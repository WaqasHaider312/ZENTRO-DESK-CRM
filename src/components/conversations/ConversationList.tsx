import { useState } from 'react'
import { useConversations } from '@/contexts/ConversationsContext'
import { useAuth } from '@/contexts/AuthContext'
import { cn, getInitials, formatTimeAgo, truncate } from '@/lib/utils'
import { Conversation, ConversationStatus, ChannelType } from '@/types'
import { Search, Filter, MessageSquare, Facebook, Instagram, Globe, Phone, Mail } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

const CHANNEL_ICONS: Record<ChannelType, React.ComponentType<{ className?: string }>> = {
  whatsapp: Phone,
  facebook: Facebook,
  instagram: Instagram,
  widget: Globe,
  email: Mail,
}

const CHANNEL_COLORS: Record<ChannelType, string> = {
  whatsapp: 'text-green-500',
  facebook: 'text-blue-500',
  instagram: 'text-pink-500',
  widget: 'text-violet-500',
  email: 'text-orange-500',
}

const STATUS_FILTERS: { label: string; value: ConversationStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Open', value: 'open' },
  { label: 'Pending', value: 'pending' },
  { label: 'Resolved', value: 'resolved' },
]

function ConversationItem({ conv, isSelected, onClick }: {
  conv: Conversation
  isSelected: boolean
  onClick: () => void
}) {
  const channelType = conv.inbox?.channel_type as ChannelType
  const ChannelIcon = CHANNEL_ICONS[channelType] || MessageSquare
  const channelColor = CHANNEL_COLORS[channelType] || 'text-muted-foreground'
  const contactName = conv.contact?.name || conv.contact?.phone || conv.contact?.email || 'Unknown'

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-3 border-b border-border hover:bg-accent/50 transition-colors',
        isSelected && 'bg-primary/5 border-l-2 border-l-primary'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold">
            {getInitials(contactName)}
          </div>
          <div className={cn('absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-background flex items-center justify-center')}>
            <ChannelIcon className={cn('w-2.5 h-2.5', channelColor)} />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="text-sm font-medium text-foreground truncate">{contactName}</span>
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {conv.latest_message_at ? formatTimeAgo(conv.latest_message_at) : formatTimeAgo(conv.created_at)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground truncate">
              {conv.latest_message
                ? (conv.latest_message_sender === 'agent' ? `You: ${conv.latest_message}` : conv.latest_message)
                : 'No messages yet'}
            </p>
            {conv.unread_count > 0 && (
              <span className="flex-shrink-0 w-4 h-4 bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {conv.unread_count > 9 ? '9+' : conv.unread_count}
              </span>
            )}
          </div>
          {conv.assigned_agent && (
            <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">
              → {(conv.assigned_agent as any).full_name}
            </p>
          )}
        </div>
      </div>
    </button>
  )
}

export default function ConversationList() {
  const { conversations, selectedId, setSelectedId, activeFilter, setActiveFilter, counts, loading } = useConversations()
  const [search, setSearch] = useState('')

  const filtered = conversations.filter(c => {
    const matchesFilter = activeFilter === 'all' || c.status === activeFilter
    const contactName = c.contact?.name || c.contact?.phone || c.contact?.email || ''
    const matchesSearch = !search || contactName.toLowerCase().includes(search.toLowerCase()) ||
      (c.latest_message || '').toLowerCase().includes(search.toLowerCase())
    return matchesFilter && matchesSearch
  })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm">Conversations</h2>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted border border-transparent rounded-md focus:outline-none focus:border-primary/50 focus:bg-background transition-colors"
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-border px-2">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setActiveFilter(f.value)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors',
              activeFilter === f.value
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {f.label}
            {f.value !== 'all' && counts[f.value as keyof typeof counts] > 0 && (
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full font-semibold',
                activeFilter === f.value ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              )}>
                {counts[f.value as keyof typeof counts]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <MessageSquare className="w-8 h-8 text-muted-foreground/20 mb-2" />
            <p className="text-sm text-muted-foreground font-medium">No conversations</p>
            <p className="text-xs text-muted-foreground mt-1">
              {search ? 'Try a different search' : 'Connect an inbox to start receiving messages'}
            </p>
          </div>
        ) : (
          filtered.map(conv => (
            <ConversationItem
              key={conv.id}
              conv={conv}
              isSelected={selectedId === conv.id}
              onClick={() => setSelectedId(conv.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}
