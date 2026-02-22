import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { MessageSquare, Plus, Pencil, Trash2, X, Loader2, Search, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { CannedResponse } from '@/types'

export default function CannedResponses() {
  const { organization, profile } = useAuth()
  const [responses, setResponses] = useState<CannedResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<CannedResponse | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', content: '', shortcut: '' })

  useEffect(() => { fetchResponses() }, [organization?.id])

  const fetchResponses = async () => {
    if (!organization) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('canned_responses')
        .select('*')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      setResponses(data || [])
    } catch { toast.error('Failed to load canned responses') }
    finally { setLoading(false) }
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ title: '', content: '', shortcut: '' })
    setShowModal(true)
  }

  const openEdit = (r: CannedResponse) => {
    setEditing(r)
    setForm({ title: r.title, content: r.content, shortcut: r.shortcut || '' })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      toast.error('Title and content are required')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        const { error } = await supabase
          .from('canned_responses')
          .update({ title: form.title.trim(), content: form.content.trim(), shortcut: form.shortcut.trim() || null, updated_at: new Date().toISOString() })
          .eq('id', editing.id)
        if (error) throw error
        setResponses(prev => prev.map(r => r.id === editing.id ? { ...r, ...form } : r))
        toast.success('Response updated')
      } else {
        const { data, error } = await supabase
          .from('canned_responses')
          .insert({ organization_id: organization!.id, created_by: profile?.id, title: form.title.trim(), content: form.content.trim(), shortcut: form.shortcut.trim() || null })
          .select().single()
        if (error) throw error
        setResponses(prev => [data, ...prev])
        toast.success('Response created')
      }
      setShowModal(false)
    } catch (err: any) { toast.error(err.message || 'Failed to save') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this canned response?')) return
    setDeleting(id)
    try {
      const { error } = await supabase.from('canned_responses').delete().eq('id', id)
      if (error) throw error
      setResponses(prev => prev.filter(r => r.id !== id))
      toast.success('Deleted')
    } catch { toast.error('Failed to delete') }
    finally { setDeleting(null) }
  }

  const filtered = responses.filter(r =>
    !search || r.title.toLowerCase().includes(search.toLowerCase()) ||
    r.content.toLowerCase().includes(search.toLowerCase()) ||
    (r.shortcut || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-8 flex-shrink-0">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-5 h-5 text-gray-400" />
          <div>
            <h1 className="font-bold text-gray-900">Canned Responses</h1>
            <p className="text-xs text-gray-500">{responses.length} saved response{responses.length !== 1 ? 's' : ''} · Use / in chat to trigger</p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-primary hover:bg-primary/90">
          <Plus className="w-4 h-4" />
          New Response
        </Button>
      </div>

      {/* Search */}
      <div className="px-8 py-4 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by title, shortcut or content..."
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-8">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <MessageSquare className="w-14 h-14 text-gray-200 mb-4" />
            <p className="font-semibold text-gray-700">{search ? 'No matches found' : 'No canned responses yet'}</p>
            <p className="text-sm text-gray-400 mt-1 mb-4">
              {search ? 'Try a different search' : 'Create reusable templates to reply faster'}
            </p>
            {!search && <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" />Create First Response</Button>}
          </div>
        ) : (
          <div className="max-w-3xl space-y-3">
            {filtered.map(r => (
              <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow group">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-gray-900 text-sm">{r.title}</p>
                      {r.shortcut && (
                        <span className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">
                          <Zap className="w-3 h-3" />/{r.shortcut}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 line-clamp-2">{r.content}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => openEdit(r)} className="p-2 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(r.id)} disabled={deleting === r.id} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      {deleting === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="font-bold text-gray-900">{editing ? 'Edit Response' : 'New Canned Response'}</h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Title *</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Greeting, Order Delay Apology..."
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1.5 block">
                  Shortcut <span className="font-normal text-gray-400">(optional — type /shortcut in chat)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">/</span>
                  <input
                    value={form.shortcut}
                    onChange={e => setForm(f => ({ ...f, shortcut: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '') }))}
                    placeholder="greeting"
                    className="w-full pl-6 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Content *</label>
                <textarea
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  placeholder="Type the response message..."
                  rows={5}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">{form.content.length} characters</p>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !form.title.trim() || !form.content.trim()} className="flex-1 bg-primary hover:bg-primary/90">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editing ? 'Save Changes' : 'Create Response')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
