import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Settings, Building, Loader2 } from 'lucide-react'

export default function OrgSettings() {
  const { organization } = useAuth()
  const [name, setName] = useState(organization?.name || '')
  const [website, setWebsite] = useState(organization?.website || '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!organization) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ name: name.trim(), website: website.trim() })
        .eq('id', organization.id)
      if (error) throw error
      toast.success('Settings saved')
    } catch { toast.error('Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="h-16 border-b border-gray-200 bg-white flex items-center px-8 gap-3 flex-shrink-0">
        <Settings className="w-5 h-5 text-gray-400" />
        <div>
          <h1 className="font-bold text-gray-900">General Settings</h1>
          <p className="text-xs text-gray-500">Manage your organization details</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-lg space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Building className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Organization Details</h2>
                <p className="text-xs text-gray-500">Update your organization information</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Organization Name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Website <span className="font-normal text-gray-400">(optional)</span></label>
                <input
                  value={website}
                  onChange={e => setWebsite(e.target.value)}
                  placeholder="https://yourcompany.com"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Plan</label>
                <div className="px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-600 capitalize">
                  {organization?.plan || 'trial'}
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100">
              <Button onClick={save} disabled={saving} className="bg-primary hover:bg-primary/90">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</> : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}