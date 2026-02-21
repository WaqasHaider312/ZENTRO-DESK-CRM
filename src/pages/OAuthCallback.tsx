import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Loader2 } from 'lucide-react'

// This page handles the Facebook OAuth callback
// It reads the code+state from URL, then redirects to the correct org's inboxes page
export default function OAuthCallback() {
    const navigate = useNavigate()
    const { organization } = useAuth()

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const code = params.get('code')
        const state = params.get('state')
        const error = params.get('error')

        if (error) {
            // OAuth was cancelled or failed - go back
            navigate(-1)
            return
        }

        if (code && state) {
            const [, orgId] = state.split(':')
            // We need to redirect to the inboxes page with the code+state preserved
            // The inboxes page will handle the token exchange
            // Use sessionStorage to pass the oauth params
            sessionStorage.setItem('oauth_code', code)
            sessionStorage.setItem('oauth_state', state)

            // Navigate to inboxes - we need the org slug
            // Use organization from context if available, otherwise wait
            if (organization) {
                navigate(`/app/${organization.slug}/settings/inboxes`)
            }
        }
    }, [organization])

    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
                <p className="text-sm text-muted-foreground">Connecting your account...</p>
            </div>
        </div>
    )
}