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

        // ── Exchange token (Facebook / Instagram) ─────────────────────
        if (action === 'exchange_token') {
            const { code, redirect_uri } = body
            console.log('exchange_token — redirect_uri:', redirect_uri)

            const tokenRes = await fetch(
                `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(redirect_uri)}&client_secret=${APP_SECRET}&code=${code}`
            )
            const tokenData = await tokenRes.json()
            if (tokenData.error) return new Response(JSON.stringify({ error: tokenData.error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

            const longRes = await fetch(
                `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${tokenData.access_token}`
            )
            const longData = await longRes.json()
            if (longData.error) return new Response(JSON.stringify({ error: longData.error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

            const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${longData.access_token}`)
            const pagesData = await pagesRes.json()

            return new Response(JSON.stringify({
                long_lived_token: longData.access_token,
                pages: pagesData.data || [],
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // ── Exchange token (WhatsApp) ──────────────────────────────────
        if (action === 'exchange_token_whatsapp') {
            const { code, redirect_uri } = body
            console.log('exchange_token_whatsapp — redirect_uri:', redirect_uri)

            // Short-lived token
            const tokenRes = await fetch(
                `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(redirect_uri)}&client_secret=${APP_SECRET}&code=${code}`
            )
            const tokenData = await tokenRes.json()
            console.log('Short-lived token result:', JSON.stringify(tokenData))
            if (tokenData.error) return new Response(JSON.stringify({ error: tokenData.error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

            // Long-lived token
            const longRes = await fetch(
                `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${tokenData.access_token}`
            )
            const longData = await longRes.json()
            console.log('Long-lived token result:', JSON.stringify(longData))
            if (longData.error) return new Response(JSON.stringify({ error: longData.error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

            const userToken = longData.access_token
            const phoneNumbers: any[] = []

            const seenWabaIds = new Set<string>()

            const fetchNumbersFromWaba = async (wabaId: string) => {
                if (seenWabaIds.has(wabaId)) return
                seenWabaIds.add(wabaId)
                const numRes = await fetch(`https://graph.facebook.com/v19.0/${wabaId}/phone_numbers?fields=display_phone_number,verified_name,status,quality_rating&access_token=${userToken}`)
                const numData = await numRes.json()
                console.log(`WABA ${wabaId} phone_numbers:`, JSON.stringify(numData))
                for (const num of (numData.data || [])) {
                    phoneNumbers.push({
                        id: num.id,
                        display_phone_number: num.display_phone_number,
                        verified_name: num.verified_name,
                        status: num.status || 'CONNECTED',
                        waba_id: wabaId,
                        access_token: userToken,
                    })
                }
            }

            // Strategy 1: Get businesses, then WABAs under each business
            const bizRes = await fetch(`https://graph.facebook.com/v19.0/me/businesses?fields=id,name&access_token=${userToken}`)
            const bizData = await bizRes.json()
            console.log('Businesses:', JSON.stringify(bizData))

            for (const biz of (bizData.data || [])) {
                const wabaRes = await fetch(`https://graph.facebook.com/v19.0/${biz.id}/whatsapp_business_accounts?fields=id,name&access_token=${userToken}`)
                const wabaData = await wabaRes.json()
                console.log(`Biz ${biz.id} whatsapp_business_accounts:`, JSON.stringify(wabaData))
                for (const waba of (wabaData.data || [])) await fetchNumbersFromWaba(waba.id)
            }

            // Strategy 2: Get WABAs the token user directly has access to
            if (phoneNumbers.length === 0) {
                const userRes = await fetch(`https://graph.facebook.com/v19.0/me?fields=id&access_token=${userToken}`)
                const userData = await userRes.json()
                console.log('User:', JSON.stringify(userData))
                if (userData.id) {
                    // Try getting WABAs via user ID directly
                    const userWabaRes = await fetch(`https://graph.facebook.com/v19.0/${userData.id}/whatsapp_business_accounts?fields=id,name&access_token=${userToken}`)
                    const userWabaData = await userWabaRes.json()
                    console.log('User WABAs:', JSON.stringify(userWabaData))
                    for (const waba of (userWabaData.data || [])) await fetchNumbersFromWaba(waba.id)
                }
            }

            console.log(`Found ${phoneNumbers.length} WhatsApp numbers total`)

            return new Response(JSON.stringify({
                phone_numbers: phoneNumbers,
                access_token: userToken,
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // ── Connect WhatsApp ───────────────────────────────────────────
        if (action === 'connect_whatsapp') {
            const { phone_number_id, phone_number, verified_name, waba_id, organization_id, inbox_name, access_token } = body

            // Register webhook subscription for this WABA
            if (access_token && waba_id) {
                const subRes = await fetch(`https://graph.facebook.com/v19.0/${waba_id}/subscribed_apps`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ access_token }),
                })
                const subData = await subRes.json()
                console.log('WABA subscription result:', JSON.stringify(subData))
            }

            const { data: inbox, error } = await supabase.from('inboxes').upsert({
                organization_id,
                name: inbox_name || verified_name || phone_number,
                channel_type: 'whatsapp',
                wa_phone_number_id: phone_number_id,
                wa_phone_number: phone_number,
                wa_waba_id: waba_id,
                wa_access_token: access_token || null,
                is_active: true,
            }, { onConflict: 'organization_id,wa_phone_number_id', ignoreDuplicates: false }).select().single()

            if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            return new Response(JSON.stringify({ inbox }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // ── Connect Facebook Page ──────────────────────────────────────
        if (action === 'connect_facebook_page') {
            const { page_id, page_name, page_access_token, organization_id, inbox_name } = body

            await fetch(`https://graph.facebook.com/v19.0/${page_id}/subscribed_apps`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscribed_fields: ['messages', 'messaging_postbacks', 'messaging_referrals'], access_token: page_access_token })
            })

            const { data: inbox, error } = await supabase.from('inboxes').upsert({
                organization_id, name: inbox_name || page_name, channel_type: 'facebook',
                fb_page_id: page_id, fb_page_name: page_name, fb_access_token: page_access_token, is_active: true,
            }, { onConflict: 'organization_id,fb_page_id,channel_type', ignoreDuplicates: false }).select().single()

            if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            return new Response(JSON.stringify({ inbox }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // ── Connect Instagram ──────────────────────────────────────────
        if (action === 'connect_instagram') {
            const { page_id, page_access_token, organization_id, inbox_name } = body

            const igRes = await fetch(`https://graph.facebook.com/v19.0/${page_id}?fields=instagram_business_account&access_token=${page_access_token}`)
            const igData = await igRes.json()
            const igAccountId = igData.instagram_business_account?.id

            if (!igAccountId) return new Response(JSON.stringify({ error: 'No Instagram Business account linked to this Facebook Page.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

            await fetch(`https://graph.facebook.com/v19.0/${page_id}/subscribed_apps`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscribed_fields: ['messages', 'messaging_postbacks'], access_token: page_access_token })
            })

            const { data: inbox, error } = await supabase.from('inboxes').upsert({
                organization_id, name: inbox_name || 'Instagram', channel_type: 'instagram',
                fb_page_id: page_id, fb_access_token: page_access_token, ig_account_id: igAccountId, is_active: true,
            }, { onConflict: 'organization_id,fb_page_id,channel_type', ignoreDuplicates: false }).select().single()

            if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            return new Response(JSON.stringify({ inbox }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // ── Disconnect ─────────────────────────────────────────────────
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