import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthContext'
import { Conversation, ConversationStatus } from '@/types'

interface ConversationsContextType {
  conversations: Conversation[]
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  activeFilter: ConversationStatus | 'all'
  setActiveFilter: (f: ConversationStatus | 'all') => void
  counts: { open: number; pending: number; resolved: number }
  loading: boolean
  refresh: () => Promise<void>
}

const ConversationsContext = createContext<ConversationsContextType | undefined>(undefined)

export const ConversationsProvider = ({ children }: { children: ReactNode }) => {
  const { organization } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<ConversationStatus | 'all'>('open')
  const [loading, setLoading] = useState(true)
  const channelRef = useRef<any>(null)

  const refresh = async () => {
    if (!organization) return
    try {
      // Load active conversations
      const { data: active } = await supabase
        .from('conversations')
        .select(`
          *,
          contact:contacts(*),
          inbox:inboxes(id, name, channel_type),
          assigned_agent:agent_profiles!assigned_agent_id(id, full_name, avatar_url)
        `)
        .eq('organization_id', organization.id)
        .in('status', ['open', 'pending'])
        .order('updated_at', { ascending: false })

      // Load last 50 resolved
      const { data: resolved } = await supabase
        .from('conversations')
        .select(`
          *,
          contact:contacts(*),
          inbox:inboxes(id, name, channel_type),
          assigned_agent:agent_profiles!assigned_agent_id(id, full_name, avatar_url)
        `)
        .eq('organization_id', organization.id)
        .eq('status', 'resolved')
        .order('updated_at', { ascending: false })
        .limit(50)

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

    // Cleanup previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }

    const channel = supabase
      .channel(`conversations-${organization.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations', filter: `organization_id=eq.${organization.id}` },
        async (payload) => {
          const { data } = await supabase
            .from('conversations')
            .select('*, contact:contacts(*), inbox:inboxes(id,name,channel_type), assigned_agent:agent_profiles!assigned_agent_id(id,full_name,avatar_url)')
            .eq('id', payload.new.id)
            .single()
          if (data) setConversations(prev => [data, ...prev])
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `organization_id=eq.${organization.id}` },
        async (payload) => {
          const { data } = await supabase
            .from('conversations')
            .select('*, contact:contacts(*), inbox:inboxes(id,name,channel_type), assigned_agent:agent_profiles!assigned_agent_id(id,full_name,avatar_url)')
            .eq('id', payload.new.id)
            .single()
          if (data) setConversations(prev => prev.map(c => c.id === data.id ? data : c))
        }
      )
      .subscribe()

    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [organization?.id])

  const counts = {
    open: conversations.filter(c => c.status === 'open').length,
    pending: conversations.filter(c => c.status === 'pending').length,
    resolved: conversations.filter(c => c.status === 'resolved').length,
  }

  return (
    <ConversationsContext.Provider value={{ conversations, selectedId, setSelectedId, activeFilter, setActiveFilter, counts, loading, refresh }}>
      {children}
    </ConversationsContext.Provider>
  )
}

export const useConversations = () => {
  const ctx = useContext(ConversationsContext)
  if (!ctx) throw new Error('useConversations must be within ConversationsProvider')
  return ctx
}
