import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useConversations, SidebarView } from '@/contexts/ConversationsContext'
import { cn, getInitials } from '@/lib/utils'
import {
    Inbox, UserX, Users, CheckCircle, Clock, LayoutList,
    LayoutDashboard, Settings, LogOut, ChevronLeft, ChevronRight, Headphones
} from 'lucide-react'
import { Button } from '@/components/ui/button'

const VIEWS = [
    { id: 'my_open' as SidebarView, label: 'My Open Tickets', icon: Inbox, countKey: 'my_open' },
    { id: 'unassigned' as SidebarView, label: 'Unassigned Tickets', icon: UserX, countKey: 'unassigned' },
    { id: 'all_assigned' as SidebarView, label: 'All Assigned', icon: Users, countKey: 'all_assigned' },
    { id: 'my_resolved_today' as SidebarView, label: 'My Resolved Today', icon: CheckCircle, countKey: 'my_resolved_today' },
    { id: 'all_resolved_today' as SidebarView, label: 'All Resolved Today', icon: CheckCircle, countKey: 'all_resolved_today' },
    { id: 'all_tickets' as SidebarView, label: 'All Tickets Ever', icon: Clock, countKey: 'all_tickets' },
]

const MENU = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/app' },
    { id: 'settings', label: 'Settings', icon: Settings, path: '/app/settings' },
]

export default function TicketSidebar() {
    const navigate = useNavigate()
    const { profile, signOut, organization } = useAuth()
    const { activeView, setActiveView, counts } = useConversations()
    const [collapsed, setCollapsed] = useState(false)

    return (
        <div className={cn(
            'bg-white border-r border-gray-200 flex flex-col h-full transition-all duration-300 flex-shrink-0',
            collapsed ? 'w-16' : 'w-60'
        )}>
            {/* Logo */}
            <div className="p-4 border-b border-gray-200">
                {collapsed ? (
                    <div className="flex flex-col items-center gap-2">
                        <button onClick={() => setCollapsed(false)} className="p-1 hover:bg-primary rounded transition-colors group mb-2">
                            <ChevronRight className="h-5 w-5 text-gray-600 group-hover:text-white" />
                        </button>
                        <Headphones className="h-8 w-8 text-primary" />
                    </div>
                ) : (
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Headphones className="h-8 w-8 text-primary flex-shrink-0" />
                            <span className="text-base font-bold text-foreground truncate">{organization?.name || 'Zentro Desk'}</span>
                        </div>
                        <button onClick={() => setCollapsed(true)} className="p-1 hover:bg-primary rounded transition-colors group flex-shrink-0">
                            <ChevronLeft className="h-5 w-5 text-gray-600 group-hover:text-white" />
                        </button>
                    </div>
                )}
            </div>

            {/* Views */}
            <div className="py-4 px-2 flex-1 overflow-hidden">
                {!collapsed && (
                    <h3 className="text-xs uppercase text-muted-foreground px-3 mb-2 font-medium">Views</h3>
                )}
                <div className="space-y-1">
                    {VIEWS.map(view => {
                        const Icon = view.icon
                        const count = counts[view.countKey as keyof typeof counts] as number
                        const isActive = activeView === view.id
                        return (
                            <button
                                key={view.id}
                                onClick={() => setActiveView(view.id)}
                                title={collapsed ? view.label : ''}
                                className={cn(
                                    'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors',
                                    isActive ? 'text-primary font-medium' : 'text-foreground hover:bg-gray-100',
                                    collapsed && 'justify-center'
                                )}
                            >
                                <div className={cn('flex items-center gap-2', collapsed && 'flex-col')}>
                                    <Icon className="h-4 w-4" />
                                    {!collapsed && <span>{view.label}</span>}
                                    {collapsed && (
                                        <span className="bg-gray-200 text-gray-700 text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                                            {count}
                                        </span>
                                    )}
                                </div>
                                {!collapsed && (
                                    <span className="bg-gray-200 text-gray-700 text-xs px-2 py-0.5 rounded-full">
                                        {count}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Menu */}
            <div className="py-4 px-2 border-t border-gray-200">
                {!collapsed && (
                    <h3 className="text-xs uppercase text-muted-foreground px-3 mb-2 font-medium">Menu</h3>
                )}
                <div className="space-y-1">
                    {MENU.map(item => {
                        const Icon = item.icon
                        return (
                            <button
                                key={item.id}
                                onClick={() => navigate(item.path)}
                                title={collapsed ? item.label : ''}
                                className={cn('w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-gray-100 transition-colors', collapsed && 'justify-center')}
                            >
                                <Icon className="h-4 w-4" />
                                {!collapsed && <span>{item.label}</span>}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Profile */}
            <div className="mt-auto p-4 border-t border-gray-200">
                {collapsed ? (
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center text-sm font-semibold">
                            {profile?.full_name ? getInitials(profile.full_name) : 'AG'}
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => signOut()} className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50" title="Logout">
                            <LogOut className="h-4 w-4" />
                        </Button>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
                                {profile?.full_name ? getInitials(profile.full_name) : 'AG'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{profile?.full_name || 'Agent'}</p>
                                <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
                            </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => signOut()} className="w-full text-red-600 hover:text-red-700 hover:bg-red-50">
                            <LogOut className="h-4 w-4 mr-2" />
                            Logout
                        </Button>
                    </>
                )}
            </div>
        </div>
    )
}