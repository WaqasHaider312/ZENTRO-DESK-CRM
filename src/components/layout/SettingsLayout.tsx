import { Outlet, NavLink, useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { cn, getInitials } from '@/lib/utils'
import {
    Settings, Inbox, Users, MessageSquare, Tag, Sparkles,
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
                'bg-white border-r border-gray-200 flex flex-col h-full transition-all duration-300 flex-shrink-0',
                collapsed ? 'w-16' : 'w-60'
            )}>
                {/* Logo */}
                <div className="p-4 border-b border-gray-200">
                    {collapsed ? (
                        <div className="flex flex-col items-center gap-2">
                            <button onClick={() => setCollapsed(false)} className="p-1 hover:bg-primary rounded transition-colors group mb-1">
                                <ChevronRight className="h-5 w-5 text-gray-600 group-hover:text-white" />
                            </button>
                            <Headphones className="h-8 w-8 text-primary" />
                        </div>
                    ) : (
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                                <Headphones className="h-7 w-7 text-primary flex-shrink-0" />
                                <span className="text-sm font-bold text-foreground truncate">{organization?.name || 'Zentro Desk'}</span>
                            </div>
                            <button onClick={() => setCollapsed(true)} className="p-1 hover:bg-primary rounded transition-colors group flex-shrink-0 ml-2">
                                <ChevronLeft className="h-5 w-5 text-gray-600 group-hover:text-white" />
                            </button>
                        </div>
                    )}
                </div>

                {/* Back to tickets */}
                <div className="py-3 px-2 border-b border-gray-200">
                    <button
                        onClick={() => navigate(`/app/${orgSlug}/conversations`)}
                        title={collapsed ? 'Back to Tickets' : ''}
                        className={cn(
                            'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-primary font-medium hover:bg-primary/10 transition-colors',
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
                        <p className="text-xs uppercase text-gray-400 px-3 mb-2 font-semibold tracking-wider">Settings</p>
                    )}
                    <div className="space-y-1">
                        {SETTINGS_NAV.map(item => {
                            const Icon = item.icon
                            return (
                                <NavLink
                                    key={item.path}
                                    to={`${base}/${item.path}`}
                                    title={collapsed ? item.label : ''}
                                    className={({ isActive }) => cn(
                                        'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                                        isActive
                                            ? 'bg-primary/10 text-primary font-semibold'
                                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                                        collapsed && 'justify-center'
                                    )}
                                >
                                    <Icon className="h-4 w-4 flex-shrink-0" />
                                    {!collapsed && <span>{item.label}</span>}
                                </NavLink>
                            )
                        })}
                    </div>
                </div>

                {/* Profile */}
                <div className="mt-auto p-4 border-t border-gray-200">
                    {collapsed ? (
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center text-sm font-semibold">
                                {profile?.full_name ? getInitials(profile.full_name) : 'AG'}
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => signOut()} className="p-2 text-red-500 hover:bg-red-50" title="Logout">
                                <LogOut className="h-4 w-4" />
                            </Button>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
                                    {profile?.full_name ? getInitials(profile.full_name) : 'AG'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 truncate">{profile?.full_name}</p>
                                    <p className="text-xs text-gray-400 truncate">{profile?.email}</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => signOut()} className="w-full text-red-500 hover:bg-red-50 hover:text-red-600">
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