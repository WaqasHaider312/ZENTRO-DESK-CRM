import { useState, useRef, useEffect } from 'react'
import { useConversations } from '@/contexts/ConversationsContext'
import { useAuth } from '@/contexts/AuthContext'
import { cn, getInitials, formatTimeAgo } from '@/lib/utils'
import { Conversation, ConversationStatus, ChannelType } from '@/types'
import { Search, SlidersHorizontal, FileText, Check, Loader2, Phone, Facebook, Instagram, Globe, Mail, MessageSquare } from 'lucide-react'
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
  open: { label: 'Open', cls: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'In Progress', cls: 'bg-amber-100 text-amber-700' },
  pending: { label: 'Pending', cls: 'bg-orange-100 text-orange-700' },
  resolved: { label: 'Resolved', cls: 'bg-green-100 text-green-700' },
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
  const ticketNum = (conv as any).ticket_number ? `TKT${String((conv as any).ticket_number).padStart(6, '0')}` : null
  const assignedAgent = conv.assigned_agent as any
  const needsReply = conv.latest_message_sender !== 'agent' && conv.status !== 'resolved'

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-start gap-3 p-4 border-b border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer',
        isSelected && 'bg-blue-50 border-l-4 border-l-primary',
        needsReply && !isSelected && 'bg-blue-50/40'
      )}
    >
      <input
        type="checkbox"
        checked={isChecked}
        onClick={onCheck}
        onChange={() => { }}
        className="mt-1 h-4 w-4 rounded border-gray-300 text-primary cursor-pointer flex-shrink-0"
      />

      <div className="flex-1 min-w-0">
        {/* Row 1: Ticket number + status */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            {needsReply && <span className="h-2 w-2 bg-blue-500 rounded-full animate-pulse flex-shrink-0" />}
            <FileText className="h-3.5 w-3.5 text-primary flex-shrink-0" />
            <span className={cn('text-xs font-semibold text-primary', needsReply && 'font-bold')}>
              {ticketNum || '#'}
            </span>
          </div>
          <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', statusCfg.cls)}>
            {statusCfg.label}
          </span>
        </div>

        {/* Row 2: Contact name + channel icon */}
        <div className="flex items-center justify-between mb-1">
          <p className={cn('text-sm text-gray-900 truncate', needsReply ? 'font-bold' : 'font-medium')}>
            {contactName}
          </p>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <ChannelIcon className={cn('w-3 h-3', channelColor)} />
            {assignedAgent ? (
              <div className="h-5 w-5 rounded-full bg-primary text-white text-[9px] flex items-center justify-center font-semibold">
                {getInitials(assignedAgent.full_name)}
              </div>
            ) : (
              <span className="text-[10px] text-gray-400">-</span>
            )}
          </div>
        </div>

        {/* Row 3: Last message */}
        <p className="text-xs text-gray-500 truncate mb-1">
          {conv.latest_message || 'No messages yet'}
        </p>

        {/* Row 4: Time */}
        <p className="text-[11px] text-gray-400">
          {conv.latest_message_at ? formatTimeAgo(conv.latest_message_at) : formatTimeAgo(conv.created_at)}
        </p>
      </div>
    </div>
  )
}

export default function ConversationList() {
  const { conversations, selectedId, setSelectedId, activeView, activeFilter, setActiveFilter, counts, loading, refresh } = useConversations()
  const { profile } = useAuth()
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [sortBy, setSortBy] = useState<SortType>('newest')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [agents, setAgents] = useState<any[]>([])
  const [selectedAgent, setSelectedAgent] = useState('')
  const [acting, setActing] = useState(false)
  const [displayCount, setDisplayCount] = useState(20)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { fetchAgents() }, [])
  useEffect(() => { setDisplayCount(20); setSelected(new Set()) }, [activeView, activeFilter, search, sortBy])

  const fetchAgents = async () => {
    const { data } = await supabase.from('agent_profiles').select('id, full_name').order('full_name')
    setAgents(data || [])
  }

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)

  // Filter by view
  const viewFiltered = conversations.filter(conv => {
    const agentId = (conv as any).assigned_agent_id
    switch (activeView) {
      case 'my_open': return agentId === profile?.id && conv.status !== 'resolved'
      case 'unassigned': return !agentId && conv.status !== 'resolved'
      case 'all_assigned': return !!agentId && conv.status !== 'resolved'
      case 'my_resolved_today': return conv.status === 'resolved' && agentId === profile?.id && new Date(conv.updated_at) >= todayStart
      case 'all_resolved_today': return conv.status === 'resolved' && new Date(conv.updated_at) >= todayStart
      case 'all_tickets': return true
      default: return true
    }
  })

  // Filter by status tab
  const statusFiltered = viewFiltered.filter(c => activeFilter === 'all' || c.status === activeFilter)

  // Sort
  const sortGroup = (arr: Conversation[]) => {
    if (sortBy === 'unread') return [...arr].sort((a, b) => (b.unread_count || 0) - (a.unread_count || 0))
    if (sortBy === 'oldest') return [...arr].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    return [...arr].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  }

  // Split into needs reply vs replied (like Markaz)
  const needsReply = statusFiltered.filter(c => c.latest_message_sender !== 'agent' && c.status !== 'resolved')
  const replied = statusFiltered.filter(c => c.latest_message_sender === 'agent' || c.status === 'resolved')
  const sorted = [...sortGroup(needsReply), ...sortGroup(replied)]

  // Search filter
  const filtered = sorted.filter(c => {
    if (!search) return true
    const name = c.contact?.name || c.contact?.phone || c.contact?.email || ''
    const num = (c as any).ticket_number ? `TKT${String((c as any).ticket_number).padStart(6, '0')}` : ''
    return name.toLowerCase().includes(search.toLowerCase()) ||
      (c.latest_message || '').toLowerCase().includes(search.toLowerCase()) ||
      num.toLowerCase().includes(search.toLowerCase())
  })

  const displayed = filtered.slice(0, displayCount)

  // Scroll pagination
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
          conversation_id: id, organization_id: conversations.find(c => c.id === id)?.organization_id,
          sender_type: 'system', message_type: 'text', content: `${profile?.full_name} marked this ticket as resolved`, is_deleted: false,
        })
      }
      toast.success(`${selected.size} tickets resolved`)
      setSelected(new Set())
      refresh()
    } catch { toast.error('Failed to resolve') } finally { setActing(false) }
  }

  const SORT_LABELS: Record<SortType, string> = { newest: 'Newest First', oldest: 'Oldest First', unread: 'Unread Messages' }

  return (
    <div className="w-[380px] bg-white border-r border-gray-200 flex flex-col h-full flex-shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold text-foreground">Tickets</h2>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setSearchOpen(!searchOpen)}>
              <Search className="h-4 w-4" />
            </Button>
            <div className="relative">
              <Button variant="ghost" size="icon" onClick={() => setShowSortMenu(!showSortMenu)}>
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
              {showSortMenu && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
                  {(['newest', 'oldest', 'unread'] as SortType[]).map(s => (
                    <button key={s} onClick={() => { setSortBy(s); setShowSortMenu(false) }}
                      className="w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-50">
                      <span>{SORT_LABELS[s]}</span>
                      {sortBy === s && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {searchOpen && (
          <input
            autoFocus
            placeholder="Search tickets..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full mb-3 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
        )}

        {/* Status filter */}
        <div className="flex gap-2 mb-3">
          <select
            value={activeFilter}
            onChange={e => setActiveFilter(e.target.value as ConversationStatus | 'all')}
            className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 hover:border-primary focus:border-primary outline-none"
          >
            <option value="all">All Status</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>

        {/* Bulk select */}
        {filtered.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-gray-200">
            <select
              onChange={e => {
                const val = e.target.value
                if (val === '0') setSelected(new Set())
                else if (val === '-1') setSelected(new Set(filtered.map(c => c.id)))
                else setSelected(new Set(filtered.slice(0, parseInt(val)).map(c => c.id)))
                e.target.value = 'placeholder'
              }}
              defaultValue="placeholder"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 hover:border-primary outline-none"
            >
              <option value="placeholder" disabled>Select Tickets...</option>
              <option value="0">Deselect All</option>
              <option value="20">Select 20</option>
              <option value="50">Select 50</option>
              <option value="-1">Select All ({filtered.length})</option>
            </select>

            {selected.size > 0 && (
              <div className="flex items-center gap-2">
                <select value={selectedAgent} onChange={e => setSelectedAgent(e.target.value)}
                  className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 hover:border-primary outline-none">
                  <option value="">Select Agent</option>
                  <option value="unassign">Unassign</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                </select>
                <Button size="sm" onClick={handleBulkAssign} disabled={!selectedAgent || acting}>
                  {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Assign'}
                </Button>
                <Button size="sm" onClick={handleBulkResolve} disabled={acting}
                  className="bg-green-600 hover:bg-green-700 text-white whitespace-nowrap">
                  Resolve
                </Button>
              </div>
            )}

            {selected.size > 0 && (
              <p className="text-xs text-muted-foreground">{selected.size} ticket{selected.size !== 1 ? 's' : ''} selected</p>
            )}
          </div>
        )}

        <div className="flex justify-between items-center mt-2">
          <p className="text-xs text-muted-foreground">Sorted by: {SORT_LABELS[sortBy]}</p>
          <p className="text-xs text-muted-foreground">Showing {displayed.length} of {filtered.length}</p>
        </div>
      </div>

      {/* List */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <FileText className="h-12 w-12 text-gray-300 mb-3" />
            <p className="text-foreground font-medium">No tickets found</p>
            <p className="text-sm text-muted-foreground mt-1">Try adjusting filters</p>
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
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}