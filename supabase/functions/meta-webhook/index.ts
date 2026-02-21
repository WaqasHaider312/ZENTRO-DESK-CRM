// supabase/functions/meta-webhook/index.ts
// Receives all incoming messages from Facebook & Instagram
// Routes them to the correct organization based on page ID

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const VERIFY_TOKEN = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN')!
const APP_SECRET = Deno.env.get('META_APP_SECRET')!
const B_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Verify webhook signature from Meta
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

    // ── GET: Webhook verification from Meta ──────────────────────────
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

        // Verify signature
        const signature = req.headers.get('x-hub-signature-256') || ''
        const isValid = await verifySignature(rawBody, signature)
        if (!isValid) {
            console.error('Invalid signature')
            return new Response('Unauthorized', { status: 401 })
        }

        const body = JSON.parse(rawBody)
        console.log('Webhook payload:', JSON.stringify(body))

        // Always return 200 immediately to Meta
        // Process async
        processWebhook(body).catch(err => console.error('Processing error:', err))

        return new Response('OK', { status: 200 })
    }

    return new Response('Method not allowed', { status: 405 })
})

async function processWebhook(body: any) {
    const supabase = createClient(B_URL, SUPABASE_SERVICE_KEY)

    const object = body.object // 'page' for Facebook, 'instagram' for Instagram

    if (object !== 'page' && object !== 'instagram') {
        console.log('Unknown object type:', object)
        return
    }

    for (const entry of body.entry || []) {
        const pageId = entry.id

        // Find which inbox this page belongs to
        // Both FB and Instagram use fb_page_id (entry.id is always the FB page ID)
        // We distinguish by channel_type to avoid .single() failing on multiple rows
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

        // Handle Facebook Messenger messages
        if (object === 'page') {
            for (const event of entry.messaging || []) {
                await handleFacebookMessage(supabase, inbox, event)
            }
        }

        // Handle Instagram messages
        if (object === 'instagram') {
            for (const event of entry.messaging || []) {
                await handleInstagramMessage(supabase, inbox, event)
            }
        }
    }
}

async function handleFacebookMessage(supabase: any, inbox: any, event: any) {
    // Skip if it's an echo (message we sent)
    if (event.message?.is_echo) return
    // Skip if no message
    if (!event.message) return

    const senderId = event.sender?.id
    const messageText = event.message?.text || ''
    const attachments = event.message?.attachments || []
    const mid = event.message?.mid

    if (!senderId) return

    console.log(`FB message from ${senderId}: ${messageText}`)

    // Find or create contact
    const contact = await findOrCreateContact(supabase, inbox.organization_id, {
        fb_psid: senderId,
        channel: 'facebook',
    })

    if (!contact) return

    // Find or create conversation
    const conversation = await findOrCreateConversation(supabase, inbox, contact, mid)
    if (!conversation) return

    // Create message
    const attachmentUrls = attachments
        .filter((a: any) => a.payload?.url)
        .map((a: any) => a.payload.url)

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

    console.log('Message saved for conversation:', conversation.id)
}

async function handleInstagramMessage(supabase: any, inbox: any, event: any) {
    if (event.message?.is_echo) return
    if (!event.message) return

    const senderId = event.sender?.id
    const messageText = event.message?.text || ''
    const mid = event.message?.mid

    if (!senderId) return

    console.log(`IG message from ${senderId}: ${messageText}`)

    const contact = await findOrCreateContact(supabase, inbox.organization_id, {
        ig_id: senderId,
        channel: 'instagram',
    })

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
}

async function findOrCreateContact(supabase: any, orgId: string, info: {
    fb_psid?: string
    ig_id?: string
    channel: string
}) {
    try {
        // Try to find existing contact
        const field = info.fb_psid ? 'fb_psid' : 'ig_id'
        const value = info.fb_psid || info.ig_id

        const { data: existing } = await supabase
            .from('contacts')
            .select('*')
            .eq('organization_id', orgId)
            .eq(field, value)
            .single()

        if (existing) return existing

        // Create new contact
        const { data: newContact, error } = await supabase
            .from('contacts')
            .insert({
                organization_id: orgId,
                name: null, // Will be enriched later via Graph API
                fb_psid: info.fb_psid || null,
                ig_id: info.ig_id || null,
                is_blocked: false,
            })
            .select()
            .single()

        if (error) {
            console.error('Error creating contact:', error)
            return null
        }

        return newContact
    } catch (err) {
        console.error('findOrCreateContact error:', err)
        return null
    }
}

async function findOrCreateConversation(supabase: any, inbox: any, contact: any, messageId: string) {
    try {
        // Look for an existing open/pending conversation
        const { data: existing } = await supabase
            .from('conversations')
            .select('*')
            .eq('organization_id', inbox.organization_id)
            .eq('inbox_id', inbox.id)
            .eq('contact_id', contact.id)
            .in('status', ['open', 'pending'])
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

        if (existing) return existing

        // Create new conversation
        const { data: newConv, error } = await supabase
            .from('conversations')
            .insert({
                organization_id: inbox.organization_id,
                inbox_id: inbox.id,
                contact_id: contact.id,
                status: 'open',
                channel_conversation_id: messageId,
            })
            .select()
            .single()

        if (error) {
            console.error('Error creating conversation:', error)
            return null
        }

        return newConv
    } catch (err) {
        console.error('findOrCreateConversation error:', err)
        return null
    }
}