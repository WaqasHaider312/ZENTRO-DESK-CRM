import { Users } from 'lucide-react'

export default function Contacts() {
  return (
    <div className="flex-1 flex flex-col">
      <div className="h-14 border-b border-border flex items-center px-6 gap-3">
        <Users className="w-4 h-4 text-muted-foreground" />
        <span className="font-semibold">Contacts</span>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Users className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No contacts yet</p>
          <p className="text-sm text-muted-foreground mt-1">Contacts will appear here as conversations come in</p>
        </div>
      </div>
    </div>
  )
}
