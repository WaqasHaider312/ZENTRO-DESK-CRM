// supabase/functions/meta-webhook/index.ts
// Receives all incoming messages from Facebook, Instagram & WhatsApp

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const VERIFY_TOKEN = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN')!
const APP_SECRET = Deno.env.get('META_APP_SECRET')!
const B_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

async function verifySignature(body: string, signature: string): Promise<boolean> {
    try {
        const key = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(APP_SECRET),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        )
        const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
        const expected = 'sha256=' + Array.from(new Uint8Array(sig))
            .map(b => b.toString(16).padStart(2, '0')).join('')
        return expected === signature
    } catch {
        return false
    }
}

Deno.serve(async (req) => {
    const url = new URL(req.url)

    // ── GET: Webhook verification ────────────────────────────────────
    if (req.method === 'GET') {
        const mode = url.searchParams.get('hub.mode')
        const token = url.searchParams.get('hub.verify_token')
        const challenge = url.searchParams.get('hub.challenge')
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('Webhook verified by Meta')
            return new Response(challenge, { status: 200 })
        }
        return new Response('Forbidden', { status: 403 })
    }

    // ── POST: Incoming messages ──────────────────────────────────────
    if (req.method === 'POST') {
        const rawBody = await req.text()
        const signature = req.headers.get('x-hub-signature-256') || ''
        const isValid = await verifySignature(rawBody, signature)
        if (!isValid) {
            console.error('Invalid signature')
            return new Response('Unauthorized', { status: 401 })
        }

        const body = JSON.parse(rawBody)
        console.log('Webhook payload:', JSON.stringify(body))

        processWebhook(body).catch(err => console.error('Processing error:', err))
        return new Response('OK', { status: 200 })
    }

    return new Response('Method not allowed', { status: 405 })
})

async function processWebhook(body: any) {
    const supabase = createClient(B_URL, SUPABASE_SERVICE_KEY)
    const object = body.object

    // ── WhatsApp ─────────────────────────────────────────────────────
    if (object === 'whatsapp_business_account') {
        for (const entry of body.entry || []) {
            for (const change of entry.changes || []) {
                if (change.field !== 'messages') continue
                const value = change.value
                const phoneNumberId = value.metadata?.phone_number_id
                if (!phoneNumberId) continue

                // Find inbox by WhatsApp phone_number_id
                const { data: inbox, error: inboxError } = await supabase
                    .from('inboxes')
                    .select('id, organization_id, channel_type, name, wa_access_token')
                    .eq('wa_phone_number_id', phoneNumberId)
                    .eq('channel_type', 'whatsapp')
                    .eq('is_active', true)
                    .single()

                if (inboxError || !inbox) {
                    console.log('No WhatsApp inbox found for phone_number_id:', phoneNumberId, inboxError?.message)
                    continue
                }

                console.log('Found WhatsApp inbox:', inbox.id)

                for (const msg of value.messages || []) {
                    await handleWhatsAppMessage(supabase, inbox, msg, value.contacts || [])
                }
            }
        }
        return
    }

    // ── Facebook & Instagram ─────────────────────────────────────────
    if (object !== 'page' && object !== 'instagram') {
        console.log('Unknown object type:', object)
        return
    }

    for (const entry of body.entry || []) {
        const pageId = entry.id
        const channelType = object === 'page' ? 'facebook' : 'instagram'

        const { data: inbox, error: inboxError } = await supabase
            .from('inboxes')
            .select('id, organization_id, channel_type, name, fb_access_token')
            .eq('fb_page_id', pageId)
            .eq('channel_type', channelType)
            .eq('is_active', true)
            .single()

        if (inboxError || !inbox) {
            console.log(`No ${channelType} inbox found for page:`, pageId, inboxError?.message)
            continue
        }
        console.log('Found inbox:', inbox.id, inbox.channel_type)

        if (object === 'page') {
            for (const event of entry.messaging || []) {
                await handleFacebookMessage(supabase, inbox, event)
            }
        }

        if (object === 'instagram') {
            for (const event of entry.messaging || []) {
                await handleInstagramMessage(supabase, inbox, event)
            }
        }
    }
}

// ── WhatsApp handler ─────────────────────────────────────────────────
async function handleWhatsAppMessage(supabase: any, inbox: any, msg: any, waContacts: any[]) {
    if (msg.type !== 'text' && msg.type !== 'image' && msg.type !== 'audio' && msg.type !== 'video' && msg.type !== 'document') return

    const waId = msg.from // sender's WhatsApp number e.g. '923001234567'
    const messageId = msg.id
    const messageText = msg.text?.body || ''
    const timestamp = msg.timestamp

    console.log(`WhatsApp message from ${waId}: ${messageText}`)

    // Get display name from contacts array in payload
    const waContact = waContacts.find((c: any) => c.wa_id === waId)
    const displayName = waContact?.profile?.name || waId

    // Find or create contact by wa_id
    const contact = await findOrCreateWhatsAppContact(supabase, inbox.organization_id, waId, displayName)
    if (!contact) return

    // Find or create conversation
    const conversation = await findOrCreateConversation(supabase, inbox, contact, messageId)
    if (!conversation) return

    // Save message
    const messageType = msg.type === 'text' ? 'text' : (msg.type === 'image' ? 'image' : 'file')
    await supabase.from('messages').insert({
        conversation_id: conversation.id,
        organization_id: inbox.organization_id,
        sender_type: 'contact',
        sender_id: contact.id,
        sender_name: displayName,
        message_type: messageType,
        content: messageText || `[${msg.type}]`,
        channel_message_id: messageId,
        is_read: false,
        is_private: false,
    })

    // Update conversation latest message
    await supabase.from('conversations').update({
        latest_message: messageText || `[${msg.type}]`,
        latest_message_at: new Date(parseInt(timestamp) * 1000).toISOString(),
        latest_message_sender: displayName,
        status: 'open',
    }).eq('id', conversation.id)

    console.log('WhatsApp message saved for conversation:', conversation.id)
}

async function findOrCreateWhatsAppContact(supabase: any, orgId: string, waId: string, name: string) {
    try {
        const { data: existing } = await supabase
            .from('contacts')
            .select('*')
            .eq('organization_id', orgId)
            .eq('wa_id', waId)
            .maybeSingle()

        if (existing) return existing

        const { data: newContact, error } = await supabase
            .from('contacts')
            .insert({
                organization_id: orgId,
                name: name || waId,
                wa_id: waId,
                phone: '+' + waId,
                is_blocked: false,
            })
            .select()
            .single()

        if (error) {
            console.error('Error creating WhatsApp contact:', error)
            return null
        }
        return newContact
    } catch (err) {
        console.error('findOrCreateWhatsAppContact error:', err)
        return null
    }
}

// ── Facebook handler ─────────────────────────────────────────────────
async function handleFacebookMessage(supabase: any, inbox: any, event: any) {
    if (event.message?.is_echo) return
    if (!event.message) return

    const senderId = event.sender?.id
    const messageText = event.message?.text || ''
    const attachments = event.message?.attachments || []
    const mid = event.message?.mid

    if (!senderId) return
    console.log(`FB message from ${senderId}: ${messageText}`)

    const contact = await findOrCreateContact(supabase, inbox.organization_id, { fb_psid: senderId, channel: 'facebook' })
    if (!contact) return

    const conversation = await findOrCreateConversation(supabase, inbox, contact, mid)
    if (!conversation) return

    const attachmentUrls = attachments.filter((a: any) => a.payload?.url).map((a: any) => a.payload.url)

    await supabase.from('messages').insert({
        conversation_id: conversation.id,
        organization_id: inbox.organization_id,
        sender_type: 'contact',
        sender_id: contact.id,
        sender_name: contact.name || 'Unknown',
        message_type: attachments.length > 0 ? 'image' : 'text',
        content: messageText || (attachments.length > 0 ? '[Attachment]' : ''),
        attachment_urls: attachmentUrls.length > 0 ? attachmentUrls : null,
        channel_message_id: mid,
        is_read: false,
        is_private: false,
    })

    await supabase.from('conversations').update({
        latest_message: messageText || '[Attachment]',
        latest_message_at: new Date().toISOString(),
        latest_message_sender: contact.name || 'Unknown',
    }).eq('id', conversation.id)

    console.log('FB message saved for conversation:', conversation.id)
}

// ── Instagram handler ────────────────────────────────────────────────
async function handleInstagramMessage(supabase: any, inbox: any, event: any) {
    if (event.message?.is_echo) return
    if (!event.message) return

    const senderId = event.sender?.id
    const messageText = event.message?.text || ''
    const mid = event.message?.mid

    if (!senderId) return
    console.log(`IG message from ${senderId}: ${messageText}`)

    const contact = await findOrCreateContact(supabase, inbox.organization_id, { ig_id: senderId, channel: 'instagram' })
    if (!contact) return

    const conversation = await findOrCreateConversation(supabase, inbox, contact, mid)
    if (!conversation) return

    await supabase.from('messages').insert({
        conversation_id: conversation.id,
        organization_id: inbox.organization_id,
        sender_type: 'contact',
        sender_id: contact.id,
        sender_name: contact.name || 'Unknown',
        message_type: 'text',
        content: messageText,
        channel_message_id: mid,
        is_read: false,
        is_private: false,
    })

    await supabase.from('conversations').update({
        latest_message: messageText,
        latest_message_at: new Date().toISOString(),
        latest_message_sender: contact.name || 'Unknown',
    }).eq('id', conversation.id)
}

// ── Shared helpers ───────────────────────────────────────────────────
async function findOrCreateContact(supabase: any, orgId: string, info: { fb_psid?: string; ig_id?: string; channel: string }) {
    try {
        const field = info.fb_psid ? 'fb_psid' : 'ig_id'
        const value = info.fb_psid || info.ig_id

        const { data: existing } = await supabase.from('contacts').select('*').eq('organization_id', orgId).eq(field, value).maybeSingle()
        if (existing) return existing

        const { data: newContact, error } = await supabase.from('contacts').insert({
            organization_id: orgId,
            name: null,
            fb_psid: info.fb_psid || null,
            ig_id: info.ig_id || null,
            is_blocked: false,
        }).select().single()

        if (error) { console.error('Error creating contact:', error); return null }
        return newContact
    } catch (err) {
        console.error('findOrCreateContact error:', err)
        return null
    }
}

async function findOrCreateConversation(supabase: any, inbox: any, contact: any, messageId: string) {
    try {
        const { data: existing } = await supabase
            .from('conversations').select('*')
            .eq('organization_id', inbox.organization_id)
            .eq('inbox_id', inbox.id)
            .eq('contact_id', contact.id)
            .in('status', ['open', 'pending'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (existing) return existing

        const { data: newConv, error } = await supabase.from('conversations').insert({
            organization_id: inbox.organization_id,
            inbox_id: inbox.id,
            contact_id: contact.id,
            status: 'open',
            channel_conversation_id: messageId,
        }).select().single()

        if (error) { console.error('Error creating conversation:', error); return null }
        return newConv
    } catch (err) {
        console.error('findOrCreateConversation error:', err)
        return null
    }
}