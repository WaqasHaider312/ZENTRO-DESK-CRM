import { useState, useEffect } from 'react'
import { useConversations } from '@/contexts/ConversationsContext'
import { useAuth } from '@/contexts/AuthContext'
import { cn, getInitials, formatTimeAgo } from '@/lib/utils'
import { Phone, Mail, MapPin, Building, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { AgentProfile } from '@/types'

interface ContactInfoPanelProps {
  onClose: () => void
}

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'in_progress', label: 'In Progress', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'pending', label: 'Pending', cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  { value: 'resolved', label: 'Resolved', cls: 'bg-green-100 text-green-700 border-green-200' },
]

export default function ContactInfoPanel({ onClose }: ContactInfoPanelProps) {
  const { selectedId, conversations, refresh } = useConversations()
  // BUG FIX: get organization to scope agent query
  const { profile, organization } = useAuth()
  const conversation = conversations.find(c => c.id === selectedId)
  const contact = conversation?.contact
  const [agents, setAgents] = useState<AgentProfile[]>([])
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    if (!organization) return
    // BUG FIX #1: Filter agents by organization_id — was showing all orgs
    supabase
      .from('agent_profiles')
      .select('id, full_name, email, role, is_active, availability, organization_id, created_at, updated_at, avatar_url')
      .eq('organization_id', organization.id)
      .eq('is_active', true)
      .order('full_name')
      .then(({ data }) => setAgents((data as AgentProfile[]) || []))
  }, [organization?.id])

  if (!conversation || !contact) return null

  const contactName = contact.name || contact.phone || contact.email || 'Unknown'
  const assignedAgent = conversation.assigned_agent as any
  const ticketNum = (conversation as any).ticket_number
    ? `TKT${String((conversation as any).ticket_number).padStart(6, '0')}`
    : null
  const previousConvs = conversations
    .filter(c => c.contact_id === contact.id && c.id !== selectedId)
    .slice(0, 5)
  const currentStatus = STATUS_OPTIONS.find(s => s.value === conversation.status) || STATUS_OPTIONS[0]

  // Helper: insert a system message (all required fields included)
  const insertSystemMessage = async (content: string) => {
    await supabase.from('messages').insert({
      conversation_id: selectedId!,
      organization_id: conversation.organization_id,
      sender_type: 'system',
      sender_name: 'System',
      message_type: 'activity',
      content,
      is_private: false,  // BUG FIX #2: was missing
      is_read: true,       // BUG FIX #2: was missing
      is_deleted: false,
    })
  }

  const updateStatus = async (status: string) => {
    if (status === conversation.status) return
    setUpdating(true)
    try {
      await supabase
        .from('conversations')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', selectedId!)

      await insertSystemMessage(
        `${profile?.full_name} changed status to ${status.replace('_', ' ')}`
      )

      toast.success(`Status → ${status.replace('_', ' ')}`)
      refresh()
    } catch { toast.error('Failed to update status') }
    finally { setUpdating(false) }
  }

  const updateAssign = async (agentId: string) => {
    setUpdating(true)
    try {
      const val = agentId === '' ? null : agentId
      await supabase
        .from('conversations')
        .update({ assigned_agent_id: val, updated_at: new Date().toISOString() })
        .eq('id', selectedId!)

      const agentName = agents.find(a => a.id === agentId)?.full_name
      await insertSystemMessage(
        val == null
          ? `${profile?.full_name} unassigned this ticket`
          : `${profile?.full_name} assigned this ticket to ${agentName}`
      )

      toast.success(val == null ? 'Ticket unassigned' : `Assigned to ${agentName}`)
      refresh()
    } catch { toast.error('Failed to assign') }
    finally { setUpdating(false) }
  }

  const markResolved = () => updateStatus('resolved')

  return (
    <div className="w-72 border-l border-gray-200 flex flex-col h-full bg-white flex-shrink-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-gray-200 flex-shrink-0">
        <span className="font-bold text-sm text-gray-900">Ticket Info</span>
        <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* Contact & Ticket Info */}
        <div className="p-4 border-b border-gray-200">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
            Contact &amp; Ticket Info
          </p>

          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold flex-shrink-0">
              {getInitials(contactName)}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm text-gray-900 truncate">{contactName}</p>
              {contact.company && <p className="text-xs text-gray-500 truncate">{contact.company}</p>}
            </div>
          </div>

          <div className="space-y-2">
            {contact.phone && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="font-medium">{contact.phone}</span>
              </div>
            )}
            {contact.email && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="truncate">{contact.email}</span>
              </div>
            )}
            {contact.location && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span>{contact.location}</span>
              </div>
            )}
            {contact.company && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Building className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span>{contact.company}</span>
              </div>
            )}
          </div>

          {ticketNum && (
            <div className="mt-4 pt-3 border-t border-gray-100 grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-gray-400 mb-0.5">Ticket #</p>
                <p className="font-bold text-primary">{ticketNum}</p>
              </div>
              <div>
                <p className="text-gray-400 mb-0.5">Created</p>
                <p className="font-semibold text-gray-800">{formatTimeAgo(conversation.created_at)}</p>
              </div>
              <div>
                <p className="text-gray-400 mb-0.5">Channel</p>
                <p className="font-semibold text-gray-800 capitalize">{conversation.inbox?.channel_type}</p>
              </div>
              <div>
                <p className="text-gray-400 mb-0.5">Inbox</p>
                <p className="font-semibold text-gray-800 truncate">{conversation.inbox?.name}</p>
              </div>
            </div>
          )}
        </div>

        {/* Status */}
        <div className="p-4 border-b border-gray-200 space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Status</p>
            <select
              value={conversation.status}
              onChange={e => updateStatus(e.target.value)}
              disabled={updating}
              className={cn(
                'w-full text-sm font-bold px-3 py-2.5 rounded-xl border-2 cursor-pointer outline-none appearance-none transition-colors',
                currentStatus.cls
              )}
            >
              {STATUS_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Assign to — BUG FIX #1: now org-scoped */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Assign to</p>
            <select
              value={assignedAgent?.id || ''}
              onChange={e => updateAssign(e.target.value)}
              disabled={updating}
              className="w-full text-sm px-3 py-2.5 rounded-xl border-2 border-gray-200 cursor-pointer outline-none focus:border-primary transition-colors bg-white"
            >
              <option value="">Unassigned</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.full_name}</option>
              ))}
            </select>
          </div>

          <Button
            onClick={markResolved}
            disabled={updating || conversation.status === 'resolved'}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl py-2.5 text-sm"
          >
            ✓ Mark Resolved
          </Button>
        </div>

        {/* Previous tickets */}
        {previousConvs.length > 0 && (
          <div className="p-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
              Previous Tickets ({previousConvs.length})
            </p>
            <div className="space-y-2">
              {previousConvs.map(c => {
                const num = (c as any).ticket_number
                  ? `TKT${String((c as any).ticket_number).padStart(6, '0')}`
                  : 'Ticket'
                const st = STATUS_OPTIONS.find(s => s.value === c.status)
                return (
                  <div key={c.id} className="p-3 border border-gray-100 rounded-xl hover:bg-gray-50 cursor-pointer text-xs transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-bold text-primary">{num}</p>
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', st?.cls || '')}>
                        {c.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-gray-500 truncate">{c.latest_message || 'No messages'}</p>
                    <p className="text-gray-400 mt-0.5">{formatTimeAgo(c.created_at)}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
