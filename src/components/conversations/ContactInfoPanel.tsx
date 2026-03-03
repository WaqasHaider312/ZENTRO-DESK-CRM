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
  { value: 'open', label: 'Open', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'in_progress', label: 'In Progress', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'pending', label: 'Pending', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  { value: 'resolved', label: 'Resolved', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
]

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
      {children}
    </p>
  )
}

export default function ContactInfoPanel({ onClose }: ContactInfoPanelProps) {
  const { selectedId, conversations, orgLabels, refresh, setSelectedId } = useConversations()
  const { profile, organization } = useAuth()
  const conversation = conversations.find(c => c.id === selectedId)
  const contact = conversation?.contact
  const [agents, setAgents] = useState<AgentProfile[]>([])
  const [updating, setUpdating] = useState(false)
  const [showLabelPicker, setShowLabelPicker] = useState(false)
  const [labelLoading, setLabelLoading] = useState<string | null>(null)

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
      await supabase.from('conversations').update({ status, updated_at: new Date().toISOString() }).eq('id', selectedId!)
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
      // When assigning to an agent, always remove from AI handling
      const updatePayload: any = { assigned_agent_id: val, updated_at: new Date().toISOString() }
      if (val !== null) updatePayload.ai_handled = false
      await supabase.from('conversations').update(updatePayload).eq('id', selectedId!)
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

  const addLabel = async (label: Label) => {
    if (!selectedId) return
    setLabelLoading(label.id)
    try {
      const { error } = await supabase.from('conversation_labels').insert({ conversation_id: selectedId, label_id: label.id })
      if (error) throw error
      await insertSystemMessage(`${profile?.full_name} added label "${label.name}"`)
      refresh()
    } catch (err: any) {
      toast.error(err.message || 'Failed to add label')
    } finally { setLabelLoading(null) }
  }

  const removeLabel = async (label: Label) => {
    if (!selectedId) return
    setLabelLoading(label.id)
    try {
      const { error } = await supabase.from('conversation_labels').delete().eq('conversation_id', selectedId).eq('label_id', label.id)
      if (error) throw error
      await insertSystemMessage(`${profile?.full_name} removed label "${label.name}"`)
      refresh()
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove label')
    } finally { setLabelLoading(null) }
  }

  const toggleLabel = async (label: Label) => {
    if (appliedIds.has(label.id)) await removeLabel(label)
    else await addLabel(label)
  }

  return (
    <div className="w-64 border-l border-gray-100 flex flex-col h-full bg-white flex-shrink-0 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100 flex-shrink-0">
        <span className="text-[13px] font-bold text-gray-900">Ticket Info</span>
        <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">

        {/* ── Contact ────────────────────────────────────────────── */}
        <div className="p-4">
          <SectionLabel>Contact</SectionLabel>

          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold flex-shrink-0">
              {getInitials(contactName)}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-[13px] text-gray-900 truncate">{contactName}</p>
              {contact.company && <p className="text-[11px] text-gray-400 truncate">{contact.company}</p>}
            </div>
          </div>

          <div className="space-y-2.5">
            {contact.phone && (
              <div className="flex items-center gap-2.5">
                <Phone className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                <span className="text-[12px] text-gray-600 font-medium">{contact.phone}</span>
              </div>
            )}
            {contact.email && (
              <div className="flex items-center gap-2.5">
                <Mail className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                <span className="text-[12px] text-gray-600 truncate">{contact.email}</span>
              </div>
            )}
            {contact.location && (
              <div className="flex items-center gap-2.5">
                <MapPin className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                <span className="text-[12px] text-gray-600">{contact.location}</span>
              </div>
            )}
            {contact.company && (
              <div className="flex items-center gap-2.5">
                <Building className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                <span className="text-[12px] text-gray-600">{contact.company}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Ticket Details ─────────────────────────────────────── */}
        {ticketNum && (
          <div className="p-4">
            <SectionLabel>Ticket Details</SectionLabel>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Ticket #', value: ticketNum, accent: true },
                { label: 'Created', value: formatTimeAgo(conversation.created_at) },
                { label: 'Channel', value: conversation.inbox?.channel_type || '—', capitalize: true },
                { label: 'Inbox', value: conversation.inbox?.name || '—' },
              ].map((row, i) => (
                <div key={i}>
                  <p className="text-[10px] text-gray-400 font-semibold mb-0.5">{row.label}</p>
                  <p className={cn(
                    'text-[12px] font-semibold truncate',
                    row.accent ? 'text-primary' : 'text-gray-700',
                    row.capitalize && 'capitalize'
                  )}>
                    {row.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Status & Assign ────────────────────────────────────── */}
        <div className="p-4 space-y-3">
          <SectionLabel>Actions</SectionLabel>

          <div>
            <p className="text-[11px] font-semibold text-gray-400 mb-1.5">Status</p>
            <select
              value={conversation.status}
              onChange={e => updateStatus(e.target.value)}
              disabled={updating}
              className={cn(
                'w-full text-[12px] font-bold px-3 py-2 rounded-lg border-2 cursor-pointer outline-none appearance-none transition-colors',
                currentStatus.cls
              )}
            >
              {STATUS_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-gray-400 mb-1.5">Assigned To</p>
            <select
              value={assignedAgent?.id || ''}
              onChange={e => updateAssign(e.target.value)}
              disabled={updating}
              className="w-full text-[12px] px-3 py-2 rounded-lg border-2 border-gray-100 cursor-pointer outline-none focus:border-primary transition-colors bg-white text-gray-700"
            >
              <option value="">Unassigned</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.full_name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={markResolved}
            disabled={updating || conversation.status === 'resolved'}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-lg py-2 text-[13px] transition-colors"
          >
            ✓ Mark Resolved
          </button>
        </div>

        {/* ── Labels ─────────────────────────────────────────────── */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-gray-300" />
              <SectionLabel>Labels</SectionLabel>
            </div>
            <button
              onClick={() => setShowLabelPicker(p => !p)}
              className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-bold transition-colors"
            >
              <Plus className="w-3 h-3" />Add
            </button>
          </div>

          {appliedLabels.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {appliedLabels.map(label => (
                <span
                  key={label.id}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full text-white"
                  style={{ backgroundColor: label.color }}
                >
                  {label.name}
                  <button onClick={() => removeLabel(label)} disabled={labelLoading === label.id} className="ml-0.5 hover:opacity-70 transition-opacity">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            !showLabelPicker && <p className="text-[11px] text-gray-300 mb-2">No labels applied</p>
          )}

          {showLabelPicker && (
            <div className="border border-gray-100 rounded-xl overflow-hidden mt-2">
              {orgLabels.length === 0 ? (
                <div className="p-3 text-center">
                  <p className="text-[11px] text-gray-400">No labels yet</p>
                  <p className="text-[10px] text-gray-300 mt-0.5">Create them in Settings → Labels</p>
                </div>
              ) : (
                <div className="max-h-44 overflow-y-auto">
                  {orgLabels.map(label => {
                    const isApplied = appliedIds.has(label.id)
                    const isLoading = labelLoading === label.id
                    return (
                      <button
                        key={label.id}
                        onClick={() => toggleLabel(label)}
                        disabled={isLoading}
                        className={cn('w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-50 transition-colors text-left', isApplied && 'bg-gray-50')}
                      >
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: label.color }} />
                        <span className="flex-1 text-[12px] font-medium text-gray-700">{label.name}</span>
                        {isApplied && <Check className="w-3 h-3 text-primary flex-shrink-0" />}
                        {isLoading && <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              )}
              <div className="border-t border-gray-100 px-3 py-2 bg-gray-50">
                <button onClick={() => setShowLabelPicker(false)} className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors">
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Previous Tickets ────────────────────────────────────── */}
        {previousConvs.length > 0 && (
          <div className="p-4">
            <SectionLabel>Previous Tickets ({previousConvs.length})</SectionLabel>
            <div className="space-y-2">
              {previousConvs.map(c => {
                const num = (c as any).ticket_number
                  ? `TKT${String((c as any).ticket_number).padStart(6, '0')}`
                  : 'Ticket'
                const st = STATUS_OPTIONS.find(s => s.value === c.status)
                const prevLabels: Label[] = (c as any).labels || []
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className="p-3 border border-gray-100 rounded-xl hover:bg-gray-50 hover:border-primary/20 cursor-pointer transition-all"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-bold text-primary">{num}</p>
                      <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full border', st?.cls || '')}>
                        {c.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 truncate">{c.latest_message || 'No messages'}</p>
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
                    <p className="text-[10px] text-gray-300 mt-1.5">{formatTimeAgo(c.created_at)}</p>
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