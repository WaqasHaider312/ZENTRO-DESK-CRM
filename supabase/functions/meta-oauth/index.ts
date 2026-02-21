import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const APP_ID = Deno.env.get('META_APP_ID')!
const APP_SECRET = Deno.env.get('META_APP_SECRET')!
const B_URL = Deno.env.get('SUPABASE_URL')!
const B_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const supabase = createClient(B_URL, B_SERVICE_KEY)
        const body = await req.json()
        const { action } = body

        // ── Exchange token ────────────────────────────────────────────
        if (action === 'exchange_token') {
            const { code, redirect_uri } = body
            console.log('exchange_token — redirect_uri:', redirect_uri)

            // Short-lived token
            const tokenRes = await fetch(
                `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(redirect_uri)}&client_secret=${APP_SECRET}&code=${code}`
            )
            const tokenData = await tokenRes.json()
            console.log('Short-lived token result:', JSON.stringify(tokenData))

            if (tokenData.error) {
                return new Response(JSON.stringify({ error: tokenData.error.message, details: tokenData.error }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                })
            }

            // Long-lived token
            const longRes = await fetch(
                `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${tokenData.access_token}`
            )
            const longData = await longRes.json()
            console.log('Long-lived token result:', JSON.stringify(longData))

            if (longData.error) {
                return new Response(JSON.stringify({ error: longData.error.message }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                })
            }

            // Get pages
            const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${longData.access_token}`)
            const pagesData = await pagesRes.json()
            console.log('Pages result:', JSON.stringify(pagesData))

            return new Response(JSON.stringify({
                long_lived_token: longData.access_token,
                pages: pagesData.data || [],
                pages_error: pagesData.error || null,
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // ── Connect Facebook Page ─────────────────────────────────────
        if (action === 'connect_facebook_page') {
            const { page_id, page_name, page_access_token, organization_id, inbox_name } = body

            await fetch(`https://graph.facebook.com/v19.0/${page_id}/subscribed_apps`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subscribed_fields: ['messages', 'messaging_postbacks', 'messaging_referrals'],
                    access_token: page_access_token,
                })
            })

            const { data: inbox, error } = await supabase.from('inboxes').upsert({
                organization_id,
                name: inbox_name || page_name,
                channel_type: 'facebook',
                fb_page_id: page_id,
                fb_page_name: page_name,
                fb_access_token: page_access_token,
                is_active: true,
            }, { onConflict: 'organization_id,fb_page_id,channel_type', ignoreDuplicates: false }).select().single()

            if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            return new Response(JSON.stringify({ inbox }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // ── Connect Instagram ─────────────────────────────────────────
        if (action === 'connect_instagram') {
            const { page_id, page_access_token, organization_id, inbox_name } = body

            const igRes = await fetch(`https://graph.facebook.com/v19.0/${page_id}?fields=instagram_business_account&access_token=${page_access_token}`)
            const igData = await igRes.json()
            const igAccountId = igData.instagram_business_account?.id

            if (!igAccountId) {
                return new Response(JSON.stringify({ error: 'No Instagram Business account linked to this Facebook Page.' }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                })
            }

            await fetch(`https://graph.facebook.com/v19.0/${page_id}/subscribed_apps`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscribed_fields: ['messages', 'messaging_postbacks'], access_token: page_access_token })
            })

            const { data: inbox, error } = await supabase.from('inboxes').upsert({
                organization_id,
                name: inbox_name || 'Instagram',
                channel_type: 'instagram',
                fb_page_id: page_id,
                fb_access_token: page_access_token,
                ig_account_id: igAccountId,
                is_active: true,
            }, { onConflict: 'organization_id,fb_page_id,channel_type', ignoreDuplicates: false }).select().single()

            if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            return new Response(JSON.stringify({ inbox }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // ── Disconnect ────────────────────────────────────────────────
        if (action === 'disconnect_inbox') {
            const { inbox_id, organization_id } = body
            const { error } = await supabase.from('inboxes').update({ is_active: false }).eq('id', inbox_id).eq('organization_id', organization_id)
            if (error) throw error
            return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    } catch (err: any) {
        console.error('meta-oauth error:', err)
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
})