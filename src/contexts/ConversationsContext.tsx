import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthContext'
import { Conversation, ConversationStatus } from '@/types'

export type SidebarView = 'my_open' | 'unassigned' | 'all_assigned' | 'my_resolved_today' | 'all_resolved_today' | 'all_tickets'

interface ConversationsContextType {
  conversations: Conversation[]
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  activeView: SidebarView
  setActiveView: (v: SidebarView) => void
  activeFilter: ConversationStatus | 'all'
  setActiveFilter: (f: ConversationStatus | 'all') => void
  counts: {
    open: number; in_progress: number; pending: number; resolved: number
    my_open: number; unassigned: number; all_assigned: number
    my_resolved_today: number; all_resolved_today: number; all_tickets: number
  }
  loading: boolean
  refresh: () => Promise<void>
}

const ConversationsContext = createContext<ConversationsContextType | undefined>(undefined)

export const ConversationsProvider = ({ children }: { children: ReactNode }) => {
  const { organization, profile } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<SidebarView>('my_open')
  const [activeFilter, setActiveFilter] = useState<ConversationStatus | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const channelRef = useRef<any>(null)

  const refresh = async () => {
    if (!organization) return
    try {
      const { data: active } = await supabase
        .from('conversations')
        .select('*, contact:contacts(*), inbox:inboxes(id, name, channel_type), assigned_agent:agent_profiles!assigned_agent_id(id, full_name, avatar_url)')
        .eq('organization_id', organization.id)
        .in('status', ['open', 'in_progress', 'pending'])
        .order('updated_at', { ascending: false })

      const { data: resolved } = await supabase
        .from('conversations')
        .select('*, contact:contacts(*), inbox:inboxes(id, name, channel_type), assigned_agent:agent_profiles!assigned_agent_id(id, full_name, avatar_url)')
        .eq('organization_id', organization.id)
        .eq('status', 'resolved')
        .order('updated_at', { ascending: false })
        .limit(100)

      const all = [...(active || []), ...(resolved || [])]
      all.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      setConversations(all)
    } catch (err) {
      console.error('Error fetching conversations:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!organization) return
    refresh()
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    const channel = supabase
      .channel(`conversations-${organization.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations', filter: `organization_id=eq.${organization.id}` },
        async (payload) => {
          const { data } = await supabase.from('conversations')
            .select('*, contact:contacts(*), inbox:inboxes(id,name,channel_type), assigned_agent:agent_profiles!assigned_agent_id(id,full_name,avatar_url)')
            .eq('id', payload.new.id).single()
          if (data) setConversations(prev => [data, ...prev])
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `organization_id=eq.${organization.id}` },
        async (payload) => {
          const { data } = await supabase.from('conversations')
            .select('*, contact:contacts(*), inbox:inboxes(id,name,channel_type), assigned_agent:agent_profiles!assigned_agent_id(id,full_name,avatar_url)')
            .eq('id', payload.new.id).single()
          if (data) setConversations(prev => prev.map(c => c.id === data.id ? data : c))
        })
      .subscribe()
    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [organization?.id])

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)

  const counts = {
    open: conversations.filter(c => c.status === 'open').length,
    in_progress: conversations.filter(c => c.status === 'in_progress').length,
    pending: conversations.filter(c => c.status === 'pending').length,
    resolved: conversations.filter(c => c.status === 'resolved').length,
    my_open: conversations.filter(c => (c as any).assigned_agent_id === profile?.id && c.status !== 'resolved').length,
    unassigned: conversations.filter(c => !(c as any).assigned_agent_id && c.status !== 'resolved').length,
    all_assigned: conversations.filter(c => !!(c as any).assigned_agent_id && c.status !== 'resolved').length,
    my_resolved_today: conversations.filter(c => c.status === 'resolved' && (c as any).assigned_agent_id === profile?.id && new Date(c.updated_at) >= todayStart).length,
    all_resolved_today: conversations.filter(c => c.status === 'resolved' && new Date(c.updated_at) >= todayStart).length,
    all_tickets: conversations.length,
  }

  return (
    <ConversationsContext.Provider value={{ conversations, selectedId, setSelectedId, activeView, setActiveView, activeFilter, setActiveFilter, counts, loading, refresh }}>
      {children}
    </ConversationsContext.Provider>
  )
}

export const useConversations = () => {
  const ctx = useContext(ConversationsContext)
  if (!ctx) throw new Error('useConversations must be within ConversationsProvider')
  return ctx
}