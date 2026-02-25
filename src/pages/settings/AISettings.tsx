import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { KnowledgeBaseSource, Inbox } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
    Sparkles, Upload, Globe, Trash2, Loader2,
    CheckCircle, AlertCircle, Clock, FileText, X, ToggleLeft, ToggleRight,
    Bot, Info
} from 'lucide-react'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

type ProcessingState = { [sourceId: string]: boolean }

export default function AISettings() {
    const { organization } = useAuth()
    const [sources, setSources] = useState<KnowledgeBaseSource[]>([])
    const [inboxes, setInboxes] = useState<Inbox[]>([])
    const [loading, setLoading] = useState(true)
    const [processing, setProcessing] = useState<ProcessingState>({})
    const [showUrlModal, setShowUrlModal] = useState(false)
    const [urlInput, setUrlInput] = useState('')
    const [urlName, setUrlName] = useState('')
    const [addingUrl, setAddingUrl] = useState(false)
    const [uploadingPdf, setUploadingPdf] = useState(false)
    const [togglingInbox, setTogglingInbox] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (!organization) return
        fetchData()
        // Realtime: watch for source status changes
        const channel = supabase
            .channel(`kbs-${organization.id}`)
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'knowledge_base_sources', filter: `organization_id=eq.${organization.id}` },
                (payload) => {
                    setSources(prev => prev.map(s => s.id === payload.new.id ? { ...s, ...payload.new } as KnowledgeBaseSource : s))
                    // Remove from processing if status changed
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

        setUploadingPdf(true)
        try {
            // Create source row first to get ID
            const { data: source, error: insertErr } = await supabase
                .from('knowledge_base_sources')
                .insert({
                    organization_id: organization.id,
                    type: 'docx',
                    name: file.name,
                    status: 'processing',
                })
                .select()
                .single()

            if (insertErr || !source) throw new Error(insertErr?.message || 'Failed to create source')

            // Upload Word Doc to Storage
            const filePath = `${organization.id}/${source.id}.pdf`
            const { error: uploadErr } = await supabase.storage
                .from('knowledge-base')
                .upload(filePath, file, { contentType: 'application/pdf' })

            if (uploadErr) {
                // Clean up the DB row
                await supabase.from('knowledge_base_sources').delete().eq('id', source.id)
                throw new Error(uploadErr.message)
            }

            // Update source with file_path
            await supabase.from('knowledge_base_sources').update({ file_path: filePath }).eq('id', source.id)

            // Add to local state
            setSources(prev => [{ ...source, file_path: filePath } as KnowledgeBaseSource, ...prev])
            setProcessing(prev => ({ ...prev, [source.id]: true }))

            // Trigger processing
            callProcessFunction(source.id)

            toast.success(`${file.name} uploaded — processing...`)
        } catch (err: any) {
            toast.error(err.message || 'Upload failed')
        } finally {
            setUploadingPdf(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const handleAddUrl = async () => {
        if (!urlInput.trim() || !organization) return
        const trimmedUrl = urlInput.trim()

        // Basic URL validation
        try { new URL(trimmedUrl) } catch {
            toast.error('Please enter a valid URL (e.g. https://example.com/faq)')
            return
        }

        setAddingUrl(true)
        try {
            const displayName = urlName.trim() || trimmedUrl

            const { data: source, error } = await supabase
                .from('knowledge_base_sources')
                .insert({
                    organization_id: organization.id,
                    type: 'url',
                    name: displayName,
                    source_url: trimmedUrl,
                    status: 'processing',
                })
                .select()
                .single()

            if (error || !source) throw new Error(error?.message || 'Failed to add URL')

            setSources(prev => [source as KnowledgeBaseSource, ...prev])
            setProcessing(prev => ({ ...prev, [source.id]: true }))

            callProcessFunction(source.id)

            toast.success('URL added — extracting content...')
            setShowUrlModal(false)
            setUrlInput('')
            setUrlName('')
        } catch (err: any) {
            toast.error(err.message || 'Failed to add URL')
        } finally {
            setAddingUrl(false)
        }
    }

    const callProcessFunction = async (sourceId: string) => {
        try {
            const res = await fetch(`${SUPABASE_URL}/functions/v1/process-knowledge-source`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                },
                body: JSON.stringify({ source_id: sourceId }),
            })
            const data = await res.json()
            if (data.error) {
                toast.error(`Processing failed: ${data.error}`)
            }
        } catch (err: any) {
            console.error('Process function error:', err)
        }
    }

    const deleteSource = async (source: KnowledgeBaseSource) => {
        if (!confirm(`Delete "${source.name}"? This cannot be undone.`)) return
        try {
            // Delete from storage if PDF
            if (source.type === 'pdf' && source.file_path) {
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
        } catch {
            toast.error('Failed to retry')
        }
    }

    const totalReadyChars = sources
        .filter(s => s.status === 'ready' && s.raw_content)
        .reduce((sum, s) => sum + (s.raw_content?.length || 0), 0)

    const CHANNEL_LABELS: Record<string, string> = {
        whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram',
        widget: 'Web Widget', email: 'Email'
    }
    const CHANNEL_COLORS: Record<string, string> = {
        whatsapp: 'bg-green-500', facebook: 'bg-blue-500', instagram: 'bg-pink-500',
        widget: 'bg-violet-500', email: 'bg-orange-500'
    }

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
        )
    }

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

                    {/* How it works banner */}
                    <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 flex gap-3">
                        <Info className="w-5 h-5 text-violet-500 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-violet-800">
                            <p className="font-semibold mb-1">How AI Assistant works</p>
                            <p className="text-xs text-violet-700 leading-relaxed">
                                When AI is enabled for an inbox, every inbound message is answered automatically using your knowledge base.
                                If the AI cannot answer, the ticket is silently moved to <strong>Unassigned</strong> for your agents.
                                Agents can also manually take over any AI-handled conversation.
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
                                    No inboxes connected. Go to <strong>Inboxes</strong> to connect a channel first.
                                </div>
                            ) : (
                                inboxes.map(inbox => {
                                    const color = CHANNEL_COLORS[inbox.channel_type] || 'bg-gray-400'
                                    return (
                                        <div key={inbox.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-xl bg-white hover:border-gray-300 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', color)}>
                                                    <Bot className="w-4 h-4 text-white" />
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-sm text-gray-900">{inbox.name}</p>
                                                    <p className="text-xs text-gray-500">{CHANNEL_LABELS[inbox.channel_type]}</p>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => toggleInboxAI(inbox)}
                                                disabled={togglingInbox === inbox.id}
                                                className="flex items-center gap-2 transition-colors"
                                            >
                                                {togglingInbox === inbox.id ? (
                                                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                                                ) : inbox.ai_enabled ? (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-bold text-violet-700">ON</span>
                                                        <ToggleRight className="w-8 h-8 text-violet-600" />
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-medium text-gray-400">OFF</span>
                                                        <ToggleLeft className="w-8 h-8 text-gray-400" />
                                                    </div>
                                                )}
                                            </button>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>

                    {/* Knowledge Base */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <h2 className="font-bold text-gray-900">Knowledge Base</h2>
                            {totalReadyChars > 0 && (
                                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                                    ~{Math.round(totalReadyChars / 4).toLocaleString()} tokens ready
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-gray-500 mb-4">
                            Upload Word Docs or add URLs. AI will answer customer questions using this content only.
                        </p>

                        {/* Source list */}
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
                                <p className="text-sm font-semibold text-gray-600">No knowledge base yet</p>
                                <p className="text-xs text-gray-400 mt-1">Add PDFs or URLs for the AI to learn from</p>
                            </div>
                        )}

                        {/* Add buttons */}
                        <div className="flex gap-3">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                className="hidden"
                                onChange={handleFileUpload}
                            />
                            <Button
                                variant="outline"
                                className="flex-1 gap-2 rounded-xl h-11 font-semibold border-2"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploadingPdf}
                            >
                                {uploadingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                Upload Word Doc
                            </Button>
                            <Button
                                variant="outline"
                                className="flex-1 gap-2 rounded-xl h-11 font-semibold border-2"
                                onClick={() => setShowUrlModal(true)}
                            >
                                <Globe className="w-4 h-4" />
                                Add URL
                            </Button>
                        </div>

                        <p className="text-xs text-gray-400 mt-2 text-center">
                            Max 10MB per .docx · URLs must be publicly accessible · Word docs & FAQ pages work best
                        </p>
                    </div>

                </div>
            </div>

            {/* URL Modal */}
            {showUrlModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                <Globe className="w-4 h-4 text-violet-600" />
                                Add URL Source
                            </h3>
                            <button onClick={() => { setShowUrlModal(false); setUrlInput(''); setUrlName('') }} className="p-1.5 hover:bg-gray-100 rounded-lg">
                                <X className="w-4 h-4 text-gray-400" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1.5">URL</label>
                                <Input
                                    placeholder="https://yoursite.com/faq"
                                    value={urlInput}
                                    onChange={e => setUrlInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && !addingUrl && handleAddUrl()}
                                    className="rounded-xl h-11"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1.5">Display Name (optional)</label>
                                <Input
                                    placeholder="e.g. FAQ Page, Help Center"
                                    value={urlName}
                                    onChange={e => setUrlName(e.target.value)}
                                    className="rounded-xl h-11"
                                />
                            </div>
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                                <strong>Note:</strong> The URL must be publicly accessible (no login required). Works best with FAQ pages, help docs, and policy pages.
                            </div>
                            <div className="flex gap-3 pt-2">
                                <Button variant="outline" onClick={() => { setShowUrlModal(false); setUrlInput(''); setUrlName('') }} className="flex-1 rounded-xl h-11">
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleAddUrl}
                                    disabled={!urlInput.trim() || addingUrl}
                                    className="flex-1 rounded-xl h-11 bg-violet-600 hover:bg-violet-700 font-semibold"
                                >
                                    {addingUrl ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add URL'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ── Source Card Component ─────────────────────────────────────────────
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
            'flex items-center gap-3 p-4 border rounded-xl transition-colors',
            isReady ? 'border-gray-200 bg-white' : isFailed ? 'border-red-200 bg-red-50' : 'border-violet-200 bg-violet-50/50'
        )}>
            <div className={cn(
                'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                source.type === 'docx' ? 'bg-blue-100' : 'bg-green-100'
            )}>
                {source.type === 'docx'
                    ? <FileText className="w-4 h-4 text-blue-600" />
                    : <Globe className="w-4 h-4 text-green-600" />
                }
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{source.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                    {isProc && (
                        <span className="flex items-center gap-1 text-xs text-violet-600">
                            <Loader2 className="w-3 h-3 animate-spin" />Processing...
                        </span>
                    )}
                    {isReady && (
                        <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                            <CheckCircle className="w-3 h-3" />
                            Ready · {source.raw_content ? `~${Math.round(source.raw_content.length / 4).toLocaleString()} tokens` : ''}
                        </span>
                    )}
                    {isFailed && (
                        <span className="flex items-center gap-1 text-xs text-red-600">
                            <AlertCircle className="w-3 h-3" />
                            {source.error_message || 'Processing failed'}
                        </span>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
                {isFailed && (
                    <button onClick={onRetry} className="text-xs text-blue-600 hover:underline px-2 py-1 rounded-lg hover:bg-blue-50">
                        Retry
                    </button>
                )}
                {isProc && <Clock className="w-4 h-4 text-violet-400 animate-pulse" />}
                <button
                    onClick={onDelete}
                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}