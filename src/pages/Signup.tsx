import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { slugify } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Zap, Loader2, CheckCircle } from 'lucide-react'

type Step = 'account' | 'organization' | 'done'

export default function Signup() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('account')
  const [loading, setLoading] = useState(false)

  // Step 1 fields
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Step 2 fields
  const [orgName, setOrgName] = useState('')
  const [website, setWebsite] = useState('')

  // Stored after step 1
  const [userId, setUserId] = useState('')

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) throw error
      if (!data.user) throw new Error('No user returned')
      setUserId(data.user.id)
      setStep('organization')
    } catch (err: any) {
      toast.error(err.message || 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  const handleOrgSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const slug = slugify(orgName)

      // Call our atomic DB function
      const { data, error } = await supabase.rpc('create_organization_with_owner', {
        p_user_id: userId,
        p_user_email: email,
        p_full_name: fullName,
        p_org_name: orgName,
        p_org_slug: slug,
      })

      if (error) throw error

      // Seed default labels
      await supabase.rpc('seed_default_labels', { p_org_id: data.id })

      setStep('done')

      // Auto-redirect after 2s
      setTimeout(() => navigate('/login'), 2500)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create organization')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left branding panel */}
      <div className="hidden lg:flex w-1/2 bg-primary flex-col items-center justify-center p-12">
        <div className="max-w-sm text-center text-white">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold mb-3">Zentro Desk</h1>
          <p className="text-white/80 text-lg">
            Start your 14-day free trial. No credit card required.
          </p>
          <div className="mt-10 space-y-3 text-left">
            {[
              'Unlimited conversations',
              'All channels included',
              'Full team access',
              'Cancel anytime',
            ].map((f) => (
              <div key={f} className="flex items-center gap-3">
                <CheckCircle className="w-4 h-4 text-white/70 flex-shrink-0" />
                <span className="text-white/90 text-sm">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold text-lg">Zentro Desk</span>
          </div>

          {/* Step indicator */}
          {step !== 'done' && (
            <div className="flex items-center gap-2 mb-8">
              {(['account', 'organization'] as Step[]).map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                    step === s ? 'bg-primary text-white' :
                    (step === 'organization' && s === 'account') ? 'bg-primary/20 text-primary' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {(step === 'organization' && s === 'account') ? '✓' : i + 1}
                  </div>
                  <span className={`text-sm ${step === s ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                    {s === 'account' ? 'Your account' : 'Organization'}
                  </span>
                  {i === 0 && <div className="w-8 h-px bg-border mx-1" />}
                </div>
              ))}
            </div>
          )}

          {/* Step 1: Account */}
          {step === 'account' && (
            <>
              <h2 className="text-2xl font-bold mb-1">Create your account</h2>
              <p className="text-muted-foreground mb-8">Start your 14-day free trial</p>
              <form onSubmit={handleAccountSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <Label>Full Name</Label>
                  <Input
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Work Email</Label>
                  <Input
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    placeholder="Min. 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required minLength={8}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Continue
                </Button>
              </form>
            </>
          )}

          {/* Step 2: Organization */}
          {step === 'organization' && (
            <>
              <h2 className="text-2xl font-bold mb-1">Set up your workspace</h2>
              <p className="text-muted-foreground mb-8">Tell us about your organization</p>
              <form onSubmit={handleOrgSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <Label>Organization Name</Label>
                  <Input
                    placeholder="Acme Corp"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    required autoFocus
                  />
                  {orgName && (
                    <p className="text-xs text-muted-foreground">
                      Your workspace URL: /app/<strong>{slugify(orgName)}</strong>
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Website <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input
                    type="url"
                    placeholder="https://yourcompany.com"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading || !orgName}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Start Free Trial
                </Button>
                <button
                  type="button"
                  onClick={() => setStep('account')}
                  className="w-full text-sm text-muted-foreground hover:text-foreground"
                >
                  ← Back
                </button>
              </form>
            </>
          )}

          {/* Done state */}
          {step === 'done' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold mb-2">You're all set!</h2>
              <p className="text-muted-foreground mb-2">
                Your 14-day trial has started. Check your email to verify your account.
              </p>
              <p className="text-sm text-muted-foreground">Redirecting to login...</p>
            </div>
          )}

          {step === 'account' && (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link to="/login" className="text-primary font-medium hover:underline">
                Sign in
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
