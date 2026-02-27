// supabase/functions/ai-agent/index.ts
// Stage 2 — Claude-powered AI Agent with protocols, tool use, multi-turn, confirmations

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const CLAUDE_MODEL = 'claude-haiku-4-5'

interface AgentRequest {
    conversation_id?: string
    organization_id: string
    inbox_id?: string
    new_message: string
    contact_name?: string
    channel_type?: string
    test_mode?: boolean
    test_history?: { role: 'user' | 'assistant'; content: string }[]
}

interface Protocol {
    id: string
    name: string
    trigger_description: string
    requires_confirmation: boolean
    params: { param_name: string; description: string; required: boolean }[]
    steps: { step_order: number; type: string; config: any }[]
}

// ── MAIN HANDLER ─────────────────────────────────────────────────────
Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    try {
        const payload: AgentRequest = await req.json()
        const {
            conversation_id,
            organization_id,
            new_message,
            contact_name = 'Customer',
            channel_type = 'unknown',
            test_mode = false,
            test_history = [],
        } = payload

        console.log(`ai-agent: org=${organization_id}, test=${test_mode}, msg="${new_message.slice(0, 60)}"`)

        // ── 1. Validate conversation (skip for test mode) ──────────────
        let conv: any = null
        if (!test_mode) {
            if (!conversation_id) {
                return jsonResponse({ error: 'conversation_id required' }, 400)
            }

            const { data } = await supabase
                .from('conversations')
                .select('id, ai_handled, status, inbox_id, assigned_agent_id, ai_pending_tool_call')
                .eq('id', conversation_id)
                .single()

            conv = data

            // AI only responds if ai_handled=true AND no agent assigned
            if (!conv || !conv.ai_handled || conv.status === 'resolved' || conv.assigned_agent_id) {
                console.log('Skipping: not ai_handled, resolved, or assigned to agent')
                return jsonResponse({ skipped: true })
            }
        }

        // ── 2. Load org data (prompt + knowledge base + protocols) ──────
        const [orgResult, sourcesResult, protocolsResult] = await Promise.all([
            supabase.from('organizations').select('name, ai_prompt').eq('id', organization_id).single(),
            supabase.from('knowledge_base_sources').select('name, raw_content').eq('organization_id', organization_id).eq('status', 'ready').not('raw_content', 'is', null),
            supabase.from('ai_protocols').select(`
        id, name, trigger_description, requires_confirmation,
        ai_protocol_params(param_name, description, required, sort_order),
        ai_protocol_steps(step_order, type, config)
      `).eq('organization_id', organization_id).eq('is_active', true),
        ])

        const org = orgResult.data
        const sources = sourcesResult.data || []
        const rawProtocols = protocolsResult.data || []

        // Normalize protocol data
        const protocols: Protocol[] = rawProtocols.map((p: any) => ({
            id: p.id,
            name: p.name,
            trigger_description: p.trigger_description,
            requires_confirmation: p.requires_confirmation,
            params: (p.ai_protocol_params || []).sort((a: any, b: any) => a.sort_order - b.sort_order),
            steps: (p.ai_protocol_steps || []).sort((a: any, b: any) => a.step_order - b.step_order),
        }))

        const orgName = org?.name || 'our company'
        const customPrompt = org?.ai_prompt?.trim() || ''

        // ── 3. Handle pending confirmation ────────────────────────────
        if (!test_mode && conv?.ai_pending_tool_call) {
            const pending = conv.ai_pending_tool_call
            const lowerMsg = new_message.toLowerCase().trim()
            const confirmed = ['yes', 'confirm', 'ok', 'okay', 'sure', 'proceed', 'go ahead', 'haan', 'ha'].some(w => lowerMsg.includes(w))
            const cancelled = ['no', 'cancel', 'stop', 'nahi', 'nope', 'abort'].some(w => lowerMsg.includes(w))

            if (confirmed) {
                console.log(`Confirmation received for protocol: ${pending.tool_name}`)
                const result = await executeProtocolSteps(supabase, pending.protocol_id, pending.params, protocols, organization_id)

                // Clear pending state
                await supabase.from('conversations').update({ ai_pending_tool_call: null }).eq('id', conversation_id)

                if (result.success) {
                    // Save internal note for agents
                    await saveInternalNote(supabase, conversation_id!, organization_id,
                        `✅ AI executed protocol "${pending.tool_name}" — ${result.summary}`)

                    // Claude formulates natural response from result
                    const response = await claudeFormulateResponse(orgName, customPrompt, new_message, result, pending.tool_name)
                    await sendAndSaveAIMessage(supabase, conversation_id!, organization_id, channel_type, conv.inbox_id, response)
                    return jsonResponse({ success: true, replied: true })
                } else {
                    await saveInternalNote(supabase, conversation_id!, organization_id,
                        `❌ AI protocol "${pending.tool_name}" failed — ${result.error}`)
                    await escalateToHuman(supabase, conversation_id!, organization_id, `Protocol "${pending.tool_name}" failed: ${result.error}`)
                    return jsonResponse({ escalated: true, reason: 'protocol_failed' })
                }
            } else if (cancelled) {
                await supabase.from('conversations').update({ ai_pending_tool_call: null }).eq('id', conversation_id)
                const msg = "No problem! Is there anything else I can help you with?"
                await sendAndSaveAIMessage(supabase, conversation_id!, organization_id, channel_type, conv.inbox_id, msg)
                return jsonResponse({ success: true, replied: true })
            }
            // Not a clear yes/no — fall through to normal AI flow (AI will handle context)
            await supabase.from('conversations').update({ ai_pending_tool_call: null }).eq('id', conversation_id)
        }

        // ── 4. Build knowledge base context ───────────────────────────
        const knowledgeBase = sources.length > 0
            ? sources.map(s => `=== Document: ${s.name} ===\n${s.raw_content}`).join('\n\n')
            : ''

        // ── 5. Build conversation history ─────────────────────────────
        let conversationMessages: { role: 'user' | 'assistant'; content: string }[] = []

        if (test_mode) {
            conversationMessages = [...test_history, { role: 'user', content: new_message }]
        } else {
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

            // Avoid duplicate of new message
            const last = conversationMessages[conversationMessages.length - 1]
            if (!last || last.role !== 'user' || last.content !== new_message) {
                conversationMessages.push({ role: 'user', content: new_message })
            }
        }

        // ── 6. Build Claude tools from protocols ──────────────────────
        const tools = buildClaudeTools(protocols)

        // ── 7. Build system prompt ────────────────────────────────────
        const systemPrompt = buildSystemPrompt(orgName, customPrompt, knowledgeBase, protocols)

        // ── 8. Call Claude ────────────────────────────────────────────
        if (!ANTHROPIC_API_KEY) {
            if (test_mode) return jsonResponse({ error: 'ANTHROPIC_API_KEY not configured' }, 500)
            await escalateToHuman(supabase, conversation_id!, organization_id, 'AI not configured')
            return jsonResponse({ escalated: true, reason: 'no_api_key' })
        }

        const claudeResponse = await callClaude(systemPrompt, conversationMessages, tools)

        if (!claudeResponse.ok) {
            const errText = await claudeResponse.text()
            console.error('Claude API error:', claudeResponse.status, errText)
            if (test_mode) return jsonResponse({ error: `Claude API error: ${claudeResponse.status}` }, 500)
            await escalateToHuman(supabase, conversation_id!, organization_id, `AI API error: ${claudeResponse.status}`)
            return jsonResponse({ escalated: true, reason: 'claude_error' })
        }

        const claudeData = await claudeResponse.json()
        console.log('Claude response type:', claudeData.stop_reason)

        // ── 9. Handle Claude's response ───────────────────────────────

        // 9a. Text response — answer from knowledge base or general
        if (claudeData.stop_reason === 'end_turn') {
            const textBlock = claudeData.content?.find((b: any) => b.type === 'text')
            const replyText = textBlock?.text?.trim()

            if (!replyText) {
                if (test_mode) return jsonResponse({ can_answer: false, reason: 'Empty response from Claude' })
                await escalateToHuman(supabase, conversation_id!, organization_id, 'Empty AI response')
                return jsonResponse({ escalated: true, reason: 'empty_response' })
            }

            // Check if Claude is escalating via text (it sometimes does this)
            const isEscalating = replyText.toLowerCase().includes('[escalate]')
            if (isEscalating) {
                const cleanMsg = replyText.replace(/\[escalate\]/gi, '').trim()
                if (cleanMsg && !test_mode) {
                    await sendAndSaveAIMessage(supabase, conversation_id!, organization_id, channel_type, conv?.inbox_id, cleanMsg)
                }
                if (!test_mode) await escalateToHuman(supabase, conversation_id!, organization_id, 'Outside knowledge base')
                if (test_mode) return jsonResponse({ can_answer: false, farewell: cleanMsg || null })
                return jsonResponse({ escalated: true })
            }

            if (test_mode) return jsonResponse({ can_answer: true, reply: replyText, documents_used: sources.map(s => s.name) })
            await sendAndSaveAIMessage(supabase, conversation_id!, organization_id, channel_type, conv?.inbox_id, replyText)
            return jsonResponse({ success: true, replied: true })
        }

        // 9b. Tool use — protocol execution
        if (claudeData.stop_reason === 'tool_use') {
            const toolUseBlock = claudeData.content?.find((b: any) => b.type === 'tool_use')
            if (!toolUseBlock) {
                if (!test_mode) await escalateToHuman(supabase, conversation_id!, organization_id, 'Tool use parse error')
                return jsonResponse({ escalated: true, reason: 'tool_parse_error' })
            }

            const toolName = toolUseBlock.name
            const toolParams = toolUseBlock.input || {}

            console.log(`Claude wants to call tool: ${toolName}`, toolParams)

            // Handle built-in escalate tool
            if (toolName === 'escalate_to_human') {
                const farewell = toolParams.farewell_message || ''
                if (farewell && !test_mode) {
                    await sendAndSaveAIMessage(supabase, conversation_id!, organization_id, channel_type, conv?.inbox_id, farewell)
                }
                if (!test_mode) await escalateToHuman(supabase, conversation_id!, organization_id, toolParams.reason || 'Outside knowledge base')
                if (test_mode) return jsonResponse({ can_answer: false, farewell: farewell || null, reason: toolParams.reason })
                return jsonResponse({ escalated: true })
            }

            // Find matching protocol
            const protocol = protocols.find(p => slugify(p.name) === toolName)
            if (!protocol) {
                if (!test_mode) await escalateToHuman(supabase, conversation_id!, organization_id, `Unknown protocol: ${toolName}`)
                return jsonResponse({ escalated: true, reason: 'unknown_protocol' })
            }

            // Test mode — return what would happen
            if (test_mode) {
                return jsonResponse({
                    can_answer: true,
                    action: 'protocol',
                    protocol_name: protocol.name,
                    collected_params: toolParams,
                    requires_confirmation: protocol.requires_confirmation,
                    would_confirm: protocol.requires_confirmation
                        ? `AI would ask: "Please confirm you want to execute: ${protocol.name} with ${JSON.stringify(toolParams)}. Reply YES to proceed."`
                        : 'Would execute immediately',
                })
            }

            // Requires confirmation — save pending and ask customer
            if (protocol.requires_confirmation) {
                const confirmMsg = buildConfirmationMessage(protocol, toolParams)
                await supabase.from('conversations').update({
                    ai_pending_tool_call: { protocol_id: protocol.id, tool_name: protocol.name, params: toolParams }
                }).eq('id', conversation_id)
                await sendAndSaveAIMessage(supabase, conversation_id!, organization_id, channel_type, conv?.inbox_id, confirmMsg)
                return jsonResponse({ success: true, awaiting_confirmation: true })
            }

            // No confirmation needed — execute immediately
            const result = await executeProtocolSteps(supabase, protocol.id, toolParams, protocols, organization_id)
            await saveInternalNote(supabase, conversation_id!, organization_id,
                result.success
                    ? `✅ AI executed protocol "${protocol.name}" — ${result.summary}`
                    : `❌ AI protocol "${protocol.name}" failed — ${result.error}`)

            if (result.success) {
                const response = await claudeFormulateResponse(orgName, customPrompt, new_message, result, protocol.name)
                await sendAndSaveAIMessage(supabase, conversation_id!, organization_id, channel_type, conv?.inbox_id, response)
                return jsonResponse({ success: true, replied: true })
            } else {
                await escalateToHuman(supabase, conversation_id!, organization_id, `Protocol "${protocol.name}" failed: ${result.error}`)
                return jsonResponse({ escalated: true, reason: 'protocol_failed' })
            }
        }

        // Fallback
        if (!test_mode) await escalateToHuman(supabase, conversation_id!, organization_id, 'Unexpected AI response')
        return jsonResponse({ escalated: true, reason: 'unexpected_response' })

    } catch (err: any) {
        console.error('ai-agent unexpected error:', err)
        return jsonResponse({ error: err.message }, 500)
    }
})

// ── Build system prompt ───────────────────────────────────────────────
function buildSystemPrompt(orgName: string, customPrompt: string, knowledgeBase: string, protocols: Protocol[]): string {
    const defaultBehavior = `You are a helpful customer support agent for ${orgName}.
Your job is to assist customers by answering questions and performing actions on their behalf.

BEHAVIOR:
- Answer questions ONLY from the knowledge base provided. Never make up information.
- Keep replies concise, friendly, and professional.
- Do NOT mention you are an AI unless directly asked.
- Do NOT mention "knowledge base", "document", or "protocol" to the customer.
- Respond in the SAME language the customer is using.
- If you cannot answer or help, call the escalate_to_human tool with a polite farewell message.`

    const behavior = customPrompt || defaultBehavior

    const protocolInstructions = protocols.length > 0 ? `

PROTOCOLS (actions you can perform):
${protocols.map(p => `- ${p.name}: ${p.trigger_description}`).join('\n')}

When a customer's intent matches a protocol:
1. Collect ALL required parameters from the conversation history first
2. If any required parameter is missing, ask the customer for it naturally
3. Once all parameters are collected, call the protocol tool
4. If requires_confirmation is true, the system will handle the confirmation step automatically` : ''

    const kb = knowledgeBase ? `\n\nKNOWLEDGE BASE:\n${knowledgeBase}` : '\n\nNo knowledge base documents have been uploaded yet.'

    return `${behavior}${protocolInstructions}${kb}`
}

// ── Build Claude tools from protocols ────────────────────────────────
function buildClaudeTools(protocols: Protocol[]): any[] {
    const tools: any[] = [
        {
            name: 'escalate_to_human',
            description: 'Call this when you cannot answer the customer\'s question or the request is outside your capabilities',
            input_schema: {
                type: 'object',
                properties: {
                    reason: { type: 'string', description: 'Brief reason why you are escalating' },
                    farewell_message: { type: 'string', description: 'Optional polite message to send to customer before handing off' },
                },
                required: ['reason'],
            },
        },
    ]

    for (const protocol of protocols) {
        const properties: Record<string, any> = {}
        const required: string[] = []

        for (const param of protocol.params) {
            properties[param.param_name] = {
                type: 'string',
                description: param.description,
            }
            if (param.required) required.push(param.param_name)
        }

        tools.push({
            name: slugify(protocol.name),
            description: protocol.trigger_description,
            input_schema: {
                type: 'object',
                properties,
                required,
            },
        })
    }

    return tools
}

// ── Call Claude API ───────────────────────────────────────────────────
async function callClaude(
    systemPrompt: string,
    messages: { role: 'user' | 'assistant'; content: string }[],
    tools: any[]
): Promise<Response> {
    return fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: CLAUDE_MODEL,
            max_tokens: 1024,
            system: systemPrompt,
            messages,
            tools,
        }),
    })
}

// ── Execute protocol steps ────────────────────────────────────────────
async function executeProtocolSteps(
    supabase: any,
    protocolId: string,
    params: Record<string, string>,
    protocols: Protocol[],
    organizationId: string
): Promise<{ success: boolean; summary: string; data?: any; error?: string }> {
    const protocol = protocols.find(p => p.id === protocolId)
    if (!protocol) return { success: false, summary: '', error: 'Protocol not found' }

    const results: any[] = []

    for (const step of protocol.steps) {
        try {
            if (step.type === 'call_api') {
                const config = step.config
                const url = fillPlaceholders(config.url, params)
                const method = config.method || 'POST'

                // Build headers
                const headers: Record<string, string> = { 'Content-Type': 'application/json' }
                if (config.headers) {
                    for (const [k, v] of Object.entries(config.headers)) {
                        headers[k] = fillPlaceholders(String(v), params)
                    }
                }

                // Build body
                let body: string | undefined
                if (config.body && method !== 'GET') {
                    const filledBody = fillObjectPlaceholders(config.body, params)
                    body = JSON.stringify(filledBody)
                }

                console.log(`Calling API: ${method} ${url}`)
                const apiRes = await fetch(url, {
                    method,
                    headers,
                    body,
                    signal: AbortSignal.timeout(15_000),
                })

                const responseText = await apiRes.text()
                let responseData: any = responseText
                try { responseData = JSON.parse(responseText) } catch { }

                if (!apiRes.ok) {
                    return {
                        success: false,
                        summary: `API returned ${apiRes.status}`,
                        error: `HTTP ${apiRes.status}: ${responseText.slice(0, 200)}`,
                    }
                }

                results.push({ step: step.step_order, type: 'call_api', status: apiRes.status, data: responseData })
                console.log(`API call success: ${apiRes.status}`, JSON.stringify(responseData).slice(0, 200))

            } else if (step.type === 'send_message') {
                const msg = fillPlaceholders(step.config.message || '', params)
                results.push({ step: step.step_order, type: 'send_message', message: msg })

            } else if (step.type === 'lookup_document') {
                results.push({ step: step.step_order, type: 'lookup_document', note: 'Handled by knowledge base context' })
            }

        } catch (err: any) {
            console.error(`Step ${step.step_order} failed:`, err.message)
            return { success: false, summary: `Step ${step.step_order} failed`, error: err.message }
        }
    }

    const summary = results.map(r => {
        if (r.type === 'call_api') return `API ${r.status}`
        if (r.type === 'send_message') return `Sent: "${r.message?.slice(0, 50)}"`
        return r.type
    }).join(', ')

    return { success: true, summary, data: results }
}

// ── Claude formulates natural response from API result ────────────────
async function claudeFormulateResponse(
    orgName: string,
    customPrompt: string,
    originalMessage: string,
    result: { success: boolean; data?: any; summary: string },
    protocolName: string
): Promise<string> {
    try {
        const systemPrompt = `You are a customer support agent for ${orgName}. 
Given the result of an action, formulate a natural, friendly response to the customer.
Be concise. Do not mention technical details like API, HTTP status codes, or JSON.
${customPrompt ? `\nAdditional instructions: ${customPrompt}` : ''}`

        const userMsg = `The customer asked: "${originalMessage}"
    
We executed: ${protocolName}
Result: ${JSON.stringify(result.data, null, 2)}

Write a natural response to the customer about what happened.`

        const res = await callClaude(systemPrompt, [{ role: 'user', content: userMsg }], [])
        const data = await res.json()
        const text = data.content?.find((b: any) => b.type === 'text')?.text?.trim()
        return text || 'Your request has been processed successfully!'
    } catch {
        return 'Your request has been processed successfully!'
    }
}

// ── Build confirmation message ────────────────────────────────────────
function buildConfirmationMessage(protocol: Protocol, params: Record<string, string>): string {
    const paramList = Object.entries(params).map(([k, v]) => `${k}: ${v}`).join(', ')
    return `To confirm — I'll proceed with: **${protocol.name}** (${paramList}). Please reply *YES* to confirm or *NO* to cancel.`
}

// ── Send message and save to DB ───────────────────────────────────────
async function sendAndSaveAIMessage(
    supabase: any,
    conversationId: string,
    organizationId: string,
    channelType: string,
    inboxId: string,
    text: string
) {
    // Save to DB
    const { error } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        organization_id: organizationId,
        sender_type: 'ai',
        sender_name: 'AI Assistant',
        message_type: 'text',
        content: text,
        is_private: false,
        is_read: true,
        is_deleted: false,
    })
    if (error) console.error('AI message insert failed:', JSON.stringify(error))

    await supabase.from('conversations').update({
        latest_message: text,
        latest_message_at: new Date().toISOString(),
        latest_message_sender: 'ai',
        unread_count: 0,
    }).eq('id', conversationId)

    // Send via channel
    await sendToChannel(supabase, { conversationId, organizationId, channelType, replyText: text, inboxId })
}

// ── Save internal note (agents only) ─────────────────────────────────
async function saveInternalNote(
    supabase: any,
    conversationId: string,
    organizationId: string,
    content: string
) {
    await supabase.from('messages').insert({
        conversation_id: conversationId,
        organization_id: organizationId,
        sender_type: 'system',
        sender_name: 'AI Agent',
        message_type: 'activity',
        content,
        is_private: true,   // agents only
        is_read: true,
        is_deleted: false,
    })
}

// ── Escalate to human ────────────────────────────────────────────────
async function escalateToHuman(
    supabase: any,
    conversationId: string,
    organizationId: string,
    reason: string
) {
    await supabase.from('conversations').update({
        ai_handled: false,
        assigned_agent_id: null,
        ai_escalated_at: new Date().toISOString(),
        status: 'open',
        ai_pending_tool_call: null,
    }).eq('id', conversationId)

    await supabase.from('messages').insert({
        conversation_id: conversationId,
        organization_id: organizationId,
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
    conversationId: string; organizationId: string
    channelType: string; replyText: string; inboxId: string
}) {
    const { conversationId, replyText, inboxId, channelType } = params
    const { data: inbox } = await supabase.from('inboxes').select('*').eq('id', inboxId).single()
    if (!inbox) return
    const { data: convData } = await supabase.from('conversations').select('contact:contacts(*)').eq('id', conversationId).single()
    const contact = convData?.contact

    try {
        if (channelType === 'whatsapp' && contact?.wa_id && inbox.wa_phone_number_id) {
            await fetch(`https://graph.facebook.com/v19.0/${inbox.wa_phone_number_id}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${inbox.wa_access_token}` },
                body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: contact.wa_id, type: 'text', text: { body: replyText } }),
            })
        }
        if (channelType === 'facebook' && contact?.fb_psid && inbox.fb_access_token) {
            await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${inbox.fb_access_token}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recipient: { id: contact.fb_psid }, message: { text: replyText }, messaging_type: 'RESPONSE' }),
            })
        }
        if (channelType === 'instagram' && contact?.ig_id && inbox.fb_access_token) {
            await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${inbox.fb_access_token}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recipient: { id: contact.ig_id }, message: { text: replyText }, messaging_type: 'RESPONSE' }),
            })
        }
    } catch (err: any) {
        console.error(`Channel send failed (${channelType}):`, err.message)
    }
}

// ── Helpers ──────────────────────────────────────────────────────────
function slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function fillPlaceholders(template: string, params: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => params[key] || `{{${key}}}`)
}

function fillObjectPlaceholders(obj: any, params: Record<string, string>): any {
    if (typeof obj === 'string') return fillPlaceholders(obj, params)
    if (Array.isArray(obj)) return obj.map(item => fillObjectPlaceholders(item, params))
    if (typeof obj === 'object' && obj !== null) {
        const result: any = {}
        for (const [k, v] of Object.entries(obj)) {
            result[k] = fillObjectPlaceholders(v, params)
        }
        return result
    }
    return obj
}

function jsonResponse(data: any, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
}