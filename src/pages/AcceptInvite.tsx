import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export default function AcceptInvite() {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'done'>('loading')
    const [invitation, setInvitation] = useState<any>(null)
    const [fullName, setFullName] = useState('')
    const [password, setPassword] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')

    const token = searchParams.get('token')
    const orgId = searchParams.get('org')

    useEffect(() => {
        validateInvite()
    }, [token, orgId])

    const validateInvite = async () => {
        if (!token || !orgId) {
            setErrorMsg('Invalid invite link — missing token or organization.')
            setStatus('error')
            return
        }

        try {
            const { data, error } = await supabase
                .from('invitations')
                .select('*, organization:organizations(name, slug)')
                .eq('token', token)
                .eq('organization_id', orgId)
                .eq('accepted', false)
                .single()

            if (error || !data) {
                setErrorMsg('This invite link is invalid or has already been used.')
                setStatus('error')
                return
            }

            if (new Date(data.expires_at) < new Date()) {
                setErrorMsg('This invite link has expired. Ask your admin to send a new one.')
                setStatus('error')
                return
            }

            setInvitation(data)
            setStatus('ready')
        } catch {
            setErrorMsg('Failed to validate invite. Please try again.')
            setStatus('error')
        }
    }

    const handleAccept = async () => {
        if (!fullName.trim() || !password || password.length < 8) return
        setSubmitting(true)
        try {
            // Check if user already has an account (was invited via Supabase auth)
            const { data: { user } } = await supabase.auth.getUser()

            if (user) {
                // Already signed in via magic link — just update profile
                await supabase.from('agent_profiles').update({
                    full_name: fullName.trim(),
                    is_active: true,
                }).eq('id', user.id)
            } else {
                // Create account using the email from the invitation
                const { error: signUpError } = await supabase.auth.signUp({
                    email: invitation.email,
                    password,
                    options: {
                        data: {
                            full_name: fullName.trim(),
                            organization_id: orgId,
                            role: invitation.role,
                        }
                    }
                })
                if (signUpError) throw signUpError
            }

            // Mark invitation as accepted
            await supabase.from('invitations')
                .update({ accepted: true, accepted_at: new Date().toISOString() })
                .eq('token', token)

            // Ensure agent_profile exists with correct org
            await supabase.from('agent_profiles').upsert({
                email: invitation.email,
                full_name: fullName.trim(),
                organization_id: orgId,
                role: invitation.role || 'agent',
                is_active: true,
                availability: 'online',
            }, { onConflict: 'email,organization_id' })

            setStatus('done')
            toast.success('Account created! Redirecting...')

            setTimeout(() => navigate('/login'), 2500)
        } catch (err: any) {
            toast.error(err.message || 'Failed to accept invite')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">

                {/* Logo */}
                <div className="flex items-center gap-2 mb-8">
                    <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                        <span className="text-white font-bold text-sm">Z</span>
                    </div>
                    <span className="font-bold text-gray-900 text-lg">Zentro Desk</span>
                </div>

                {status === 'loading' && (
                    <div className="flex flex-col items-center py-8 gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        <p className="text-sm text-gray-500">Validating your invite...</p>
                    </div>
                )}

                {status === 'error' && (
                    <div className="flex flex-col items-center py-8 gap-4 text-center">
                        <XCircle className="w-12 h-12 text-red-400" />
                        <div>
                            <p className="font-semibold text-gray-900">Invite Invalid</p>
                            <p className="text-sm text-gray-500 mt-1">{errorMsg}</p>
                        </div>
                        <Button variant="outline" onClick={() => navigate('/login')}>
                            Go to Login
                        </Button>
                    </div>
                )}

                {status === 'done' && (
                    <div className="flex flex-col items-center py-8 gap-4 text-center">
                        <CheckCircle className="w-12 h-12 text-emerald-500" />
                        <div>
                            <p className="font-semibold text-gray-900">You're all set!</p>
                            <p className="text-sm text-gray-500 mt-1">Redirecting to login...</p>
                        </div>
                    </div>
                )}

                {status === 'ready' && invitation && (
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 mb-1">
                            You're invited!
                        </h1>
                        <p className="text-sm text-gray-500 mb-6">
                            Join <strong>{invitation.organization?.name}</strong> as an <strong>{invitation.role}</strong>.
                            Set up your account below.
                        </p>

                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Email</label>
                                <input
                                    type="email"
                                    value={invitation.email}
                                    disabled
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
                                />
                            </div>

                            <div>
                                <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Full Name</label>
                                <input
                                    type="text"
                                    value={fullName}
                                    onChange={e => setFullName(e.target.value)}
                                    placeholder="Your full name"
                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                />
                            </div>

                            <div>
                                <label className="text-sm font-semibold text-gray-700 mb-1.5 block">
                                    Password <span className="text-gray-400 font-normal">(min 8 characters)</span>
                                </label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAccept()}
                                    placeholder="Create a password"
                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                />
                            </div>

                            <Button
                                onClick={handleAccept}
                                disabled={!fullName.trim() || password.length < 8 || submitting}
                                className="w-full bg-primary hover:bg-primary/90 mt-2"
                            >
                                {submitting
                                    ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Creating account...</>
                                    : 'Accept Invite & Join'
                                }
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}