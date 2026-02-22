import { useState } from 'react'
import { useConversations, SidebarView } from '@/contexts/ConversationsContext'
import { useAuth } from '@/contexts/AuthContext'
import { cn, getInitials, formatTimeAgo } from '@/lib/utils'
import { Conversation, ConversationStatus, ChannelType } from '@/types'
import { Search, MessageSquare, Facebook, Instagram, Globe, Phone, Mail, Inbox, Users, CheckCheck, Clock, LayoutList } from 'lucide-react'

const CHANNEL_ICONS: Record<ChannelType, React.ComponentType<{ className?: string }>> = {
  whatsapp: Phone, facebook: Facebook, instagram: Instagram, widget: Globe, email: Mail,
}
const CHANNEL_COLORS: Record<ChannelType, string> = {
  whatsapp: 'text-green-500', facebook: 'text-blue-500', instagram: 'text-pink-500',
  widget: 'text-violet-500', email: 'text-orange-500',
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: 'Open', color: 'text-blue-700', bg: 'bg-blue-100' },
  in_progress: { label: 'In Progress', color: 'text-amber-700', bg: 'bg-amber-100' },
  pending: { label: 'Pending', color: 'text-orange-700', bg: 'bg-orange-100' },
  resolved: { label: 'Resolved', color: 'text-green-700', bg: 'bg-green-100' },
}

const STATUS_TABS: { label: string; value: ConversationStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Open', value: 'open' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Pending', value: 'pending' },
  { label: 'Resolved', value: 'resolved' },
]

const SIDEBAR_VIEWS: { key: SidebarView; label: string; icon: React.ComponentType<{ className?: string }>; countKey: string }[] = [
  { key: 'my_open', label: 'My Open Tickets', icon: Inbox, countKey: 'my_open' },
  { key: 'unassigned', label: 'Unassigned Tickets', icon: MessageSquare, countKey: 'unassigned' },
  { key: 'all_assigned', label: 'All Assigned', icon: Users, countKey: 'all_assigned' },
  { key: 'my_resolved_today', label: 'My Resolved Today', icon: CheckCheck, countKey: 'my_resolved_today' },
  { key: 'all_resolved_today', label: 'All Resolved Today', icon: Clock, countKey: 'all_resolved_today' },
  { key: 'all_tickets', label: 'All Tickets Ever', icon: LayoutList, countKey: 'all_tickets' },
]

function TicketItem({ conv, isSelected, onClick, currentProfile }: { conv: Conversation; isSelected: boolean; onClick: () => void; currentProfile: any }) {
  const channelType = conv.inbox?.channel_type as ChannelType
  const ChannelIcon = CHANNEL_ICONS[channelType] || MessageSquare
  const channelColor = CHANNEL_COLORS[channelType] || 'text-muted-foreground'
  const contactName = conv.contact?.name || conv.contact?.phone || conv.contact?.email || 'Unknown'
  const statusCfg = STATUS_CONFIG[conv.status] || STATUS_CONFIG.open
  const ticketNum = (conv as any).ticket_number ? `TKT${String((conv as any).ticket_number).padStart(6, '0')}` : null
  const assignedAgent = conv.assigned_agent as any

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-3 border-b border-border hover:bg-accent/40 transition-colors',
        isSelected && 'bg-primary/5 border-l-[3px] border-l-primary'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Avatar with channel icon */}
        <div className="relative flex-shrink-0 mt-0.5">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold">
            {getInitials(contactName)}
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-background flex items-center justify-center">
            <ChannelIcon className={cn('w-2.5 h-2.5', channelColor)} />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Row 1: Name + time */}
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="text-sm font-semibold text-foreground truncate">{contactName}</span>
            <span className="text-[11px] text-muted-foreground flex-shrink-0">
              {conv.latest_message_at ? formatTimeAgo(conv.latest_message_at) : formatTimeAgo(conv.created_at)}
            </span>
          </div>

          {/* Row 2: Ticket number + status badge */}
          <div className="flex items-center gap-2 mb-1">
            {ticketNum && (
              <span className="text-[10px] font-mono text-muted-foreground">{ticketNum}</span>
            )}
            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', statusCfg.bg, statusCfg.color)}>
              {statusCfg.label}
            </span>
            {conv.unread_count > 0 && (
              <span className="w-4 h-4 bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {conv.unread_count > 9 ? '9+' : conv.unread_count}
              </span>
            )}
          </div>

          {/* Row 3: Last message */}
          <p className="text-xs text-muted-foreground truncate">
            {conv.latest_message
              ? (conv.latest_message_sender === 'agent' || conv.latest_message_sender === currentProfile?.full_name
                ? `You: ${conv.latest_message}` : conv.latest_message)
              : 'No messages yet'}
          </p>

          {/* Row 4: Assigned agent */}
          {assignedAgent && (
            <div className="flex items-center gap-1 mt-1">
              <div className="w-3.5 h-3.5 rounded-full bg-primary/20 flex items-center justify-center text-[8px] font-bold text-primary">
                {getInitials(assignedAgent.full_name)}
              </div>
              <span className="text-[10px] text-muted-foreground truncate">{assignedAgent.full_name}</span>
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

export default function ConversationList() {
  const { conversations, selectedId, setSelectedId, activeView, setActiveView, activeFilter, setActiveFilter, counts, loading } = useConversations()
  const { profile: currentProfile } = useAuth()
  const [search, setSearch] = useState('')

  // Filter by view
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)

  const viewFiltered = conversations.filter(conv => {
    const agentId = (conv as any).assigned_agent_id
    switch (activeView) {
      case 'my_open': return agentId === currentProfile?.id && conv.status !== 'resolved'
      case 'unassigned': return !agentId && conv.status !== 'resolved'
      case 'all_assigned': return !!agentId && conv.status !== 'resolved'
      case 'my_resolved_today': return conv.status === 'resolved' && agentId === currentProfile?.id && new Date(conv.updated_at) >= todayStart
      case 'all_resolved_today': return conv.status === 'resolved' && new Date(conv.updated_at) >= todayStart
      case 'all_tickets': return true
      default: return true
    }
  })

  // Then filter by status tab
  const statusFiltered = viewFiltered.filter(conv => {
    return activeFilter === 'all' || conv.status === activeFilter
  })

  // Then filter by search
  const filtered = statusFiltered.filter(conv => {
    if (!search) return true
    const contactName = conv.contact?.name || conv.contact?.phone || conv.contact?.email || ''
    const ticketNum = (conv as any).ticket_number ? `TKT${String((conv as any).ticket_number).padStart(6, '0')}` : ''
    return (
      contactName.toLowerCase().includes(search.toLowerCase()) ||
      (conv.latest_message || '').toLowerCase().includes(search.toLowerCase()) ||
      ticketNum.toLowerCase().includes(search.toLowerCase())
    )
  })

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left sidebar: Views ───────────────────────────────────── */}
      <div className="w-52 flex-shrink-0 border-r border-border flex flex-col bg-muted/20">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-bold text-sm text-foreground">Tickets</h2>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          <p className="px-4 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Views</p>
          {SIDEBAR_VIEWS.map(view => {
            const Icon = view.icon
            const count = counts[view.countKey as keyof typeof counts] as number
            return (
              <button
                key={view.key}
                onClick={() => { setActiveView(view.key); setActiveFilter('all') }}
                className={cn(
                  'w-full flex items-center justify-between px-4 py-2 text-xs transition-colors text-left',
                  activeView === view.key
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{view.label}</span>
                </div>
                {count > 0 && (
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full font-bold min-w-[18px] text-center',
                    activeView === view.key ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                  )}>
                    {count > 999 ? '999+' : count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Right: Ticket list ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Search */}
        <div className="px-3 py-2.5 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search tickets..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted border border-transparent rounded-md focus:outline-none focus:border-primary/50 focus:bg-background transition-colors"
            />
          </div>
        </div>

        {/* Status tabs */}
        <div className="flex border-b border-border overflow-x-auto px-1 flex-shrink-0">
          {STATUS_TABS.map(tab => {
            const count = tab.value !== 'all' ? counts[tab.value as keyof typeof counts] as number : null
            return (
              <button
                key={tab.value}
                onClick={() => setActiveFilter(tab.value)}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-2 text-[11px] font-medium border-b-2 whitespace-nowrap transition-colors flex-shrink-0',
                  activeFilter === tab.value ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.label}
                {count !== null && count > 0 && (
                  <span className={cn(
                    'text-[10px] px-1 py-0.5 rounded-full font-bold',
                    activeFilter === tab.value ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  )}>{count}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Ticket list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <MessageSquare className="w-8 h-8 text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground font-medium">No tickets found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {search ? 'Try a different search' : 'No tickets in this view'}
              </p>
            </div>
          ) : (
            <>
              <div className="px-4 py-1.5 border-b border-border bg-muted/30">
                <p className="text-[10px] text-muted-foreground">
                  Showing {filtered.length} ticket{filtered.length !== 1 ? 's' : ''}
                </p>
              </div>
              {filtered.map(conv => (
                <TicketItem
                  key={conv.id}
                  conv={conv}
                  isSelected={selectedId === conv.id}
                  onClick={() => setSelectedId(conv.id)}
                  currentProfile={currentProfile}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}