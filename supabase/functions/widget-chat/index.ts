import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )

        const body = await req.json()
        const { action } = body

        // ── GET WIDGET INFO ─────────────────────────────────────────────
        if (action === 'get_widget_info') {
            const { token } = body
            if (!token) return json({ error: 'Missing token' }, 400)

            const { data: inbox } = await supabase
                .from('inboxes')
                .select('organization_id, name, organizations(name)')
                .eq('widget_token', token)
                .eq('channel_type', 'widget')
                .eq('is_active', true)
                .single()

            if (!inbox) return json({ error: 'Invalid widget token' }, 404)

            return json({
                org_name: (inbox.organizations as any)?.name || inbox.name,
                inbox_name: inbox.name,
            })
        }

        // ── CREATE CONVERSATION ─────────────────────────────────────────
        if (action === 'create_conversation') {
            const { token, name, email, message } = body
            if (!token || !name || !email || !message) return json({ error: 'Missing fields' }, 400)

            // Find inbox by widget token
            const { data: inbox } = await supabase
                .from('inboxes')
                .select('id, organization_id')
                .eq('widget_token', token)
                .eq('channel_type', 'widget')
                .eq('is_active', true)
                .single()

            if (!inbox) return json({ error: 'Invalid widget token' }, 404)

            // Find or create contact by email within org
            let contact: any = null
            const { data: existingContact } = await supabase
                .from('contacts')
                .select('id')
                .eq('organization_id', inbox.organization_id)
                .eq('email', email)
                .maybeSingle()

            if (existingContact) {
                contact = existingContact
            } else {
                const { data: newContact, error: contactError } = await supabase
                    .from('contacts')
                    .insert({
                        organization_id: inbox.organization_id,
                        name,
                        email,
                    })
                    .select()
                    .single()
                if (contactError) throw contactError
                contact = newContact
            }

            // Create conversation
            const { data: conv, error: convError } = await supabase
                .from('conversations')
                .insert({
                    organization_id: inbox.organization_id,
                    inbox_id: inbox.id,
                    contact_id: contact.id,
                    status: 'open',
                    subject: message.substring(0, 80),
                })
                .select()
                .single()
            if (convError) throw convError

            // Insert first message
            await supabase.from('messages').insert({
                conversation_id: conv.id,
                organization_id: inbox.organization_id,
                content: message,
                message_type: 'text',
                sender_type: 'contact',
                sender_name: name,
                is_visitor: true,
            })

            // Update conversation latest message
            await supabase.from('conversations').update({
                latest_message: message,
                latest_message_at: new Date().toISOString(),
                latest_message_sender: name,
            }).eq('id', conv.id)

            return json({ conversation_id: conv.id, visitor_id: contact.id })
        }

        // ── SEND MESSAGE ────────────────────────────────────────────────
        if (action === 'send_message') {
            const { conversation_id, visitor_id, content } = body
            if (!conversation_id || !visitor_id || !content) return json({ error: 'Missing fields' }, 400)

            // Verify conversation belongs to this visitor
            const { data: conv } = await supabase
                .from('conversations')
                .select('id, organization_id, inbox_id')
                .eq('id', conversation_id)
                .eq('contact_id', visitor_id)
                .single()

            if (!conv) return json({ error: 'Unauthorized' }, 403)

            const { data: msg } = await supabase.from('messages').insert({
                conversation_id: conv.id,
                organization_id: conv.organization_id,
                content,
                message_type: 'text',
                sender_type: 'contact',
                is_visitor: true,
            }).select().single()

            // Update latest message on conversation
            await supabase.from('conversations').update({
                latest_message: content,
                latest_message_at: new Date().toISOString(),
                status: 'open',
            }).eq('id', conversation_id)

            return json({ message_id: msg?.id })
        }

        // ── GET MESSAGES ────────────────────────────────────────────────
        if (action === 'get_messages') {
            const { conversation_id, visitor_id, after } = body
            if (!conversation_id || !visitor_id) return json({ error: 'Missing fields' }, 400)

            // Verify ownership
            const { data: conv } = await supabase
                .from('conversations')
                .select('id')
                .eq('id', conversation_id)
                .eq('contact_id', visitor_id)
                .single()

            if (!conv) return json({ error: 'Unauthorized' }, 403)

            let query = supabase
                .from('messages')
                .select('id, content, message_type, sender_type, sender_name, created_at, is_visitor')
                .eq('conversation_id', conversation_id)
                .order('created_at', { ascending: true })

            if (after) query = query.gt('created_at', after)

            const { data: messages } = await query

            return json({
                messages: (messages || []).map(m => ({
                    id: m.id,
                    content: m.content,
                    is_visitor: m.is_visitor || m.sender_type === 'contact',
                    sender_name: m.sender_name,
                    created_at: m.created_at,
                }))
            })
        }

        return json({ error: 'Unknown action' }, 400)

    } catch (err: any) {
        console.error('Widget chat error:', err)
        return json({ error: err.message || 'Internal error' }, 500)
    }
})

function json(data: any, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
}