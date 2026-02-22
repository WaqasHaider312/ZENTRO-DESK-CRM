import { useState, useEffect } from 'react'
import { useConversations } from '@/contexts/ConversationsContext'
import { useAuth } from '@/contexts/AuthContext'
import { cn, getInitials, formatTimeAgo } from '@/lib/utils'
import { Phone, Mail, MapPin, Building, X, MessageSquare, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface ContactInfoPanelProps {
  onClose: () => void
}

export default function ContactInfoPanel({ onClose }: ContactInfoPanelProps) {
  const { selectedId, conversations, refresh } = useConversations()
  const { profile } = useAuth()
  const conversation = conversations.find(c => c.id === selectedId)
  const contact = conversation?.contact
  const [agents, setAgents] = useState<any[]>([])
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    supabase.from('agent_profiles').select('id, full_name').order('full_name')
      .then(({ data }) => setAgents(data || []))
  }, [])

  if (!conversation || !contact) return null

  const contactName = contact.name || contact.phone || contact.email || 'Unknown'
  const assignedAgent = conversation.assigned_agent as any
  const ticketNum = (conversation as any).ticket_number ? `TKT${String((conversation as any).ticket_number).padStart(6, '0')}` : null
  const previousConvs = conversations.filter(c => c.contact_id === contact.id && c.id !== selectedId).slice(0, 5)

  const updateStatus = async (status: string) => {
    setUpdating(true)
    try {
      await supabase.from('conversations').update({ status, updated_at: new Date().toISOString() }).eq('id', selectedId!)
      await supabase.from('messages').insert({
        conversation_id: selectedId, organization_id: conversation.organization_id,
        sender_type: 'system', message_type: 'text',
        content: `${profile?.full_name} marked this ticket as ${status.replace('_', ' ')}`, is_deleted: false,
      })
      toast.success(`Status updated to ${status.replace('_', ' ')}`)
      refresh()
    } catch { toast.error('Failed to update status') } finally { setUpdating(false) }
  }

  const updateAssign = async (agentId: string) => {
    setUpdating(true)
    try {
      const val = agentId === 'unassign' ? null : agentId
      await supabase.from('conversations').update({ assigned_agent_id: val, updated_at: new Date().toISOString() }).eq('id', selectedId!)
      const agentName = agents.find(a => a.id === agentId)?.full_name
      await supabase.from('messages').insert({
        conversation_id: selectedId, organization_id: conversation.organization_id,
        sender_type: 'system', message_type: 'text',
        content: agentId === 'unassign' ? `${profile?.full_name} unassigned this ticket` : `${profile?.full_name} assigned this ticket to ${agentName}`,
        is_deleted: false,
      })
      toast.success('Ticket assigned')
      refresh()
    } catch { toast.error('Failed to assign') } finally { setUpdating(false) }
  }

  const STATUS_OPTIONS = [
    { value: 'open', label: 'Open', cls: 'bg-blue-100 text-blue-700' },
    { value: 'in_progress', label: 'In Progress', cls: 'bg-amber-100 text-amber-700' },
    { value: 'pending', label: 'Pending', cls: 'bg-orange-100 text-orange-700' },
    { value: 'resolved', label: 'Resolved', cls: 'bg-green-100 text-green-700' },
  ]
  const currentStatus = STATUS_OPTIONS.find(s => s.value === conversation.status) || STATUS_OPTIONS[0]

  return (
    <div className="w-72 border-l border-gray-200 flex flex-col h-full bg-white flex-shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-gray-200 flex-shrink-0">
        <span className="font-semibold text-sm">Ticket Info</span>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded transition-colors">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Contact section */}
        <div className="p-4 border-b border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Contact & Ticket Info</p>

          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold flex-shrink-0">
              {getInitials(contactName)}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm text-gray-900 truncate">{contactName}</p>
              {contact.company && <p className="text-xs text-gray-500 truncate">{contact.company}</p>}
            </div>
          </div>

          <div className="space-y-2">
            {contact.phone && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span>{contact.phone}</span>
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
            <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-gray-500">Ticket #</p>
                <p className="font-semibold text-gray-900">{ticketNum}</p>
              </div>
              <div>
                <p className="text-gray-500">Created</p>
                <p className="font-semibold text-gray-900">{formatTimeAgo(conversation.created_at)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Status + Assign */}
        <div className="p-4 border-b border-gray-200 space-y-3">
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Status</p>
            <select
              value={conversation.status}
              onChange={e => updateStatus(e.target.value)}
              disabled={updating}
              className={cn('w-full text-sm font-semibold px-3 py-2 rounded-lg border cursor-pointer outline-none', currentStatus.cls, 'border-transparent')}
            >
              {STATUS_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1.5">Assign to</p>
            <select
              value={assignedAgent?.id || ''}
              onChange={e => updateAssign(e.target.value || 'unassign')}
              disabled={updating}
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-300 cursor-pointer outline-none focus:border-primary"
            >
              <option value="">Unassigned</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </select>
          </div>

          <Button
            onClick={() => updateStatus('resolved')}
            disabled={updating || conversation.status === 'resolved'}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold"
          >
            ✓ Mark Resolved
          </Button>
        </div>

        {/* Previous conversations */}
        {previousConvs.length > 0 && (
          <div className="p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Previous Tickets ({previousConvs.length})
            </p>
            <div className="space-y-2">
              {previousConvs.map(c => {
                const num = (c as any).ticket_number ? `TKT${String((c as any).ticket_number).padStart(6, '0')}` : 'Ticket'
                const statusCls: Record<string, string> = {
                  open: 'bg-blue-100 text-blue-700', in_progress: 'bg-amber-100 text-amber-700',
                  pending: 'bg-orange-100 text-orange-700', resolved: 'bg-green-100 text-green-700',
                }
                return (
                  <div key={c.id} className="flex items-center justify-between p-2 border border-gray-100 rounded-lg hover:bg-gray-50 cursor-pointer text-xs">
                    <div className="min-w-0">
                      <p className="font-semibold text-primary">{num}</p>
                      <p className="text-gray-500 truncate">{c.latest_message || 'No messages'}</p>
                      <p className="text-gray-400">{formatTimeAgo(c.created_at)}</p>
                    </div>
                    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ml-2', statusCls[c.status] || statusCls.open)}>
                      {c.status.replace('_', ' ')}
                    </span>
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
