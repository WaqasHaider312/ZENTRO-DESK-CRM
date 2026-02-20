import { useConversations } from '@/contexts/ConversationsContext'
import { cn, getInitials, formatTimeAgo } from '@/lib/utils'
import { Phone, Mail, MapPin, Building, Tag, Clock, MessageSquare, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

interface ContactInfoPanelProps {
  onClose: () => void
}

export default function ContactInfoPanel({ onClose }: ContactInfoPanelProps) {
  const { selectedId, conversations } = useConversations()
  const conversation = conversations.find(c => c.id === selectedId)
  const contact = conversation?.contact

  if (!conversation || !contact) return null

  const contactName = contact.name || contact.phone || contact.email || 'Unknown'

  // Previous conversations with same contact
  const previousConvs = conversations
    .filter(c => c.contact_id === contact.id && c.id !== selectedId)
    .slice(0, 5)

  return (
    <div className="w-72 border-l border-border flex flex-col h-full bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border flex-shrink-0">
        <span className="font-medium text-sm">Contact Info</span>
        <button onClick={onClose} className="p-1 hover:bg-accent rounded-md transition-colors">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Contact card */}
        <div className="p-4 text-center border-b border-border">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary text-lg font-semibold mx-auto mb-3">
            {getInitials(contactName)}
          </div>
          <p className="font-semibold text-sm">{contactName}</p>
          {contact.company && (
            <p className="text-xs text-muted-foreground mt-0.5">{contact.company}</p>
          )}
          <Badge variant="outline" className="mt-2 text-xs capitalize">
            {conversation.inbox?.channel_type}
          </Badge>
        </div>

        {/* Contact details */}
        <div className="p-4 border-b border-border space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Details</p>

          {contact.email && (
            <div className="flex items-center gap-2.5 text-sm">
              <Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-foreground truncate">{contact.email}</span>
            </div>
          )}
          {contact.phone && (
            <div className="flex items-center gap-2.5 text-sm">
              <Phone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-foreground">{contact.phone}</span>
            </div>
          )}
          {contact.location && (
            <div className="flex items-center gap-2.5 text-sm">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-foreground">{contact.location}</span>
            </div>
          )}
          {contact.company && (
            <div className="flex items-center gap-2.5 text-sm">
              <Building className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-foreground">{contact.company}</span>
            </div>
          )}
          {!contact.email && !contact.phone && !contact.location && !contact.company && (
            <p className="text-xs text-muted-foreground">No details available</p>
          )}
        </div>

        {/* Conversation details */}
        <div className="p-4 border-b border-border space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Conversation</p>

          <div className="flex items-center gap-2.5 text-sm">
            <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-foreground">Started {formatTimeAgo(conversation.created_at)}</span>
          </div>

          <div className="flex items-center gap-2.5 text-sm">
            <div className={cn(
              'w-2 h-2 rounded-full flex-shrink-0',
              conversation.status === 'open' ? 'bg-green-500' :
              conversation.status === 'pending' ? 'bg-amber-500' : 'bg-muted-foreground'
            )} />
            <span className="text-foreground capitalize">{conversation.status}</span>
          </div>

          {conversation.assigned_agent && (
            <div className="flex items-center gap-2.5 text-sm">
              <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-semibold text-primary flex-shrink-0">
                {getInitials((conversation.assigned_agent as any).full_name || '')}
              </div>
              <span className="text-foreground truncate">{(conversation.assigned_agent as any).full_name}</span>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="p-4 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Notes</p>
          {contact.notes ? (
            <p className="text-xs text-foreground">{contact.notes}</p>
          ) : (
            <p className="text-xs text-muted-foreground">No notes added</p>
          )}
        </div>

        {/* Previous conversations */}
        {previousConvs.length > 0 && (
          <div className="p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Previous Conversations ({previousConvs.length})
            </p>
            <div className="space-y-2">
              {previousConvs.map(c => (
                <div key={c.id} className="flex items-start gap-2 p-2 rounded-lg bg-muted/50 text-xs">
                  <MessageSquare className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-foreground truncate">{c.latest_message || 'No messages'}</p>
                    <p className="text-muted-foreground mt-0.5">{formatTimeAgo(c.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
