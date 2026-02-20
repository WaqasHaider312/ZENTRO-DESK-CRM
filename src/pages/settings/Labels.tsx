import { Tag, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function Labels() {
  return (
    <div className="flex-1 flex flex-col">
      <div className="h-14 border-b border-border flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <Tag className="w-4 h-4 text-muted-foreground" />
          <span className="font-semibold">Labels</span>
        </div>
        <Button size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          New Label
        </Button>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Tag className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">Manage labels</p>
          <p className="text-sm text-muted-foreground mt-1">Labels help organize and categorize conversations</p>
        </div>
      </div>
    </div>
  )
}
