import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )

        const { conversation_id, message_text, agent_id, agent_name, organization_id } = await req.json()
        console.log('send-message called for conversation:', conversation_id)

        const { data: conv, error: convError } = await supabase
            .from('conversations')
            .select('*, inbox:inboxes(*), contact:contacts(*)')
            .eq('id', conversation_id)
            .single()

        if (convError || !conv) {
            console.error('Conversation not found:', convError)
            return new Response(JSON.stringify({ error: 'Conversation not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        const inbox = conv.inbox
        const contact = conv.contact
        const channelType = inbox.channel_type

        console.log('Channel type:', channelType)

        // ── WhatsApp ───────────────────────────────────────────────────
        if (channelType === 'whatsapp') {
            const waId = contact.wa_id

            if (!waId) {
                return new Response(JSON.stringify({ error: 'No WhatsApp ID on contact' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            }
            if (!inbox.wa_phone_number_id || !inbox.wa_access_token) {
                return new Response(JSON.stringify({ error: 'WhatsApp inbox missing phone_number_id or access_token' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            }

            const waRes = await fetch(`https://graph.facebook.com/v19.0/${inbox.wa_phone_number_id}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${inbox.wa_access_token}`,
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: waId,
                    type: 'text',
                    text: { body: message_text },
                }),
            })

            const waData = await waRes.json()
            console.log('WhatsApp send result:', JSON.stringify(waData))

            if (waData.error) {
                console.error('WhatsApp API error:', waData.error)
                return new Response(JSON.stringify({ error: waData.error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            }

            const messageId = waData.messages?.[0]?.id

            await supabase.from('messages').insert({
                conversation_id,
                organization_id,
                sender_type: 'agent',
                sender_id: agent_id,
                sender_name: agent_name,
                message_type: 'text',
                content: message_text,
                channel_message_id: messageId,
                is_read: true,
                is_private: false,
            })

            await supabase.from('conversations').update({
                latest_message: message_text,
                latest_message_at: new Date().toISOString(),
                latest_message_sender: agent_name,
            }).eq('id', conversation_id)

            return new Response(JSON.stringify({ success: true, message_id: messageId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // ── Facebook & Instagram ───────────────────────────────────────
        if (channelType === 'facebook' || channelType === 'instagram') {
            const recipientId = channelType === 'facebook' ? contact.fb_psid : contact.ig_id

            if (!recipientId) {
                return new Response(JSON.stringify({ error: 'No recipient ID on contact' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            }
            if (!inbox.fb_access_token) {
                return new Response(JSON.stringify({ error: 'No access token on inbox' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            }

            const fbRes = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${inbox.fb_access_token}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipient: { id: recipientId },
                    message: { text: message_text },
                    messaging_type: 'RESPONSE',
                }),
            })

            const fbData = await fbRes.json()
            console.log('FB send result:', JSON.stringify(fbData))

            if (fbData.error) {
                console.error('FB API error:', fbData.error)
                return new Response(JSON.stringify({ error: fbData.error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            }

            await supabase.from('messages').insert({
                conversation_id,
                organization_id,
                sender_type: 'agent',
                sender_id: agent_id,
                sender_name: agent_name,
                message_type: 'text',
                content: message_text,
                channel_message_id: fbData.message_id,
                is_read: true,
                is_private: false,
            })

            await supabase.from('conversations').update({
                latest_message: message_text,
                latest_message_at: new Date().toISOString(),
                latest_message_sender: agent_name,
            }).eq('id', conversation_id)

            return new Response(JSON.stringify({ success: true, message_id: fbData.message_id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // ── Widget & other channels ────────────────────────────────────
        await supabase.from('messages').insert({
            conversation_id,
            organization_id,
            sender_type: 'agent',
            sender_id: agent_id,
            sender_name: agent_name,
            message_type: 'text',
            content: message_text,
            is_read: true,
            is_private: false,
        })

        await supabase.from('conversations').update({
            latest_message: message_text,
            latest_message_at: new Date().toISOString(),
            latest_message_sender: agent_name,
        }).eq('id', conversation_id)

        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    } catch (err: any) {
        console.error('send-message error:', err)
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
})