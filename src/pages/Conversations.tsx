import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { ConversationsProvider } from '@/contexts/ConversationsContext'
import { useConversations } from '@/contexts/ConversationsContext'
import TicketSidebar from '@/components/conversations/TicketSidebar'
import ConversationList from '@/components/conversations/ConversationList'
import ChatPanel from '@/components/conversations/ChatPanel'
import ContactInfoPanel from '@/components/conversations/ContactInfoPanel'

function ConversationsLayout() {
  const [showInfo, setShowInfo] = useState(true)
  const { conversationId } = useParams<{ conversationId?: string }>()
  const { setSelectedId } = useConversations()

  // Auto-select conversation when navigated to via URL (e.g. from Contacts page)
  useEffect(() => {
    if (conversationId) {
      setSelectedId(conversationId)
    }
  }, [conversationId])

  return (
    <div className="flex h-full overflow-hidden">
      {/* 1. Collapsible sidebar */}
      <TicketSidebar />

      {/* 2. Ticket list */}
      <ConversationList />

      {/* 3. Chat panel */}
      <ChatPanel
        onToggleInfo={() => setShowInfo(prev => !prev)}
        showInfo={showInfo}
      />

      {/* 4. Info panel */}
      {showInfo && (
        <ContactInfoPanel onClose={() => setShowInfo(false)} />
      )}
    </div>
  )
}

export default function Conversations() {
  return (
    <ConversationsProvider>
      <ConversationsLayout />
    </ConversationsProvider>
  )
}