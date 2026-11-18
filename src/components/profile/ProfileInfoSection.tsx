'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Save,
  User as UserIcon,
} from 'lucide-react'
import type { AuthUser } from '@/access/roles'
import { updateUserProfile } from '@/api/auth'
import { FormBuilder } from '@/components/shared/form-builder'
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
import { useProfileInfoFormStructure } from '@/hooks/forms/useProfileInfoFormStructure'
import { useProfileStore } from '@/hooks/stores/useProfileStore'
import { updateProfileSchema, validateForm } from '@/validations'

export function ProfileInfoSection({ user }: { user: AuthUser }) {
  const router = useRouter()
  const profileStore = useProfileStore()
  const [profileSaved, setProfileSaved] = useState(false)

  useEffect(() => {
    profileStore.set('updateDto', {
      fullName: user.fullName ?? '',
      email: user.email ?? '',
      organization: user.organization ?? '',
      territoryFocus: user.territoryFocus ?? '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, user.fullName, user.email, user.organization, user.territoryFocus])

  const { profileInfoFormStructure } = useProfileInfoFormStructure({
    profileStore,
    roleLabel: getRoleLabel(user.role),
    onFieldChange: () => setProfileSaved(false),
  })

  const profileMutation = useMutation({
    mutationFn: () =>
      updateUserProfile(user.id, {
        fullName: profileStore.updateDto.fullName.trim(),
        email: profileStore.updateDto.email.trim(),
        organization: profileStore.updateDto.organization.trim(),
        territoryFocus: profileStore.updateDto.territoryFocus.trim(),
      }),
    onSuccess: () => {
      setProfileSaved(true)
      router.refresh()
    },
  })

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setProfileSaved(false)
    const result = validateForm(updateProfileSchema, profileStore.updateDto)
    if (!result.success) {
      profileStore.set('updateDtoErrors', result.errors)
      return
    }
    profileStore.set('updateDtoErrors', {})
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
          <FormBuilder structure={profileInfoFormStructure} />

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
