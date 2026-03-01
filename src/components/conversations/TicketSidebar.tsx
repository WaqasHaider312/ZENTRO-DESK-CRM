import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useConversations, SidebarView } from '@/contexts/ConversationsContext'
import { cn, getInitials } from '@/lib/utils'
import {
    Inbox, UserX, Users, CheckCircle, Clock,
    LayoutDashboard, Settings, LogOut, ChevronLeft,
    Headphones, Sparkles
} from 'lucide-react'

const VIEWS = [
    { id: 'my_open' as SidebarView, label: 'My Open Tickets', icon: Inbox, countKey: 'my_open', ai: false },
    { id: 'unassigned' as SidebarView, label: 'Unassigned', icon: UserX, countKey: 'unassigned', ai: false },
    { id: 'ai_handling' as SidebarView, label: 'AI Handling', icon: Sparkles, countKey: 'ai_handling', ai: true },
    { id: 'all_assigned' as SidebarView, label: 'All Assigned', icon: Users, countKey: 'all_assigned', ai: false },
    { id: 'my_resolved_today' as SidebarView, label: 'My Resolved Today', icon: CheckCircle, countKey: 'my_resolved_today', ai: false },
    { id: 'all_resolved_today' as SidebarView, label: 'All Resolved Today', icon: CheckCircle, countKey: 'all_resolved_today', ai: false },
    { id: 'all_tickets' as SidebarView, label: 'All Tickets', icon: Clock, countKey: 'all_tickets', ai: false },
]

const TOOLS = [
    { id: 'reports', label: 'Reports', icon: LayoutDashboard, path: 'reports' },
    { id: 'contacts', label: 'Contacts', icon: Users, path: 'contacts' },
    { id: 'settings', label: 'Settings', icon: Settings, path: 'settings' },
]

export default function TicketSidebar() {
    const navigate = useNavigate()
    const { orgSlug } = useParams()
    const { profile, signOut, organization } = useAuth()
    const { activeView, setActiveView, counts } = useConversations()
    const [collapsed, setCollapsed] = useState(false)

    return (
        <div className={cn(
            'flex flex-col h-full transition-all duration-300 flex-shrink-0',
            'bg-[#111827] border-r border-[#1F2937]',
            collapsed ? 'w-16' : 'w-60'
        )}>

            {/* Logo */}
            <div className={cn(
                'flex items-center border-b border-[#1F2937] flex-shrink-0 h-14',
                collapsed ? 'justify-center px-3' : 'px-4 gap-3'
            )}>
                {collapsed ? (
                    <button onClick={() => setCollapsed(false)} className="w-8 h-8 rounded-lg bg-primary/10 hover:bg-primary/20 flex items-center justify-center transition-colors">
                        <Headphones className="h-4 w-4 text-primary" />
                    </button>
                ) : (
                    <>
                        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                            <Headphones className="h-4 w-4 text-primary" />
                        </div>
                        <span className="flex-1 text-sm font-bold text-white truncate">{organization?.name || 'Zentro Desk'}</span>
                        <button onClick={() => setCollapsed(true)} className="p-1.5 hover:bg-[#1F2937] rounded-lg transition-colors">
                            <ChevronLeft className="h-4 w-4 text-[#6B7280]" />
                        </button>
                    </>
                )}
            </div>

            {/* Views */}
            <div className="flex-1 overflow-y-auto py-3 px-2">
                {!collapsed && (
                    <p className="text-[10px] font-bold text-[#4B5563] uppercase tracking-widest px-3 mb-2">Inbox</p>
                )}
                <div className="space-y-0.5">
                    {VIEWS.map(view => {
                        const Icon = view.icon
                        const count = counts[view.countKey as keyof typeof counts] as number
                        const isActive = activeView === view.id
                        return (
                            <button
                                key={view.id}
                                onClick={() => setActiveView(view.id)}
                                title={collapsed ? view.label : undefined}
                                className={cn(
                                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all relative',
                                    collapsed && 'justify-center px-2',
                                    isActive
                                        ? 'bg-[#064E3B] text-emerald-300 font-semibold'
                                        : 'text-[#9CA3AF] hover:bg-[#1F2937] hover:text-white'
                                )}
                            >
                                <Icon className={cn(
                                    'flex-shrink-0',
                                    collapsed ? 'h-5 w-5' : 'h-4 w-4',
                                    isActive ? 'text-emerald-400' : view.ai ? 'text-violet-400' : 'text-[#6B7280]'
                                )} />
                                {!collapsed && (
                                    <>
                                        <span className="flex-1 text-left truncate">{view.label}</span>
                                        <span className={cn(
                                            'text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center tabular-nums',
                                            isActive ? 'bg-emerald-900/60 text-emerald-300'
                                                : view.ai && count > 0 ? 'bg-violet-900/40 text-violet-400'
                                                    : 'bg-[#1F2937] text-[#6B7280]'
                                        )}>
                                            {count}
                                        </span>
                                    </>
                                )}
                                {collapsed && count > 0 && (
                                    <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-primary text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                                        {count > 9 ? '9+' : count}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>

                <div className="h-px bg-[#1F2937] mx-2 my-3" />

                {!collapsed && (
                    <p className="text-[10px] font-bold text-[#4B5563] uppercase tracking-widest px-3 mb-2">Tools</p>
                )}
                <div className="space-y-0.5">
                    {TOOLS.map(item => {
                        const Icon = item.icon
                        return (
                            <button
                                key={item.id}
                                onClick={() => navigate(`/app/${orgSlug}/${item.path}`)}
                                title={collapsed ? item.label : undefined}
                                className={cn(
                                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-[#9CA3AF] hover:bg-[#1F2937] hover:text-white transition-all',
                                    collapsed && 'justify-center px-2'
                                )}
                            >
                                <Icon className={cn('text-[#6B7280] flex-shrink-0', collapsed ? 'h-5 w-5' : 'h-4 w-4')} />
                                {!collapsed && <span>{item.label}</span>}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Profile */}
            <div className={cn('border-t border-[#1F2937] flex-shrink-0', collapsed ? 'p-3 flex flex-col items-center gap-2' : 'p-4')}>
                {collapsed ? (
                    <>
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-white">
                            {profile?.full_name ? getInitials(profile.full_name) : 'AG'}
                        </div>
                        <button onClick={() => signOut()} title="Logout" className="p-1.5 text-[#6B7280] hover:text-red-400 hover:bg-[#1F2937] rounded-lg transition-colors">
                            <LogOut className="h-4 w-4" />
                        </button>
                    </>
                ) : (
                    <>
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                                {profile?.full_name ? getInitials(profile.full_name) : 'AG'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-white truncate">{profile?.full_name || 'Agent'}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                                    <p className="text-[11px] text-[#6B7280] truncate">{profile?.email}</p>
                                </div>
                            </div>
                        </div>
                        <button onClick={() => signOut()} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[#6B7280] hover:bg-[#1F2937] hover:text-red-400 transition-all">
                            <LogOut className="h-4 w-4 flex-shrink-0" />
                            <span>Logout</span>
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}