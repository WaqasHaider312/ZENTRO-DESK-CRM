// supabase/functions/process-knowledge-source/index.ts
// Extracts plain text from PDFs and URLs, saves to knowledge_base_sources.raw_content

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_CHARS = 60_000 // ~15k tokens — safe limit for GPT-4o-mini context

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )

        const { source_id } = await req.json()
        if (!source_id) {
            return new Response(JSON.stringify({ error: 'source_id required' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Fetch the source row
        const { data: source, error: fetchError } = await supabase
            .from('knowledge_base_sources')
            .select('*')
            .eq('id', source_id)
            .single()

        if (fetchError || !source) {
            return new Response(JSON.stringify({ error: 'Source not found' }), {
                status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        console.log(`Processing source ${source_id}, type: ${source.type}, name: ${source.name}`)

        let rawContent = ''

        // ── URL Processing ───────────────────────────────────────────────
        if (source.type === 'url') {
            try {
                const res = await fetch(source.source_url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ZentroBot/1.0)' },
                    signal: AbortSignal.timeout(15_000),
                })

                if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)

                const html = await res.text()

                // Strip HTML tags and extract readable text
                rawContent = html
                    // Remove script, style, nav, footer, header blocks
                    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
                    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
                    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
                    // Replace block tags with newlines
                    .replace(/<\/?(p|div|h[1-6]|li|br|tr|td|th)[^>]*>/gi, '\n')
                    // Strip remaining tags
                    .replace(/<[^>]+>/g, '')
                    // Decode HTML entities
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&quot;/g, '"')
                    .replace(/&#39;/g, "'")
                    .replace(/&nbsp;/g, ' ')
                    // Collapse whitespace
                    .replace(/[ \t]+/g, ' ')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim()

                console.log(`URL extracted: ${rawContent.length} chars`)
            } catch (err: any) {
                throw new Error(`Failed to fetch URL: ${err.message}`)
            }
        }

        // ── PDF Processing ───────────────────────────────────────────────
        if (source.type === 'pdf') {
            try {
                // Download the PDF from Supabase Storage
                const { data: fileData, error: downloadError } = await supabase
                    .storage
                    .from('knowledge-base')
                    .download(source.file_path)

                if (downloadError || !fileData) {
                    throw new Error(`Failed to download PDF: ${downloadError?.message}`)
                }

                // Convert to ArrayBuffer then Uint8Array
                const arrayBuffer = await fileData.arrayBuffer()
                const uint8Array = new Uint8Array(arrayBuffer)

                // Parse PDF using pdf-parse via esm.sh
                // We use a simple text extraction approach - parse the PDF stream for text
                rawContent = await extractPdfText(uint8Array)

                console.log(`PDF extracted: ${rawContent.length} chars`)
            } catch (err: any) {
                throw new Error(`Failed to process PDF: ${err.message}`)
            }
        }

        // Truncate to limit
        if (rawContent.length > MAX_CHARS) {
            rawContent = rawContent.slice(0, MAX_CHARS) + '\n\n[Content truncated — upload multiple sources for complete coverage]'
        }

        if (!rawContent || rawContent.trim().length < 50) {
            throw new Error('Could not extract meaningful content. Check that the URL is publicly accessible and contains text content.')
        }

        // Save to DB
        await supabase
            .from('knowledge_base_sources')
            .update({
                raw_content: rawContent,
                status: 'ready',
                error_message: null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', source_id)

        console.log(`Source ${source_id} processed successfully`)

        return new Response(
            JSON.stringify({ success: true, chars: rawContent.length }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (err: any) {
        console.error('process-knowledge-source error:', err)

        // Update status to failed
        try {
            const supabase = createClient(
                Deno.env.get('SUPABASE_URL')!,
                Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
            )
            const body = await req.json().catch(() => ({}))
            if (body.source_id) {
                await supabase
                    .from('knowledge_base_sources')
                    .update({
                        status: 'failed',
                        error_message: err.message,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', body.source_id)
            }
        } catch { }

        return new Response(
            JSON.stringify({ error: err.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})

// Simple PDF text extractor — parses PDF stream for text objects
// Works for most standard PDFs. For complex/encrypted PDFs we fall back gracefully.
async function extractPdfText(data: Uint8Array): Promise<string> {
    try {
        const text = new TextDecoder('latin1').decode(data)

        // Extract text from BT...ET blocks (PDF text objects)
        const textBlocks: string[] = []
        const btEtRegex = /BT([\s\S]*?)ET/g
        let match

        while ((match = btEtRegex.exec(text)) !== null) {
            const block = match[1]
            // Extract Tj and TJ strings
            const tjRegex = /\(((?:[^()\\]|\\[\s\S])*)\)\s*Tj/g
            const tjArrRegex = /\[((?:[^\[\]]*(?:\((?:[^()\\]|\\[\s\S])*\)[^\[\]]*)*)*)\]\s*TJ/g

            let tjMatch
            while ((tjMatch = tjRegex.exec(block)) !== null) {
                const decoded = decodePdfString(tjMatch[1])
                if (decoded.trim()) textBlocks.push(decoded)
            }

            while ((tjMatch = tjArrRegex.exec(block)) !== null) {
                const arr = tjMatch[1]
                const strRegex = /\(((?:[^()\\]|\\[\s\S])*)\)/g
                let strMatch
                const parts: string[] = []
                while ((strMatch = strRegex.exec(arr)) !== null) {
                    const decoded = decodePdfString(strMatch[1])
                    if (decoded.trim()) parts.push(decoded)
                }
                if (parts.length) textBlocks.push(parts.join(''))
            }
        }

        // Also try extracting from stream objects for newer PDFs
        const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g
        while ((match = streamRegex.exec(text)) !== null) {
            const stream = match[1]
            if (stream.includes('BT') && stream.includes('ET')) {
                const innerTj = /\(((?:[^()\\]|\\[\s\S])*)\)\s*Tj/g
                let innerMatch
                while ((innerMatch = innerTj.exec(stream)) !== null) {
                    const decoded = decodePdfString(innerMatch[1])
                    if (decoded.trim() && decoded.length > 2) textBlocks.push(decoded)
                }
            }
        }

        const result = textBlocks
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim()

        if (result.length < 100) {
            // PDF might be scanned/image-based — return a useful error
            throw new Error('PDF appears to be image-based or encrypted. Please convert to text-based PDF or copy the content manually.')
        }

        return result
    } catch (err: any) {
        throw new Error(err.message || 'PDF parsing failed')
    }
}

function decodePdfString(str: string): string {
    return str
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\')
        .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
}