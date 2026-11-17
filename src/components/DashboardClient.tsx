'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Building2, FileText, FolderPlus, History, Layers, Loader2 } from 'lucide-react'

interface ProjectItem {
  id: number | string
  name: string
  commune: string
  codeInsee: string
  territory?: string | null
  status?: string | null
  description?: string | null
  updatedAt: string
}

interface DashboardClientProps {
  projects: ProjectItem[]
  stats: {
    projects: number
    analyses: number
    snapshots: number
    documents: number
  }
}

export function DashboardClient({ projects, stats }: DashboardClientProps) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [commune, setCommune] = useState('Aix-en-Provence')
  const [codeInsee, setCodeInsee] = useState('13001')
  const [territory, setTerritory] = useState<'amp' | 'gpu'>('amp')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          commune,
          codeInsee,
          territory,
          description,
          status: 'active',
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.errors?.[0]?.message || 'Impossible de créer le projet')
        return
      }
      setName('')
      setDescription('')
      setShowForm(false)
      router.refresh()
    } catch {
      setError('Erreur réseau')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Tableau de bord — Études de Faisabilité PLU
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Métropole Aix-Marseille-Provence & Géoportail de l&apos;Urbanisme · Traçabilité
            historique complète sur Payload CMS
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <FolderPlus className="h-4 w-4 text-blue-600" />
            Nouveau projet
          </button>
          <Link
            href="/workspace"
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            Lancer une analyse PLU
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
            Projets
            <Building2 className="h-4 w-4 text-blue-600" />
          </div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{stats.projects}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
            Analyses PLU
            <Layers className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{stats.analyses}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
            Snapshots immuables
            <History className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{stats.snapshots}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
            Documents PLU
            <FileText className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{stats.documents}</div>
        </div>
      </div>

      {/* Create Project Drawer */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-2xl border border-blue-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-base font-bold text-slate-900">Créer un projet de faisabilité</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Nom du projet *
              </label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Îlot Joliette — Bureaux & Logements"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Commune *</label>
              <input
                required
                value={commune}
                onChange={(e) => setCommune(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Code INSEE *
              </label>
              <input
                required
                value={codeInsee}
                onChange={(e) => setCodeInsee(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Territoire</label>
              <select
                value={territory}
                onChange={(e) => setTerritory(e.target.value as 'amp' | 'gpu')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="amp">Métropole Aix-Marseille-Provence</option>
                <option value="gpu">National GPU</option>
              </select>
            </div>
            <div className="sm:col-span-3">
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Description
              </label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Contexte urbain, programme envisagé..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={creating}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Enregistrer le projet
            </button>
          </div>
        </form>
      )}

      {/* Projects List */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Projets actifs</h2>
        {projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            Aucun projet trouvé. Créez votre premier projet ci-dessus.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <div
                key={p.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase text-blue-700">
                      {p.territory === 'amp' ? 'Métropole AMP' : 'GPU National'}
                    </span>
                    <span className="text-xs font-mono text-slate-500">INSEE {p.codeInsee}</span>
                  </div>
                  <h3 className="mt-3 text-base font-bold text-slate-900">{p.name}</h3>
                  <p className="mt-1 text-xs font-medium text-slate-500">{p.commune}</p>
                  {p.description && (
                    <p className="mt-2 line-clamp-2 text-xs text-slate-600">{p.description}</p>
                  )}
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-[11px] text-slate-400">
                    Maj {new Date(p.updatedAt).toLocaleDateString('fr-FR')}
                  </span>
                  <Link
                    href={`/workspace?projectId=${p.id}`}
                    className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                  >
                    Ouvrir l&apos;espace PLU
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
