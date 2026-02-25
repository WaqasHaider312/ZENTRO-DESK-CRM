// supabase/functions/process-knowledge-source/index.ts
// Extracts plain text from .docx files and URLs

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { unzip } from 'https://esm.sh/fflate@0.8.2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_CHARS = 60_000

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    let sourceId: string | null = null

    try {
        const body = await req.json()
        sourceId = body.source_id

        if (!sourceId) {
            return new Response(JSON.stringify({ error: 'source_id required' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        const { data: source, error: fetchError } = await supabase
            .from('knowledge_base_sources')
            .select('*')
            .eq('id', sourceId)
            .single()

        if (fetchError || !source) {
            return new Response(JSON.stringify({ error: 'Source not found' }), {
                status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        console.log(`Processing: id=${sourceId}, type=${source.type}, name=${source.name}`)

        let rawContent = ''

        // ── DOCX Processing ──────────────────────────────────────────────
        if (source.type === 'docx') {
            const { data: fileData, error: downloadError } = await supabase
                .storage.from('knowledge-base').download(source.file_path)

            if (downloadError || !fileData) {
                throw new Error(`Download failed: ${downloadError?.message || 'Unknown'}`)
            }

            const arrayBuffer = await fileData.arrayBuffer()
            rawContent = await extractDocxText(new Uint8Array(arrayBuffer))
            console.log(`Docx extracted: ${rawContent.length} chars`)
        }

        // ── URL Processing ───────────────────────────────────────────────
        if (source.type === 'url') {
            const res = await fetch(source.source_url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ZentroBot/1.0)' },
                signal: AbortSignal.timeout(20_000),
            })
            if (!res.ok) throw new Error(`HTTP ${res.status} fetching URL`)
            rawContent = extractHtmlText(await res.text())
            console.log(`URL extracted: ${rawContent.length} chars`)
        }

        if (!rawContent || rawContent.trim().length < 30) {
            throw new Error('Could not extract meaningful content.')
        }

        if (rawContent.length > MAX_CHARS) {
            rawContent = rawContent.slice(0, MAX_CHARS) + '\n\n[Content truncated]'
        }

        const { error: updateError } = await supabase
            .from('knowledge_base_sources')
            .update({ raw_content: rawContent, status: 'ready', error_message: null, updated_at: new Date().toISOString() })
            .eq('id', sourceId)

        if (updateError) throw new Error(`DB update failed: ${updateError.message}`)

        return new Response(
            JSON.stringify({ success: true, chars: rawContent.length }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (err: any) {
        console.error('process-knowledge-source error:', err.message)
        if (sourceId) {
            await supabase.from('knowledge_base_sources')
                .update({ status: 'failed', error_message: err.message, updated_at: new Date().toISOString() })
                .eq('id', sourceId).catch(() => { })
        }
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})

async function extractDocxText(data: Uint8Array): Promise<string> {
    return new Promise((resolve, reject) => {
        unzip(data, (err: any, unzipped: any) => {
            if (err) { reject(new Error(`Unzip failed: ${err.message}`)); return }

            const documentXml = unzipped['word/document.xml']
            if (!documentXml) { reject(new Error('Invalid docx — missing word/document.xml')); return }

            const xmlString = new TextDecoder('utf-8').decode(documentXml)
            const text = xmlString
                .replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g, (_, t) => t + ' ')
                .replace(/<\/w:p>/g, '\n')
                .replace(/<[^>]+>/g, '')
                .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
                .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()

            if (text.length < 20) { reject(new Error('Document is empty or image-only')); return }
            resolve(text)
        })
    })
}

function extractHtmlText(html: string): string {
    return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<\/?(p|div|h[1-6]|li|br|tr|td|th)[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}