import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Settings } from 'lucide-react'

export default function OrgSettings() {
  const { organization } = useAuth()
  const [name, setName] = useState(organization?.name || '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!organization) return
    setSaving(true)
    try {
      const { error } = await supabase.from('organizations').update({ name }).eq('id', organization.id)
      if (error) throw error
      toast.success('Settings saved')
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="h-14 border-b border-border flex items-center px-6 gap-3">
        <Settings className="w-4 h-4 text-muted-foreground" />
        <span className="font-semibold">General Settings</span>
      </div>
      <div className="p-6 max-w-lg space-y-5">
        <div className="space-y-1.5">
          <Label>Organization Name</Label>
          <Input value={name} onChange={e => setName(e.target.value)} />
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}