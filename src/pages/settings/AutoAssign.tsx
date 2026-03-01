import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
    Plus, Trash2, Loader2, GripVertical, Zap, ChevronDown,
    ChevronUp, X, Edit2, ToggleLeft, ToggleRight, Save
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────

type ConditionField = 'channel' | 'keyword' | 'inbox_id'
type ConditionOperator = 'equals' | 'contains'

interface Condition {
    field: ConditionField
    operator: ConditionOperator
    value: string
}

interface AutoAssignRule {
    id: string
    organization_id: string
    name: string
    is_active: boolean
    priority: number
    condition_match: 'any' | 'all'
    conditions: Condition[]
    assign_to_agent_id: string | null
    created_at: string
    updated_at: string
    // joined
    agent?: { id: string; full_name: string }
}

interface Agent {
    id: string
    full_name: string
}

interface Inbox {
    id: string
    name: string
    channel_type: string
}

const CHANNELS = [
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'facebook', label: 'Facebook' },
    { value: 'instagram', label: 'Instagram' },
    { value: 'widget', label: 'Web Widget' },
    { value: 'email', label: 'Email' },
]

const FIELD_LABELS: Record<ConditionField, string> = {
    channel: 'Channel',
    keyword: 'Keyword',
    inbox_id: 'Inbox',
}

const emptyCondition = (): Condition => ({ field: 'channel', operator: 'equals', value: '' })
const emptyRule = (): Omit<AutoAssignRule, 'id' | 'organization_id' | 'created_at' | 'updated_at'> => ({
    name: '',
    is_active: true,
    priority: 0,
    condition_match: 'any',
    conditions: [emptyCondition()],
    assign_to_agent_id: null,
})

// ── Condition Row ─────────────────────────────────────────────────────

function ConditionRow({
    condition,
    inboxes,
    onChange,
    onRemove,
    canRemove,
}: {
    condition: Condition
    inboxes: Inbox[]
    onChange: (c: Condition) => void
    onRemove: () => void
    canRemove: boolean
}) {
    return (
        <div className="flex items-center gap-2 flex-wrap">
            {/* Field */}
            <select
                value={condition.field}
                onChange={e => {
                    const field = e.target.value as ConditionField
                    const operator: ConditionOperator = field === 'keyword' ? 'contains' : 'equals'
                    onChange({ field, operator, value: '' })
                }}
                className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-primary"
            >
                <option value="channel">Channel</option>
                <option value="keyword">Keyword</option>
                <option value="inbox_id">Inbox</option>
            </select>

            {/* Operator (read-only display) */}
            <span className="text-xs text-gray-500 font-medium px-1">
                {condition.field === 'keyword' ? 'contains' : 'equals'}
            </span>

            {/* Value */}
            {condition.field === 'channel' && (
                <select
                    value={condition.value}
                    onChange={e => onChange({ ...condition, value: e.target.value })}
                    className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-primary"
                >
                    <option value="">Select channel…</option>
                    {CHANNELS.map(ch => (
                        <option key={ch.value} value={ch.value}>{ch.label}</option>
                    ))}
                </select>
            )}

            {condition.field === 'keyword' && (
                <input
                    type="text"
                    placeholder="e.g. refund, return, urgent"
                    value={condition.value}
                    onChange={e => onChange({ ...condition, value: e.target.value })}
                    className="flex-1 min-w-[180px] text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-primary"
                />
            )}

            {condition.field === 'inbox_id' && (
                <select
                    value={condition.value}
                    onChange={e => onChange({ ...condition, value: e.target.value })}
                    className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-primary"
                >
                    <option value="">Select inbox…</option>
                    {inboxes.map(inbox => (
                        <option key={inbox.id} value={inbox.id}>{inbox.name}</option>
                    ))}
                </select>
            )}

            {canRemove && (
                <button
                    onClick={onRemove}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                >
                    <X className="w-4 h-4" />
                </button>
            )}
        </div>
    )
}

// ── Rule Form (modal) ─────────────────────────────────────────────────

function RuleModal({
    initial,
    agents,
    inboxes,
    onSave,
    onClose,
}: {
    initial: Partial<AutoAssignRule>
    agents: Agent[]
    inboxes: Inbox[]
    onSave: (data: any) => Promise<void>
    onClose: () => void
}) {
    const [form, setForm] = useState({
        name: initial.name || '',
        is_active: initial.is_active ?? true,
        priority: initial.priority ?? 0,
        condition_match: initial.condition_match || 'any',
        conditions: (initial.conditions && initial.conditions.length > 0)
            ? initial.conditions
            : [emptyCondition()],
        assign_to_agent_id: initial.assign_to_agent_id || '',
    })
    const [saving, setSaving] = useState(false)

    const updateCondition = (i: number, c: Condition) => {
        setForm(f => ({ ...f, conditions: f.conditions.map((x, idx) => idx === i ? c : x) }))
    }
    const removeCondition = (i: number) => {
        setForm(f => ({ ...f, conditions: f.conditions.filter((_, idx) => idx !== i) }))
    }
    const addCondition = () => {
        setForm(f => ({ ...f, conditions: [...f.conditions, emptyCondition()] }))
    }

    const handleSave = async () => {
        if (!form.name.trim()) { toast.error('Rule name is required'); return }
        if (!form.assign_to_agent_id) { toast.error('Please select an agent to assign to'); return }
        const invalid = form.conditions.some(c => !c.value.trim())
        if (invalid) { toast.error('All conditions need a value'); return }

        setSaving(true)
        try {
            await onSave({
                ...form,
                priority: Number(form.priority) || 0,
                assign_to_agent_id: form.assign_to_agent_id || null,
            })
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-5 border-b border-gray-200">
                    <h2 className="font-bold text-gray-900 text-base">
                        {initial.id ? 'Edit Rule' : 'New Auto-Assign Rule'}
                    </h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-5 space-y-5">
                    {/* Name */}
                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1.5">Rule Name</label>
                        <input
                            type="text"
                            value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="e.g. WhatsApp → Sales Team"
                            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-primary"
                        />
                    </div>

                    {/* Priority + Active */}
                    <div className="flex items-center gap-4">
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-600 mb-1.5">
                                Priority
                                <span className="text-gray-400 font-normal ml-1">(lower runs first)</span>
                            </label>
                            <input
                                type="number"
                                value={form.priority}
                                onChange={e => setForm(f => ({ ...f, priority: parseInt(e.target.value) || 0 }))}
                                min={0}
                                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-primary"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1.5">Active</label>
                            <button
                                onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                                className={cn(
                                    'flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-semibold transition-all',
                                    form.is_active
                                        ? 'border-green-500 text-green-600 bg-green-50'
                                        : 'border-gray-300 text-gray-400 bg-gray-50'
                                )}
                            >
                                {form.is_active
                                    ? <><ToggleRight className="w-4 h-4" /> On</>
                                    : <><ToggleLeft className="w-4 h-4" /> Off</>
                                }
                            </button>
                        </div>
                    </div>

                    {/* Conditions */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-bold text-gray-600">Conditions</label>
                            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                                {(['any', 'all'] as const).map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setForm(f => ({ ...f, condition_match: m }))}
                                        className={cn(
                                            'px-3 py-1 text-xs font-semibold rounded-md transition-all',
                                            form.condition_match === m
                                                ? 'bg-white text-primary shadow-sm'
                                                : 'text-gray-500 hover:text-gray-700'
                                        )}
                                    >
                                        Match {m.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2.5 mb-3">
                            {form.conditions.map((c, i) => (
                                <ConditionRow
                                    key={i}
                                    condition={c}
                                    inboxes={inboxes}
                                    onChange={updated => updateCondition(i, updated)}
                                    onRemove={() => removeCondition(i)}
                                    canRemove={form.conditions.length > 1}
                                />
                            ))}
                        </div>

                        {form.conditions.length < 5 && (
                            <button
                                onClick={addCondition}
                                className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                Add condition
                            </button>
                        )}
                    </div>

                    {/* Assign to */}
                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1.5">Assign To Agent</label>
                        <select
                            value={form.assign_to_agent_id}
                            onChange={e => setForm(f => ({ ...f, assign_to_agent_id: e.target.value }))}
                            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-primary"
                        >
                            <option value="">Select agent…</option>
                            {agents.map(a => (
                                <option key={a.id} value={a.id}>{a.full_name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave} disabled={saving} className="gap-2">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {initial.id ? 'Save Changes' : 'Create Rule'}
                    </Button>
                </div>
            </div>
        </div>
    )
}

// ── Rule Card ─────────────────────────────────────────────────────────

function RuleCard({
    rule,
    inboxes,
    onEdit,
    onDelete,
    onToggle,
}: {
    rule: AutoAssignRule
    inboxes: Inbox[]
    onEdit: () => void
    onDelete: () => void
    onToggle: () => void
}) {
    const getConditionLabel = (c: Condition) => {
        if (c.field === 'channel') {
            const ch = CHANNELS.find(x => x.value === c.value)
            return `Channel = ${ch?.label || c.value}`
        }
        if (c.field === 'keyword') return `Message contains "${c.value}"`
        if (c.field === 'inbox_id') {
            const inbox = inboxes.find(x => x.id === c.value)
            return `Inbox = ${inbox?.name || c.value}`
        }
        return `${c.field} ${c.operator} ${c.value}`
    }

    return (
        <div className={cn(
            'bg-white border rounded-xl p-4 transition-all',
            rule.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'
        )}>
            <div className="flex items-start gap-3">
                <GripVertical className="w-4 h-4 text-gray-300 mt-0.5 flex-shrink-0" />

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="font-bold text-gray-900 text-sm">{rule.name}</span>
                        <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                            Priority {rule.priority}
                        </span>
                        <span className={cn(
                            'text-[10px] font-bold px-2 py-0.5 rounded-full',
                            rule.is_active
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-500'
                        )}>
                            {rule.is_active ? 'Active' : 'Inactive'}
                        </span>
                    </div>

                    {/* Conditions summary */}
                    <div className="flex flex-wrap gap-1.5 mb-2">
                        {rule.conditions.map((c, i) => (
                            <span key={i} className="text-[11px] bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-md font-medium">
                                {getConditionLabel(c)}
                            </span>
                        ))}
                        {rule.conditions.length > 1 && (
                            <span className="text-[10px] text-gray-400 self-center font-bold">
                                (match {rule.condition_match.toUpperCase()})
                            </span>
                        )}
                    </div>

                    {/* Assign to */}
                    <div className="flex items-center gap-1.5">
                        <Zap className="w-3 h-3 text-primary flex-shrink-0" />
                        <span className="text-xs text-gray-600">
                            Assign to{' '}
                            <span className="font-semibold text-gray-900">
                                {(rule as any).agent?.full_name || 'Unknown Agent'}
                            </span>
                        </span>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                        onClick={onToggle}
                        title={rule.is_active ? 'Deactivate' : 'Activate'}
                        className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                    >
                        {rule.is_active ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4" />}
                    </button>
                    <button
                        onClick={onEdit}
                        className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                    >
                        <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={onDelete}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Main Page ─────────────────────────────────────────────────────────

export default function AutoAssign() {
    const { organization } = useAuth()
    const [rules, setRules] = useState<AutoAssignRule[]>([])
    const [agents, setAgents] = useState<Agent[]>([])
    const [inboxes, setInboxes] = useState<Inbox[]>([])
    const [loading, setLoading] = useState(true)
    const [modal, setModal] = useState<'new' | AutoAssignRule | null>(null)

    useEffect(() => {
        if (!organization) return
        Promise.all([fetchRules(), fetchAgents(), fetchInboxes()])
    }, [organization?.id])

    const fetchRules = async () => {
        if (!organization) return
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('auto_assign_rules')
                .select('*, agent:agent_profiles!assign_to_agent_id(id, full_name)')
                .eq('organization_id', organization.id)
                .order('priority', { ascending: true })
            if (error) throw error
            setRules(data || [])
        } catch (err: any) {
            toast.error(err.message || 'Failed to load rules')
        } finally {
            setLoading(false)
        }
    }

    const fetchAgents = async () => {
        if (!organization) return
        const { data } = await supabase
            .from('agent_profiles')
            .select('id, full_name')
            .eq('organization_id', organization.id)
            .eq('is_active', true)
            .order('full_name')
        setAgents(data || [])
    }

    const fetchInboxes = async () => {
        if (!organization) return
        const { data } = await supabase
            .from('inboxes')
            .select('id, name, channel_type')
            .eq('organization_id', organization.id)
            .eq('is_active', true)
            .order('name')
        setInboxes(data || [])
    }

    const handleSave = async (form: any) => {
        if (!organization) return
        const isEdit = typeof modal === 'object' && modal !== null && 'id' in modal

        try {
            if (isEdit) {
                const { error } = await supabase
                    .from('auto_assign_rules')
                    .update({ ...form, updated_at: new Date().toISOString() })
                    .eq('id', (modal as AutoAssignRule).id)
                if (error) throw error
                toast.success('Rule updated')
            } else {
                const { error } = await supabase
                    .from('auto_assign_rules')
                    .insert({ ...form, organization_id: organization.id })
                if (error) throw error
                toast.success('Rule created')
            }
            setModal(null)
            fetchRules()
        } catch (err: any) {
            toast.error(err.message || 'Failed to save rule')
        }
    }

    const handleDelete = async (rule: AutoAssignRule) => {
        if (!confirm(`Delete rule "${rule.name}"?`)) return
        try {
            const { error } = await supabase
                .from('auto_assign_rules')
                .delete()
                .eq('id', rule.id)
            if (error) throw error
            toast.success('Rule deleted')
            setRules(prev => prev.filter(r => r.id !== rule.id))
        } catch (err: any) {
            toast.error(err.message || 'Failed to delete rule')
        }
    }

    const handleToggle = async (rule: AutoAssignRule) => {
        try {
            const { error } = await supabase
                .from('auto_assign_rules')
                .update({ is_active: !rule.is_active, updated_at: new Date().toISOString() })
                .eq('id', rule.id)
            if (error) throw error
            setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active } : r))
            toast.success(rule.is_active ? 'Rule deactivated' : 'Rule activated')
        } catch (err: any) {
            toast.error(err.message || 'Failed to update rule')
        }
    }

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
                <div>
                    <h1 className="text-lg font-bold text-gray-900">Auto-Assign Rules</h1>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Automatically assign new conversations to agents based on conditions
                    </p>
                </div>
                <Button onClick={() => setModal('new')} className="gap-2">
                    <Plus className="w-4 h-4" />
                    New Rule
                </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                {loading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                ) : rules.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
                            <Zap className="w-7 h-7 text-primary" />
                        </div>
                        <h3 className="font-bold text-gray-900 text-base mb-1">No auto-assign rules yet</h3>
                        <p className="text-sm text-gray-500 max-w-sm mb-6">
                            Rules run when a new conversation is created. The first matching rule wins and the conversation is automatically assigned to the specified agent.
                        </p>
                        <Button onClick={() => setModal('new')} className="gap-2">
                            <Plus className="w-4 h-4" />
                            Create First Rule
                        </Button>
                    </div>
                ) : (
                    <div className="max-w-2xl space-y-3">
                        <p className="text-xs text-gray-400 mb-4">
                            Rules run in priority order (lowest first). First match wins. Only applies to brand-new conversations.
                        </p>
                        {rules.map(rule => (
                            <RuleCard
                                key={rule.id}
                                rule={rule}
                                inboxes={inboxes}
                                onEdit={() => setModal(rule)}
                                onDelete={() => handleDelete(rule)}
                                onToggle={() => handleToggle(rule)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Modal */}
            {modal !== null && (
                <RuleModal
                    initial={modal === 'new' ? emptyRule() : modal}
                    agents={agents}
                    inboxes={inboxes}
                    onSave={handleSave}
                    onClose={() => setModal(null)}
                />
            )}
        </div>
    )
}