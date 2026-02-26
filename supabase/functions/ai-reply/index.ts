// supabase/functions/ai-reply/index.ts
// v2 — full conversation context, farewell message, named docs, test mode

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!

interface AiReplyRequest {
    conversation_id?: string   // not needed for test mode
    organization_id: string
    inbox_id?: string
    new_message: string
    contact_name?: string
    channel_type?: string
    test_mode?: boolean         // if true: just return AI response, don't save or send
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    try {
        const payload: AiReplyRequest = await req.json()
        const {
            conversation_id,
            organization_id,
            new_message,
            contact_name = 'Customer',
            channel_type = 'unknown',
            test_mode = false,
        } = payload

        console.log(`ai-reply: org=${organization_id}, test=${test_mode}, msg="${new_message.slice(0, 60)}"`)

        // ── 1. Check conversation (skip for test mode) ─────────────────
        let conv: any = null
        if (!test_mode) {
            if (!conversation_id) {
                return new Response(JSON.stringify({ error: 'conversation_id required' }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                })
            }

            const { data } = await supabase
                .from('conversations')
                .select('id, ai_handled, status, inbox_id')
                .eq('id', conversation_id)
                .single()

            conv = data

            if (!conv || !conv.ai_handled || conv.status === 'resolved') {
                console.log('Skipping: not ai_handled or resolved')
                return new Response(JSON.stringify({ skipped: true }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                })
            }
        }

        // ── 2. Fetch knowledge base ────────────────────────────────────
        const { data: sources } = await supabase
            .from('knowledge_base_sources')
            .select('raw_content, name')
            .eq('organization_id', organization_id)
            .eq('status', 'ready')
            .not('raw_content', 'is', null)

        if (!sources || sources.length === 0) {
            if (test_mode) {
                return new Response(JSON.stringify({
                    can_answer: false,
                    reason: 'No knowledge base documents found. Upload at least one document first.'
                }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            }
            console.log('No knowledge base — escalating')
            await escalateToHuman(supabase, conversation_id!, organization_id, 'No knowledge base configured')
            return new Response(JSON.stringify({ escalated: true, reason: 'no_knowledge_base' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Each document labeled clearly so org can reference by name in prompt
        const knowledgeBase = sources
            .map(s => `=== Document: ${s.name} ===\n${s.raw_content}`)
            .join('\n\n')

        // ── 3. Fetch FULL conversation history ─────────────────────────
        let conversationMessages: { role: 'user' | 'assistant'; content: string }[] = []

        if (!test_mode && conversation_id) {
            const { data: allMessages } = await supabase
                .from('messages')
                .select('sender_type, content, created_at')
                .eq('conversation_id', conversation_id)
                .eq('is_deleted', false)
                .eq('is_private', false)
                .not('sender_type', 'in', '("system")')
                .order('created_at', { ascending: true })

            for (const msg of allMessages || []) {
                if (!msg.content?.trim()) continue
                if (msg.sender_type === 'contact') {
                    conversationMessages.push({ role: 'user', content: msg.content })
                } else if (msg.sender_type === 'agent' || msg.sender_type === 'ai') {
                    conversationMessages.push({ role: 'assistant', content: msg.content })
                }
            }

            // Ensure the new message is at the end (avoid duplicates)
            const lastMsg = conversationMessages[conversationMessages.length - 1]
            if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== new_message) {
                conversationMessages.push({ role: 'user', content: new_message })
            }
        } else {
            // Test mode: no history, just the test message
            conversationMessages = [{ role: 'user', content: new_message }]
        }

        // ── 4. Fetch org name + custom prompt ──────────────────────────
        const { data: org } = await supabase
            .from('organizations')
            .select('name, ai_prompt')
            .eq('id', organization_id)
            .single()

        const orgName = org?.name || 'our company'
        const customPrompt = org?.ai_prompt?.trim() || ''

        // ── 5. Build system prompt ─────────────────────────────────────
        const defaultPrompt = `You are a helpful customer support agent for ${orgName}.
Answer customer questions using ONLY the documents provided in the knowledge base below.

BEHAVIOR RULES:
- Answer ONLY from the knowledge base. Never make up information.
- Keep replies concise, friendly, and professional.
- Do NOT mention you are an AI unless the customer directly asks.
- Do NOT mention "knowledge base" or "document" to the customer.
- Respond in the SAME language the customer is using.
- If the customer asks something outside the knowledge base, you MUST escalate.

ESCALATION:
- If you cannot answer: include a "farewell" field with a polite handoff message.
- Example: "Let me connect you with our support team who can better assist you."

HOW TO USE DOCUMENTS:
- Multiple documents are provided below. Use whichever is most relevant.
- The document names are shown as === Document: [name] === headers.`

        const behaviorPrompt = customPrompt || defaultPrompt

        const systemPrompt = `${behaviorPrompt}

RESPONSE FORMAT — respond in valid JSON only, no markdown, no extra text:
If you can answer:
{"can_answer": true, "reply": "your response to the customer"}

If you cannot answer:
{"can_answer": false, "farewell": "polite message to send customer before handing off (or omit if no message)"}

KNOWLEDGE BASE:
${knowledgeBase}`

        // ── 6. Call GPT-4o-mini ────────────────────────────────────────
        if (!OPENAI_API_KEY) {
            if (test_mode) {
                return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }), {
                    status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                })
            }
            await escalateToHuman(supabase, conversation_id!, organization_id, 'AI not configured')
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
                max_tokens: 700,
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
            console.error('OpenAI error:', openaiRes.status, errText)
            if (test_mode) {
                return new Response(JSON.stringify({ error: `OpenAI error: ${openaiRes.status}` }), {
                    status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                })
            }
            await escalateToHuman(supabase, conversation_id!, organization_id, `AI API error: ${openaiRes.status}`)
            return new Response(JSON.stringify({ escalated: true, reason: 'openai_error' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        const openaiData = await openaiRes.json()
        const responseText = openaiData.choices?.[0]?.message?.content || '{}'
        console.log('GPT response:', responseText)

        let parsed: { can_answer: boolean; reply?: string; farewell?: string }
        try {
            parsed = JSON.parse(responseText)
        } catch {
            if (test_mode) {
                return new Response(JSON.stringify({ error: 'AI returned invalid JSON', raw: responseText }), {
                    status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                })
            }
            await escalateToHuman(supabase, conversation_id!, organization_id, 'AI parse error')
            return new Response(JSON.stringify({ escalated: true, reason: 'parse_error' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // ── 7a. TEST MODE — return result directly ─────────────────────
        if (test_mode) {
            return new Response(JSON.stringify({
                can_answer: parsed.can_answer,
                reply: parsed.reply || null,
                farewell: parsed.farewell || null,
                documents_used: sources.map(s => s.name),
                message_count: conversationMessages.length,
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // ── 7b. AI CAN ANSWER — send reply ────────────────────────────
        if (parsed.can_answer && parsed.reply) {
            const replyText = parsed.reply.trim()

            await sendToChannel(supabase, {
                conversation_id: conversation_id!,
                organization_id,
                channel_type,
                reply_text: replyText,
                inbox_id: conv.inbox_id,
            })

            const { error: msgInsertError } = await supabase.from('messages').insert({
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

            if (msgInsertError) {
                console.error('AI message insert FAILED:', JSON.stringify(msgInsertError))
            } else {
                console.log('AI message inserted OK')
            }

            const { error: convUpdateError } = await supabase.from('conversations').update({
                latest_message: replyText,
                latest_message_at: new Date().toISOString(),
                latest_message_sender: 'ai',
                unread_count: 0,
            }).eq('id', conversation_id)

            if (convUpdateError) {
                console.error('Conversation update FAILED:', JSON.stringify(convUpdateError))
            }

            console.log(`AI replied to conv ${conversation_id}: "${replyText.slice(0, 80)}..."`)

            return new Response(JSON.stringify({ success: true, replied: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // ── 7c. AI CANNOT ANSWER — send farewell if provided, escalate ─
        console.log(`AI cannot answer conv ${conversation_id} — escalating to Unassigned`)

        // Send farewell message to customer if AI provided one
        if (parsed.farewell?.trim() && conv?.inbox_id) {
            const farewellText = parsed.farewell.trim()

            await sendToChannel(supabase, {
                conversation_id: conversation_id!,
                organization_id,
                channel_type,
                reply_text: farewellText,
                inbox_id: conv.inbox_id,
            })

            // Save farewell as AI message in chat
            await supabase.from('messages').insert({
                conversation_id,
                organization_id,
                sender_type: 'ai',
                sender_name: 'AI Assistant',
                message_type: 'text',
                content: farewellText,
                is_private: false,
                is_read: true,
                is_deleted: false,
            })

            console.log(`Farewell sent: "${farewellText.slice(0, 80)}"`)
        }

        await escalateToHuman(supabase, conversation_id!, organization_id, 'Outside knowledge base')

        return new Response(JSON.stringify({ escalated: true, reason: 'cannot_answer' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

    } catch (err: any) {
        console.error('ai-reply unexpected error:', err)
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})

// ── Escalate to human ────────────────────────────────────────────────
async function escalateToHuman(
    supabase: any,
    conversation_id: string,
    organization_id: string,
    reason: string
) {
    await supabase.from('conversations').update({
        ai_handled: false,
        assigned_agent_id: null,
        ai_escalated_at: new Date().toISOString(),
        status: 'open',
    }).eq('id', conversation_id)

    await supabase.from('messages').insert({
        conversation_id,
        organization_id,
        sender_type: 'system',
        sender_name: 'System',
        message_type: 'activity',
        content: `AI escalated this ticket to agents — ${reason}`,
        is_private: false,
        is_read: true,
        is_deleted: false,
    })
}

// ── Send to channel ──────────────────────────────────────────────────
async function sendToChannel(supabase: any, params: {
    conversation_id: string
    organization_id: string
    channel_type: string
    reply_text: string
    inbox_id: string
}) {
    const { conversation_id, reply_text, inbox_id, channel_type } = params

    const { data: inbox } = await supabase.from('inboxes').select('*').eq('id', inbox_id).single()
    if (!inbox) { console.error('Inbox not found:', inbox_id); return }

    const { data: convData } = await supabase
        .from('conversations').select('contact:contacts(*)').eq('id', conversation_id).single()
    const contact = convData?.contact

    try {
        if (channel_type === 'whatsapp') {
            if (!contact?.wa_id || !inbox.wa_phone_number_id || !inbox.wa_access_token) return
            await fetch(`https://graph.facebook.com/v19.0/${inbox.wa_phone_number_id}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${inbox.wa_access_token}` },
                body: JSON.stringify({
                    messaging_product: 'whatsapp', recipient_type: 'individual',
                    to: contact.wa_id, type: 'text', text: { body: reply_text },
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
        // Widget: DB insert is enough, widget polls for messages
    } catch (err: any) {
        console.error(`Send to ${channel_type} failed:`, err.message)
    }
}