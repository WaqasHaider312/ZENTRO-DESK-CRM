import { Users, Plus, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { getInitials } from '@/lib/utils'

export default function Agents() {
  const { profile } = useAuth()

  return (
    <div className="flex-1 flex flex-col">
      <div className="h-14 border-b border-border flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="font-semibold">Agents</span>
        </div>
        <Button size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          Invite Agent
        </Button>
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-2xl space-y-3">
          {/* Current user (always shown) */}
          {profile && (
            <div className="flex items-center gap-4 p-4 border border-border rounded-lg">
              <Avatar className="w-9 h-9">
                <AvatarImage src={profile.avatar_url} />
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                  {getInitials(profile.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{profile.full_name}</p>
                  <span className="text-xs text-muted-foreground">(you)</span>
                </div>
                <p className="text-xs text-muted-foreground">{profile.email}</p>
              </div>
              <Badge variant="secondary" className="capitalize">{profile.role}</Badge>
            </div>
          )}

          {/* Invite placeholder */}
          <div className="flex items-center gap-4 p-4 border border-dashed border-border rounded-lg">
            <div className="w-9 h-9 bg-muted rounded-full flex items-center justify-center">
              <Mail className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Invite your team members to collaborate</p>
            </div>
            <Button variant="outline" size="sm">Invite</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
