import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { KnowledgeBaseSource, Inbox, AiProtocol, AiProtocolParam, AiProtocolStep } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
    Sparkles, Upload, Trash2, Loader2, CheckCircle, AlertCircle,
    FileText, ToggleLeft, ToggleRight, Bot, Info, Send, MessageSquare,
    Plus, ChevronDown, ChevronUp, Zap, Globe, Hash, X, GripVertical,
    Settings2, Clock
} from 'lucide-react'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const MAX_DOCS = 5

type Tab = 'knowledge' | 'prompt' | 'protocols' | 'test'

// ── Main Component ────────────────────────────────────────────────────
export default function AISettings() {
    const { organization } = useAuth()
    const [activeTab, setActiveTab] = useState<Tab>('knowledge')
    const [loading, setLoading] = useState(true)

    // Knowledge base
    const [sources, setSources] = useState<KnowledgeBaseSource[]>([])
    const [processing, setProcessing] = useState<Record<string, boolean>>({})
    const [uploadingDoc, setUploadingDoc] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Inboxes
    const [inboxes, setInboxes] = useState<Inbox[]>([])
    const [togglingInbox, setTogglingInbox] = useState<string | null>(null)

    // Prompt
    const [aiPrompt, setAiPrompt] = useState('')
    const [savingPrompt, setSavingPrompt] = useState(false)
    const [promptDirty, setPromptDirty] = useState(false)

    // Protocols
    const [protocols, setProtocols] = useState<AiProtocol[]>([])
    const [editingProtocol, setEditingProtocol] = useState<AiProtocol | null>(null)
    const [showProtocolModal, setShowProtocolModal] = useState(false)

    // Test AI
    const [testQuestion, setTestQuestion] = useState('')
    const [testHistory, setTestHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
    const [testResult, setTestResult] = useState<any>(null)
    const [testLoading, setTestLoading] = useState(false)

    useEffect(() => {
        if (!organization) return
        fetchData()
        const channel = supabase
            .channel(`kbs-${organization.id}`)
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'knowledge_base_sources', filter: `organization_id=eq.${organization.id}` },
                (payload) => {
                    setSources(prev => prev.map(s => s.id === payload.new.id ? { ...s, ...payload.new } as KnowledgeBaseSource : s))
                    if (payload.new.status !== 'processing') {
                        setProcessing(prev => { const n = { ...prev }; delete n[payload.new.id]; return n })
                    }
                }
            ).subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [organization?.id])

    const fetchData = async () => {
        if (!organization) return
        setLoading(true)
        try {
            const { data: orgData } = await supabase.from('organizations').select('ai_prompt').eq('id', organization.id).single()
            setAiPrompt(orgData?.ai_prompt || '')

            const [{ data: kbs }, { data: inbs }, { data: protos }] = await Promise.all([
                supabase.from('knowledge_base_sources').select('*').eq('organization_id', organization.id).order('created_at', { ascending: false }),
                supabase.from('inboxes').select('id,name,channel_type,ai_enabled,is_active').eq('organization_id', organization.id).eq('is_active', true).order('created_at'),
                supabase.from('ai_protocols').select(`*, ai_protocol_params(*), ai_protocol_steps(*)`).eq('organization_id', organization.id).order('created_at'),
            ])
            setSources((kbs as KnowledgeBaseSource[]) || [])
            setInboxes((inbs as Inbox[]) || [])
            setProtocols((protos as AiProtocol[]) || [])
        } catch { toast.error('Failed to load AI settings') }
        finally { setLoading(false) }
    }

    // ── Tab bar ──────────────────────────────────────────────────────
    const TABS: { id: Tab; label: string; icon: any }[] = [
        { id: 'knowledge', label: 'Knowledge Base', icon: FileText },
        { id: 'prompt', label: 'Prompt', icon: MessageSquare },
        { id: 'protocols', label: 'Protocols', icon: Zap },
        { id: 'test', label: 'Test AI', icon: Send },
    ]

    if (loading) return (
        <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
    )

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="h-16 border-b border-gray-200 bg-white flex items-center px-8 gap-3 flex-shrink-0">
                <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-violet-600" />
                </div>
                <div>
                    <h1 className="font-bold text-gray-900">AI Assistant</h1>
                    <p className="text-xs text-gray-500">Powered by Claude — configure responses, knowledge, and actions</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 bg-white flex px-8 gap-1 flex-shrink-0">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            'flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                            activeTab === tab.id
                                ? 'border-violet-600 text-violet-700'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        )}
                    >
                        <tab.icon className="w-3.5 h-3.5" />
                        {tab.label}
                        {tab.id === 'protocols' && protocols.length > 0 && (
                            <span className="ml-1 text-xs bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full">
                                {protocols.filter(p => p.is_active).length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-2xl">
                    {activeTab === 'knowledge' && (
                        <KnowledgeTab
                            sources={sources} setSources={setSources}
                            processing={processing} setProcessing={setProcessing}
                            uploadingDoc={uploadingDoc} setUploadingDoc={setUploadingDoc}
                            fileInputRef={fileInputRef} inboxes={inboxes}
                            togglingInbox={togglingInbox} setTogglingInbox={setTogglingInbox}
                            setInboxes={setInboxes} organization={organization}
                        />
                    )}
                    {activeTab === 'prompt' && (
                        <PromptTab
                            aiPrompt={aiPrompt} setAiPrompt={setAiPrompt}
                            savingPrompt={savingPrompt} setSavingPrompt={setSavingPrompt}
                            promptDirty={promptDirty} setPromptDirty={setPromptDirty}
                            organization={organization}
                        />
                    )}
                    {activeTab === 'protocols' && (
                        <ProtocolsTab
                            protocols={protocols} setProtocols={setProtocols}
                            organization={organization}
                            onEdit={(p) => { setEditingProtocol(p); setShowProtocolModal(true) }}
                            onNew={() => { setEditingProtocol(null); setShowProtocolModal(true) }}
                        />
                    )}
                    {activeTab === 'test' && (
                        <TestTab
                            organization={organization} sources={sources}
                            testQuestion={testQuestion} setTestQuestion={setTestQuestion}
                            testHistory={testHistory} setTestHistory={setTestHistory}
                            testResult={testResult} setTestResult={setTestResult}
                            testLoading={testLoading} setTestLoading={setTestLoading}
                        />
                    )}
                </div>
            </div>

            {/* Protocol Modal */}
            {showProtocolModal && (
                <ProtocolModal
                    protocol={editingProtocol}
                    organization={organization}
                    onClose={() => setShowProtocolModal(false)}
                    onSave={(saved) => {
                        if (editingProtocol) {
                            setProtocols(prev => prev.map(p => p.id === saved.id ? saved : p))
                        } else {
                            setProtocols(prev => [...prev, saved])
                        }
                        setShowProtocolModal(false)
                    }}
                />
            )}
        </div>
    )
}

// ── Knowledge Base Tab ────────────────────────────────────────────────
function KnowledgeTab({ sources, setSources, processing, setProcessing, uploadingDoc, setUploadingDoc, fileInputRef, inboxes, togglingInbox, setTogglingInbox, setInboxes, organization }: any) {
    const totalChars = sources.filter((s: any) => s.status === 'ready').reduce((sum: number, s: any) => sum + (s.raw_content?.length || 0), 0)

    const toggleInboxAI = async (inbox: Inbox) => {
        setTogglingInbox(inbox.id)
        try {
            const newVal = !inbox.ai_enabled
            await supabase.from('inboxes').update({ ai_enabled: newVal }).eq('id', inbox.id)
            setInboxes((prev: Inbox[]) => prev.map(i => i.id === inbox.id ? { ...i, ai_enabled: newVal } : i))
            toast.success(`AI ${newVal ? 'enabled' : 'disabled'} for ${inbox.name}`)
        } catch { toast.error('Failed to update inbox') }
        finally { setTogglingInbox(null) }
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !organization) return
        if (!file.name.toLowerCase().endsWith('.docx')) { toast.error('Only .docx files supported'); return }
        if (file.size > 10 * 1024 * 1024) { toast.error('Max 10MB'); return }
        const activeSources = sources.filter((s: any) => s.status !== 'failed')
        if (activeSources.length >= MAX_DOCS) { toast.error(`Max ${MAX_DOCS} documents`); return }

        setUploadingDoc(true)
        try {
            const { data: source, error } = await supabase.from('knowledge_base_sources')
                .insert({ organization_id: organization.id, type: 'docx', name: file.name, status: 'processing' })
                .select().single()
            if (error || !source) throw new Error(error?.message)

            const filePath = `${organization.id}/${source.id}.docx`
            const { error: upErr } = await supabase.storage.from('knowledge-base').upload(filePath, file, {
                contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            })
            if (upErr) { await supabase.from('knowledge_base_sources').delete().eq('id', source.id); throw new Error(upErr.message) }

            await supabase.from('knowledge_base_sources').update({ file_path: filePath }).eq('id', source.id)
            setSources((prev: any[]) => [{ ...source, file_path: filePath }, ...prev])
            setProcessing((prev: any) => ({ ...prev, [source.id]: true }))

            // Call process function
            fetch(`${SUPABASE_URL}/functions/v1/process-knowledge-source`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
                body: JSON.stringify({ source_id: source.id }),
            }).catch(console.error)

            toast.success(`${file.name} uploaded — processing...`)
        } catch (err: any) { toast.error(err.message) }
        finally { setUploadingDoc(false); if (fileInputRef.current) fileInputRef.current.value = '' }
    }

    const deleteSource = async (source: KnowledgeBaseSource) => {
        if (!confirm(`Delete "${source.name}"?`)) return
        try {
            if (source.file_path) await supabase.storage.from('knowledge-base').remove([source.file_path])
            await supabase.from('knowledge_base_sources').delete().eq('id', source.id)
            setSources((prev: any[]) => prev.filter((s: any) => s.id !== source.id))
            toast.success('Deleted')
        } catch { toast.error('Delete failed') }
    }

    const CHANNEL_COLORS: Record<string, string> = {
        whatsapp: 'bg-green-500', facebook: 'bg-blue-500', instagram: 'bg-pink-500',
        widget: 'bg-violet-500', email: 'bg-orange-500'
    }

    return (
        <div className="space-y-8">
            {/* Enable per Inbox */}
            <div>
                <h2 className="font-bold text-gray-900 mb-1">Enable per Inbox</h2>
                <p className="text-sm text-gray-500 mb-4">Turn AI on or off for each channel independently.</p>
                <div className="space-y-2">
                    {inboxes.map((inbox: Inbox) => (
                        <div key={inbox.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-xl bg-white">
                            <div className="flex items-center gap-3">
                                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', CHANNEL_COLORS[inbox.channel_type] || 'bg-gray-400')}>
                                    <Bot className="w-4 h-4 text-white" />
                                </div>
                                <div>
                                    <p className="font-semibold text-sm">{inbox.name}</p>
                                    <p className="text-xs text-gray-500 capitalize">{inbox.channel_type}</p>
                                </div>
                            </div>
                            <button onClick={() => toggleInboxAI(inbox)} disabled={togglingInbox === inbox.id} className="flex items-center gap-2">
                                {togglingInbox === inbox.id ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" /> :
                                    inbox.ai_enabled
                                        ? <><span className="text-xs font-bold text-violet-700">ON</span><ToggleRight className="w-8 h-8 text-violet-600" /></>
                                        : <><span className="text-xs font-medium text-gray-400">OFF</span><ToggleLeft className="w-8 h-8 text-gray-400" /></>
                                }
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Documents */}
            <div>
                <div className="flex items-center justify-between mb-1">
                    <h2 className="font-bold text-gray-900">Documents</h2>
                    <div className="flex gap-2">
                        <span className={cn('text-xs px-2 py-1 rounded-full font-medium', sources.filter((s: any) => s.status !== 'failed').length >= MAX_DOCS ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500')}>
                            {sources.filter((s: any) => s.status !== 'failed').length}/{MAX_DOCS}
                        </span>
                        {totalChars > 0 && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">~{Math.round(totalChars / 4).toLocaleString()} tokens</span>}
                    </div>
                </div>
                <p className="text-sm text-gray-500 mb-4">Upload .docx files. Name them clearly — you can reference by name in your prompt and protocols.</p>

                {sources.length > 0 && (
                    <div className="space-y-2 mb-4">
                        {sources.map((source: KnowledgeBaseSource) => (
                            <div key={source.id} className={cn('flex items-center gap-3 p-3.5 border rounded-xl',
                                source.status === 'ready' ? 'border-gray-200 bg-white' :
                                    source.status === 'failed' ? 'border-red-200 bg-red-50' : 'border-violet-200 bg-violet-50/40'
                            )}>
                                <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                                    <FileText className="w-4 h-4 text-blue-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 truncate">{source.name}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        {(source.status === 'processing' || processing[source.id]) && <span className="flex items-center gap-1 text-xs text-violet-600"><Loader2 className="w-3 h-3 animate-spin" />Processing...</span>}
                                        {source.status === 'ready' && <span className="flex items-center gap-1 text-xs text-green-600 font-medium"><CheckCircle className="w-3 h-3" />Ready {source.raw_content && <span className="text-gray-400 font-normal">· ~{Math.round(source.raw_content.length / 4).toLocaleString()} tokens</span>}</span>}
                                        {source.status === 'failed' && <span className="flex items-center gap-1 text-xs text-red-600"><AlertCircle className="w-3 h-3" />{source.error_message || 'Failed'}</span>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    {source.status === 'failed' && <button onClick={async () => {
                                        await supabase.from('knowledge_base_sources').update({ status: 'processing', error_message: null }).eq('id', source.id)
                                        setSources((prev: any[]) => prev.map((s: any) => s.id === source.id ? { ...s, status: 'processing' } : s))
                                        setProcessing((prev: any) => ({ ...prev, [source.id]: true }))
                                        fetch(`${SUPABASE_URL}/functions/v1/process-knowledge-source`, {
                                            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
                                            body: JSON.stringify({ source_id: source.id }),
                                        }).catch(console.error)
                                    }} className="text-xs text-blue-600 hover:underline px-2">Retry</button>}
                                    <button onClick={() => deleteSource(source)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-red-500">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {sources.length === 0 && (
                    <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center mb-4">
                        <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm font-semibold text-gray-500">No documents yet</p>
                        <p className="text-xs text-gray-400 mt-1">Upload .docx files for the AI to answer from</p>
                    </div>
                )}

                <input ref={fileInputRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={handleFileUpload} />
                <Button variant="outline" className="w-full gap-2 rounded-xl h-11 font-semibold border-2"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingDoc || sources.filter((s: any) => s.status !== 'failed').length >= MAX_DOCS}>
                    {uploadingDoc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {sources.filter((s: any) => s.status !== 'failed').length >= MAX_DOCS ? `Maximum ${MAX_DOCS} documents reached` : 'Upload Word Document (.docx)'}
                </Button>
                <p className="text-xs text-gray-400 mt-2 text-center">Max 10MB · Text-based .docx only · Up to {MAX_DOCS} documents</p>
            </div>
        </div>
    )
}

// ── Prompt Tab ────────────────────────────────────────────────────────
function PromptTab({ aiPrompt, setAiPrompt, savingPrompt, setSavingPrompt, promptDirty, setPromptDirty, organization }: any) {
    const savePrompt = async () => {
        if (!organization) return
        setSavingPrompt(true)
        try {
            await supabase.from('organizations').update({ ai_prompt: aiPrompt.trim() || null }).eq('id', organization.id)
            setPromptDirty(false)
            toast.success('Prompt saved')
        } catch { toast.error('Failed to save') }
        finally { setSavingPrompt(false) }
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="font-bold text-gray-900 mb-1">AI Prompt</h2>
                <p className="text-sm text-gray-500 mb-4">Write instructions for how Claude should behave. Leave blank to use the default prompt.</p>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-600 space-y-1.5">
                <p className="font-semibold text-gray-700 mb-2">What you can control:</p>
                <p>• <strong>Tone:</strong> "Be formal" or "Use a friendly, casual tone"</p>
                <p>• <strong>Document routing:</strong> "For billing questions, refer to 'Pricing FAQ.docx'"</p>
                <p>• <strong>Farewell:</strong> "Before escalating, say: Our team will be with you shortly"</p>
                <p>• <strong>Language:</strong> "Always reply in Urdu regardless of customer language"</p>
                <p>• <strong>Protocol behavior:</strong> "For cancellations always express sympathy first"</p>
            </div>

            <textarea
                value={aiPrompt}
                onChange={e => { setAiPrompt(e.target.value); setPromptDirty(true) }}
                placeholder={"Leave blank for default, or write your own:\n\nYou are a support agent for Markaz. Be friendly and concise.\nFor product questions, use 'Product FAQ.docx'.\nFor shipping questions, use 'Shipping Policy.docx'.\nBefore handing off, say: 'Let me connect you with our team — they'll help you shortly!'"}
                rows={8}
                className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono"
            />
            <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">{aiPrompt.length} characters</p>
                <div className="flex gap-2">
                    {aiPrompt.trim() && (
                        <Button variant="outline" size="sm" className="rounded-lg text-xs" onClick={() => { setAiPrompt(''); setPromptDirty(true) }}>Reset to default</Button>
                    )}
                    <Button size="sm" disabled={!promptDirty || savingPrompt} onClick={savePrompt}
                        className="rounded-lg text-xs bg-violet-600 hover:bg-violet-700 gap-1.5 disabled:opacity-50">
                        {savingPrompt && <Loader2 className="w-3 h-3 animate-spin" />}
                        {promptDirty ? 'Save Prompt' : '✓ Saved'}
                    </Button>
                </div>
            </div>
        </div>
    )
}

// ── Protocols Tab ─────────────────────────────────────────────────────
function ProtocolsTab({ protocols, setProtocols, organization, onEdit, onNew }: any) {
    const toggleProtocol = async (protocol: AiProtocol) => {
        const newVal = !protocol.is_active
        await supabase.from('ai_protocols').update({ is_active: newVal }).eq('id', protocol.id)
        setProtocols((prev: AiProtocol[]) => prev.map(p => p.id === protocol.id ? { ...p, is_active: newVal } : p))
    }

    const deleteProtocol = async (protocol: AiProtocol) => {
        if (!confirm(`Delete "${protocol.name}"?`)) return
        await supabase.from('ai_protocols').delete().eq('id', protocol.id)
        setProtocols((prev: AiProtocol[]) => prev.filter(p => p.id !== protocol.id))
        toast.success('Protocol deleted')
    }

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h2 className="font-bold text-gray-900 mb-1">Protocols</h2>
                    <p className="text-sm text-gray-500">Define actions Claude can perform on behalf of customers — order lookups, cancellations, API calls, and more.</p>
                </div>
                <Button onClick={onNew} size="sm" className="bg-violet-600 hover:bg-violet-700 gap-1.5 flex-shrink-0 ml-4">
                    <Plus className="w-3.5 h-3.5" />New Protocol
                </Button>
            </div>

            <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 flex gap-3">
                <Info className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-violet-800">
                    Claude automatically detects when a customer's intent matches a protocol, collects required information across multiple messages, and executes the defined steps. Combine with your prompt for full control over behavior.
                </p>
            </div>

            {protocols.length === 0 ? (
                <div className="border-2 border-dashed border-gray-200 rounded-2xl p-10 text-center">
                    <Zap className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-gray-500">No protocols yet</p>
                    <p className="text-xs text-gray-400 mt-1 mb-4">Create your first protocol to enable AI actions</p>
                    <Button onClick={onNew} size="sm" className="bg-violet-600 hover:bg-violet-700 gap-1.5">
                        <Plus className="w-3.5 h-3.5" />Create Protocol
                    </Button>
                </div>
            ) : (
                <div className="space-y-3">
                    {protocols.map((protocol: AiProtocol) => (
                        <div key={protocol.id} className={cn('border rounded-xl p-4 bg-white transition-colors', protocol.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60')}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', protocol.is_active ? 'bg-violet-100' : 'bg-gray-100')}>
                                        <Zap className={cn('w-4 h-4', protocol.is_active ? 'text-violet-600' : 'text-gray-400')} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-sm text-gray-900">{protocol.name}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">{protocol.trigger_description}</p>
                                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                                            {protocol.ai_protocol_params && protocol.ai_protocol_params.length > 0 && (
                                                <span className="flex items-center gap-1 text-xs text-gray-500">
                                                    <Hash className="w-3 h-3" />
                                                    {protocol.ai_protocol_params.length} param{protocol.ai_protocol_params.length !== 1 ? 's' : ''}
                                                </span>
                                            )}
                                            {protocol.ai_protocol_steps && protocol.ai_protocol_steps.length > 0 && (
                                                <span className="flex items-center gap-1 text-xs text-gray-500">
                                                    <Settings2 className="w-3 h-3" />
                                                    {protocol.ai_protocol_steps.length} step{protocol.ai_protocol_steps.length !== 1 ? 's' : ''}
                                                </span>
                                            )}
                                            {protocol.requires_confirmation && (
                                                <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                                                    <Clock className="w-3 h-3" />Confirmation required
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <button onClick={() => toggleProtocol(protocol)} className={cn('text-xs font-bold px-2 py-1 rounded-lg', protocol.is_active ? 'text-violet-700 bg-violet-100' : 'text-gray-400 bg-gray-100')}>
                                        {protocol.is_active ? 'ON' : 'OFF'}
                                    </button>
                                    <button onClick={() => onEdit(protocol)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
                                        <Settings2 className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => deleteProtocol(protocol)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-red-500">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// ── Protocol Modal ────────────────────────────────────────────────────
function ProtocolModal({ protocol, organization, onClose, onSave }: {
    protocol: AiProtocol | null; organization: any; onClose: () => void; onSave: (p: AiProtocol) => void
}) {
    const isEdit = !!protocol
    const [saving, setSaving] = useState(false)
    const [name, setName] = useState(protocol?.name || '')
    const [trigger, setTrigger] = useState(protocol?.trigger_description || '')
    const [requiresConfirm, setRequiresConfirm] = useState(protocol?.requires_confirmation ?? true)
    const [params, setParams] = useState<Partial<AiProtocolParam>[]>(
        protocol?.ai_protocol_params?.sort((a, b) => a.sort_order - b.sort_order) || []
    )
    const [steps, setSteps] = useState<Partial<AiProtocolStep>[]>(
        protocol?.ai_protocol_steps?.sort((a, b) => a.step_order - b.step_order) || []
    )

    const addParam = () => setParams(prev => [...prev, { param_name: '', description: '', required: true, sort_order: prev.length }])
    const removeParam = (i: number) => setParams(prev => prev.filter((_, idx) => idx !== i))
    const updateParam = (i: number, field: string, value: any) => setParams(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p))

    const addStep = (type: AiProtocolStep['type']) => setSteps(prev => [...prev, {
        step_order: prev.length + 1, type,
        config: type === 'call_api' ? { method: 'POST', url: '', headers: {}, body: {} }
            : type === 'send_message' ? { message: '' }
                : { document_name: '', instruction: '' }
    }])
    const removeStep = (i: number) => setSteps(prev => prev.filter((_, idx) => idx !== i))
    const updateStepConfig = (i: number, config: any) => setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, config } : s))

    const save = async () => {
        if (!name.trim() || !trigger.trim()) { toast.error('Name and trigger are required'); return }
        setSaving(true)
        try {
            let protocolId = protocol?.id

            if (isEdit) {
                await supabase.from('ai_protocols').update({ name: name.trim(), trigger_description: trigger.trim(), requires_confirmation: requiresConfirm, updated_at: new Date().toISOString() }).eq('id', protocolId)
                // Delete and re-insert params + steps for simplicity
                await supabase.from('ai_protocol_params').delete().eq('protocol_id', protocolId)
                await supabase.from('ai_protocol_steps').delete().eq('protocol_id', protocolId)
            } else {
                const { data, error } = await supabase.from('ai_protocols').insert({
                    organization_id: organization.id, name: name.trim(), trigger_description: trigger.trim(), requires_confirmation: requiresConfirm,
                }).select().single()
                if (error || !data) throw new Error(error?.message)
                protocolId = data.id
            }

            // Insert params
            if (params.filter(p => p.param_name?.trim()).length > 0) {
                await supabase.from('ai_protocol_params').insert(
                    params.filter(p => p.param_name?.trim()).map((p, i) => ({
                        protocol_id: protocolId, param_name: p.param_name!.trim(),
                        description: p.description || '', required: p.required ?? true, sort_order: i,
                    }))
                )
            }

            // Insert steps
            if (steps.length > 0) {
                await supabase.from('ai_protocol_steps').insert(
                    steps.map((s, i) => ({ protocol_id: protocolId, step_order: i + 1, type: s.type!, config: s.config || {} }))
                )
            }

            // Fetch complete saved protocol
            const { data: saved } = await supabase.from('ai_protocols')
                .select('*, ai_protocol_params(*), ai_protocol_steps(*)')
                .eq('id', protocolId).single()

            toast.success(isEdit ? 'Protocol updated' : 'Protocol created')
            onSave(saved as AiProtocol)
        } catch (err: any) { toast.error(err.message) }
        finally { setSaving(false) }
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
                {/* Modal header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                    <h2 className="font-bold text-gray-900">{isEdit ? 'Edit Protocol' : 'New Protocol'}</h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Basic info */}
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Protocol Name *</label>
                            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Cancel Order, Check Order Status, Request Refund" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Trigger Description * <span className="font-normal text-gray-500">(tell Claude when to use this)</span></label>
                            <Input value={trigger} onChange={e => setTrigger(e.target.value)} placeholder="e.g. When customer wants to cancel an order or item" />
                        </div>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <div onClick={() => setRequiresConfirm(!requiresConfirm)} className={cn('w-10 h-6 rounded-full transition-colors flex items-center px-1', requiresConfirm ? 'bg-amber-500' : 'bg-gray-200')}>
                                <div className={cn('w-4 h-4 bg-white rounded-full shadow transition-transform', requiresConfirm ? 'translate-x-4' : 'translate-x-0')} />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-gray-800">Require customer confirmation</p>
                                <p className="text-xs text-gray-500">Claude will ask customer to confirm before executing</p>
                            </div>
                        </label>
                    </div>

                    {/* Parameters */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <p className="text-sm font-bold text-gray-900">Parameters to Collect</p>
                                <p className="text-xs text-gray-500">Information Claude needs to gather from the customer</p>
                            </div>
                            <Button variant="outline" size="sm" onClick={addParam} className="gap-1 text-xs">
                                <Plus className="w-3 h-3" />Add
                            </Button>
                        </div>
                        {params.length === 0 && <p className="text-xs text-gray-400 border border-dashed border-gray-200 rounded-lg p-3 text-center">No parameters — Claude will execute without collecting info</p>}
                        <div className="space-y-2">
                            {params.map((param, i) => (
                                <div key={i} className="flex gap-2 items-start p-3 border border-gray-200 rounded-lg">
                                    <div className="flex-1 grid grid-cols-2 gap-2">
                                        <Input value={param.param_name || ''} onChange={e => updateParam(i, 'param_name', e.target.value)} placeholder="param_name (e.g. order_id)" className="text-xs h-8 font-mono" />
                                        <Input value={param.description || ''} onChange={e => updateParam(i, 'description', e.target.value)} placeholder="Description for Claude" className="text-xs h-8" />
                                    </div>
                                    <label className="flex items-center gap-1 text-xs text-gray-600 flex-shrink-0 mt-1.5">
                                        <input type="checkbox" checked={param.required ?? true} onChange={e => updateParam(i, 'required', e.target.checked)} />
                                        Required
                                    </label>
                                    <button onClick={() => removeParam(i)} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-red-500 flex-shrink-0 mt-0.5"><X className="w-3.5 h-3.5" /></button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Steps */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <p className="text-sm font-bold text-gray-900">Steps</p>
                                <p className="text-xs text-gray-500">Actions executed in order when this protocol runs</p>
                            </div>
                            <div className="flex gap-1.5">
                                {[
                                    { type: 'call_api' as const, label: 'API Call', icon: Globe },
                                    { type: 'send_message' as const, label: 'Message', icon: MessageSquare },
                                    { type: 'lookup_document' as const, label: 'Doc Lookup', icon: FileText },
                                ].map(({ type, label, icon: Icon }) => (
                                    <Button key={type} variant="outline" size="sm" onClick={() => addStep(type)} className="gap-1 text-xs h-7 px-2">
                                        <Icon className="w-3 h-3" />{label}
                                    </Button>
                                ))}
                            </div>
                        </div>
                        {steps.length === 0 && <p className="text-xs text-gray-400 border border-dashed border-gray-200 rounded-lg p-3 text-center">No steps — add an API call, message, or document lookup</p>}
                        <div className="space-y-3">
                            {steps.map((step, i) => (
                                <StepEditor key={i} step={step} index={i} onUpdate={(config) => updateStepConfig(i, config)} onRemove={() => removeStep(i)} />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={save} disabled={saving} className="bg-violet-600 hover:bg-violet-700 gap-1.5">
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        {isEdit ? 'Save Changes' : 'Create Protocol'}
                    </Button>
                </div>
            </div>
        </div>
    )
}

// ── Step Editor ───────────────────────────────────────────────────────
function StepEditor({ step, index, onUpdate, onRemove }: { step: Partial<AiProtocolStep>; index: number; onUpdate: (config: any) => void; onRemove: () => void }) {
    const [headersText, setHeadersText] = useState(() => {
        try { return step.config?.headers ? JSON.stringify(step.config.headers, null, 2) : '{}' } catch { return '{}' }
    })
    const [bodyText, setBodyText] = useState(() => {
        try { return step.config?.body ? JSON.stringify(step.config.body, null, 2) : '{}' } catch { return '{}' }
    })

    const STEP_LABELS: Record<string, string> = { call_api: '🌐 API Call', send_message: '💬 Send Message', lookup_document: '📄 Doc Lookup' }

    return (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
                <span className="text-xs font-semibold text-gray-700">Step {index + 1} — {STEP_LABELS[step.type || ''] || step.type}</span>
                <button onClick={onRemove} className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
            </div>
            <div className="p-3 space-y-3">
                {step.type === 'call_api' && (
                    <>
                        <div className="flex gap-2">
                            <select value={step.config?.method || 'POST'} onChange={e => onUpdate({ ...step.config, method: e.target.value })}
                                className="border border-gray-200 rounded-lg text-xs px-2 h-8 font-mono bg-white w-24">
                                {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => <option key={m}>{m}</option>)}
                            </select>
                            <Input value={step.config?.url || ''} onChange={e => onUpdate({ ...step.config, url: e.target.value })}
                                placeholder="https://api.example.com/orders/cancel" className="text-xs h-8 flex-1 font-mono" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Headers (JSON) — use any auth method</label>
                            <textarea value={headersText} onChange={e => {
                                setHeadersText(e.target.value)
                                try { onUpdate({ ...step.config, headers: JSON.parse(e.target.value) }) } catch { }
                            }} rows={3} placeholder={'{\n  "Authorization": "Bearer YOUR_TOKEN",\n  "x-api-key": "YOUR_KEY"\n}'}
                                className="w-full border border-gray-200 rounded-lg p-2 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-violet-500" />
                        </div>
                        {step.config?.method !== 'GET' && (
                            <div>
                                <label className="text-xs font-semibold text-gray-600 mb-1 block">Request Body (JSON) — use {`{{param_name}}`} for collected values</label>
                                <textarea value={bodyText} onChange={e => {
                                    setBodyText(e.target.value)
                                    try { onUpdate({ ...step.config, body: JSON.parse(e.target.value) }) } catch { }
                                }} rows={4} placeholder={'{\n  "order_id": "{{order_id}}",\n  "item_id": "{{item_id}}"\n}'}
                                    className="w-full border border-gray-200 rounded-lg p-2 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-violet-500" />
                                <p className="text-xs text-gray-400 mt-1">Use {`{{param_name}}`} placeholders — they'll be filled with values collected from the customer</p>
                            </div>
                        )}
                    </>
                )}
                {step.type === 'send_message' && (
                    <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Message — use {`{{param_name}}`} for dynamic values</label>
                        <textarea value={step.config?.message || ''} onChange={e => onUpdate({ ...step.config, message: e.target.value })}
                            rows={3} placeholder="Your order {{order_id}} has been received. Reference: {{reference_id}}"
                            className="w-full border border-gray-200 rounded-lg p-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-violet-500" />
                    </div>
                )}
                {step.type === 'lookup_document' && (
                    <div className="space-y-2">
                        <Input value={step.config?.document_name || ''} onChange={e => onUpdate({ ...step.config, document_name: e.target.value })}
                            placeholder="Document name (e.g. Orders.docx)" className="text-xs h-8" />
                        <Input value={step.config?.instruction || ''} onChange={e => onUpdate({ ...step.config, instruction: e.target.value })}
                            placeholder="Instruction (e.g. Find order by order_id and return its status)" className="text-xs h-8" />
                    </div>
                )}
            </div>
        </div>
    )
}

// ── Test AI Tab ───────────────────────────────────────────────────────
function TestTab({ organization, sources, testQuestion, setTestQuestion, testHistory, setTestHistory, testResult, setTestResult, testLoading, setTestLoading }: any) {
    const readySources = sources.filter((s: any) => s.status === 'ready').length

    const runTest = async () => {
        if (!testQuestion.trim() || !organization) return
        setTestLoading(true)
        const newHistory = [...testHistory, { role: 'user' as const, content: testQuestion.trim() }]

        try {
            const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-agent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
                body: JSON.stringify({ organization_id: organization.id, new_message: testQuestion.trim(), test_mode: true, test_history: testHistory }),
            })
            const data = await res.json()
            setTestResult(data)

            if (data.reply) {
                setTestHistory([...newHistory, { role: 'assistant' as const, content: data.reply }])
            } else {
                setTestHistory(newHistory)
            }
            setTestQuestion('')
        } catch (err: any) { toast.error('Test failed: ' + err.message) }
        finally { setTestLoading(false) }
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="font-bold text-gray-900 mb-1">Test AI</h2>
                <p className="text-sm text-gray-500">Simulate a multi-turn conversation with Claude using your current knowledge base, prompt, and protocols. Nothing is sent to customers.</p>
            </div>

            {readySources === 0 ? (
                <div className="border border-orange-200 bg-orange-50 rounded-xl p-4 text-sm text-orange-700">
                    Upload and process at least one document before testing.
                </div>
            ) : (
                <>
                    {/* Conversation history */}
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                        <div className="min-h-[200px] max-h-[400px] overflow-y-auto p-4 space-y-3 bg-gray-50">
                            {testHistory.length === 0 && (
                                <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
                                    <div className="text-center"><MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>Start a test conversation below</p></div>
                                </div>
                            )}
                            {testHistory.map((msg, i) => (
                                <div key={i} className={cn('flex gap-2', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                                    <div className={cn('w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold',
                                        msg.role === 'user' ? 'bg-gray-200 text-gray-600' : 'bg-violet-100 text-violet-600')}>
                                        {msg.role === 'user' ? 'U' : <Bot className="w-3 h-3" />}
                                    </div>
                                    <div className={cn('max-w-[80%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap',
                                        msg.role === 'user' ? 'bg-white border border-gray-200 text-gray-800' : 'bg-violet-50 border border-violet-200 text-violet-900')}>
                                        {msg.content}
                                    </div>
                                </div>
                            ))}
                            {testLoading && (
                                <div className="flex gap-2">
                                    <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center"><Bot className="w-3 h-3 text-violet-600" /></div>
                                    <div className="bg-violet-50 border border-violet-200 rounded-xl px-3 py-2"><Loader2 className="w-4 h-4 animate-spin text-violet-400" /></div>
                                </div>
                            )}

                            {/* Show escalation/protocol result */}
                            {testResult && !testLoading && (
                                <div className="border border-dashed border-gray-300 rounded-lg p-3 text-xs text-gray-500 space-y-1">
                                    {!testResult.can_answer && !testResult.action && (
                                        <><p className="font-semibold text-orange-600">↗ Would escalate to agent</p>
                                            {testResult.farewell && <p>Farewell: "{testResult.farewell}"</p>}
                                            {testResult.reason && <p>Reason: {testResult.reason}</p>}</>
                                    )}
                                    {testResult.action === 'protocol' && (
                                        <><p className="font-semibold text-blue-600">⚡ Would run protocol: {testResult.protocol_name}</p>
                                            <p>Params: {JSON.stringify(testResult.collected_params)}</p>
                                            <p>{testResult.would_confirm}</p></>
                                    )}
                                    {testResult.documents_used && <p>Documents: {testResult.documents_used.join(', ')}</p>}
                                </div>
                            )}
                        </div>

                        {/* Input */}
                        <div className="flex gap-2 p-3 border-t border-gray-200 bg-white">
                            <Input value={testQuestion} onChange={e => setTestQuestion(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && !testLoading && runTest()}
                                placeholder="Type a test message..." className="flex-1 h-9 text-sm" />
                            <Button size="sm" onClick={runTest} disabled={!testQuestion.trim() || testLoading}
                                className="h-9 px-4 bg-violet-600 hover:bg-violet-700 gap-1.5">
                                {testLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}Send
                            </Button>
                            {testHistory.length > 0 && (
                                <Button size="sm" variant="outline" onClick={() => { setTestHistory([]); setTestResult(null) }} className="h-9 px-3">
                                    <X className="w-3.5 h-3.5" />
                                </Button>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}