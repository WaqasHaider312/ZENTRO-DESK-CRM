// supabase/functions/ai-reply/index.ts
// Called by meta-webhook when a new inbound message arrives on an AI-enabled inbox.
// Fetches org's knowledge base, calls GPT-4o-mini, sends reply or escalates to Unassigned.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!

interface AiReplyRequest {
    conversation_id: string
    organization_id: string
    inbox_id: string
    new_message: string
    contact_name: string
    channel_type: string  // 'whatsapp' | 'facebook' | 'instagram' | 'widget'
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    try {
        const payload: AiReplyRequest = await req.json()
        const { conversation_id, organization_id, new_message, contact_name, channel_type } = payload

        console.log(`ai-reply: conv=${conversation_id}, org=${organization_id}, msg="${new_message}"`)

        // ── 1. Check conversation is still ai_handled ──────────────────
        const { data: conv } = await supabase
            .from('conversations')
            .select('id, ai_handled, status, inbox_id')
            .eq('id', conversation_id)
            .single()

        if (!conv || !conv.ai_handled || conv.status === 'resolved') {
            console.log('Skipping AI: conversation not ai_handled or resolved')
            return new Response(JSON.stringify({ skipped: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // ── 2. Fetch org's knowledge base ─────────────────────────────
        const { data: sources } = await supabase
            .from('knowledge_base_sources')
            .select('raw_content, name')
            .eq('organization_id', organization_id)
            .eq('status', 'ready')
            .not('raw_content', 'is', null)

        // If no knowledge base → escalate immediately
        if (!sources || sources.length === 0) {
            console.log('No knowledge base — escalating to Unassigned')
            await escalateToHuman(supabase, conversation_id, organization_id, 'No knowledge base configured')
            return new Response(JSON.stringify({ escalated: true, reason: 'no_knowledge_base' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Concatenate all knowledge base content
        const knowledgeBase = sources
            .map(s => `=== ${s.name} ===\n${s.raw_content}`)
            .join('\n\n')

        // ── 3. Fetch last 6 messages for context ─────────────────────
        const { data: recentMessages } = await supabase
            .from('messages')
            .select('sender_type, sender_name, content')
            .eq('conversation_id', conversation_id)
            .eq('is_deleted', false)
            .eq('is_private', false)
            .neq('sender_type', 'system')
            .order('created_at', { ascending: false })
            .limit(6)

        // Reverse to chronological order (oldest first)
        const history = (recentMessages || []).reverse()

        // ── 4. Fetch org name ─────────────────────────────────────────
        const { data: org } = await supabase
            .from('organizations')
            .select('name')
            .eq('id', organization_id)
            .single()

        const orgName = org?.name || 'our company'

        // ── 5. Build GPT messages ─────────────────────────────────────
        const systemPrompt = `You are a helpful customer support agent for ${orgName}.
Your job is to answer customer questions using ONLY the knowledge base provided below.

STRICT RULES:
- Answer ONLY based on the knowledge base. Do NOT make up information.
- If the knowledge base does not contain the answer, or if the question is outside your knowledge, respond with {"can_answer": false}.
- Keep replies concise, friendly, and professional.
- Do NOT mention that you are an AI unless directly asked.
- Do NOT mention "knowledge base" to the customer.
- Respond in the SAME language the customer is using.

RESPONSE FORMAT (valid JSON only, no markdown, no extra text):
If you can answer: {"can_answer": true, "reply": "Your answer here"}
If you cannot answer: {"can_answer": false}

KNOWLEDGE BASE:
${knowledgeBase}`

        // Build conversation history for context
        const conversationMessages: { role: 'user' | 'assistant'; content: string }[] = []

        for (const msg of history) {
            if (msg.sender_type === 'contact') {
                conversationMessages.push({ role: 'user', content: msg.content || '' })
            } else if (msg.sender_type === 'agent' || msg.sender_type === 'ai') {
                conversationMessages.push({ role: 'assistant', content: msg.content || '' })
            }
        }

        // Add the new message (already in history from DB insert before this call, so don't add it twice)
        // Only add if last message isn't already this message
        const lastMsg = conversationMessages[conversationMessages.length - 1]
        if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== new_message) {
            conversationMessages.push({ role: 'user', content: new_message })
        }

        // ── 6. Call GPT-4o-mini ───────────────────────────────────────
        if (!OPENAI_API_KEY) {
            console.error('OPENAI_API_KEY not set')
            await escalateToHuman(supabase, conversation_id, organization_id, 'AI service not configured')
            return new Response(JSON.stringify({ escalated: true, reason: 'no_api_key' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                max_tokens: 600,
                temperature: 0.3,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...conversationMessages,
                ],
            }),
        })

        if (!openaiRes.ok) {
            const errText = await openaiRes.text()
            console.error('OpenAI API error:', openaiRes.status, errText)
            // Fail safe — escalate to human
            await escalateToHuman(supabase, conversation_id, organization_id, `AI error: ${openaiRes.status}`)
            return new Response(JSON.stringify({ escalated: true, reason: 'openai_error' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        const openaiData = await openaiRes.json()
        const responseText = openaiData.choices?.[0]?.message?.content || '{}'

        console.log('GPT response:', responseText)

        let parsed: { can_answer: boolean; reply?: string }
        try {
            parsed = JSON.parse(responseText)
        } catch {
            // Malformed JSON — escalate
            await escalateToHuman(supabase, conversation_id, organization_id, 'AI response parse error')
            return new Response(JSON.stringify({ escalated: true, reason: 'parse_error' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // ── 7a. AI can answer — send reply ────────────────────────────
        if (parsed.can_answer && parsed.reply) {
            const replyText = parsed.reply.trim()

            // Send to customer via the appropriate channel
            await sendToChannel(supabase, {
                conversation_id,
                organization_id,
                channel_type,
                reply_text: replyText,
                inbox_id: conv.inbox_id,
            })

            // Save AI message to DB
            await supabase.from('messages').insert({
                conversation_id,
                organization_id,
                sender_type: 'ai',
                sender_name: 'AI Assistant',
                message_type: 'text',
                content: replyText,
                is_private: false,
                is_read: true,
                is_deleted: false,
            })

            // Update conversation latest message
            await supabase.from('conversations').update({
                latest_message: replyText,
                latest_message_at: new Date().toISOString(),
                latest_message_sender: 'ai',
                unread_count: 0,
            }).eq('id', conversation_id)

            console.log(`AI replied to conv ${conversation_id}: "${replyText.slice(0, 80)}..."`)

            return new Response(JSON.stringify({ success: true, replied: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // ── 7b. AI cannot answer — escalate silently ──────────────────
        console.log(`AI cannot answer conv ${conversation_id} — escalating to Unassigned`)
        await escalateToHuman(supabase, conversation_id, organization_id, 'Outside knowledge base')

        return new Response(JSON.stringify({ escalated: true, reason: 'cannot_answer' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

    } catch (err: any) {
        console.error('ai-reply error:', err)
        // Fail safe — try to escalate
        try {
            const body = await req.json().catch(() => ({}))
            if (body.conversation_id && body.organization_id) {
                await escalateToHuman(supabase, body.conversation_id, body.organization_id, `Unexpected error: ${err.message}`)
            }
        } catch { }

        return new Response(JSON.stringify({ error: err.message }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})

// ── Escalate conversation to human agents ─────────────────────────────
async function escalateToHuman(supabase: any, conversation_id: string, organization_id: string, reason: string) {
    await supabase.from('conversations').update({
        ai_handled: false,
        assigned_agent_id: null,
        ai_escalated_at: new Date().toISOString(),
        status: 'open',
    }).eq('id', conversation_id)

    // System message visible in chat
    await supabase.from('messages').insert({
        conversation_id,
        organization_id,
        sender_type: 'system',
        sender_name: 'System',
        message_type: 'activity',
        content: `AI escalated this ticket to agents (${reason})`,
        is_private: false,
        is_read: true,
        is_deleted: false,
    })
}

// ── Send reply to customer via correct channel ────────────────────────
async function sendToChannel(supabase: any, params: {
    conversation_id: string
    organization_id: string
    channel_type: string
    reply_text: string
    inbox_id: string
}) {
    const { conversation_id, reply_text, inbox_id, channel_type } = params

    // Fetch inbox credentials
    const { data: inbox } = await supabase
        .from('inboxes')
        .select('*')
        .eq('id', inbox_id)
        .single()

    if (!inbox) {
        console.error('Inbox not found for channel send:', inbox_id)
        return
    }

    // Fetch contact for channel ID
    const { data: conv } = await supabase
        .from('conversations')
        .select('contact:contacts(*)')
        .eq('id', conversation_id)
        .single()

    const contact = conv?.contact

    try {
        if (channel_type === 'whatsapp') {
            if (!contact?.wa_id || !inbox.wa_phone_number_id || !inbox.wa_access_token) return
            await fetch(`https://graph.facebook.com/v19.0/${inbox.wa_phone_number_id}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${inbox.wa_access_token}`,
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: contact.wa_id,
                    type: 'text',
                    text: { body: reply_text },
                }),
            })
        }

        if (channel_type === 'facebook') {
            if (!contact?.fb_psid || !inbox.fb_access_token) return
            await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${inbox.fb_access_token}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipient: { id: contact.fb_psid },
                    message: { text: reply_text },
                    messaging_type: 'RESPONSE',
                }),
            })
        }

        if (channel_type === 'instagram') {
            if (!contact?.ig_id || !inbox.fb_access_token) return
            await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${inbox.fb_access_token}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipient: { id: contact.ig_id },
                    message: { text: reply_text },
                    messaging_type: 'RESPONSE',
                }),
            })
        }

        // Widget: message is already saved to DB, widget polls for new messages
        // No external API call needed for widget channel

    } catch (err: any) {
        console.error(`Failed to send to ${channel_type}:`, err.message)
        // Don't throw — message is already saved to DB, channel delivery failure is non-critical
    }
}