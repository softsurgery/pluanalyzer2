'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, KeyRound, Loader2 } from 'lucide-react'

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
    <div className="mx-auto mt-12 max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white">
          <Building2 className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Connexion PLU Analyzer</h1>
          <p className="text-xs text-slate-500">Authentification sécurisée via Payload CMS</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Mot de passe
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          Se connecter
        </button>
      </form>

      <div className="mt-6 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
        <div className="font-semibold text-slate-700">Comptes de démonstration (seed) :</div>
        <div className="mt-1 space-y-0.5 font-mono text-[11px]">
          <div>Urbaniste : planner@pluanalyzer.fr / PluPlanner2026!</div>
          <div>Admin : admin@pluanalyzer.fr / PluAdmin2026!</div>
          <div>Viewer : viewer@pluanalyzer.fr / PluViewer2026!</div>
        </div>
      </div>
    </div>
  )
}
