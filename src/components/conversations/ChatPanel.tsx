import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useConversations } from '@/contexts/ConversationsContext'
import { Message, Conversation, AgentProfile } from '@/types'
import { cn, getInitials, formatTimeAgo } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send, Paperclip, Info, Lock, User, ChevronDown, Loader2, X, MessageCircle, Sparkles, Bot } from 'lucide-react'
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

// BUG FIX #4: Helper — system message with all required fields
function makeSystemMsg(conversationId: string, orgId: string, content: string) {
  return {
    conversation_id: conversationId,
    organization_id: orgId,
    sender_type: 'system' as const,
    sender_name: 'System',
    message_type: 'activity' as const,
    content,
    is_private: false,
    is_read: true,
    is_deleted: false,
  }
}

function MessageBubble({ msg, isAgent }: { msg: Message; isAgent: boolean }) {
  if (msg.is_private) {
    return (
      <div className="flex justify-center my-2">
        <div className="flex items-start gap-2 max-w-[85%] bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <Lock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-700 mb-0.5">{msg.sender_name} · Internal Note</p>
            <p className="text-sm text-amber-800 whitespace-pre-wrap">{msg.content}</p>
            <p className="text-[10px] text-amber-500 mt-1">{formatTimeAgo(msg.created_at)}</p>
          </div>
        </div>
      </div>
    )
  }

  if (msg.sender_type === 'system') {
    return (
      <div className="flex justify-center my-3">
        <span className="text-xs text-gray-400 bg-gray-100 px-4 py-1.5 rounded-full">{msg.content}</span>
      </div>
    )
  }

  // AI message — special purple bubble
  if (msg.sender_type === 'ai') {
    return (
      <div className="flex gap-2 mb-4 flex-row">
        <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Bot className="w-4 h-4 text-violet-600" />
        </div>
        <div className="flex flex-col items-start max-w-[75%]">
          <p className="text-[10px] text-violet-500 font-semibold mb-1 px-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />AI Assistant
          </p>
          <div className="bg-violet-50 border border-violet-200 text-violet-900 px-4 py-2.5 rounded-2xl rounded-tl-sm text-sm whitespace-pre-wrap break-words leading-relaxed">
            {msg.content}
          </div>
          <span className="text-[10px] text-gray-400 mt-1 px-1">{formatTimeAgo(msg.created_at)}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex gap-2 mb-4', isAgent ? 'flex-row-reverse' : 'flex-row')}>
      <div className={cn(
        'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5',
        isAgent ? 'bg-primary text-white' : 'bg-gray-200 text-gray-600'
      )}>
        {getInitials(msg.sender_name || '?')}
      </div>
      <div className={cn('flex flex-col max-w-[75%]', isAgent ? 'items-end' : 'items-start')}>
        <p className="text-[10px] text-gray-400 mb-1 px-1">{msg.sender_name}</p>
        <div className={cn(
          'px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words leading-relaxed',
          isAgent
            ? 'bg-primary text-white rounded-tr-sm'
            : 'bg-gray-100 text-gray-900 rounded-tl-sm'
        )}>
          {msg.content}
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
        <span className="text-[10px] text-gray-400 mt-1 px-1">{formatTimeAgo(msg.created_at)}</span>
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
    setConversation(selectedId ? (conversations.find(c => c.id === selectedId) ?? null) : null)
  }, [selectedId, conversations])

  // Load messages + subscribe when ticket selected
  useEffect(() => {
    if (!selectedId) { setMessages([]); return }
    loadMessages(selectedId)
    markAsRead(selectedId)
    subscribeToMessages(selectedId)
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [selectedId])

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
    await supabase.from('conversations').update({ unread_count: 0 }).eq('id', convId)
  }

  const subscribeToMessages = (convId: string) => {
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    const channel = supabase
      .channel(`messages-${convId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` },
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

    const isNote = activeTab === 'note'

    // Optimistic update
    const optimistic: Message = {
      id: `opt-${Date.now()}`,
      conversation_id: selectedId,
      organization_id: organization.id,
      sender_type: 'agent',
      sender_id: profile.id,
      sender_name: profile.full_name,
      message_type: 'text',
      content: text.trim(),
      is_private: isNote,
      is_read: true,
      is_deleted: false,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, optimistic])
    isNote ? setNoteText('') : setReplyText('')

    setSending(true)
    try {
      if (isNote) {
        // Internal notes — always direct DB insert
        const { error } = await supabase.from('messages').insert({
          conversation_id: selectedId,
          organization_id: organization.id,
          sender_type: 'agent',
          sender_id: profile.id,
          sender_name: profile.full_name,
          message_type: 'text',
          content: text.trim(),
          is_private: true,
          is_read: true,
          is_deleted: false,  // BUG FIX #4: was missing
        })
        if (error) throw error
      } else {
        // BUG FIX #3: ALL channels (including widget) go through edge function
        // so the edge function can update latest_message + latest_message_sender='agent'
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
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
      }

      await loadMessages(selectedId)
      refresh()
    } catch (err: any) {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id))
      isNote ? setNoteText(text) : setReplyText(text)
      toast.error(err.message || 'Failed to send')
      console.error(err)
    } finally {
      setSending(false)
    }
  }

  const updateStatus = async (status: 'open' | 'in_progress' | 'pending' | 'resolved') => {
    if (!selectedId || !profile || !organization) return
    try {
      await supabase.from('conversations').update({ status, updated_at: new Date().toISOString() }).eq('id', selectedId)
      await supabase.from('messages').insert(
        makeSystemMsg(selectedId, organization.id, `${profile.full_name} changed status to ${status.replace('_', ' ')}`)
      )
      refresh()
      toast.success(`Status → ${status.replace('_', ' ')}`)
    } catch {
      toast.error('Failed to update status')
    }
  }

  const loadAgents = async () => {
    if (!organization) return
    // Already org-scoped correctly
    const { data } = await supabase
      .from('agent_profiles')
      .select('id, full_name, email, role, is_active, availability, organization_id, created_at, updated_at, avatar_url')
      .eq('organization_id', organization.id)
      .eq('is_active', true)
      .order('full_name')
    setAgents((data as AgentProfile[]) || [])
  }

  const assignAgent = async (agentId: string | null) => {
    if (!selectedId || !organization || !profile) return
    const agent = agents.find(a => a.id === agentId)
    await supabase.from('conversations').update({ assigned_agent_id: agentId, updated_at: new Date().toISOString() }).eq('id', selectedId)
    await supabase.from('messages').insert(
      makeSystemMsg(selectedId, organization.id,
        agentId == null
          ? `${profile.full_name} unassigned this ticket`
          : `${profile.full_name} assigned this ticket to ${agent?.full_name}`
      )
    )
    setShowAssign(false)
    refresh()
    toast.success(agentId == null ? 'Ticket unassigned' : `Assigned to ${agent?.full_name}`)
  }

  const handleTakeOver = async () => {
    if (!selectedId || !profile || !organization) return
    try {
      await supabase.from('conversations').update({
        ai_handled: false,
        assigned_agent_id: profile.id,
        updated_at: new Date().toISOString(),
      }).eq('id', selectedId)
      await supabase.from('messages').insert(
        makeSystemMsg(selectedId, organization.id,
          `${profile.full_name} took over from AI`
        )
      )
      refresh()
      toast.success('You are now handling this conversation')
    } catch {
      toast.error('Failed to take over')
    }
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
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <MessageCircle className="w-8 h-8 text-gray-300" />
          </div>
          <p className="font-semibold text-gray-600">No ticket selected</p>
          <p className="text-sm text-gray-400 mt-1">Choose a ticket from the list</p>
        </div>
      </div>
    )
  }

  const contactName = conversation.contact?.name || conversation.contact?.phone || 'Unknown'
  const channelType = conversation.inbox?.channel_type || 'widget'
  const isResolved = conversation.status === 'resolved'
  const ticketNum = (conversation as any).ticket_number
    ? `TKT${String((conversation as any).ticket_number).padStart(6, '0')}`
    : null
  const assignedAgent = conversation.assigned_agent as any

  const statusCfg: Record<string, { label: string; cls: string }> = {
    open: { label: 'Open', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
    in_progress: { label: 'In Progress', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
    pending: { label: 'Pending', cls: 'bg-orange-100 text-orange-700 border-orange-200' },
    resolved: { label: 'Resolved', cls: 'bg-green-100 text-green-700 border-green-200' },
  }
  const currentStatus = statusCfg[conversation.status] || statusCfg.open

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-white overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 h-14 border-b border-gray-200 flex-shrink-0 bg-white">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-lg font-bold text-gray-900">{ticketNum || contactName}</h2>
          <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-md font-medium">
            {CHANNEL_LABELS[channelType]} · {conversation.inbox?.name}
          </span>
          {(conversation as any).ai_handled && (
            <span className="flex items-center gap-1 bg-violet-100 text-violet-700 text-xs font-bold px-2 py-0.5 rounded-full">
              <Sparkles className="w-3 h-3" />AI Handling
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Assign dropdown */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5 h-8 font-medium"
              onClick={() => { setShowAssign(!showAssign); if (!showAssign) loadAgents() }}
            >
              <User className="w-3.5 h-3.5" />
              {assignedAgent?.full_name || 'Assign'}
              <ChevronDown className="w-3 h-3" />
            </Button>
            {showAssign && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1.5 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                  <span className="text-xs font-bold text-gray-600">Assign to</span>
                  <button onClick={() => setShowAssign(false)} className="p-0.5 hover:bg-gray-100 rounded">
                    <X className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                </div>
                <button
                  onClick={() => assignAgent(null)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-500 flex items-center gap-2"
                >
                  <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px]">–</div>
                  Unassign
                </button>
                {agents.map(agent => (
                  <button
                    key={agent.id}
                    onClick={() => assignAgent(agent.id)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors',
                      assignedAgent?.id === agent.id && 'bg-primary/5 text-primary font-semibold'
                    )}
                  >
                    <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                      {getInitials(agent.full_name)}
                    </div>
                    <span className="truncate">{agent.full_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Status selector */}
          <select
            value={conversation.status}
            onChange={e => updateStatus(e.target.value as any)}
            className={cn(
              'text-xs font-bold px-3 py-1.5 rounded-lg border-2 cursor-pointer outline-none appearance-none',
              currentStatus.cls
            )}
          >
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
          </select>

          {/* Take Over from AI */}
          {(conversation as any).ai_handled && (
            <Button
              size="sm"
              className="h-8 px-3 bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs flex items-center gap-1.5"
              onClick={handleTakeOver}
            >
              <User className="w-3.5 h-3.5" />
              Take Over
            </Button>
          )}

          {/* Info toggle */}
          <Button
            variant={showInfo ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onToggleInfo}
          >
            <Info className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* ── Messages ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-5 bg-gray-50">
        {loadingMessages ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-sm text-gray-400">No messages yet</p>
            <p className="text-xs text-gray-300 mt-1">Send the first message below</p>
          </div>
        ) : (
          messages.map(msg => (
            <MessageBubble key={msg.id} msg={msg} isAgent={msg.sender_type === 'agent' || msg.sender_type === 'ai'} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Reply Box ──────────────────────────────────────────── */}
      {isResolved ? (
        <div className="border-t border-gray-200 p-4 text-center bg-white flex-shrink-0">
          <p className="text-sm text-gray-500 mb-2">This ticket is resolved.</p>
          <Button variant="outline" size="sm" onClick={() => updateStatus('open')}>
            Reopen Ticket
          </Button>
        </div>
      ) : (
        <div className="border-t border-gray-200 bg-white flex-shrink-0">
          {/* Tabs */}
          <div className="flex border-b border-gray-100 px-1">
            <button
              onClick={() => setActiveTab('reply')}
              className={cn(
                'px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors',
                activeTab === 'reply'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              )}
            >
              Reply
            </button>
            <button
              onClick={() => setActiveTab('note')}
              className={cn(
                'px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5',
                activeTab === 'note'
                  ? 'border-amber-500 text-amber-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              )}
            >
              <Lock className="w-3 h-3" />
              Internal Note
            </button>
          </div>

          <div className={cn('p-4', activeTab === 'note' && 'bg-amber-50/50')}>
            <div className="flex items-end gap-3">
              <Button variant="ghost" size="sm" className="h-9 w-9 p-0 flex-shrink-0 text-gray-400 hover:text-gray-600 rounded-full">
                <Paperclip className="w-4 h-4" />
              </Button>
              <Textarea
                placeholder={
                  activeTab === 'reply'
                    ? 'Type message, paste screenshot (Ctrl+V), or drag & drop files... (Ctrl+Enter to send)'
                    : 'Add an internal note... (only agents can see this)'
                }
                value={activeTab === 'reply' ? replyText : noteText}
                onChange={e => activeTab === 'reply' ? setReplyText(e.target.value) : setNoteText(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                className={cn(
                  'flex-1 resize-none text-sm border-0 bg-transparent focus-visible:ring-0 p-0 min-h-[40px] max-h-[160px]',
                  activeTab === 'note' && 'placeholder:text-amber-400/70'
                )}
                style={{ height: 'auto' }}
                onInput={(e) => {
                  const t = e.target as HTMLTextAreaElement
                  t.style.height = 'auto'
                  t.style.height = Math.min(t.scrollHeight, 160) + 'px'
                }}
              />
              <Button
                size="sm"
                className={cn(
                  'h-9 px-5 rounded-lg font-semibold flex-shrink-0',
                  activeTab === 'note' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-primary hover:bg-primary/90'
                )}
                onClick={sendMessage}
                disabled={sending || !(activeTab === 'reply' ? replyText.trim() : noteText.trim())}
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                  activeTab === 'reply' ? 'Send' : 'Add Note'
                )}
              </Button>
            </div>

            <div className="flex items-center justify-between mt-2 px-1">
              <span className="text-[11px] text-gray-400">
                {activeTab === 'note' ? '🔒 Only visible to agents' : 'Use / for quick replies • Ctrl+Enter to send'}
              </span>
              <span className="text-[11px] text-gray-400">
                {(activeTab === 'reply' ? replyText : noteText).length}/1000
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}