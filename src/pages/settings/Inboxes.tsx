import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { Inbox as InboxType } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  Facebook, Instagram, Globe, MessageSquare, Phone,
  Trash2, Loader2, CheckCircle, X, ExternalLink, Inbox, Copy
} from 'lucide-react'
import { cn } from '@/lib/utils'

const META_APP_ID = '1563702864736349'
const WA_CONFIG_ID = '928857589841202'
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

// Extend window type for FB SDK
declare global {
  interface Window {
    FB: any
    fbAsyncInit: any
  }
}

const CHANNEL_CONFIG = [
  { type: 'facebook', label: 'Facebook Messenger', icon: Facebook, color: 'bg-blue-500', description: 'Receive messages from your Facebook Page', available: true },
  { type: 'instagram', label: 'Instagram', icon: Instagram, color: 'bg-gradient-to-br from-purple-500 to-pink-500', description: 'Receive Instagram DMs', available: true },
  { type: 'whatsapp', label: 'WhatsApp Business', icon: Phone, color: 'bg-green-500', description: 'Connect your WhatsApp Business number via Meta', available: true },
  { type: 'widget', label: 'Web Widget', icon: Globe, color: 'bg-violet-500', description: 'Add a live chat widget to your website', available: true },
]

interface FacebookPage {
  id: string; name: string; access_token: string; category: string
}
interface WhatsAppNumber {
  id: string; display_phone_number: string; verified_name: string; status: string; waba_id: string; access_token?: string
}

type ModalType = 'facebook' | 'instagram' | 'whatsapp' | 'widget' | null

// Load Facebook JS SDK
function loadFbSdk(appId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.FB) {
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: true, version: 'v19.0' })
      resolve()
      return
    }
    const timeout = setTimeout(() => reject(new Error('Facebook SDK load timeout')), 10000)
    window.fbAsyncInit = function () {
      clearTimeout(timeout)
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: true, version: 'v19.0' })
      resolve()
    }
    if (!document.getElementById('facebook-jssdk')) {
      const script = document.createElement('script')
      script.id = 'facebook-jssdk'
      script.src = 'https://connect.facebook.net/en_US/sdk.js'
      script.async = true
      script.defer = true
      script.onerror = () => { clearTimeout(timeout); reject(new Error('Failed to load Facebook SDK')) }
      document.head.appendChild(script)
    }
  })
}

export default function Inboxes() {
  const { organization } = useAuth()
  const [inboxes, setInboxes] = useState<InboxType[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<ModalType>(null)
  const [connecting, setConnecting] = useState(false)
  const [pages, setPages] = useState<FacebookPage[]>([])
  const [selectedPage, setSelectedPage] = useState<FacebookPage | null>(null)
  const [waNumbers, setWaNumbers] = useState<WhatsAppNumber[]>([])
  const [selectedNumber, setSelectedNumber] = useState<WhatsAppNumber | null>(null)
  const [inboxName, setInboxName] = useState('')
  const [oauthStep, setOauthStep] = useState<'connect' | 'select' | 'done'>('connect')

  // Load FB SDK on mount so it's ready when user clicks Connect
  useEffect(() => {
    loadFbSdk(META_APP_ID).catch(() => console.warn('FB SDK failed to preload'))
  }, [])

  useEffect(() => {
    fetchInboxes()
    // Handle Facebook/Instagram OAuth callback (not WhatsApp — WA uses Embedded Signup)
    const code = sessionStorage.getItem('oauth_code')
    const state = sessionStorage.getItem('oauth_state')
    if (code && state) {
      sessionStorage.removeItem('oauth_code')
      sessionStorage.removeItem('oauth_state')
      handleOAuthCallback(code, state)
    }
  }, [organization])

  const fetchInboxes = async () => {
    if (!organization) return
    setLoading(true)
    try {
      const { data, error } = await supabase.from('inboxes').select('*').eq('organization_id', organization.id).eq('is_active', true).order('created_at', { ascending: false })
      if (error) throw error
      setInboxes(data || [])
    } catch { toast.error('Failed to load inboxes') }
    finally { setLoading(false) }
  }

  const startConnect = (type: 'facebook' | 'instagram' | 'whatsapp' | 'widget') => {
    if (type === 'widget') { createWidgetInbox(); return }
    setModal(type); setOauthStep('connect')
    setPages([]); setSelectedPage(null)
    setWaNumbers([]); setSelectedNumber(null)
    setInboxName('')
  }

  const createWidgetInbox = async () => {
    if (!organization) return
    const existing = inboxes.find(i => i.channel_type === 'widget')
    if (existing) { setModal('widget'); return }
    setConnecting(true)
    try {
      const token = crypto.randomUUID()
      const { error } = await supabase.from('inboxes').insert({
        organization_id: organization.id, name: 'Web Widget',
        channel_type: 'widget', widget_token: token, is_active: true,
      })
      if (error) throw error
      toast.success('Widget inbox created!')
      await fetchInboxes(); setModal('widget')
    } catch (err: any) { toast.error(err.message || 'Failed to create widget inbox') }
    finally { setConnecting(false) }
  }

  const copyEmbedCode = (token: string) => {
    const code = `<script>\n  window.ZentroWidget = { token: '${token}' };\n  (function(d,s){var js=d.createElement(s);js.src='https://app.zentrodesk.com/widget.js';d.head.appendChild(js)})(document,'script');\n<\/script>`
    navigator.clipboard.writeText(code)
    toast.success('Embed code copied!')
  }

  // ── Facebook / Instagram OAuth (unchanged) ────────────────────────────────
  const launchOAuthPopup = (type: 'facebook' | 'instagram') => {
    const redirectUri = `${window.location.origin}/oauth/callback`
    const state = `${type}:${organization!.id}`
    let scope = ''
    if (type === 'facebook') scope = 'pages_messaging,pages_show_list,pages_manage_metadata'
    else scope = 'pages_messaging,pages_show_list,pages_manage_metadata,instagram_basic,instagram_manage_messages'
    window.location.href = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(scope)}&response_type=code`
  }

  const handleOAuthCallback = async (code: string, state: string) => {
    const [type, orgId] = state.split(':')
    if (!orgId || !organization || orgId !== organization.id) return
    setModal(type as ModalType); setConnecting(true)
    try {
      const redirectUri = `${window.location.origin}/oauth/callback`
      const res = await fetch(`${SUPABASE_URL}/functions/v1/meta-oauth`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'exchange_token', code, redirect_uri: redirectUri })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setPages(data.pages || [])
      setOauthStep('select')
    } catch (err: any) { toast.error(err.message || 'OAuth failed'); setModal(null) }
    finally { setConnecting(false) }
  }

  // ── WhatsApp Embedded Signup ──────────────────────────────────────────────
  const launchWhatsAppEmbeddedSignup = useCallback(async () => {
    setConnecting(true)
    try {
      await loadFbSdk(META_APP_ID)
      window.FB.login(
        (response: any) => {
          if (!response.authResponse?.code) {
            // User cancelled
            setConnecting(false)
            return
          }
          const code = response.authResponse.code
          // Exchange code for WABA + phone numbers via edge function
          fetch(`${SUPABASE_URL}/functions/v1/meta-oauth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'exchange_token_embedded_signup', code })
          })
            .then(res => res.json())
            .then((data) => {
              if (data.error) throw new Error(data.error)
              const numbers: WhatsAppNumber[] = data.phone_numbers || []
              if (numbers.length === 0) {
                toast.error('No WhatsApp numbers found. Make sure you completed the setup and added a phone number.')
                return
              }
              setWaNumbers(numbers)
              if (numbers.length === 1) {
                setSelectedNumber(numbers[0])
                setInboxName(numbers[0].verified_name || numbers[0].display_phone_number)
              }
              setOauthStep('select')
            })
            .catch((err: any) => {
              toast.error(err.message || 'Failed to fetch WhatsApp numbers')
            })
            .finally(() => {
              setConnecting(false)
            })
        },
        {
          config_id: WA_CONFIG_ID,
          response_type: 'code',
          override_default_response_type: true,
          extras: {
            setup: {},
            featureType: '',
            sessionInfoVersion: '3',
          },
        }
      )
    } catch (err: any) {
      console.error('Embedded Signup error:', err)
      toast.error(err.message || 'Failed to load Meta SDK. Check your internet connection and try again.')
      setConnecting(false)
    }
  }, [organization])

  const connectWhatsApp = async () => {
    if (!selectedNumber || !organization) return
    setConnecting(true)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/meta-oauth`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'connect_whatsapp',
          phone_number_id: selectedNumber.id,
          phone_number: selectedNumber.display_phone_number,
          verified_name: selectedNumber.verified_name,
          waba_id: selectedNumber.waba_id,
          access_token: selectedNumber.access_token,
          organization_id: organization.id,
          inbox_name: inboxName || selectedNumber.verified_name || selectedNumber.display_phone_number,
        })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setOauthStep('done'); toast.success('WhatsApp connected!'); fetchInboxes()
      setTimeout(() => setModal(null), 2000)
    } catch (err: any) { toast.error(err.message || 'Failed to connect WhatsApp') }
    finally { setConnecting(false) }
  }

  const connectPage = async () => {
    if (!selectedPage || !organization) return
    setConnecting(true)
    try {
      const action = modal === 'facebook' ? 'connect_facebook_page' : 'connect_instagram'
      const res = await fetch(`${SUPABASE_URL}/functions/v1/meta-oauth`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, page_id: selectedPage.id, page_name: selectedPage.name, page_access_token: selectedPage.access_token, organization_id: organization.id, inbox_name: inboxName || selectedPage.name })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setOauthStep('done'); toast.success('Connected successfully!'); fetchInboxes()
      setTimeout(() => setModal(null), 2000)
    } catch (err: any) { toast.error(err.message || 'Failed to connect') }
    finally { setConnecting(false) }
  }

  const disconnectInbox = async (inboxId: string) => {
    if (!confirm('Disconnect this inbox?')) return
    await supabase.from('inboxes').update({ is_active: false }).eq('id', inboxId)
    setInboxes(prev => prev.filter(i => i.id !== inboxId))
    toast.success('Inbox disconnected')
  }

  const getConfig = (type: string) => CHANNEL_CONFIG.find(c => c.type === type)

  return (
    <div className="flex-1 flex flex-col">
      <div className="h-16 border-b border-gray-200 bg-white flex items-center px-8 gap-3 flex-shrink-0">
        <Inbox className="w-5 h-5 text-gray-400" />
        <div>
          <h1 className="font-bold text-gray-900">Inboxes</h1>
          <p className="text-xs text-gray-500">{inboxes.length} connected inbox{inboxes.length !== 1 ? 'es' : ''}</p>
        </div>
      </div>

      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-2xl space-y-8">

          {inboxes.length > 0 && (
            <div>
              <h3 className="font-semibold mb-3 text-sm">Connected Inboxes</h3>
              <div className="space-y-2">
                {inboxes.map(inbox => {
                  const config = getConfig(inbox.channel_type)
                  if (!config) return null
                  return (
                    <div key={inbox.id} className="flex items-center gap-4 p-4 border border-border rounded-lg">
                      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', config.color)}>
                        <config.icon className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{inbox.name}</p>
                          <Badge variant="secondary" className="text-xs capitalize">{inbox.channel_type}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {inbox.wa_phone_number || inbox.fb_page_name || 'Connected'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle className="w-3.5 h-3.5" />Active</span>
                        {inbox.channel_type === 'widget' && (
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setModal('widget')}>
                            <Copy className="w-3 h-3" />Embed Code
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => disconnectInbox(inbox.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div>
            <h3 className="font-semibold mb-1 text-sm">Add New Inbox</h3>
            <p className="text-xs text-muted-foreground mb-4">Connect a communication channel to start receiving messages.</p>
            <div className="space-y-2">
              {CHANNEL_CONFIG.map(channel => (
                <div key={channel.type}
                  className="flex items-center gap-4 p-4 border border-border rounded-lg hover:border-primary/40 hover:bg-accent/20 cursor-pointer transition-colors"
                  onClick={() => startConnect(channel.type as any)}
                >
                  <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', channel.color)}>
                    <channel.icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{channel.label}</p>
                    <p className="text-xs text-muted-foreground">{channel.description}</p>
                  </div>
                  <Button variant="outline" size="sm">Connect</Button>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 bg-muted/50 rounded-lg border border-border">
            <p className="text-xs font-medium mb-1">Webhook URL</p>
            <code className="text-xs text-primary break-all">{SUPABASE_URL}/functions/v1/meta-webhook</code>
            <p className="text-xs text-muted-foreground mt-2">Verify token: <code className="text-foreground">zentro_webhook_2024_secure</code></p>
          </div>
        </div>
      </div>

      {/* Widget Modal */}
      {modal === 'widget' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl border border-border w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="font-semibold">Web Widget Setup</h3>
              <button onClick={() => setModal(null)} className="p-1 hover:bg-accent rounded-md"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              {(() => {
                const widgetInbox = inboxes.find(i => i.channel_type === 'widget')
                const token = widgetInbox?.widget_token
                const embedCode = token ? `<script>\n  window.ZentroWidget = { token: '${token}' };\n  (function(d,s){var js=d.createElement(s);js.src='https://app.zentrodesk.com/widget.js';d.head.appendChild(js)})(document,'script');\n</script>` : ''
                return (
                  <>
                    <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                      <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                      <p className="text-sm text-green-800 font-medium">Your widget is ready!</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-2">Embed Code</p>
                      <div className="relative">
                        <pre className="bg-muted rounded-lg p-3 text-xs overflow-x-auto text-foreground leading-5 whitespace-pre-wrap break-all">{embedCode}</pre>
                        <Button size="sm" variant="outline" className="absolute top-2 right-2 h-7 gap-1 text-xs" onClick={() => token && copyEmbedCode(token)}>
                          <Copy className="w-3 h-3" />Copy
                        </Button>
                      </div>
                    </div>
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Facebook / Instagram Modal */}
      {(modal === 'facebook' || modal === 'instagram') && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl border border-border w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="font-semibold">Connect {modal === 'facebook' ? 'Facebook Messenger' : 'Instagram'}</h3>
              <button onClick={() => setModal(null)} className="p-1 hover:bg-accent rounded-md"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5">
              {oauthStep === 'connect' && (
                <div className="text-center py-4">
                  <div className={cn('w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4', modal === 'facebook' ? 'bg-blue-500' : 'bg-gradient-to-br from-purple-500 to-pink-500')}>
                    {modal === 'facebook' ? <Facebook className="w-8 h-8 text-white" /> : <Instagram className="w-8 h-8 text-white" />}
                  </div>
                  <p className="font-medium mb-2">Connect your {modal === 'facebook' ? 'Facebook Page' : 'Instagram Account'}</p>
                  <p className="text-sm text-muted-foreground mb-6">
                    {modal === 'facebook' ? 'Select which Facebook Page to connect.' : 'Connect via your Facebook Page linked to your Instagram Business account.'}
                  </p>
                  <Button className={cn('w-full gap-2', modal === 'facebook' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gradient-to-r from-purple-600 to-pink-600')} onClick={() => launchOAuthPopup(modal)} disabled={connecting}>
                    {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                    Continue with Facebook
                  </Button>
                </div>
              )}
              {oauthStep === 'select' && (
                <div>
                  <p className="text-sm text-muted-foreground mb-4">Select which page to connect:</p>
                  <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                    {pages.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No pages found. Make sure you have admin access to a Facebook Page.</p>}
                    {pages.map(page => (
                      <button key={page.id} onClick={() => { setSelectedPage(page); setInboxName(page.name) }}
                        className={cn('w-full text-left p-3 rounded-lg border transition-colors', selectedPage?.id === page.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40')}>
                        <p className="font-medium text-sm">{page.name}</p>
                        <p className="text-xs text-muted-foreground">{page.category}</p>
                      </button>
                    ))}
                  </div>
                  {selectedPage && (
                    <div className="mb-4">
                      <Label className="text-xs">Inbox Name</Label>
                      <Input value={inboxName} onChange={e => setInboxName(e.target.value)} placeholder={selectedPage.name} className="mt-1 h-8 text-sm" />
                    </div>
                  )}
                  <Button className="w-full" onClick={connectPage} disabled={!selectedPage || connecting}>
                    {connecting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    Connect {selectedPage?.name || 'Page'}
                  </Button>
                </div>
              )}
              {oauthStep === 'done' && (
                <div className="text-center py-6">
                  <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <CheckCircle className="w-7 h-7 text-green-600" />
                  </div>
                  <p className="font-semibold">Connected!</p>
                  <p className="text-sm text-muted-foreground mt-1">Messages will now appear in your conversations.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Modal — Embedded Signup */}
      {modal === 'whatsapp' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl border border-border w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="font-semibold">Connect WhatsApp Business</h3>
              <button onClick={() => setModal(null)} className="p-1 hover:bg-accent rounded-md"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5">
              {oauthStep === 'connect' && (
                <div className="text-center py-4">
                  <div className="w-16 h-16 rounded-2xl bg-green-500 flex items-center justify-center mx-auto mb-4">
                    <Phone className="w-8 h-8 text-white" />
                  </div>
                  <p className="font-medium mb-2">Connect WhatsApp Business</p>
                  <p className="text-sm text-muted-foreground mb-5">
                    Click below to connect your WhatsApp Business number. You'll go through Meta's official setup — no technical knowledge required.
                  </p>
                  <div className="text-left bg-green-50 border border-green-200 rounded-lg p-3 mb-5 space-y-1">
                    <p className="text-xs font-semibold text-green-800">What you'll need:</p>
                    <p className="text-xs text-green-700">• A Facebook account with access to your business</p>
                    <p className="text-xs text-green-700">• A phone number for WhatsApp Business</p>
                    <p className="text-xs text-green-700">• A WhatsApp Business Account (or create one during setup)</p>
                  </div>
                  <Button
                    className="w-full gap-2 bg-green-600 hover:bg-green-700 h-11 text-sm font-semibold"
                    onClick={launchWhatsAppEmbeddedSignup}
                    disabled={connecting}
                  >
                    {connecting
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Setting up...</>
                      : <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /><path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.553 4.121 1.524 5.855L0 24l6.336-1.501A11.955 11.955 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.003-1.371l-.36-.214-3.727.882.925-3.63-.234-.373A9.818 9.818 0 1112 21.818z" /></svg> Connect with WhatsApp</>
                    }
                  </Button>
                </div>
              )}

              {oauthStep === 'select' && (
                <div>
                  <p className="text-sm text-muted-foreground mb-3">
                    {waNumbers.length === 1 ? 'Found your WhatsApp number:' : 'Select a WhatsApp number to connect:'}
                  </p>
                  <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                    {waNumbers.map(num => (
                      <button key={num.id}
                        onClick={() => { setSelectedNumber(num); setInboxName(num.verified_name || num.display_phone_number) }}
                        className={cn('w-full text-left p-3 rounded-lg border transition-colors', selectedNumber?.id === num.id ? 'border-green-500 bg-green-50' : 'border-border hover:border-green-300')}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">{num.verified_name || 'WhatsApp Business'}</p>
                            <p className="text-xs text-muted-foreground">{num.display_phone_number}</p>
                          </div>
                          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full',
                            num.status === 'VERIFIED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700')}>
                            {num.status}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                  {selectedNumber && (
                    <div className="mb-4">
                      <Label className="text-xs">Inbox Name</Label>
                      <Input value={inboxName} onChange={e => setInboxName(e.target.value)} placeholder={selectedNumber.verified_name} className="mt-1 h-8 text-sm" />
                    </div>
                  )}
                  <Button className="w-full bg-green-600 hover:bg-green-700" onClick={connectWhatsApp} disabled={!selectedNumber || connecting}>
                    {connecting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    Connect {selectedNumber?.display_phone_number || 'Number'}
                  </Button>
                </div>
              )}

              {oauthStep === 'done' && (
                <div className="text-center py-6">
                  <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <CheckCircle className="w-7 h-7 text-green-600" />
                  </div>
                  <p className="font-semibold">WhatsApp Connected!</p>
                  <p className="text-sm text-muted-foreground mt-1">Messages will now appear in your conversations.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}