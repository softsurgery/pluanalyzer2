'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Building2, KeyRound, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function LoginPanel() {
  const router = useRouter()
  const [email, setEmail] = useState('planner@pluanalyzer.fr')
  const [password, setPassword] = useState('PluPlanner2026!')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.errors?.[0]?.message || 'Identifiants invalides')
        return
      }
      router.refresh()
    } catch {
      setError('Erreur réseau lors de la connexion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="mx-auto mt-12 max-w-md rounded-2xl">
      <CardHeader className="flex-row items-center gap-3 space-y-0 pb-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Building2 className="h-6 w-6" />
        </div>
        <div>
          <CardTitle className="text-xl">Connexion PLU Analyzer</CardTitle>
          <CardDescription className="text-xs">
            Authentification sécurisée via Payload CMS
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="login-email" className="uppercase tracking-wide">
              Email
            </Label>
            <Input
              id="login-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="login-password" className="uppercase tracking-wide">
              Mot de passe
            </Label>
            <Input
              id="login-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            Se connecter
          </Button>
        </form>
      </CardContent>

      <CardFooter>
        <div className="w-full rounded-xl bg-muted p-3 text-xs text-muted-foreground">
          <div className="font-semibold text-foreground">Comptes de démonstration (seed) :</div>
          <div className="mt-1 space-y-0.5 font-mono text-[11px]">
            <div>Urbaniste : planner@pluanalyzer.fr / PluPlanner2026!</div>
            <div>Admin : admin@pluanalyzer.fr / PluAdmin2026!</div>
            <div>Viewer : viewer@pluanalyzer.fr / PluViewer2026!</div>
          </div>
        </div>
      </CardFooter>
    </Card>
  )
}
