import { BarChart2 } from 'lucide-react'

export default function Reports() {
  return (
    <div className="flex-1 flex flex-col">
      <div className="h-14 border-b border-border flex items-center px-6 gap-3">
        <BarChart2 className="w-4 h-4 text-muted-foreground" />
        <span className="font-semibold">Reports</span>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <BarChart2 className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">Reports coming soon</p>
          <p className="text-sm text-muted-foreground mt-1">Analytics and performance metrics will appear here</p>
        </div>
      </div>
    </div>
  )
}
