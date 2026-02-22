import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { ConversationsProvider } from '@/contexts/ConversationsContext'
import ConversationList from '@/components/conversations/ConversationList'
import ChatPanel from '@/components/conversations/ChatPanel'
import ContactInfoPanel from '@/components/conversations/ContactInfoPanel'

function ConversationsLayout() {
  const [showInfo, setShowInfo] = useState(false)

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Conversation list */}
      <div className="w-[440px] flex-shrink-0 border-r border-border flex flex-col">
        <ConversationList />
      </div>

      {/* Middle: Chat panel */}
      <ChatPanel
        onToggleInfo={() => setShowInfo(prev => !prev)}
        showInfo={showInfo}
      />

      {/* Right: Contact info (conditional) */}
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
