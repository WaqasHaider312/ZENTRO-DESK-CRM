import { Settings } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function OrgSettings() {
  const { organization, profile } = useAuth()

  return (
    <div className="flex-1 flex flex-col">
      <div className="h-14 border-b border-border flex items-center px-6 gap-3">
        <Settings className="w-4 h-4 text-muted-foreground" />
        <span className="font-semibold">General Settings</span>
      </div>
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-lg space-y-8">
          {/* Org settings */}
          <div>
            <h3 className="font-semibold mb-4">Organization</h3>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Organization Name</Label>
                <Input defaultValue={organization?.name} />
              </div>
              <div className="space-y-1.5">
                <Label>Website</Label>
                <Input defaultValue={organization?.website || ''} placeholder="https://yourcompany.com" />
              </div>
              <Button size="sm">Save Changes</Button>
            </div>
          </div>

          {/* Profile */}
          <div>
            <h3 className="font-semibold mb-4">Your Profile</h3>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Full Name</Label>
                <Input defaultValue={profile?.full_name} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input defaultValue={profile?.email} disabled />
              </div>
              <Button size="sm">Update Profile</Button>
            </div>
          </div>

          {/* Plan info */}
          <div>
            <h3 className="font-semibold mb-4">Plan & Billing</h3>
            <div className="p-4 border border-border rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium capitalize">{organization?.plan} Plan</p>
                  {organization?.plan === 'trial' && organization.trial_ends_at && (
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Trial ends {new Date(organization.trial_ends_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <Button variant="outline" size="sm">Upgrade</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
