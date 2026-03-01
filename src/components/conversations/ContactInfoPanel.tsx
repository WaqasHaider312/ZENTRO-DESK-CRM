import { useState, useEffect } from 'react'
import { useConversations } from '@/contexts/ConversationsContext'
import { useAuth } from '@/contexts/AuthContext'
import { cn, getInitials, formatTimeAgo } from '@/lib/utils'
import { Phone, Mail, MapPin, Building, X, Tag, Plus, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { AgentProfile, Label } from '@/types'

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
  const { selectedId, conversations, orgLabels, refresh, setSelectedId } = useConversations()
  const { profile, organization } = useAuth()
  const conversation = conversations.find(c => c.id === selectedId)
  const contact = conversation?.contact
  const [agents, setAgents] = useState<AgentProfile[]>([])
  const [updating, setUpdating] = useState(false)
  const [showLabelPicker, setShowLabelPicker] = useState(false)
  const [labelLoading, setLabelLoading] = useState<string | null>(null)

  // Labels applied to this conversation
  const appliedLabels: Label[] = (conversation as any)?.labels || []
  const appliedIds = new Set(appliedLabels.map(l => l.id))

  useEffect(() => {
    if (!organization) return
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

  const insertSystemMessage = async (content: string) => {
    await supabase.from('messages').insert({
      conversation_id: selectedId!,
      organization_id: conversation.organization_id,
      sender_type: 'system',
      sender_name: 'System',
      message_type: 'activity',
      content,
      is_private: false,
      is_read: true,
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
      await insertSystemMessage(`${profile?.full_name} changed status to ${status.replace('_', ' ')}`)
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

  // ── Label actions ────────────────────────────────────────────────────

  const addLabel = async (label: Label) => {
    if (!selectedId) return
    setLabelLoading(label.id)
    try {
      const { error } = await supabase
        .from('conversation_labels')
        .insert({ conversation_id: selectedId, label_id: label.id })
      if (error) throw error
      await insertSystemMessage(`${profile?.full_name} added label "${label.name}"`)
      refresh()
    } catch (err: any) {
      toast.error(err.message || 'Failed to add label')
    } finally {
      setLabelLoading(null)
    }
  }

  const removeLabel = async (label: Label) => {
    if (!selectedId) return
    setLabelLoading(label.id)
    try {
      const { error } = await supabase
        .from('conversation_labels')
        .delete()
        .eq('conversation_id', selectedId)
        .eq('label_id', label.id)
      if (error) throw error
      await insertSystemMessage(`${profile?.full_name} removed label "${label.name}"`)
      refresh()
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove label')
    } finally {
      setLabelLoading(null)
    }
  }

  const toggleLabel = async (label: Label) => {
    if (appliedIds.has(label.id)) {
      await removeLabel(label)
    } else {
      await addLabel(label)
    }
  }

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

        {/* ── Contact & Ticket Info ─────────────────────────────── */}
        <div className="p-4 border-b border-gray-200">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
            Contact &amp; Ticket
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

        {/* ── Status & Assign ───────────────────────────────────── */}
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

        {/* ── Labels ───────────────────────────────────────────── */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-gray-400" />
              <p className="text-xs font-semibold text-gray-500">Labels</p>
            </div>
            <button
              onClick={() => setShowLabelPicker(p => !p)}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>

          {/* Applied labels */}
          {appliedLabels.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {appliedLabels.map(label => (
                <span
                  key={label.id}
                  className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full text-white"
                  style={{ backgroundColor: label.color }}
                >
                  {label.name}
                  <button
                    onClick={() => removeLabel(label)}
                    disabled={labelLoading === label.id}
                    className="ml-0.5 hover:opacity-70 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            !showLabelPicker && (
              <p className="text-xs text-gray-400 mb-2">No labels applied</p>
            )
          )}

          {/* Label picker */}
          {showLabelPicker && (
            <div className="border border-gray-200 rounded-xl overflow-hidden mt-2">
              {orgLabels.length === 0 ? (
                <div className="p-3 text-center">
                  <p className="text-xs text-gray-400">No labels yet</p>
                  <p className="text-[10px] text-gray-300 mt-0.5">Create them in Settings → Labels</p>
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto">
                  {orgLabels.map(label => {
                    const isApplied = appliedIds.has(label.id)
                    const isLoading = labelLoading === label.id
                    return (
                      <button
                        key={label.id}
                        onClick={() => toggleLabel(label)}
                        disabled={isLoading}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors text-left',
                          isApplied && 'bg-gray-50'
                        )}
                      >
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: label.color }}
                        />
                        <span className="flex-1 font-medium text-gray-800">{label.name}</span>
                        {isApplied && (
                          <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                        )}
                        {isLoading && (
                          <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
              <div className="border-t border-gray-100 px-3 py-2 bg-gray-50">
                <button
                  onClick={() => setShowLabelPicker(false)}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Previous Tickets ──────────────────────────────────── */}
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
                const prevLabels: Label[] = (c as any).labels || []
                return (
                  <div key={c.id} onClick={() => setSelectedId(c.id)} className="p-3 border border-gray-100 rounded-xl hover:bg-gray-50 cursor-pointer text-xs transition-colors hover:border-primary/30">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-bold text-primary">{num}</p>
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', st?.cls || '')}>
                        {c.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-gray-500 truncate">{c.latest_message || 'No messages'}</p>
                    {prevLabels.length > 0 && (
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {prevLabels.slice(0, 3).map(l => (
                          <span
                            key={l.id}
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white"
                            style={{ backgroundColor: l.color }}
                          >
                            {l.name}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-gray-400 mt-1">{formatTimeAgo(c.created_at)}</p>
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