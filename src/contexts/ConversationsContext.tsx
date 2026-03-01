import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthContext'
import { Conversation, ConversationStatus, Label } from '@/types'

export type SidebarView = 'my_open' | 'unassigned' | 'ai_handling' | 'all_assigned' | 'my_resolved_today' | 'all_resolved_today' | 'all_tickets'

interface ConversationsContextType {
  conversations: Conversation[]
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  activeView: SidebarView
  setActiveView: (v: SidebarView) => void
  activeFilter: ConversationStatus | 'all'
  setActiveFilter: (f: ConversationStatus | 'all') => void
  activeLabelId: string | null
  setActiveLabelId: (id: string | null) => void
  orgLabels: Label[]
  counts: {
    open: number; in_progress: number; pending: number; resolved: number
    my_open: number; unassigned: number; all_assigned: number
    my_resolved_today: number; all_resolved_today: number; all_tickets: number
  }
  loading: boolean
  refresh: () => Promise<void>
}

const ConversationsContext = createContext<ConversationsContextType | undefined>(undefined)

// Conversation select with labels joined through junction table
const CONV_SELECT = '*, assigned_agent_id, contact:contacts(*), inbox:inboxes(id, name, channel_type), assigned_agent:agent_profiles!assigned_agent_id(id, full_name, avatar_url), conversation_labels(label:labels(id, name, color))'

// Shape returned by Supabase for conversation_labels join
function extractLabels(conv: any): Label[] {
  if (!conv.conversation_labels) return []
  return conv.conversation_labels
    .map((cl: any) => cl.label)
    .filter(Boolean)
}

export const ConversationsProvider = ({ children }: { children: ReactNode }) => {
  const { organization, profile } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<SidebarView>('my_open')
  const [activeFilter, setActiveFilter] = useState<ConversationStatus | 'all'>('all')
  const [activeLabelId, setActiveLabelId] = useState<string | null>(null)
  const [orgLabels, setOrgLabels] = useState<Label[]>([])
  const [loading, setLoading] = useState(true)
  const channelRef = useRef<any>(null)

  // Fetch org labels once
  useEffect(() => {
    if (!organization) return
    supabase
      .from('labels')
      .select('*')
      .eq('organization_id', organization.id)
      .order('name')
      .then(({ data }) => setOrgLabels(data || []))
  }, [organization?.id])

  const refresh = async () => {
    if (!organization) return
    try {
      const { data: active } = await supabase
        .from('conversations')
        .select(CONV_SELECT)
        .eq('organization_id', organization.id)
        .in('status', ['open', 'in_progress', 'pending'])
        .order('updated_at', { ascending: false })

      const { data: resolved } = await supabase
        .from('conversations')
        .select(CONV_SELECT)
        .eq('organization_id', organization.id)
        .eq('status', 'resolved')
        .order('updated_at', { ascending: false })
        .limit(100)

      const all = [...(active || []), ...(resolved || [])]
      all.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

      // Attach labels array to each conversation
      const withLabels = all.map(c => ({ ...c, labels: extractLabels(c) }))
      setConversations(withLabels)
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
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversations', filter: `organization_id=eq.${organization.id}` },
        async (payload) => {
          const { data } = await supabase.from('conversations')
            .select(CONV_SELECT).eq('id', payload.new.id).single()
          if (data) setConversations(prev => [{ ...data, labels: extractLabels(data) }, ...prev])
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `organization_id=eq.${organization.id}` },
        async (payload) => {
          const { data } = await supabase.from('conversations')
            .select(CONV_SELECT).eq('id', payload.new.id).single()
          if (data) setConversations(prev => prev.map(c => c.id === data.id ? { ...data, labels: extractLabels(data) } : c))
        })
      // Also listen for conversation_labels changes so cards update instantly
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_labels' },
        async (payload) => {
          const convId = (payload.new as any)?.conversation_id || (payload.old as any)?.conversation_id
          if (!convId) return
          const { data } = await supabase.from('conversations')
            .select(CONV_SELECT).eq('id', convId).single()
          if (data) setConversations(prev => prev.map(c => c.id === convId ? { ...data, labels: extractLabels(data) } : c))
        })
      .subscribe()

    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [organization?.id])

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)

  const getAgentId = (c: Conversation) => (c.assigned_agent as any)?.id || (c as any).assigned_agent_id || null
  const counts = {
    open: conversations.filter(c => c.status === 'open').length,
    in_progress: conversations.filter(c => c.status === 'in_progress').length,
    pending: conversations.filter(c => c.status === 'pending').length,
    resolved: conversations.filter(c => c.status === 'resolved').length,
    my_open: conversations.filter(c => getAgentId(c) === profile?.id && c.status !== 'resolved' && !(c as any).ai_handled).length,
    unassigned: conversations.filter(c => !getAgentId(c) && c.status !== 'resolved' && !(c as any).ai_handled).length,
    ai_handling: conversations.filter(c => !!(c as any).ai_handled && c.status !== 'resolved').length,
    all_assigned: conversations.filter(c => !!getAgentId(c) && c.status !== 'resolved' && !(c as any).ai_handled).length,
    my_resolved_today: conversations.filter(c => c.status === 'resolved' && getAgentId(c) === profile?.id && new Date(c.updated_at) >= todayStart).length,
    all_resolved_today: conversations.filter(c => c.status === 'resolved' && new Date(c.updated_at) >= todayStart).length,
    all_tickets: conversations.length,
  }

  return (
    <ConversationsContext.Provider value={{
      conversations, selectedId, setSelectedId,
      activeView, setActiveView,
      activeFilter, setActiveFilter,
      activeLabelId, setActiveLabelId,
      orgLabels,
      counts, loading, refresh,
    }}>
      {children}
    </ConversationsContext.Provider>
  )
}

export const useConversations = () => {
  const ctx = useContext(ConversationsContext)
  if (!ctx) throw new Error('useConversations must be within ConversationsProvider')
  return ctx
}