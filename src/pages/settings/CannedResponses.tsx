import { MessageSquare, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function CannedResponses() {
  return (
    <div className="flex-1 flex flex-col">
      <div className="h-14 border-b border-border flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-4 h-4 text-muted-foreground" />
          <span className="font-semibold">Canned Responses</span>
        </div>
        <Button size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          New Response
        </Button>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <MessageSquare className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No canned responses yet</p>
          <p className="text-sm text-muted-foreground mt-1">Create reusable reply templates to save time</p>
          <Button size="sm" className="mt-4 gap-2">
            <Plus className="w-4 h-4" />
            Create First Response
          </Button>
        </div>
      </div>
    </div>
  )
}
