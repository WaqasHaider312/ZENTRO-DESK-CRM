import { Outlet, NavLink, useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { cn, getInitials } from '@/lib/utils'
import {
    Settings, Inbox, Users, MessageSquare, Tag, Sparkles, Zap,
    LogOut, ChevronLeft, ChevronRight, Headphones,
    ArrowLeft
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

const SETTINGS_NAV = [
    { label: 'General', path: 'general', icon: Settings },
    { label: 'Inboxes', path: 'inboxes', icon: Inbox },
    { label: 'Agents', path: 'agents', icon: Users },
    { label: 'Canned Responses', path: 'canned-responses', icon: MessageSquare },
    { label: 'Labels', path: 'labels', icon: Tag },
    { label: 'AI Assistant', path: 'ai', icon: Sparkles },
    { label: 'Auto-Assign', path: 'auto-assign', icon: Zap },
]

export default function SettingsLayout() {
    const { orgSlug } = useParams()
    const navigate = useNavigate()
    const { profile, organization, signOut } = useAuth()
    const [collapsed, setCollapsed] = useState(false)
    const base = `/app/${orgSlug}/settings`

    return (
        <div className="flex h-screen overflow-hidden bg-background">
            {/* Sidebar */}
            <div className={cn(
                'flex flex-col h-full transition-all duration-300 flex-shrink-0',
                'bg-[#111827] border-r border-[#1F2937]',
                collapsed ? 'w-16' : 'w-60'
            )}>
                {/* Logo */}
                <div className={cn('flex items-center border-b border-[#1F2937] flex-shrink-0 h-14', collapsed ? 'justify-center px-3' : 'px-4 gap-3')}>
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

                {/* Back to tickets */}
                <div className="py-3 px-2 border-b border-[#1F2937]">
                    <button
                        onClick={() => navigate(`/app/${orgSlug}/conversations`)}
                        title={collapsed ? 'Back to Tickets' : ''}
                        className={cn(
                            'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-emerald-400 font-medium hover:bg-[#1F2937] transition-colors',
                            collapsed && 'justify-center'
                        )}
                    >
                        <ArrowLeft className="h-4 w-4 flex-shrink-0" />
                        {!collapsed && <span>Back to Tickets</span>}
                    </button>
                </div>

                {/* Settings Nav */}
                <div className="py-4 px-2 flex-1 overflow-hidden">
                    {!collapsed && (
                        <p className="text-[10px] font-bold text-[#4B5563] uppercase tracking-widest px-3 mb-2">Settings</p>
                    )}
                    <div className="space-y-0.5">
                        {SETTINGS_NAV.map(item => {
                            const Icon = item.icon
                            return (
                                <NavLink
                                    key={item.path}
                                    to={`${base}/${item.path}`}
                                    title={collapsed ? item.label : ''}
                                    className={({ isActive }) => cn(
                                        'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all',
                                        isActive
                                            ? 'bg-[#064E3B] text-emerald-300 font-semibold'
                                            : 'text-[#9CA3AF] hover:bg-[#1F2937] hover:text-white',
                                        collapsed && 'justify-center px-2'
                                    )}
                                >
                                    <Icon className={cn('flex-shrink-0', collapsed ? 'h-5 w-5' : 'h-4 w-4')} />
                                    {!collapsed && <span>{item.label}</span>}
                                </NavLink>
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
                            <Button variant="ghost" size="sm" onClick={() => signOut()} className="p-1.5 text-[#6B7280] hover:text-red-400 hover:bg-[#1F2937]" title="Logout">
                                <LogOut className="h-4 w-4" />
                            </Button>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-sm font-semibold text-white flex-shrink-0">
                                    {profile?.full_name ? getInitials(profile.full_name) : 'AG'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-white truncate">{profile?.full_name}</p>
                                    <p className="text-xs text-[#6B7280] truncate">{profile?.email}</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => signOut()} className="w-full text-[#6B7280] hover:bg-[#1F2937] hover:text-red-400">
                                <LogOut className="h-4 w-4 mr-2" />
                                Logout
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Content */}
            <main className="flex-1 flex flex-col overflow-hidden bg-gray-50">
                <Outlet />
            </main>
        </div>
    )
}