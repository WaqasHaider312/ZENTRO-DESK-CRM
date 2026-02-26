import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { KnowledgeBaseSource, Inbox } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
    Sparkles, Upload, Trash2, Loader2, CheckCircle,
    AlertCircle, Clock, FileText, ToggleLeft, ToggleRight,
    Bot, Info, Send, X, MessageSquare
} from 'lucide-react'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const MAX_DOCS = 5

export default function AISettings() {
    const { organization } = useAuth()
    const [sources, setSources] = useState<KnowledgeBaseSource[]>([])
    const [inboxes, setInboxes] = useState<Inbox[]>([])
    const [loading, setLoading] = useState(true)
    const [processing, setProcessing] = useState<Record<string, boolean>>({})
    const [uploadingPdf, setUploadingPdf] = useState(false)
    const [togglingInbox, setTogglingInbox] = useState<string | null>(null)
    const [aiPrompt, setAiPrompt] = useState('')
    const [savingPrompt, setSavingPrompt] = useState(false)
    const [promptDirty, setPromptDirty] = useState(false)

    // Test AI
    const [testQuestion, setTestQuestion] = useState('')
    const [testResult, setTestResult] = useState<{ can_answer: boolean; reply?: string; farewell?: string; documents_used?: string[]; reason?: string } | null>(null)
    const [testLoading, setTestLoading] = useState(false)

    const fileInputRef = useRef<HTMLInputElement>(null)

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
            )
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [organization?.id])

    const fetchData = async () => {
        if (!organization) return
        setLoading(true)
        try {
            const { data: orgData } = await supabase.from('organizations').select('ai_prompt').eq('id', organization.id).single()
            setAiPrompt(orgData?.ai_prompt || '')

            const [{ data: kbs }, { data: inbs }] = await Promise.all([
                supabase.from('knowledge_base_sources').select('*').eq('organization_id', organization.id).order('created_at', { ascending: false }),
                supabase.from('inboxes').select('id, name, channel_type, ai_enabled, is_active').eq('organization_id', organization.id).eq('is_active', true).order('created_at'),
            ])
            setSources((kbs as KnowledgeBaseSource[]) || [])
            setInboxes((inbs as Inbox[]) || [])
        } catch {
            toast.error('Failed to load AI settings')
        } finally {
            setLoading(false)
        }
    }

    const toggleInboxAI = async (inbox: Inbox) => {
        setTogglingInbox(inbox.id)
        try {
            const newVal = !inbox.ai_enabled
            await supabase.from('inboxes').update({ ai_enabled: newVal }).eq('id', inbox.id)
            setInboxes(prev => prev.map(i => i.id === inbox.id ? { ...i, ai_enabled: newVal } : i))
            toast.success(`AI ${newVal ? 'enabled' : 'disabled'} for ${inbox.name}`)
        } catch {
            toast.error('Failed to update inbox')
        } finally {
            setTogglingInbox(null)
        }
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !organization) return

        if (!file.name.toLowerCase().endsWith('.docx')) {
            toast.error('Only Word (.docx) files are supported')
            return
        }
        if (file.size > 10 * 1024 * 1024) {
            toast.error('File too large — maximum 10MB')
            return
        }
        const readySources = sources.filter(s => s.status !== 'failed')
        if (readySources.length >= MAX_DOCS) {
            toast.error(`Maximum ${MAX_DOCS} documents allowed. Delete one first.`)
            return
        }

        setUploadingPdf(true)
        try {
            const { data: source, error: insertErr } = await supabase
                .from('knowledge_base_sources')
                .insert({ organization_id: organization.id, type: 'docx', name: file.name, status: 'processing' })
                .select().single()

            if (insertErr || !source) throw new Error(insertErr?.message || 'Failed to create source')

            const filePath = `${organization.id}/${source.id}.docx`
            const { error: uploadErr } = await supabase.storage.from('knowledge-base').upload(filePath, file, {
                contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            })

            if (uploadErr) {
                await supabase.from('knowledge_base_sources').delete().eq('id', source.id)
                throw new Error(uploadErr.message)
            }

            await supabase.from('knowledge_base_sources').update({ file_path: filePath }).eq('id', source.id)
            setSources(prev => [{ ...source, file_path: filePath } as KnowledgeBaseSource, ...prev])
            setProcessing(prev => ({ ...prev, [source.id]: true }))
            callProcessFunction(source.id)
            toast.success(`${file.name} uploaded — processing...`)
        } catch (err: any) {
            toast.error(err.message || 'Upload failed')
        } finally {
            setUploadingPdf(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const callProcessFunction = async (sourceId: string) => {
        try {
            const res = await fetch(`${SUPABASE_URL}/functions/v1/process-knowledge-source`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
                body: JSON.stringify({ source_id: sourceId }),
            })
            const data = await res.json()
            if (data.error) toast.error(`Processing failed: ${data.error}`)
        } catch (err: any) {
            console.error('Process function error:', err)
        }
    }

    const deleteSource = async (source: KnowledgeBaseSource) => {
        if (!confirm(`Delete "${source.name}"? This cannot be undone.`)) return
        try {
            if (source.type === 'docx' && source.file_path) {
                await supabase.storage.from('knowledge-base').remove([source.file_path])
            }
            await supabase.from('knowledge_base_sources').delete().eq('id', source.id)
            setSources(prev => prev.filter(s => s.id !== source.id))
            toast.success('Source deleted')
        } catch {
            toast.error('Failed to delete source')
        }
    }

    const retrySource = async (source: KnowledgeBaseSource) => {
        try {
            await supabase.from('knowledge_base_sources').update({ status: 'processing', error_message: null }).eq('id', source.id)
            setSources(prev => prev.map(s => s.id === source.id ? { ...s, status: 'processing', error_message: undefined } : s))
            setProcessing(prev => ({ ...prev, [source.id]: true }))
            callProcessFunction(source.id)
            toast.success('Retrying...')
        } catch { toast.error('Failed to retry') }
    }

    const savePrompt = async () => {
        if (!organization) return
        setSavingPrompt(true)
        try {
            await supabase.from('organizations').update({ ai_prompt: aiPrompt.trim() || null }).eq('id', organization.id)
            setPromptDirty(false)
            toast.success('Prompt saved')
        } catch { toast.error('Failed to save prompt') }
        finally { setSavingPrompt(false) }
    }

    const runTestAI = async () => {
        if (!testQuestion.trim() || !organization) return
        setTestLoading(true)
        setTestResult(null)
        try {
            const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-reply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
                body: JSON.stringify({
                    organization_id: organization.id,
                    new_message: testQuestion.trim(),
                    test_mode: true,
                }),
            })
            const data = await res.json()
            setTestResult(data)
        } catch (err: any) {
            toast.error('Test failed: ' + err.message)
        } finally {
            setTestLoading(false)
        }
    }

    const readySources = sources.filter(s => s.status === 'ready').length
    const totalChars = sources.filter(s => s.status === 'ready').reduce((sum, s) => sum + (s.raw_content?.length || 0), 0)

    const CHANNEL_COLORS: Record<string, string> = {
        whatsapp: 'bg-green-500', facebook: 'bg-blue-500', instagram: 'bg-pink-500',
        widget: 'bg-violet-500', email: 'bg-orange-500'
    }
    const CHANNEL_LABELS: Record<string, string> = {
        whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram',
        widget: 'Web Widget', email: 'Email'
    }

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
                    <p className="text-xs text-gray-500">Configure AI responses and knowledge base</p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-2xl space-y-8">

                    {/* How it works */}
                    <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 flex gap-3">
                        <Info className="w-5 h-5 text-violet-500 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-violet-800">
                            <p className="font-semibold mb-1">How AI Assistant works</p>
                            <p className="text-xs text-violet-700 leading-relaxed">
                                When AI is enabled for an inbox, every inbound message is answered using your knowledge base and prompt.
                                If AI cannot answer, the ticket moves silently to <strong>Unassigned</strong>.
                                You can customize the farewell message to customers in your prompt.
                            </p>
                        </div>
                    </div>

                    {/* Inbox toggles */}
                    <div>
                        <h2 className="font-bold text-gray-900 mb-1">Enable per Inbox</h2>
                        <p className="text-sm text-gray-500 mb-4">Turn AI on or off for each channel independently.</p>
                        <div className="space-y-2">
                            {inboxes.length === 0 ? (
                                <div className="border border-gray-200 rounded-xl p-4 text-sm text-gray-500 text-center">
                                    No inboxes connected yet.
                                </div>
                            ) : inboxes.map(inbox => (
                                <div key={inbox.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-xl bg-white hover:border-gray-300 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', CHANNEL_COLORS[inbox.channel_type] || 'bg-gray-400')}>
                                            <Bot className="w-4 h-4 text-white" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-sm text-gray-900">{inbox.name}</p>
                                            <p className="text-xs text-gray-500">{CHANNEL_LABELS[inbox.channel_type]}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => toggleInboxAI(inbox)} disabled={togglingInbox === inbox.id} className="flex items-center gap-2">
                                        {togglingInbox === inbox.id ? (
                                            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                                        ) : inbox.ai_enabled ? (
                                            <><span className="text-xs font-bold text-violet-700">ON</span><ToggleRight className="w-8 h-8 text-violet-600" /></>
                                        ) : (
                                            <><span className="text-xs font-medium text-gray-400">OFF</span><ToggleLeft className="w-8 h-8 text-gray-400" /></>
                                        )}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Knowledge Base */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <h2 className="font-bold text-gray-900">Knowledge Base</h2>
                            <div className="flex items-center gap-2">
                                <span className={cn('text-xs px-2 py-1 rounded-full font-medium',
                                    sources.filter(s => s.status !== 'failed').length >= MAX_DOCS
                                        ? 'bg-orange-100 text-orange-700'
                                        : 'bg-gray-100 text-gray-500'
                                )}>
                                    {sources.filter(s => s.status !== 'failed').length}/{MAX_DOCS} documents
                                </span>
                                {totalChars > 0 && (
                                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                                        ~{Math.round(totalChars / 4).toLocaleString()} tokens ready
                                    </span>
                                )}
                            </div>
                        </div>
                        <p className="text-sm text-gray-500 mb-4">
                            Upload Word documents (.docx). Name them clearly — you can reference them by name in your prompt.
                        </p>

                        {sources.length > 0 && (
                            <div className="space-y-2 mb-4">
                                {sources.map(source => (
                                    <SourceCard
                                        key={source.id}
                                        source={source}
                                        isProcessing={!!processing[source.id]}
                                        onDelete={() => deleteSource(source)}
                                        onRetry={() => retrySource(source)}
                                    />
                                ))}
                            </div>
                        )}

                        {sources.length === 0 && (
                            <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center mb-4">
                                <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                                    <FileText className="w-6 h-6 text-gray-400" />
                                </div>
                                <p className="text-sm font-semibold text-gray-600">No documents yet</p>
                                <p className="text-xs text-gray-400 mt-1">Upload .docx files for the AI to answer from</p>
                            </div>
                        )}

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            className="hidden"
                            onChange={handleFileUpload}
                        />
                        <Button
                            variant="outline"
                            className="w-full gap-2 rounded-xl h-11 font-semibold border-2"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadingPdf || sources.filter(s => s.status !== 'failed').length >= MAX_DOCS}
                        >
                            {uploadingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            {sources.filter(s => s.status !== 'failed').length >= MAX_DOCS ? `Maximum ${MAX_DOCS} documents reached` : 'Upload Word Document (.docx)'}
                        </Button>
                        <p className="text-xs text-gray-400 mt-2 text-center">
                            Max 10MB per file · Text-based .docx only · Up to {MAX_DOCS} documents
                        </p>
                    </div>

                    {/* AI Prompt */}
                    <div>
                        <h2 className="font-bold text-gray-900 mb-1">AI Prompt</h2>
                        <p className="text-sm text-gray-500 mb-3">
                            Write instructions for how the AI should behave. You can reference documents by name, define a farewell message, set tone, and more.
                        </p>

                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-3 space-y-1.5 text-xs text-gray-600">
                            <p className="font-semibold text-gray-700">What you can control via prompt:</p>
                            <p>• <strong>Tone:</strong> "Always be formal" or "Use a friendly, casual tone"</p>
                            <p>• <strong>Document routing:</strong> "For billing questions, refer to 'Pricing FAQ.docx'"</p>
                            <p>• <strong>Farewell:</strong> "Before escalating, always say: Our team will be with you shortly"</p>
                            <p>• <strong>Language:</strong> "Always reply in Urdu regardless of customer language"</p>
                            <p>• <strong>Restrictions:</strong> "Never discuss competitors"</p>
                        </div>

                        <textarea
                            value={aiPrompt}
                            onChange={e => { setAiPrompt(e.target.value); setPromptDirty(true) }}
                            placeholder={"Leave blank to use the default prompt, or write your own:\n\nYou are a support agent for Markaz. Be friendly and concise.\nFor product questions, refer to 'Product FAQ.docx'.\nFor shipping questions, refer to 'Shipping Policy.docx'.\nBefore handing off to an agent, always say: 'Let me connect you with our team. They'll be with you shortly!'"}
                            rows={7}
                            className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent font-mono"
                        />
                        <div className="flex items-center justify-between mt-2">
                            <p className="text-xs text-gray-400">{aiPrompt.length} characters</p>
                            <div className="flex gap-2">
                                {aiPrompt.trim() && (
                                    <Button variant="outline" size="sm" className="rounded-lg text-xs"
                                        onClick={() => { setAiPrompt(''); setPromptDirty(true) }}>
                                        Reset to default
                                    </Button>
                                )}
                                <Button size="sm" disabled={!promptDirty || savingPrompt} onClick={savePrompt}
                                    className="rounded-lg text-xs bg-violet-600 hover:bg-violet-700 gap-1.5 disabled:opacity-50">
                                    {savingPrompt && <Loader2 className="w-3 h-3 animate-spin" />}
                                    {promptDirty ? 'Save Prompt' : '✓ Saved'}
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Test AI */}
                    <div>
                        <h2 className="font-bold text-gray-900 mb-1">Test AI</h2>
                        <p className="text-sm text-gray-500 mb-4">
                            Send a test question to see exactly what the AI would reply — uses your current knowledge base and prompt. Nothing is sent to any customer.
                        </p>

                        {readySources === 0 ? (
                            <div className="border border-orange-200 bg-orange-50 rounded-xl p-4 text-sm text-orange-700">
                                Upload and process at least one document before testing.
                            </div>
                        ) : (
                            <div className="border border-gray-200 rounded-xl overflow-hidden">
                                <div className="flex gap-2 p-3 border-b border-gray-100">
                                    <Input
                                        value={testQuestion}
                                        onChange={e => { setTestQuestion(e.target.value); setTestResult(null) }}
                                        onKeyDown={e => e.key === 'Enter' && !testLoading && runTestAI()}
                                        placeholder="e.g. What is your return policy?"
                                        className="flex-1 h-9 text-sm border-gray-200 rounded-lg"
                                    />
                                    <Button
                                        size="sm"
                                        onClick={runTestAI}
                                        disabled={!testQuestion.trim() || testLoading}
                                        className="h-9 px-4 bg-violet-600 hover:bg-violet-700 gap-1.5"
                                    >
                                        {testLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                        Test
                                    </Button>
                                </div>

                                {testResult && (
                                    <div className="p-4">
                                        {testResult.error ? (
                                            <div className="flex gap-2 text-red-600 text-sm">
                                                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                                <p>{testResult.error as any}</p>
                                            </div>
                                        ) : testResult.can_answer ? (
                                            <div className="space-y-3">
                                                <div className="flex items-start gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                        <Bot className="w-3.5 h-3.5 text-violet-600" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-[10px] font-bold text-violet-600 mb-1 flex items-center gap-1">
                                                            <Sparkles className="w-3 h-3" />AI WOULD REPLY
                                                        </p>
                                                        <div className="bg-violet-50 border border-violet-200 rounded-xl px-3 py-2.5 text-sm text-violet-900 whitespace-pre-wrap">
                                                            {testResult.reply}
                                                        </div>
                                                    </div>
                                                </div>
                                                {testResult.documents_used && testResult.documents_used.length > 0 && (
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="text-xs text-gray-400">Sources used:</span>
                                                        {testResult.documents_used.map(d => (
                                                            <span key={d} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                                <FileText className="w-3 h-3" />{d}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2 text-orange-600">
                                                    <AlertCircle className="w-4 h-4" />
                                                    <p className="text-sm font-semibold">AI would escalate to agents</p>
                                                </div>
                                                {testResult.farewell && (
                                                    <div className="ml-6">
                                                        <p className="text-xs text-gray-500 mb-1">Farewell message that would be sent to customer:</p>
                                                        <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-sm text-orange-800 italic">
                                                            "{testResult.farewell}"
                                                        </div>
                                                    </div>
                                                )}
                                                {!testResult.farewell && (
                                                    <p className="ml-6 text-xs text-gray-400">No farewell message configured. Add one in your prompt.</p>
                                                )}
                                                {testResult.reason && (
                                                    <p className="ml-6 text-xs text-gray-400">Reason: {testResult.reason}</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {!testResult && !testLoading && (
                                    <div className="p-4 flex items-center gap-2 text-gray-400">
                                        <MessageSquare className="w-4 h-4" />
                                        <p className="text-xs">Enter a question above and click Test to preview the AI response</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    )
}

function SourceCard({ source, isProcessing, onDelete, onRetry }: {
    source: KnowledgeBaseSource
    isProcessing: boolean
    onDelete: () => void
    onRetry: () => void
}) {
    const isReady = source.status === 'ready'
    const isFailed = source.status === 'failed'
    const isProc = source.status === 'processing' || isProcessing

    return (
        <div className={cn(
            'flex items-center gap-3 p-3.5 border rounded-xl transition-colors',
            isReady ? 'border-gray-200 bg-white' : isFailed ? 'border-red-200 bg-red-50' : 'border-violet-200 bg-violet-50/40'
        )}>
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{source.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                    {isProc && <span className="flex items-center gap-1 text-xs text-violet-600"><Loader2 className="w-3 h-3 animate-spin" />Processing...</span>}
                    {isReady && (
                        <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                            <CheckCircle className="w-3 h-3" />Ready
                            {source.raw_content && <span className="text-gray-400 font-normal">· ~{Math.round(source.raw_content.length / 4).toLocaleString()} tokens</span>}
                        </span>
                    )}
                    {isFailed && <span className="flex items-center gap-1 text-xs text-red-600"><AlertCircle className="w-3 h-3" />{source.error_message || 'Failed'}</span>}
                </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
                {isProc && <Clock className="w-4 h-4 text-violet-400 animate-pulse" />}
                {isFailed && <button onClick={onRetry} className="text-xs text-blue-600 hover:underline px-2 py-1 rounded hover:bg-blue-50">Retry</button>}
                <button onClick={onDelete} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}