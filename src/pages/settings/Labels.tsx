import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { Tag, Plus, Pencil, Trash2, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Label } from '@/types'

const PRESET_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E', '#14B8A6',
  '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#6B7280',
]

export default function Labels() {
  const { organization } = useAuth()
  const [labels, setLabels] = useState<Label[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Label | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', color: '#6366F1' })

  useEffect(() => { fetchLabels() }, [organization?.id])

  const fetchLabels = async () => {
    if (!organization) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('labels')
        .select('*')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      setLabels(data || [])
    } catch { toast.error('Failed to load labels') }
    finally { setLoading(false) }
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', color: '#6366F1' })
    setShowModal(true)
  }

  const openEdit = (l: Label) => {
    setEditing(l)
    setForm({ name: l.name, color: l.color })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      if (editing) {
        const { error } = await supabase
          .from('labels')
          .update({ name: form.name.trim(), color: form.color })
          .eq('id', editing.id)
        if (error) throw error
        setLabels(prev => prev.map(l => l.id === editing.id ? { ...l, name: form.name.trim(), color: form.color } : l))
        toast.success('Label updated')
      } else {
        const { data, error } = await supabase
          .from('labels')
          .insert({ organization_id: organization!.id, name: form.name.trim(), color: form.color })
          .select().single()
        if (error) throw error
        setLabels(prev => [...prev, data])
        toast.success('Label created')
      }
      setShowModal(false)
    } catch (err: any) { toast.error(err.message || 'Failed to save') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this label? It will be removed from all tickets.')) return
    setDeleting(id)
    try {
      const { error } = await supabase.from('labels').delete().eq('id', id)
      if (error) throw error
      setLabels(prev => prev.filter(l => l.id !== id))
      toast.success('Label deleted')
    } catch { toast.error('Failed to delete') }
    finally { setDeleting(null) }
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-8 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Tag className="w-5 h-5 text-gray-400" />
          <div>
            <h1 className="font-bold text-gray-900">Labels</h1>
            <p className="text-xs text-gray-500">{labels.length} label{labels.length !== 1 ? 's' : ''} · Organize and tag your tickets</p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-primary hover:bg-primary/90">
          <Plus className="w-4 h-4" />
          New Label
        </Button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-8">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : labels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Tag className="w-14 h-14 text-gray-200 mb-4" />
            <p className="font-semibold text-gray-700">No labels yet</p>
            <p className="text-sm text-gray-400 mt-1 mb-4">Create labels to organize and categorize tickets</p>
            <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" />Create First Label</Button>
          </div>
        ) : (
          <div className="max-w-2xl grid grid-cols-2 gap-3">
            {labels.map(label => (
              <div key={label.id} className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow group">
                <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: label.color }} />
                <p className="flex-1 font-semibold text-gray-800 text-sm truncate">{label.name}</p>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(label)} className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(label.id)} disabled={deleting === label.id} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    {deleting === label.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="font-bold text-gray-900">{editing ? 'Edit Label' : 'New Label'}</h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Name *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Urgent, Follow-up, VIP..."
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-2 block">Color</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setForm(f => ({ ...f, color: c }))}
                      className={`w-8 h-8 rounded-full transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={form.color}
                    onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                    className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer p-1"
                  />
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: form.color }} />
                    <span className="text-sm font-semibold" style={{ color: form.color }}>{form.name || 'Preview'}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !form.name.trim()} className="flex-1 bg-primary hover:bg-primary/90">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editing ? 'Save Changes' : 'Create Label')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}