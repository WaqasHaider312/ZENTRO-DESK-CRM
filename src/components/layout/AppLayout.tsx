import { Outlet, NavLink, useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { cn, getInitials, truncate } from '@/lib/utils'
import {
  MessageSquare, Users, BarChart2, Settings, LogOut,
  Inbox, ChevronDown, Bell, Search, Zap
} from 'lucide-react'
import { useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'

const NAV_ITEMS = [
  { label: 'Conversations', icon: MessageSquare, path: 'conversations' },
  { label: 'Contacts', icon: Users, path: 'contacts' },
  { label: 'Reports', icon: BarChart2, path: 'reports' },
]

const SETTINGS_ITEMS = [
  { label: 'General', path: 'settings/general' },
  { label: 'Inboxes', path: 'settings/inboxes' },
  { label: 'Agents', path: 'settings/agents' },
  { label: 'Canned Responses', path: 'settings/canned-responses' },
  { label: 'Labels', path: 'settings/labels' },
]

export default function AppLayout() {
  const { orgSlug } = useParams()
  const { profile, organization, signOut } = useAuth()
  const navigate = useNavigate()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const basePath = `/app/${orgSlug}`

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const isTrialActive = organization?.plan === 'trial'
  const trialDaysLeft = organization?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(organization.trial_ends_at).getTime() - Date.now()) / 86400000))
    : 0

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex flex-col border-r border-border bg-card">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 h-14 border-b border-border">
          <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-foreground">Zentro Desk</span>
        </div>

        {/* Trial banner */}
        {isTrialActive && (
          <div className="mx-3 mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs font-medium text-amber-800">
              Trial: {trialDaysLeft} days left
            </p>
            <p className="text-xs text-amber-600 mt-0.5">Upgrade to keep access</p>
          </div>
        )}

        {/* Org name */}
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
            {truncate(organization?.name || '', 22)}
          </p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={`${basePath}/${item.path}`}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )
              }
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </NavLink>
          ))}

          {/* Settings (collapsible) */}
          <div>
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Settings className="w-4 h-4 flex-shrink-0" />
              Settings
              <ChevronDown className={cn('w-3 h-3 ml-auto transition-transform', settingsOpen && 'rotate-180')} />
            </button>
            {settingsOpen && (
              <div className="mt-1 ml-7 space-y-1">
                {SETTINGS_ITEMS.map((item) => (
                  <NavLink
                    key={item.path}
                    to={`${basePath}/${item.path}`}
                    className={({ isActive }) =>
                      cn(
                        'block px-3 py-1.5 rounded-md text-sm transition-colors',
                        isActive
                          ? 'text-primary font-medium'
                          : 'text-muted-foreground hover:text-foreground'
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* Agent profile */}
        <div className="p-3 border-t border-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-accent transition-colors">
                <Avatar className="w-8 h-8">
                  <AvatarImage src={profile?.avatar_url} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                    {getInitials(profile?.full_name || 'A')}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {profile?.full_name}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">{profile?.role}</p>
                </div>
                <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => navigate(`${basePath}/settings/general`)}>
                <Settings className="w-4 h-4 mr-2" />
                Profile Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
