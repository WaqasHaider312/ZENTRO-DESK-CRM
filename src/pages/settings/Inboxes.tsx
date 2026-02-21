import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { Inbox as InboxType } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  Facebook, Instagram, Globe, MessageSquare,
  Trash2, Loader2, CheckCircle, X, ExternalLink, Inbox
} from 'lucide-react'
import { cn } from '@/lib/utils'

const META_APP_ID = '1563702864736349'
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

const CHANNEL_CONFIG = [
  { type: 'facebook', label: 'Facebook Messenger', icon: Facebook, color: 'bg-blue-500', description: 'Receive messages from your Facebook Page', available: true },
  { type: 'instagram', label: 'Instagram', icon: Instagram, color: 'bg-gradient-to-br from-purple-500 to-pink-500', description: 'Receive Instagram DMs', available: true },
  { type: 'widget', label: 'Web Widget', icon: Globe, color: 'bg-violet-500', description: 'Add a live chat widget to your website', available: false, comingSoon: true },
  { type: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, color: 'bg-green-500', description: 'Connect WhatsApp Business (contact us to setup)', available: false, comingSoon: true },
]

interface FacebookPage {
  id: string
  name: string
  access_token: string
  category: string
}

type ModalType = 'facebook' | 'instagram' | null

export default function Inboxes() {
  const { organization } = useAuth()
  const [inboxes, setInboxes] = useState<InboxType[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<ModalType>(null)
  const [connecting, setConnecting] = useState(false)
  const [pages, setPages] = useState<FacebookPage[]>([])
  const [selectedPage, setSelectedPage] = useState<FacebookPage | null>(null)
  const [inboxName, setInboxName] = useState('')
  const [oauthStep, setOauthStep] = useState<'connect' | 'select_page' | 'done'>('connect')

  useEffect(() => {
    fetchInboxes()
    // Check sessionStorage for OAuth callback params (set by /oauth/callback page)
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

  const startConnect = (type: 'facebook' | 'instagram') => {
    setModal(type); setOauthStep('connect'); setPages([]); setSelectedPage(null); setInboxName('')
  }

  const launchOAuthPopup = (type: 'facebook' | 'instagram') => {
    const redirectUri = `${window.location.origin}/oauth/callback`
    const state = `${type}:${organization!.id}`
    const scope = type === 'facebook'
      ? 'pages_messaging,pages_show_list,pages_manage_metadata'
      : 'pages_messaging,pages_show_list,pages_manage_metadata,instagram_basic,instagram_manage_messages'
    window.location.href = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(scope)}&response_type=code`
  }

  const handleOAuthCallback = async (code: string, state: string) => {
    const [type, orgId] = state.split(':')
    if (!orgId || !organization || orgId !== organization.id) return
    setModal(type as ModalType); setConnecting(true)
    try {
      const redirectUri = `${window.location.origin}/oauth/callback`
      const res = await fetch(`${SUPABASE_URL}/functions/v1/meta-oauth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'exchange_token', code, redirect_uri: redirectUri })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setPages(data.pages || []); setOauthStep('select_page')
    } catch (err: any) { toast.error(err.message || 'OAuth failed'); setModal(null) }
    finally { setConnecting(false) }
  }

  const connectPage = async () => {
    if (!selectedPage || !organization) return
    setConnecting(true)
    try {
      const action = modal === 'facebook' ? 'connect_facebook_page' : 'connect_instagram'
      const res = await fetch(`${SUPABASE_URL}/functions/v1/meta-oauth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      <div className="h-14 border-b border-border flex items-center px-6 gap-3">
        <Inbox className="w-4 h-4 text-muted-foreground" />
        <span className="font-semibold">Inboxes</span>
        {inboxes.length > 0 && <Badge variant="secondary">{inboxes.length}</Badge>}
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
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
                        <p className="text-xs text-muted-foreground">{inbox.fb_page_name || 'Connected'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle className="w-3.5 h-3.5" />Active</span>
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
                  className={cn('flex items-center gap-4 p-4 border border-border rounded-lg transition-colors', channel.available ? 'hover:border-primary/40 hover:bg-accent/20 cursor-pointer' : 'opacity-60')}
                  onClick={() => channel.available && startConnect(channel.type as any)}
                >
                  <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', channel.color)}>
                    <channel.icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{channel.label}</p>
                      {channel.comingSoon && <Badge variant="outline" className="text-xs">Coming Soon</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{channel.description}</p>
                  </div>
                  {channel.available && <Button variant="outline" size="sm">Connect</Button>}
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

      {modal && (
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
                  <p className="text-sm text-muted-foreground mb-6">{modal === 'facebook' ? "Select which Facebook Page to connect." : "Connect via your Facebook Page linked to your Instagram Business account."}</p>
                  <Button className={cn('w-full gap-2', modal === 'facebook' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gradient-to-r from-purple-600 to-pink-600')} onClick={() => launchOAuthPopup(modal)} disabled={connecting}>
                    {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                    Continue with Facebook
                  </Button>
                </div>
              )}

              {oauthStep === 'select_page' && (
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
    </div>
  )
}