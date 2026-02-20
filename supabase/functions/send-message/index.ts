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

        // Get conversation with inbox and contact
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

        console.log('Channel type:', channelType, '| Contact:', contact?.fb_psid, contact?.ig_id)

        // Send via Facebook/Instagram Graph API
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
                })
            })

            const fbData = await fbRes.json()
            console.log('FB send result:', JSON.stringify(fbData))

            if (fbData.error) {
                console.error('FB API error:', fbData.error)
                return new Response(JSON.stringify({ error: fbData.error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            }

            // Save message to DB
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

            return new Response(JSON.stringify({ success: true, message_id: fbData.message_id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // For other channels (widget etc) — just save to DB, delivery handled differently
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

        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    } catch (err: any) {
        console.error('send-message error:', err)
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
})