'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowRight,
  Building2,
  FileText,
  FolderPlus,
  History,
  Layers,
  Loader2,
} from 'lucide-react'
import { apiFetch, fetchDashboardStats, fetchProjects, queryKeys } from '@/lib/api'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function DashboardClient() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [commune, setCommune] = useState('Aix-en-Provence')
  const [codeInsee, setCodeInsee] = useState('13001')
  const [territory, setTerritory] = useState<'amp' | 'gpu'>('amp')
  const [description, setDescription] = useState('')

  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(24),
    queryFn: () => fetchProjects(24),
  })

  const statsQuery = useQuery({
    queryKey: queryKeys.dashboardStats,
    queryFn: fetchDashboardStats,
  })

  const createProjectMutation = useMutation({
    mutationFn: () =>
      apiFetch('/api/projects', {
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
      }),
    onSuccess: async () => {
      setName('')
      setDescription('')
      setShowForm(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats }),
      ])
    },
  })

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    createProjectMutation.mutate()
  }

  const projects = projectsQuery.data?.docs ?? []
  const stats = statsQuery.data ?? { projects: 0, analyses: 0, snapshots: 0, documents: 0 }

  const kpiCards = [
    { label: 'Projets', value: stats.projects, icon: Building2, iconColor: 'text-primary' },
    { label: 'Analyses PLU', value: stats.analyses, icon: Layers, iconColor: 'text-indigo-600' },
    {
      label: 'Snapshots immuables',
      value: stats.snapshots,
      icon: History,
      iconColor: 'text-emerald-600',
    },
    { label: 'Documents PLU', value: stats.documents, icon: FileText, iconColor: 'text-amber-600' },
  ]

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Tableau de bord — Études de Faisabilité PLU
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Métropole Aix-Marseille-Provence & Géoportail de l&apos;Urbanisme · Traçabilité
            historique complète sur Payload CMS
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => setShowForm((v) => !v)}>
            <FolderPlus className="h-4 w-4 text-primary" />
            Nouveau projet
          </Button>
          <Button asChild>
            <Link href="/workspace">
              Lancer une analyse PLU
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon
          return (
            <Card key={kpi.label}>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardDescription className="text-xs font-semibold uppercase tracking-wide">
                  {kpi.label}
                </CardDescription>
                <Icon className={`h-4 w-4 ${kpi.iconColor}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">
                  {statsQuery.isLoading ? '—' : kpi.value}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Create Project Drawer */}
      {showForm && (
        <Card className="rounded-2xl border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">Créer un projet de faisabilité</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="proj-name">Nom du projet *</Label>
                  <Input
                    id="proj-name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Îlot Joliette — Bureaux & Logements"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="proj-commune">Commune *</Label>
                  <Input
                    id="proj-commune"
                    required
                    value={commune}
                    onChange={(e) => setCommune(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="proj-insee">Code INSEE *</Label>
                  <Input
                    id="proj-insee"
                    required
                    value={codeInsee}
                    onChange={(e) => setCodeInsee(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="proj-territory">Territoire</Label>
                  <Select
                    value={territory}
                    onValueChange={(v) => setTerritory(v as 'amp' | 'gpu')}
                  >
                    <SelectTrigger id="proj-territory">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="amp">Métropole Aix-Marseille-Provence</SelectItem>
                      <SelectItem value="gpu">National GPU</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-3">
                  <Label htmlFor="proj-desc">Description</Label>
                  <Input
                    id="proj-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Contexte urbain, programme envisagé..."
                  />
                </div>
              </div>

              {createProjectMutation.isError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {createProjectMutation.error instanceof Error
                      ? createProjectMutation.error.message
                      : 'Impossible de créer le projet'}
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                  Annuler
                </Button>
                <Button type="submit" size="sm" disabled={createProjectMutation.isPending}>
                  {createProjectMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Enregistrer le projet
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Projects List */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-foreground">Projets actifs</h2>
        {projectsQuery.isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement des projets...
            </CardContent>
          </Card>
        ) : projectsQuery.isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {projectsQuery.error instanceof Error
                ? projectsQuery.error.message
                : 'Impossible de charger les projets.'}
            </AlertDescription>
          </Alert>
        ) : projects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              Aucun projet trouvé. Créez votre premier projet ci-dessus.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <Card
                key={p.id}
                className="flex flex-col justify-between transition hover:border-primary/40"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="info" className="text-[11px] uppercase">
                      {p.territory === 'amp' ? 'Métropole AMP' : 'GPU National'}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      INSEE {p.codeInsee}
                    </span>
                  </div>
                  <CardTitle className="pt-2 text-base">{p.name}</CardTitle>
                  <CardDescription className="text-xs font-medium">{p.commune}</CardDescription>
                </CardHeader>

                {p.description && (
                  <CardContent className="pt-0">
                    <p className="line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                  </CardContent>
                )}

                <CardFooter className="mt-auto justify-between border-t pt-3">
                  <span className="text-[11px] text-muted-foreground">
                    Maj {new Date(p.updatedAt).toLocaleDateString('fr-FR')}
                  </span>
                  <Button variant="link" size="sm" asChild className="h-auto p-0 text-xs">
                    <Link href={`/workspace?projectId=${p.id}`}>
                      Ouvrir l&apos;espace PLU
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
