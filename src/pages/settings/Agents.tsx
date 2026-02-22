import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { getInitials } from '@/lib/utils'
import { Users, Plus, Loader2, Trash2, X, Mail, Shield, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { AgentProfile, MemberRole } from '@/types'

const ROLE_COLORS: Record<MemberRole, string> = {
  owner: 'bg-purple-100 text-purple-700',
  admin: 'bg-blue-100 text-blue-700',
  agent: 'bg-gray-100 text-gray-600',
}

export default function Agents() {
  const { profile, organization } = useAuth()
  const [agents, setAgents] = useState<AgentProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<MemberRole>('agent')
  const [inviting, setInviting] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  useEffect(() => { fetchAgents() }, [organization?.id])

  const fetchAgents = async () => {
    if (!organization) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('agent_profiles')
        .select('*')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      setAgents(data || [])
    } catch {
      toast.error('Failed to load agents')
    } finally {
      setLoading(false)
    }
  }

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !organization) return
    setInviting(true)
    try {
      // Check if already exists
      const { data: existing } = await supabase
        .from('agent_profiles')
        .select('id')
        .eq('organization_id', organization.id)
        .eq('email', inviteEmail.trim().toLowerCase())
        .single()

      if (existing) {
        toast.error('This email is already an agent in your organization')
        return
      }

      // Create invitation record
      const token = crypto.randomUUID()
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

      const { error } = await supabase.from('invitations').insert({
        organization_id: organization.id,
        invited_by: profile?.id,
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        token,
        accepted: false,
        expires_at: expires,
      })

      if (error) throw error

      toast.success(`Invitation sent to ${inviteEmail}`)
      setInviteEmail('')
      setInviteRole('agent')
      setShowInvite(false)
    } catch (err: any) {
      toast.error(err.message || 'Failed to send invitation')
    } finally {
      setInviting(false)
    }
  }

  const handleRemove = async (agentId: string) => {
    if (agentId === profile?.id) {
      toast.error("You can't remove yourself")
      return
    }
    const agent = agents.find(a => a.id === agentId)
    if (agent?.role === 'owner') {
      toast.error("Can't remove the owner")
      return
    }
    if (!confirm(`Remove ${agent?.full_name}? They will lose access immediately.`)) return

    setRemoving(agentId)
    try {
      const { error } = await supabase
        .from('agent_profiles')
        .update({ is_active: false })
        .eq('id', agentId)
      if (error) throw error
      setAgents(prev => prev.filter(a => a.id !== agentId))
      toast.success('Agent removed')
    } catch {
      toast.error('Failed to remove agent')
    } finally {
      setRemoving(null)
    }
  }

  const handleRoleChange = async (agentId: string, role: MemberRole) => {
    try {
      const { error } = await supabase
        .from('agent_profiles')
        .update({ role })
        .eq('id', agentId)
      if (error) throw error
      setAgents(prev => prev.map(a => a.id === agentId ? { ...a, role } : a))
      toast.success('Role updated')
    } catch {
      toast.error('Failed to update role')
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-8 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-gray-400" />
          <div>
            <h1 className="font-bold text-gray-900">Agents</h1>
            <p className="text-xs text-gray-500">{agents.length} member{agents.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <Button onClick={() => setShowInvite(true)} className="gap-2 bg-primary hover:bg-primary/90">
          <Plus className="w-4 h-4" />
          Invite Agent
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl space-y-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            agents.map(agent => (
              <div key={agent.id} className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {getInitials(agent.full_name)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 text-sm">{agent.full_name}</p>
                    {agent.id === profile?.id && (
                      <span className="text-xs text-gray-400">(you)</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">{agent.email}</p>
                </div>

                {/* Role selector */}
                <select
                  value={agent.role}
                  onChange={e => handleRoleChange(agent.id, e.target.value as MemberRole)}
                  disabled={agent.role === 'owner' || agent.id === profile?.id}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border-0 outline-none cursor-pointer ${ROLE_COLORS[agent.role]}`}
                >
                  <option value="agent">Agent</option>
                  <option value="admin">Admin</option>
                  {agent.role === 'owner' && <option value="owner">Owner</option>}
                </select>

                {/* Online status */}
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${agent.availability === 'online' ? 'bg-green-500' :
                    agent.availability === 'busy' ? 'bg-amber-500' : 'bg-gray-300'
                    }`} />
                  <span className="text-xs text-gray-400 capitalize">{agent.availability}</span>
                </div>

                {/* Remove */}
                {agent.id !== profile?.id && agent.role !== 'owner' && (
                  <button
                    onClick={() => handleRemove(agent.id)}
                    disabled={removing === agent.id}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    {removing === agent.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Trash2 className="w-4 h-4" />
                    }
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h3 className="font-bold text-gray-900">Invite Agent</h3>
                <p className="text-sm text-gray-500 mt-0.5">They'll receive an email to join your workspace</p>
              </div>
              <button onClick={() => setShowInvite(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleInvite()}
                    placeholder="colleague@company.com"
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Role</label>
                <div className="grid grid-cols-2 gap-3">
                  {(['agent', 'admin'] as MemberRole[]).map(role => (
                    <button
                      key={role}
                      onClick={() => setInviteRole(role)}
                      className={`p-3 rounded-xl border-2 text-left transition-colors ${inviteRole === role
                        ? 'border-primary bg-primary/5'
                        : 'border-gray-200 hover:border-gray-300'
                        }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {role === 'agent' ? <User className="w-4 h-4 text-gray-500" /> : <Shield className="w-4 h-4 text-blue-500" />}
                        <span className="text-sm font-semibold capitalize">{role}</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {role === 'agent' ? 'Can reply to tickets' : 'Can manage settings & agents'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 pb-6 flex gap-3">
              <Button variant="outline" onClick={() => setShowInvite(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleInvite} disabled={!inviteEmail.trim() || inviting} className="flex-1 bg-primary hover:bg-primary/90">
                {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Invite'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}