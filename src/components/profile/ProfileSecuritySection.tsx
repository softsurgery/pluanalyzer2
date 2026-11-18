'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from 'lucide-react'
import { updateUserProfile } from '@/api/auth'
import { FormBuilder } from '@/components/shared/form-builder'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useProfileSecurityFormStructure } from '@/hooks/forms/useProfileSecurityFormStructure'
import { useProfileStore } from '@/hooks/stores/useProfileStore'
import { updatePasswordSchema, validateForm } from '@/validations'

export function ProfileSecuritySection({ userId }: { userId: string | number }) {
  const profileStore = useProfileStore()
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSaved, setPasswordSaved] = useState(false)

  const { profileSecurityFormStructure } = useProfileSecurityFormStructure({
    profileStore,
    onFieldChange: () => {
      setPasswordError(null)
      setPasswordSaved(false)
    },
  })

  const passwordMutation = useMutation({
    mutationFn: (newPassword: string) =>
      updateUserProfile(userId, { password: newPassword }),
    onSuccess: () => {
      profileStore.set('passwordDto', { password: '', confirmPassword: '' })
      profileStore.set('passwordDtoErrors', {})
      setPasswordError(null)
      setPasswordSaved(true)
    },
  })

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordSaved(false)
    setPasswordError(null)

    const result = validateForm(updatePasswordSchema, profileStore.passwordDto)
    if (!result.success) {
      profileStore.set('passwordDtoErrors', result.errors)
      const firstError = Object.values(result.errors)[0]?.[0] ?? null
      setPasswordError(firstError)
      return
    }

    profileStore.set('passwordDtoErrors', {})
    passwordMutation.mutate(result.data.password)
  }

  return (
    <Card className="max-w-2xl">
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
          <FormBuilder structure={profileSecurityFormStructure} />

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
  )
}
