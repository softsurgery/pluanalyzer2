'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from 'lucide-react'
import { updateUserProfile } from '@/api/auth'
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

export function ProfileSecuritySection({ userId }: { userId: string | number }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSaved, setPasswordSaved] = useState(false)

  const passwordMutation = useMutation({
    mutationFn: (newPassword: string) =>
      updateUserProfile(userId, { password: newPassword }),
    onSuccess: () => {
      setPassword('')
      setConfirmPassword('')
      setPasswordError(null)
      setPasswordSaved(true)
    },
  })

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
  )
}
