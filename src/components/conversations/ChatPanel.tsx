import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useConversations } from '@/contexts/ConversationsContext'
import { Message, Conversation, AgentProfile } from '@/types'
import { cn, getInitials, formatTimeAgo } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Send, Paperclip, Info, CheckCheck, Lock, User,
  ChevronDown, Loader2, Phone, Facebook, Instagram, Globe, Mail, X
} from 'lucide-react'
import { toast } from 'sonner'

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  instagram: 'Instagram',
  widget: 'Web Widget',
  email: 'Email',
}

interface ChatPanelProps {
  onToggleInfo: () => void
  showInfo: boolean
}

function MessageBubble({ msg, isAgent }: { msg: Message; isAgent: boolean }) {
  if (msg.is_private) {
    return (
      <div className="flex justify-center my-1">
        <div className="flex items-start gap-2 max-w-[85%] bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <Lock className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-amber-700 mb-0.5">{msg.sender_name} (internal note)</p>
            <p className="text-xs text-amber-800 whitespace-pre-wrap">{msg.content}</p>
          </div>
        </div>
      </div>
    )
  }

  if (msg.sender_type === 'system') {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">{msg.content}</span>
      </div>
    )
  }

  return (
    <div className={cn('flex gap-2 mb-3', isAgent ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-semibold text-primary flex-shrink-0 mt-0.5">
        {getInitials(msg.sender_name || '?')}
      </div>

      <div className={cn('flex flex-col max-w-[75%]', isAgent ? 'items-end' : 'items-start')}>
        <div className={cn(
          'px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words',
          isAgent
            ? 'bg-primary text-white rounded-tr-sm'
            : 'bg-muted text-foreground rounded-tl-sm'
        )}>
          {msg.content}
          {/* Attachments */}
          {msg.attachment_urls && msg.attachment_urls.length > 0 && (
            <div className="mt-2 space-y-1">
              {msg.attachment_urls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                  className={cn('block text-xs underline', isAgent ? 'text-white/80' : 'text-primary')}>
                  Attachment {i + 1}
                </a>
              ))}
            </div>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground mt-1 px-1">{formatTimeAgo(msg.created_at)}</span>
      </div>
    </div>
  )
}

export default function ChatPanel({ onToggleInfo, showInfo }: ChatPanelProps) {
  const { profile, organization } = useAuth()
  const { selectedId, conversations, refresh } = useConversations()
  const [messages, setMessages] = useState<Message[]>([])
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [replyText, setReplyText] = useState('')
  const [noteText, setNoteText] = useState('')
  const [activeTab, setActiveTab] = useState<'reply' | 'note'>('reply')
  const [sending, setSending] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [agents, setAgents] = useState<AgentProfile[]>([])
  const [showAssign, setShowAssign] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<any>(null)

  // Sync conversation from context
  useEffect(() => {
    if (selectedId) {
      const conv = conversations.find(c => c.id === selectedId)
      if (conv) setConversation(conv)
    } else {
      setConversation(null)
    }
  }, [selectedId, conversations])

  // Load messages when conversation changes
  useEffect(() => {
    if (!selectedId) { setMessages([]); return }
    loadMessages(selectedId)
    markAsRead(selectedId)
    subscribeToMessages(selectedId)
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [selectedId])

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadMessages = async (convId: string) => {
    setLoadingMessages(true)
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', convId)
        .neq('is_deleted', true)
        .order('created_at', { ascending: true })
      if (error) throw error
      setMessages(data || [])
    } catch (err) {
      console.error('Error loading messages:', err)
    } finally {
      setLoadingMessages(false)
    }
  }

  const markAsRead = async (convId: string) => {
    await supabase
      .from('conversations')
      .update({ unread_count: 0 })
      .eq('id', convId)
  }

  const subscribeToMessages = (convId: string) => {
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    const channel = supabase
      .channel(`messages-${convId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` },
        (payload) => {
          setMessages(prev => {
            if (prev.find(m => m.id === payload.new.id)) return prev
            return [...prev, payload.new as Message]
          })
        }
      )
      .subscribe()
    channelRef.current = channel
  }

  const sendMessage = async () => {
    const text = activeTab === 'reply' ? replyText : noteText
    if (!text.trim() || !selectedId || !profile || !organization) return

    // Optimistic update — show message immediately
    const optimisticMsg: Message = {
      id: `optimistic-${Date.now()}`,
      conversation_id: selectedId,
      organization_id: organization.id,
      sender_type: 'agent',
      sender_id: profile.id,
      sender_name: profile.full_name,
      message_type: 'text',
      content: text.trim(),
      is_private: activeTab === 'note',
      is_read: true,
      is_deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      attachment_urls: undefined,
      channel_message_id: undefined,
    }
    setMessages(prev => [...prev, optimisticMsg])
    activeTab === 'reply' ? setReplyText('') : setNoteText('')

    setSending(true)
    try {
      const channelType = conversation?.inbox?.channel_type
      const isInternalNote = activeTab === 'note'

      if (!isInternalNote && (channelType === 'facebook' || channelType === 'instagram' || channelType === 'whatsapp')) {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: selectedId,
            message_text: text.trim(),
            agent_id: profile.id,
            agent_name: profile.full_name,
            organization_id: organization.id,
          })
        })
        const data = await res.json()
        if (data.error) throw new Error(data.error)
      } else {
        const { error } = await supabase.from('messages').insert({
          conversation_id: selectedId,
          organization_id: organization.id,
          sender_type: 'agent',
          sender_id: profile.id,
          sender_name: profile.full_name,
          message_type: 'text',
          content: text.trim(),
          is_private: isInternalNote,
          is_read: true,
        })
        if (error) throw error
      }

      if ((conversation?.status === 'pending' || conversation?.status === 'in_progress') && !isInternalNote) {
        // Keep status as-is when replying, don't auto-change
      }

      // Replace optimistic message with real one from DB
      await loadMessages(selectedId)
      refresh()
    } catch (err: any) {
      // Remove optimistic message on failure
      setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id))
      activeTab === 'reply' ? setReplyText(text) : setNoteText(text)
      toast.error(err.message || 'Failed to send message')
      console.error(err)
    } finally {
      setSending(false)
    }
  }

  const updateStatus = async (status: 'open' | 'in_progress' | 'pending' | 'resolved') => {
    if (!selectedId || !profile) return
    try {
      await supabase.from('conversations').update({ status }).eq('id', selectedId)
      // Log activity
      await supabase.from('activities').insert({
        organization_id: organization!.id,
        conversation_id: selectedId,
        actor_id: profile.id,
        actor_name: profile.full_name,
        activity_type: status === 'resolved' ? 'resolved' : status === 'open' ? 'reopened' : status === 'in_progress' ? 'in_progress' : 'set_pending',
      })
      // Add system message
      await supabase.from('messages').insert({
        conversation_id: selectedId,
        organization_id: organization!.id,
        sender_type: 'system',
        sender_name: 'System',
        message_type: 'activity',
        content: `${profile.full_name} marked this ticket as ${status.replace('_', ' ')}`,
        is_private: false,
        is_read: true,
      })
      refresh()
      toast.success(`Ticket marked as ${status.replace('_', ' ')}`)
    } catch (err) {
      toast.error('Failed to update status')
    }
  }

  const loadAgents = async () => {
    if (!organization) return
    const { data } = await supabase
      .from('agent_profiles')
      .select('id, full_name, email, avatar_url, role, is_active, availability, organization_id, created_at, updated_at')
      .eq('organization_id', organization.id)
      .eq('is_active', true)
    setAgents(data || [])
  }

  const assignAgent = async (agentId: string) => {
    if (!selectedId) return
    const agent = agents.find(a => a.id === agentId)
    await supabase.from('conversations').update({ assigned_agent_id: agentId }).eq('id', selectedId)
    await supabase.from('messages').insert({
      conversation_id: selectedId,
      organization_id: organization!.id,
      sender_type: 'system',
      sender_name: 'System',
      message_type: 'activity',
      content: `${profile?.full_name} assigned this conversation to ${agent?.full_name}`,
      is_private: false,
      is_read: true,
    })
    setShowAssign(false)
    refresh()
    toast.success(`Assigned to ${agent?.full_name}`)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Empty state
  if (!selectedId || !conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/10">
        <div className="text-center">
          <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="font-medium text-foreground">No conversation selected</p>
          <p className="text-sm text-muted-foreground mt-1">Choose a conversation from the list</p>
        </div>
      </div>
    )
  }

  const contactName = conversation.contact?.name || conversation.contact?.phone || 'Unknown'
  const channelType = conversation.inbox?.channel_type || 'widget'
  const isResolved = conversation.status === 'resolved'

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold flex-shrink-0">
            {getInitials(contactName)}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm text-foreground truncate">{contactName}</p>
            <p className="text-xs text-muted-foreground">{CHANNEL_LABELS[channelType]} · {conversation.inbox?.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Assign */}
          <div className="relative">
            <Button variant="outline" size="sm" className="text-xs gap-1.5 h-7"
              onClick={() => { setShowAssign(!showAssign); loadAgents() }}>
              <User className="w-3 h-3" />
              {(conversation.assigned_agent as any)?.full_name || 'Assign'}
              <ChevronDown className="w-3 h-3" />
            </Button>
            {showAssign && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-popover border border-border rounded-lg shadow-lg z-50 py-1">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
                  <span className="text-xs font-medium">Assign to</span>
                  <button onClick={() => setShowAssign(false)}><X className="w-3 h-3" /></button>
                </div>
                {agents.map(agent => (
                  <button key={agent.id} onClick={() => assignAgent(agent.id)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-semibold text-primary">
                      {getInitials(agent.full_name)}
                    </div>
                    <span className="truncate">{agent.full_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Status dropdown */}
          {(() => {
            const statusCfg: Record<string, { label: string; color: string }> = {
              open: { label: 'Open', color: 'bg-blue-100 text-blue-700 border-blue-200' },
              in_progress: { label: 'In Progress', color: 'bg-amber-100 text-amber-700 border-amber-200' },
              pending: { label: 'Pending', color: 'bg-orange-100 text-orange-700 border-orange-200' },
              resolved: { label: 'Resolved', color: 'bg-green-100 text-green-700 border-green-200' },
            }
            const current = statusCfg[conversation.status] || statusCfg.open
            return (
              <div className="relative">
                <select
                  value={conversation.status}
                  onChange={e => updateStatus(e.target.value as any)}
                  className={`text-xs font-semibold px-2 py-1 rounded-md border cursor-pointer outline-none ${current.color}`}
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="pending">Pending</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
            )
          })()}

          {/* Info toggle */}
          <Button variant={showInfo ? 'secondary' : 'ghost'} size="sm" className="h-7 w-7 p-0" onClick={onToggleInfo}>
            <Info className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loadingMessages ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-sm text-muted-foreground">No messages yet</p>
            <p className="text-xs text-muted-foreground mt-1">Send the first message below</p>
          </div>
        ) : (
          messages.map(msg => (
            <MessageBubble key={msg.id} msg={msg} isAgent={msg.sender_type === 'agent'} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply box */}
      {!isResolved && (
        <div className="border-t border-border flex-shrink-0">
          {/* Tabs */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab('reply')}
              className={cn('px-4 py-2 text-xs font-medium border-b-2 transition-colors',
                activeTab === 'reply' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}>
              Reply
            </button>
            <button
              onClick={() => setActiveTab('note')}
              className={cn('px-4 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5',
                activeTab === 'note' ? 'border-amber-500 text-amber-600' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}>
              <Lock className="w-3 h-3" />
              Internal Note
            </button>
          </div>

          <div className="p-3">
            <Textarea
              placeholder={activeTab === 'reply' ? 'Type a reply... (Ctrl+Enter to send)' : 'Add an internal note... (only agents can see this)'}
              value={activeTab === 'reply' ? replyText : noteText}
              onChange={e => activeTab === 'reply' ? setReplyText(e.target.value) : setNoteText(e.target.value)}
              onKeyDown={handleKeyDown}
              className={cn(
                'min-h-[80px] max-h-[160px] text-sm border-0 bg-transparent focus-visible:ring-0 p-0 resize-none',
                activeTab === 'note' && 'placeholder:text-amber-400/60'
              )}
            />
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground">
                  <Paperclip className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Ctrl+Enter</span>
                <Button
                  size="sm"
                  className={cn('h-7 gap-1.5 text-xs', activeTab === 'note' && 'bg-amber-500 hover:bg-amber-600')}
                  onClick={sendMessage}
                  disabled={sending || !(activeTab === 'reply' ? replyText.trim() : noteText.trim())}
                >
                  {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  {activeTab === 'reply' ? 'Send' : 'Add Note'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isResolved && (
        <div className="border-t border-border p-4 text-center">
          <p className="text-sm text-muted-foreground">This conversation is resolved.</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => updateStatus('open')}>
            Reopen Conversation
          </Button>
        </div>
      )}
    </div>
  )
}