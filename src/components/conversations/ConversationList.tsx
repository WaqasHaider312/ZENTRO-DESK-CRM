import { useState, useRef, useEffect } from 'react'
import { useConversations } from '@/contexts/ConversationsContext'
import { useAuth } from '@/contexts/AuthContext'
import { cn, getInitials, formatTimeAgo } from '@/lib/utils'
import { Conversation, ConversationStatus, ChannelType, Label } from '@/types'
import { Search, SlidersHorizontal, FileText, Check, Loader2, Phone, Facebook, Instagram, Globe, Mail, MessageSquare, Sparkles, Tag, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

const CHANNEL_ICONS: Record<ChannelType, React.ComponentType<{ className?: string }>> = {
  whatsapp: Phone, facebook: Facebook, instagram: Instagram, widget: Globe, email: Mail,
}
const CHANNEL_COLORS: Record<ChannelType, string> = {
  whatsapp: 'text-green-500', facebook: 'text-blue-500', instagram: 'text-pink-500',
  widget: 'text-violet-500', email: 'text-orange-500',
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'bg-emerald-50 text-emerald-700' },
  in_progress: { label: 'In Progress', cls: 'bg-amber-50 text-amber-700' },
  pending: { label: 'Pending', cls: 'bg-orange-50 text-orange-700' },
  resolved: { label: 'Resolved', cls: 'bg-gray-100 text-gray-500' },
}

type SortType = 'newest' | 'oldest' | 'unread'

function TicketCard({ conv, isSelected, onClick, isChecked, onCheck }: {
  conv: Conversation; isSelected: boolean; onClick: () => void
  isChecked: boolean; onCheck: (e: React.MouseEvent) => void
}) {
  const channelType = conv.inbox?.channel_type as ChannelType
  const ChannelIcon = CHANNEL_ICONS[channelType] || MessageSquare
  const channelColor = CHANNEL_COLORS[channelType] || 'text-muted-foreground'
  const contactName = conv.contact?.name || conv.contact?.phone || conv.contact?.email || 'Unknown'
  const statusCfg = STATUS_CONFIG[conv.status] || STATUS_CONFIG.open
  const ticketNum = (conv as any).ticket_number
    ? `TKT${String((conv as any).ticket_number).padStart(6, '0')}`
    : null
  const assignedAgent = conv.assigned_agent as any
  const needsReply = conv.latest_message_sender !== 'agent' && conv.status !== 'resolved'
  const labels: Label[] = (conv as any).labels || []

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-start gap-2.5 px-4 py-3.5 border-b border-gray-100 cursor-pointer transition-all',
        'hover:bg-gray-50',
        isSelected
          ? 'bg-emerald-50/60 border-l-[3px] border-l-primary'
          : 'border-l-[3px] border-l-transparent',
        needsReply && !isSelected && 'bg-gray-50/50'
      )}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={isChecked}
        onClick={onCheck}
        onChange={() => { }}
        className="mt-1 h-3.5 w-3.5 rounded border-gray-300 text-primary cursor-pointer flex-shrink-0 accent-primary"
      />

      <div className="flex-1 min-w-0">
        {/* Row 1: Ticket # + status badge */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {needsReply && (
              <span className="h-1.5 w-1.5 bg-primary rounded-full flex-shrink-0" />
            )}
            <span className={cn(
              'text-[11px] font-bold text-primary truncate',
              !needsReply && 'text-gray-400'
            )}>
              {ticketNum || '#'}
            </span>
            {(conv as any).ai_handled && (
              <span className="flex items-center gap-0.5 bg-violet-100 text-violet-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0">
                <Sparkles className="w-2.5 h-2.5" />AI
              </span>
            )}
          </div>
          <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ml-1', statusCfg.cls)}>
            {statusCfg.label}
          </span>
        </div>

        {/* Row 2: Contact name + channel + agent */}
        <div className="flex items-center justify-between mb-1 gap-2">
          <p className={cn(
            'text-[13px] text-gray-900 truncate',
            needsReply ? 'font-semibold' : 'font-medium'
          )}>
            {contactName}
          </p>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <ChannelIcon className={cn('w-3 h-3 flex-shrink-0', channelColor)} />
            {assignedAgent ? (
              <div className="h-5 w-5 rounded-full bg-primary text-white text-[9px] flex items-center justify-center font-bold flex-shrink-0">
                {getInitials(assignedAgent.full_name)}
              </div>
            ) : (
              <div className="h-5 w-5 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                <span className="text-[9px] text-gray-400">–</span>
              </div>
            )}
          </div>
        </div>

        {/* Row 3: Last message preview */}
        <p className="text-[12px] text-gray-400 truncate leading-relaxed">
          {conv.latest_message || 'No messages yet'}
        </p>

        {/* Row 4: Labels + timestamp */}
        <div className="flex items-center justify-between mt-1.5 gap-2">
          <div className="flex items-center gap-1">
            {labels.slice(0, 4).map(label => (
              <span
                key={label.id}
                title={label.name}
                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: label.color }}
              />
            ))}
            {labels.length > 4 && (
              <span className="text-[9px] text-gray-400 font-semibold">+{labels.length - 4}</span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 flex-shrink-0 tabular-nums">
            {conv.latest_message_at ? formatTimeAgo(conv.latest_message_at) : formatTimeAgo(conv.created_at)}
          </p>
        </div>
      </div>
    </div>
  )
}

export default function ConversationList() {
  const {
    conversations, selectedId, setSelectedId,
    activeView, activeFilter, setActiveFilter,
    activeLabelId, setActiveLabelId, orgLabels,
    counts, loading, refresh
  } = useConversations()
  const { profile, organization } = useAuth()
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [sortBy, setSortBy] = useState<SortType>('newest')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [showLabelFilter, setShowLabelFilter] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [agents, setAgents] = useState<any[]>([])
  const [selectedAgent, setSelectedAgent] = useState('')
  const [acting, setActing] = useState(false)
  const [displayCount, setDisplayCount] = useState(20)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { fetchAgents() }, [organization?.id])
  useEffect(() => { setDisplayCount(20); setSelected(new Set()) }, [activeView, activeFilter, activeLabelId, search, sortBy])

  const fetchAgents = async () => {
    if (!organization) return
    const { data } = await supabase
      .from('agent_profiles')
      .select('id, full_name')
      .eq('organization_id', organization.id)
      .eq('is_active', true)
      .order('full_name')
    setAgents(data || [])
  }

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const getAgentId = (conv: Conversation) => (conv.assigned_agent as any)?.id || (conv as any).assigned_agent_id || null

  const viewFiltered = conversations.filter(conv => {
    const agentId = getAgentId(conv)
    switch (activeView) {
      case 'my_open': return agentId === profile?.id && conv.status !== 'resolved' && !(conv as any).ai_handled
      case 'unassigned': return !agentId && conv.status !== 'resolved' && !(conv as any).ai_handled
      case 'ai_handling': return !!(conv as any).ai_handled && !agentId && conv.status !== 'resolved'
      case 'all_assigned': return !!agentId && conv.status !== 'resolved'
      case 'my_resolved_today': return conv.status === 'resolved' && agentId === profile?.id && new Date(conv.updated_at) >= todayStart
      case 'all_resolved_today': return conv.status === 'resolved' && new Date(conv.updated_at) >= todayStart
      case 'all_tickets': return true
      default: return true
    }
  })

  const statusFiltered = viewFiltered.filter(c => activeFilter === 'all' || c.status === activeFilter)

  const labelFiltered = !activeLabelId
    ? statusFiltered
    : statusFiltered.filter(c => {
      const labels: Label[] = (c as any).labels || []
      return labels.some(l => l.id === activeLabelId)
    })

  const sortGroup = (arr: Conversation[]) => {
    if (sortBy === 'unread') return [...arr].sort((a, b) => (b.unread_count || 0) - (a.unread_count || 0))
    if (sortBy === 'oldest') return [...arr].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    return [...arr].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  }

  const needsReply = labelFiltered.filter(c => c.latest_message_sender !== 'agent' && c.status !== 'resolved')
  const replied = labelFiltered.filter(c => c.latest_message_sender === 'agent' || c.status === 'resolved')
  const sorted = [...sortGroup(needsReply), ...sortGroup(replied)]

  const filtered = sorted.filter(c => {
    if (!search) return true
    const name = c.contact?.name || c.contact?.phone || c.contact?.email || ''
    const num = (c as any).ticket_number ? `TKT${String((c as any).ticket_number).padStart(6, '0')}` : ''
    return name.toLowerCase().includes(search.toLowerCase()) ||
      (c.latest_message || '').toLowerCase().includes(search.toLowerCase()) ||
      num.toLowerCase().includes(search.toLowerCase())
  })

  const displayed = filtered.slice(0, displayCount)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handler = () => {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 100 && displayCount < filtered.length) {
        setDisplayCount(p => p + 20)
      }
    }
    el.addEventListener('scroll', handler)
    return () => el.removeEventListener('scroll', handler)
  }, [displayCount, filtered.length])

  const toggleCheck = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  const handleBulkAssign = async () => {
    if (!selectedAgent || selected.size === 0) return
    setActing(true)
    try {
      for (const id of Array.from(selected)) {
        await supabase.from('conversations').update({
          assigned_agent_id: selectedAgent === 'unassign' ? null : selectedAgent,
          updated_at: new Date().toISOString()
        }).eq('id', id)
      }
      toast.success(`${selected.size} tickets assigned`)
      setSelected(new Set()); setSelectedAgent('')
      refresh()
    } catch { toast.error('Failed to assign') } finally { setActing(false) }
  }

  const handleBulkResolve = async () => {
    if (selected.size === 0) return
    setActing(true)
    try {
      for (const id of Array.from(selected)) {
        await supabase.from('conversations').update({ status: 'resolved', updated_at: new Date().toISOString() }).eq('id', id)
        await supabase.from('messages').insert({
          conversation_id: id,
          organization_id: conversations.find(c => c.id === id)?.organization_id,
          sender_type: 'system',
          sender_name: 'System',
          message_type: 'activity',
          content: `${profile?.full_name} marked this ticket as resolved`,
          is_private: false,
          is_read: true,
          is_deleted: false,
        })
      }
      toast.success(`${selected.size} tickets resolved`)
      setSelected(new Set())
      refresh()
    } catch { toast.error('Failed to resolve') } finally { setActing(false) }
  }

  const SORT_LABELS: Record<SortType, string> = { newest: 'Newest First', oldest: 'Oldest First', unread: 'Unread First' }
  const activeLabel = orgLabels.find(l => l.id === activeLabelId)

  return (
    <div className="w-[340px] bg-white border-r border-gray-100 flex flex-col h-full flex-shrink-0">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 space-y-3">

        {/* Title + icons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-bold text-gray-900">Tickets</h2>
            <span className="text-[11px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full tabular-nums">
              {filtered.length}
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className={cn(
                'p-2 rounded-lg transition-colors',
                searchOpen ? 'bg-primary/10 text-primary' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
              )}
            >
              <Search className="h-4 w-4" />
            </button>

            {/* Label filter */}
            <div className="relative">
              <button
                onClick={() => setShowLabelFilter(!showLabelFilter)}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  activeLabelId ? 'bg-primary/10 text-primary' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                )}
              >
                <Tag className="h-4 w-4" />
              </button>
              {showLabelFilter && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1 overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <span className="text-xs font-bold text-gray-600">Filter by Label</span>
                  </div>
                  <button
                    onClick={() => { setActiveLabelId(null); setShowLabelFilter(false) }}
                    className={cn('w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors', !activeLabelId && 'text-primary font-semibold')}
                  >
                    <span>All Labels</span>
                    {!activeLabelId && <Check className="w-4 h-4" />}
                  </button>
                  {orgLabels.map(label => (
                    <button
                      key={label.id}
                      onClick={() => { setActiveLabelId(label.id === activeLabelId ? null : label.id); setShowLabelFilter(false) }}
                      className={cn('w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors', activeLabelId === label.id && 'bg-gray-50 font-semibold')}
                    >
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: label.color }} />
                      <span className="flex-1 text-left">{label.name}</span>
                      {activeLabelId === label.id && <Check className="w-4 h-4 text-primary" />}
                    </button>
                  ))}
                  {orgLabels.length === 0 && (
                    <p className="px-3 py-4 text-xs text-gray-400 text-center">No labels yet</p>
                  )}
                </div>
              )}
            </div>

            {/* Sort */}
            <div className="relative">
              <button
                onClick={() => setShowSortMenu(!showSortMenu)}
                className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
              {showSortMenu && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1 overflow-hidden">
                  {(['newest', 'oldest', 'unread'] as SortType[]).map(s => (
                    <button key={s} onClick={() => { setSortBy(s); setShowSortMenu(false) }}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors">
                      <span className="text-gray-700">{SORT_LABELS[s]}</span>
                      {sortBy === s && <Check className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Search input */}
        {searchOpen && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              autoFocus
              placeholder="Search tickets, contacts…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-primary transition-colors"
            />
          </div>
        )}

        {/* Active label pill */}
        {activeLabel && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Label:</span>
            <span
              className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full text-white"
              style={{ backgroundColor: activeLabel.color }}
            >
              {activeLabel.name}
              <button onClick={() => setActiveLabelId(null)} className="hover:opacity-70">
                <X className="w-3 h-3" />
              </button>
            </span>
          </div>
        )}

        {/* Status filter */}
        <select
          value={activeFilter}
          onChange={e => setActiveFilter(e.target.value as ConversationStatus | 'all')}
          className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 hover:border-primary focus:border-primary outline-none transition-colors text-gray-700 bg-white"
        >
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="pending">Pending</option>
          <option value="resolved">Resolved</option>
        </select>

        {/* Bulk select row */}
        {filtered.length > 0 && (
          <div className="space-y-2 pt-1 border-t border-gray-100">
            <select
              onChange={e => {
                const val = e.target.value
                if (val === '0') setSelected(new Set())
                else if (val === '-1') setSelected(new Set(filtered.map(c => c.id)))
                else setSelected(new Set(filtered.slice(0, parseInt(val)).map(c => c.id)))
                e.target.value = 'placeholder'
              }}
              defaultValue="placeholder"
              className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 hover:border-primary outline-none text-gray-700 bg-white transition-colors"
            >
              <option value="placeholder" disabled>Select tickets…</option>
              <option value="0">Deselect all</option>
              <option value="20">Select 20</option>
              <option value="50">Select 50</option>
              <option value="-1">Select all ({filtered.length})</option>
            </select>

            {selected.size > 0 && (
              <div className="flex items-center gap-2">
                <select
                  value={selectedAgent}
                  onChange={e => setSelectedAgent(e.target.value)}
                  className="flex-1 text-[13px] border border-gray-200 rounded-lg px-3 py-2 hover:border-primary outline-none bg-white transition-colors"
                >
                  <option value="">Select agent</option>
                  <option value="unassign">Unassign</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                </select>
                <Button size="sm" onClick={handleBulkAssign} disabled={!selectedAgent || acting} className="text-xs">
                  {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Assign'}
                </Button>
                <Button size="sm" onClick={handleBulkResolve} disabled={acting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs whitespace-nowrap">
                  Resolve
                </Button>
              </div>
            )}

            {selected.size > 0 && (
              <p className="text-[11px] text-gray-400">{selected.size} ticket{selected.size !== 1 ? 's' : ''} selected</p>
            )}
          </div>
        )}

        {/* Sort info */}
        <div className="flex justify-between items-center">
          <p className="text-[11px] text-gray-400">{SORT_LABELS[sortBy]}</p>
          <p className="text-[11px] text-gray-400">{displayed.length} of {filtered.length}</p>
        </div>
      </div>

      {/* ── List ───────────────────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
              <FileText className="h-5 w-5 text-gray-300" />
            </div>
            <p className="text-sm font-semibold text-gray-500">No tickets found</p>
            <p className="text-xs text-gray-400 mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <>
            {displayed.map(conv => (
              <TicketCard
                key={conv.id}
                conv={conv}
                isSelected={selectedId === conv.id}
                onClick={() => setSelectedId(conv.id)}
                isChecked={selected.has(conv.id)}
                onCheck={e => toggleCheck(e, conv.id)}
              />
            ))}
            {displayCount < filtered.length && (
              <div className="p-4 flex justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-gray-300" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}