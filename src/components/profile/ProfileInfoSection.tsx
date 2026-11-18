'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Loader2,
  MapPin,
  Save,
  Shield,
  User as UserIcon,
} from 'lucide-react'
import type { AuthUser } from '@/access/roles'
import { updateUserProfile } from '@/api/auth'
import { getRoleLabel } from '@/lib/user-display'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ProfileInfoSection({ user }: { user: AuthUser }) {
  const router = useRouter()

  const [fullName, setFullName] = useState(user.fullName ?? '')
  const [email, setEmail] = useState(user.email ?? '')
  const [organization, setOrganization] = useState(user.organization ?? '')
  const [territoryFocus, setTerritoryFocus] = useState(user.territoryFocus ?? '')
  const [profileSaved, setProfileSaved] = useState(false)

  const profileMutation = useMutation({
    mutationFn: () =>
      updateUserProfile(user.id, {
        fullName: fullName.trim(),
        email: email.trim(),
        organization: organization.trim(),
        territoryFocus: territoryFocus.trim(),
      }),
    onSuccess: () => {
      setProfileSaved(true)
      router.refresh()
    },
  })

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setProfileSaved(false)
    profileMutation.mutate()
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <UserIcon className="h-4 w-4 text-primary" />
          Informations du profil
        </CardTitle>
        <CardDescription>
          Mettez à jour vos coordonnées et votre territoire de référence.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleProfileSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="profile-fullname">Nom complet</Label>
            <Input
              id="profile-fullname"
              required
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value)
                setProfileSaved(false)
              }}
              placeholder="Jean Dupont"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-email">Adresse email</Label>
            <Input
              id="profile-email"
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setProfileSaved(false)
              }}
              placeholder="nom@organisation.fr"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-org" className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              Organisation
            </Label>
            <Input
              id="profile-org"
              value={organization}
              onChange={(e) => {
                setOrganization(e.target.value)
                setProfileSaved(false)
              }}
              placeholder="Métropole Aix-Marseille-Provence"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-territory" className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              Territoire de référence
            </Label>
            <Input
              id="profile-territory"
              value={territoryFocus}
              onChange={(e) => {
                setTerritoryFocus(e.target.value)
                setProfileSaved(false)
              }}
              placeholder="Aix-Marseille-Provence"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-muted-foreground" />
              Rôle
            </Label>
            <div className="flex h-9 items-center rounded-lg border bg-muted/50 px-3 text-sm text-muted-foreground">
              {getRoleLabel(user.role)}
            </div>
          </div>

          {profileMutation.isError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {profileMutation.error instanceof Error
                  ? profileMutation.error.message
                  : 'Impossible de mettre à jour le profil.'}
              </AlertDescription>
            </Alert>
          )}

          {profileSaved && (
            <Alert>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <AlertDescription>Profil mis à jour avec succès.</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={profileMutation.isPending}
          >
            {profileMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Enregistrer les modifications
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
