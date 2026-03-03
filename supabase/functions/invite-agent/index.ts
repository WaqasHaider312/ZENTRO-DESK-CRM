// supabase/functions/invite-agent/index.ts
// Sends a real Supabase auth invite email to a new agent

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const { email, role, organization_id, organization_name, invited_by_name } = await req.json()

        if (!email || !organization_id) {
            return new Response(JSON.stringify({ error: 'email and organization_id required' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Use service role to send auth invite
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
            { auth: { autoRefreshToken: false, persistSession: false } }
        )

        // Check if user already exists in this org
        const { data: existing } = await supabase
            .from('agent_profiles')
            .select('id')
            .eq('organization_id', organization_id)
            .eq('email', email.trim().toLowerCase())
            .maybeSingle()

        if (existing) {
            return new Response(JSON.stringify({ error: 'This email is already a member of your organization' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Store invitation record first
        const token = crypto.randomUUID()
        const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

        const { error: inviteRecordError } = await supabase.from('invitations').insert({
            organization_id,
            invited_by: invited_by_name,
            email: email.trim().toLowerCase(),
            role: role || 'agent',
            token,
            accepted: false,
            expires_at: expires,
        })

        if (inviteRecordError) {
            console.error('Error storing invitation:', inviteRecordError)
            // Non-fatal — still send the invite
        }

        // Send Supabase auth invite email (creates user + sends email)
        const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(
            email.trim().toLowerCase(),
            {
                data: {
                    organization_id,
                    role: role || 'agent',
                    invite_token: token,
                    organization_name: organization_name || 'Zentro Desk',
                },
                redirectTo: `${Deno.env.get('SITE_URL') || 'https://zentrodesk.com'}/accept-invite?token=${token}&org=${organization_id}`,
            }
        )

        if (authError) {
            console.error('Auth invite error:', authError)
            return new Response(JSON.stringify({ error: authError.message }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        console.log(`Invite sent to ${email} for org ${organization_id}`)

        return new Response(JSON.stringify({ success: true, user_id: authData.user?.id }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

    } catch (err: any) {
        console.error('invite-agent error:', err)
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})