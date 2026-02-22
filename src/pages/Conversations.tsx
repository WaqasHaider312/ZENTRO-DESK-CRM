import { useState } from 'react'
import { ConversationsProvider } from '@/contexts/ConversationsContext'
import TicketSidebar from '@/components/conversations/TicketSidebar'
import ConversationList from '@/components/conversations/ConversationList'
import ChatPanel from '@/components/conversations/ChatPanel'
import ContactInfoPanel from '@/components/conversations/ContactInfoPanel'

function ConversationsLayout() {
  const [showInfo, setShowInfo] = useState(true)

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