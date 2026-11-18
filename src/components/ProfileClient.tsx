'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  KeyRound,
  Loader2,
  MapPin,
  Save,
  Shield,
  User as UserIcon,
} from 'lucide-react'
import type { AuthUser } from '@/access/roles'
import { updateUserProfile } from '@/api/auth'
import { getRoleLabel, getUserInitials } from '@/lib/user-display'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
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
import { Separator } from '@/components/ui/separator'

export function ProfileClient({ user }: { user: AuthUser }) {
  const router = useRouter()

  const [fullName, setFullName] = useState(user.fullName ?? '')
  const [email, setEmail] = useState(user.email ?? '')
  const [organization, setOrganization] = useState(user.organization ?? '')
  const [territoryFocus, setTerritoryFocus] = useState(user.territoryFocus ?? '')
  const [profileSaved, setProfileSaved] = useState(false)

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSaved, setPasswordSaved] = useState(false)

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

  const passwordMutation = useMutation({
    mutationFn: (newPassword: string) =>
      updateUserProfile(user.id, { password: newPassword }),
    onSuccess: () => {
      setPassword('')
      setConfirmPassword('')
      setPasswordError(null)
      setPasswordSaved(true)
    },
  })

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setProfileSaved(false)
    profileMutation.mutate()
  }

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordSaved(false)
    setPasswordError(null)

    if (password.length < 8) {
      setPasswordError('Le mot de passe doit contenir au moins 8 caractères.')
      return
    }
    if (password !== confirmPassword) {
      setPasswordError('Les mots de passe ne correspondent pas.')
      return
    }

    passwordMutation.mutate(password)
  }

  const initials = getUserInitials(fullName || user.fullName, email || user.email)
  const displayName = fullName || user.fullName || user.email || 'Utilisateur'

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 border-2 border-primary/20">
            <AvatarFallback className="bg-primary/10 text-lg font-bold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{displayName}</h1>
              {user.role && (
                <Badge variant="secondary" className="uppercase text-[11px]">
                  {getRoleLabel(user.role)}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {email || user.email}
              {organization ? ` · ${organization}` : ''}
            </p>
          </div>
        </div>
      </div>

      <Separator />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
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
                  <AlertDescription>
                    Profil mis à jour avec succès.
                  </AlertDescription>
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

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <KeyRound className="h-4 w-4 text-primary" />
              Sécurité & Mot de passe
            </CardTitle>
            <CardDescription>
              Modifiez votre mot de passe de connexion à la plateforme.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="profile-password">Nouveau mot de passe</Label>
                <Input
                  id="profile-password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setPasswordError(null)
                    setPasswordSaved(false)
                  }}
                  placeholder="Minimum 8 caractères"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="profile-confirm-password">
                  Confirmer le mot de passe
                </Label>
                <Input
                  id="profile-confirm-password"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value)
                    setPasswordError(null)
                    setPasswordSaved(false)
                  }}
                  placeholder="Répétez le mot de passe"
                />
              </div>

              {(passwordError || passwordMutation.isError) && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {passwordError ??
                      (passwordMutation.error instanceof Error
                        ? passwordMutation.error.message
                        : 'Impossible de modifier le mot de passe.')}
                  </AlertDescription>
                </Alert>
              )}

              {passwordSaved && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <AlertDescription>
                    Mot de passe modifié avec succès.
                  </AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                variant="outline"
                className="w-full"
                disabled={passwordMutation.isPending}
              >
                {passwordMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                Mettre à jour le mot de passe
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
