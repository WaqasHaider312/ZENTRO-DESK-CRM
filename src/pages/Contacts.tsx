import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { cn, getInitials, formatTimeAgo } from '@/lib/utils'
import { Contact, Conversation } from '@/types'
import {
  Users, Search, Phone, Mail, MapPin, Building, Globe,
  Facebook, Instagram, MessageCircle, ChevronRight, Loader2,
  ArrowLeft, X, FileText, Sparkles, ExternalLink
} from 'lucide-react'
import { Button } from '@/components/ui/button'

// ── Types ─────────────────────────────────────────────────────────────

interface ContactWithStats extends Contact {
  conversation_count: number
  last_seen?: string
  channels: string[]
}

interface ContactConversation extends Conversation {
  ticket_number?: number
  inbox?: { channel_type: string; name: string }
}

// ── Helpers ───────────────────────────────────────────────────────────

const CHANNEL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  whatsapp: Phone,
  facebook: Facebook,
  instagram: Instagram,
  widget: Globe,
  email: Mail,
}

const CHANNEL_COLORS: Record<string, string> = {
  whatsapp: 'text-green-600',
  facebook: 'text-blue-600',
  instagram: 'text-pink-600',
  widget: 'text-violet-600',
  email: 'text-orange-600',
}

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  instagram: 'Instagram',
  widget: 'Web Widget',
  email: 'Email',
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'In Progress', cls: 'bg-amber-100 text-amber-700' },
  pending: { label: 'Pending', cls: 'bg-orange-100 text-orange-700' },
  resolved: { label: 'Resolved', cls: 'bg-green-100 text-green-700' },
}

// ── Contact Card (list item) ──────────────────────────────────────────

function ContactCard({
  contact,
  isSelected,
  onClick,
}: {
  contact: ContactWithStats
  isSelected: boolean
  onClick: () => void
}) {
  const name = contact.name || contact.phone || contact.email || 'Unknown'

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left flex items-center gap-3 px-4 py-3.5 border-b border-gray-100 hover:bg-gray-50 transition-colors',
        isSelected && 'bg-blue-50 border-l-4 border-l-primary'
      )}
    >
      {/* Avatar */}
      <div className={cn(
        'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0',
        isSelected ? 'bg-primary text-white' : 'bg-gray-200 text-gray-600'
      )}>
        {getInitials(name)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
          <span className="text-[10px] text-gray-400 flex-shrink-0">
            {contact.conversation_count} ticket{contact.conversation_count !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Channel icons */}
          <div className="flex items-center gap-1">
            {contact.channels.slice(0, 3).map(ch => {
              const Icon = CHANNEL_ICONS[ch] || MessageCircle
              return (
                <Icon key={ch} className={cn('w-3 h-3', CHANNEL_COLORS[ch] || 'text-gray-400')} />
              )
            })}
          </div>

          {/* Secondary info */}
          {(contact.phone || contact.email) && (
            <p className="text-xs text-gray-400 truncate">
              {contact.phone || contact.email}
            </p>
          )}
        </div>
      </div>

      <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
    </button>
  )
}

// ── Contact Detail Panel ──────────────────────────────────────────────

function ContactDetail({
  contact,
  onClose,
}: {
  contact: ContactWithStats
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const [conversations, setConversations] = useState<ContactConversation[]>([])
  const [loading, setLoading] = useState(true)
  const [displayCount, setDisplayCount] = useState(10)

  const name = contact.name || contact.phone || contact.email || 'Unknown'

  useEffect(() => {
    fetchConversations()
    setDisplayCount(10)
  }, [contact.id])

  const fetchConversations = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*, inbox:inboxes(id, name, channel_type), assigned_agent:agent_profiles!assigned_agent_id(id, full_name)')
        .eq('contact_id', contact.id)
        .order('updated_at', { ascending: false })

      if (error) throw error
      setConversations((data as ContactConversation[]) || [])
    } catch (err) {
      console.error('Error loading contact conversations:', err)
    } finally {
      setLoading(false)
    }
  }

  const openConversation = (conv: ContactConversation) => {
    navigate(`/app/${orgSlug}/conversations/${conv.id}`)
  }

  // Unique channels this contact has messaged from
  const uniqueChannels = [...new Set(
    conversations.map(c => c.inbox?.channel_type).filter(Boolean)
  )]

  return (
    <div className="flex flex-col h-full bg-white">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 flex-shrink-0">
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600 md:hidden"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-gray-900 truncate">{name}</h2>
          <p className="text-xs text-gray-400">
            {contact.conversation_count} conversation{contact.conversation_count !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600 hidden md:block"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* Contact profile card */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary text-lg font-bold flex-shrink-0">
              {getInitials(name)}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-gray-900 text-base">{name}</p>
              {contact.company && (
                <p className="text-sm text-gray-500 truncate">{contact.company}</p>
              )}
              <p className="text-xs text-gray-400 mt-0.5">
                Contact since {formatTimeAgo(contact.created_at)}
              </p>
            </div>
          </div>

          {/* Contact details */}
          <div className="space-y-2">
            {contact.phone && (
              <div className="flex items-center gap-2.5 text-sm">
                <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="text-gray-700 font-medium">{contact.phone}</span>
              </div>
            )}
            {contact.email && (
              <div className="flex items-center gap-2.5 text-sm">
                <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="text-gray-700 truncate">{contact.email}</span>
              </div>
            )}
            {contact.location && (
              <div className="flex items-center gap-2.5 text-sm">
                <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="text-gray-700">{contact.location}</span>
              </div>
            )}
            {contact.company && (
              <div className="flex items-center gap-2.5 text-sm">
                <Building className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="text-gray-700">{contact.company}</span>
              </div>
            )}
          </div>

          {/* Channel IDs */}
          {(contact.wa_id || contact.fb_psid || contact.ig_id) && (
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Platform IDs</p>
              {contact.wa_id && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Phone className="w-3 h-3 text-green-500" />
                  <span className="font-medium text-green-700">WhatsApp:</span>
                  <span className="font-mono text-gray-600">{contact.wa_id}</span>
                </div>
              )}
              {contact.fb_psid && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Facebook className="w-3 h-3 text-blue-500" />
                  <span className="font-medium text-blue-700">Facebook:</span>
                  <span className="font-mono text-gray-600 truncate">{contact.fb_psid}</span>
                </div>
              )}
              {contact.ig_id && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Instagram className="w-3 h-3 text-pink-500" />
                  <span className="font-medium text-pink-700">Instagram:</span>
                  <span className="font-mono text-gray-600">{contact.ig_id}</span>
                </div>
              )}
            </div>
          )}

          {/* Channels used */}
          {uniqueChannels.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Active Channels</p>
              <div className="flex items-center gap-2 flex-wrap">
                {uniqueChannels.map(ch => {
                  const Icon = CHANNEL_ICONS[ch!] || MessageCircle
                  return (
                    <span
                      key={ch}
                      className={cn(
                        'flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full',
                        'bg-gray-100 text-gray-600'
                      )}
                    >
                      <Icon className={cn('w-3 h-3', CHANNEL_COLORS[ch!] || 'text-gray-400')} />
                      {CHANNEL_LABELS[ch!] || ch}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {/* Notes */}
          {contact.notes && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Notes</p>
              <p className="text-sm text-gray-600 leading-relaxed">{contact.notes}</p>
            </div>
          )}
        </div>

        {/* Conversation history */}
        <div className="p-5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
            Conversation History ({conversations.length})
          </p>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-8">
              <MessageCircle className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No conversations yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.slice(0, displayCount).map(conv => {
                const ticketNum = conv.ticket_number
                  ? `TKT${String(conv.ticket_number).padStart(6, '0')}`
                  : null
                const statusCfg = STATUS_CONFIG[conv.status] || STATUS_CONFIG.open
                const channelType = conv.inbox?.channel_type || 'widget'
                const Icon = CHANNEL_ICONS[channelType] || MessageCircle
                const assignedAgent = conv.assigned_agent as any

                return (
                  <button
                    key={conv.id}
                    onClick={() => openConversation(conv)}
                    className="w-full text-left p-3.5 border border-gray-200 rounded-xl hover:border-primary hover:bg-blue-50/40 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', CHANNEL_COLORS[channelType] || 'text-gray-400')} />
                        <span className="text-xs font-bold text-primary truncate">
                          {ticketNum || 'Ticket'}
                        </span>
                        {conv.ai_handled && (
                          <span className="flex items-center gap-0.5 bg-violet-100 text-violet-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0">
                            <Sparkles className="w-2.5 h-2.5" />AI
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', statusCfg.cls)}>
                          {statusCfg.label}
                        </span>
                        <ExternalLink className="w-3 h-3 text-gray-300 group-hover:text-primary transition-colors" />
                      </div>
                    </div>

                    <p className="text-xs text-gray-500 truncate mb-1.5">
                      {conv.latest_message || 'No messages'}
                    </p>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-400">
                          {conv.inbox?.name || CHANNEL_LABELS[channelType]}
                        </span>
                        {assignedAgent?.full_name && (
                          <>
                            <span className="text-gray-300">·</span>
                            <span className="text-[10px] text-gray-400 truncate max-w-[80px]">
                              {assignedAgent.full_name}
                            </span>
                          </>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-400">
                        {formatTimeAgo(conv.updated_at)}
                      </span>
                    </div>
                  </button>
                )
              })}

              {displayCount < conversations.length && (
                <button
                  onClick={() => setDisplayCount(d => d + 10)}
                  className="w-full py-2.5 text-xs font-semibold text-primary hover:bg-blue-50 rounded-xl border border-dashed border-primary/30 transition-colors"
                >
                  Load more ({conversations.length - displayCount} remaining)
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────

export default function Contacts() {
  const { organization } = useAuth()
  const [contacts, setContacts] = useState<ContactWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedContact, setSelectedContact] = useState<ContactWithStats | null>(null)
  const [displayCount, setDisplayCount] = useState(30)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (organization) fetchContacts()
  }, [organization?.id])

  // Infinite scroll
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const handler = () => {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
        setDisplayCount(d => d + 30)
      }
    }
    el.addEventListener('scroll', handler)
    return () => el.removeEventListener('scroll', handler)
  }, [])

  const fetchContacts = async () => {
    if (!organization) return
    setLoading(true)
    try {
      // Fetch contacts with conversation aggregates
      const { data: contactData, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('organization_id', organization.id)
        .order('updated_at', { ascending: false })

      if (error) throw error

      // For each contact, count conversations and find channels
      // Do this efficiently with a single conversations query
      const { data: convData } = await supabase
        .from('conversations')
        .select('contact_id, status, updated_at, inbox:inboxes(channel_type)')
        .eq('organization_id', organization.id)

      // Build per-contact stats map
      const statsMap = new Map<string, { count: number; channels: Set<string>; lastSeen: string }>()
        ; (convData || []).forEach((c: any) => {
          const existing = statsMap.get(c.contact_id) || { count: 0, channels: new Set<string>(), lastSeen: '' }
          existing.count++
          if (c.inbox?.channel_type) existing.channels.add(c.inbox.channel_type)
          if (!existing.lastSeen || c.updated_at > existing.lastSeen) existing.lastSeen = c.updated_at
          statsMap.set(c.contact_id, existing)
        })

      const enriched: ContactWithStats[] = (contactData || []).map(c => {
        const stats = statsMap.get(c.id)
        return {
          ...c,
          conversation_count: stats?.count || 0,
          last_seen: stats?.lastSeen,
          channels: stats ? [...stats.channels] : [],
        }
      })

      setContacts(enriched)
    } catch (err) {
      console.error('Error loading contacts:', err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = contacts.filter(c => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (c.name || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.company || '').toLowerCase().includes(q)
    )
  })

  const displayed = filtered.slice(0, displayCount)

  return (
    <div className="flex h-full overflow-hidden bg-gray-50">

      {/* ── Left: Contact List ──────────────────────────────────── */}
      <div className={cn(
        'flex flex-col bg-white border-r border-gray-200 h-full flex-shrink-0',
        selectedContact ? 'w-80 hidden md:flex' : 'flex-1 md:w-80'
      )}>

        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <h1 className="font-bold text-gray-900">Contacts</h1>
            </div>
            <span className="text-xs text-gray-400 font-medium">
              {contacts.length} total
            </span>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setDisplayCount(30) }}
              placeholder="Search name, phone, email…"
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {search && (
            <p className="text-xs text-gray-400 mt-2">
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* List */}
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <Users className="w-12 h-12 text-gray-200 mb-3" />
              <p className="font-semibold text-gray-600">
                {search ? 'No contacts match' : 'No contacts yet'}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {search ? 'Try a different search' : 'Contacts appear here as conversations come in'}
              </p>
            </div>
          ) : (
            <>
              {displayed.map(contact => (
                <ContactCard
                  key={contact.id}
                  contact={contact}
                  isSelected={selectedContact?.id === contact.id}
                  onClick={() => setSelectedContact(contact)}
                />
              ))}
              {displayCount < filtered.length && (
                <div className="flex justify-center p-4">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Right: Contact Detail ───────────────────────────────── */}
      <div className={cn(
        'flex-1 h-full overflow-hidden',
        !selectedContact && 'hidden md:flex md:items-center md:justify-center'
      )}>
        {selectedContact ? (
          <ContactDetail
            key={selectedContact.id}
            contact={selectedContact}
            onClose={() => setSelectedContact(null)}
          />
        ) : (
          <div className="text-center p-8">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-gray-300" />
            </div>
            <p className="font-semibold text-gray-500">Select a contact</p>
            <p className="text-sm text-gray-400 mt-1">View their profile and conversation history</p>
          </div>
        )}
      </div>

    </div>
  )
}