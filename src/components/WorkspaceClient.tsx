'use client'

import { useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Code2,
  Download,
  FileText,
  GitCompare,
  History,
  Layers,
  Loader2,
  Play,
  RotateCcw,
  Search,
  Settings,
  Trash2,
} from 'lucide-react'
import { ParcelMap } from './ParcelMap'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export interface SnapshotRecord {
  id: number | string
  snapshotLabel: string
  version: number
  zoneCode?: string | null
  validationStatus?: string | null
  originalPrompt: string
  addressQuery?: string | null
  cadastralReferences?: Record<string, unknown> | null
  geocodingResult?: Record<string, unknown> | null
  zoningAndGis?: Record<string, unknown> | null
  extractedArticles?: Array<{ articleNumber: string; title: string; content: string }> | null
  regulatoryInterpretation?: Record<string, unknown> | null
  validationReport?: Record<string, unknown> | null
  constructibilityCalculations?: Record<string, unknown> | null
  archicadExport?: Record<string, unknown> | null
  executionLogs?: Array<{ step: string; status: string; durationMs: number; message: string }> | null
  executionErrors?: Array<{ step: string; error: string }> | null
  createdAt: string
}

export interface ParcelRecord {
  id: number | string
  idu: string
  commune?: string | null
  codeInsee: string
  section: string
  numero: string
  surfaceM2?: number | null
  address?: string | null
  centroid?: { lng?: number | null; lat?: number | null } | null
  geometry?: unknown
}

interface ProjectSummary {
  id: number | string
  name: string
  commune: string
  codeInsee: string
  territory?: string | null
  status?: string | null
  description?: string | null
}

interface WorkspaceClientProps {
  projects: ProjectSummary[]
  parcels: ParcelRecord[]
  snapshots: SnapshotRecord[]
  initialProjectId?: string
  initialTab?: string
  userRole?: string
}

type TabKey = 'constructibility' | 'regulations' | 'history' | 'compare' | 'json' | 'settings'

const VALID_TABS: readonly TabKey[] = [
  'constructibility',
  'regulations',
  'history',
  'compare',
  'json',
  'settings',
]

function resolveTabKey(tab?: string): TabKey {
  return VALID_TABS.includes(tab as TabKey) ? (tab as TabKey) : 'constructibility'
}

const AUTO_PARCEL_VALUE = '__auto__'

export function WorkspaceClient({
  projects,
  parcels,
  snapshots: initialSnapshots,
  initialProjectId,
  initialTab,
  userRole,
}: WorkspaceClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>(initialSnapshots)
  const [activeSnapshot, setActiveSnapshot] = useState<SnapshotRecord | null>(
    initialSnapshots[0] || null,
  )
  const [activeTab, setActiveTab] = useState<TabKey>(() => resolveTabKey(initialTab))

  const handleTabChange = (nextTab: TabKey) => {
    setActiveTab(nextTab)
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', nextTab)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  // Form state
  const [projectId, setProjectId] = useState<string>(
    initialProjectId || (projects[0] ? String(projects[0].id) : ''),
  )
  const [address, setAddress] = useState('12 Avenue Sextius, Aix-en-Provence')
  const [idu, setIdu] = useState('')
  const [selectedParcelId, setSelectedParcelId] = useState<string>(
    parcels[0] ? String(parcels[0].id) : '',
  )
  const [prompt, setPrompt] = useState(
    'Analyser la constructibilité maximale (emprise, hauteur, SDP, stationnement) pour un bâtiment mixte R+3.',
  )

  // Live lookup & execution state
  const [lookupLoading, setLookupLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [replayingId, setReplayingId] = useState<string | number | null>(null)
  const [statusBanner, setStatusBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  )

  // Map preview state
  const [mapPreview, setMapPreview] = useState<{
    centroid?: { lng?: number | null; lat?: number | null } | null
    geometry?: unknown
    label?: string
    zoneCode?: string
  }>(() => {
    const p = parcels[0]
    return {
      centroid: p?.centroid,
      geometry: p?.geometry,
      label: p ? `${p.idu} (${p.surfaceM2 ?? '?'} m²)` : undefined,
      zoneCode: initialSnapshots[0]?.zoneCode || undefined,
    }
  })

  // Comparison state
  const [compareA, setCompareA] = useState<string>(
    initialSnapshots[0] ? String(initialSnapshots[0].id) : '',
  )
  const [compareB, setCompareB] = useState<string>(
    initialSnapshots[1]
      ? String(initialSnapshots[1].id)
      : initialSnapshots[0]
        ? String(initialSnapshots[0].id)
        : '',
  )
  const [compareResult, setCompareResult] = useState<Record<string, unknown> | null>(null)
  const [comparing, setComparing] = useState(false)

  // JSON inspector section
  const [jsonSection, setJsonSection] = useState<'snapshot' | 'archicad' | 'gis' | 'logs'>(
    'snapshot',
  )

  // Project deletion state
  const [deletingProject, setDeletingProject] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const currentProject = projects.find((p) => String(p.id) === projectId) || null
  const canDeleteProject = userRole !== 'viewer'

  const handleParcelLookup = async () => {
    setLookupLoading(true)
    setStatusBanner(null)
    try {
      const params = new URLSearchParams()
      if (idu.trim()) params.set('idu', idu.trim())
      else if (address.trim()) params.set('address', address.trim())

      const res = await fetch(`/api/plu/parcel-lookup?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) {
        setStatusBanner({ type: 'err', text: data.error || 'Erreur lors de la localisation IGN' })
        return
      }
      if (data.parcel?.status === 'ok') {
        setMapPreview({
          centroid: data.parcel.centroid,
          geometry: data.parcel.geometry,
          label: `${data.parcel.idu} (${data.parcel.surfaceM2 ?? '?'} m²)`,
          zoneCode: data.gpu?.zoneCode,
        })
        if (data.parcel.idu) setIdu(data.parcel.idu)
        setStatusBanner({
          type: 'ok',
          text: `Parcelle localisée : ${data.parcel.idu} · Surface ${data.parcel.surfaceM2 ?? '?'} m² · Zone GPU : ${data.gpu?.zoneCode || 'non détectée'}`,
        })
      } else if (data.geocoding?.coordinates) {
        setMapPreview({
          centroid: data.geocoding.coordinates,
          label: data.geocoding.label,
          zoneCode: data.gpu?.zoneCode,
        })
        setStatusBanner({
          type: 'ok',
          text: `Adresse géocodée (${data.geocoding.label}), parcelle cadastrale non retournée par IGN.`,
        })
      } else {
        setStatusBanner({ type: 'err', text: 'Aucune parcelle trouvée pour cette recherche.' })
      }
    } catch {
      setStatusBanner({ type: 'err', text: 'Erreur réseau lors de la requête IGN.' })
    } finally {
      setLookupLoading(false)
    }
  }

  const handleRunAnalysis = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId) return
    setAnalyzing(true)
    setStatusBanner(null)
    try {
      const res = await fetch('/api/plu/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: Number(projectId),
          prompt,
          address: address.trim() || undefined,
          idu: idu.trim() || undefined,
          parcelId: !idu.trim() && selectedParcelId ? Number(selectedParcelId) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStatusBanner({ type: 'err', text: data.error || "Échec de l'analyse PLU" })
        return
      }
      const newSnap = data.snapshot as SnapshotRecord
      setSnapshots((prev) => [newSnap, ...prev])
      setActiveSnapshot(newSnap)
      setStatusBanner({
        type: 'ok',
        text: `Analyse enregistrée : ${newSnap.snapshotLabel} (historique immuable mis à jour).`,
      })
      router.refresh()
    } catch {
      setStatusBanner({ type: 'err', text: "Erreur réseau lors de l'exécution du pipeline." })
    } finally {
      setAnalyzing(false)
    }
  }

  const handleReplay = async (snapshotId: number | string) => {
    setReplayingId(snapshotId)
    setStatusBanner(null)
    try {
      const res = await fetch('/api/plu/replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStatusBanner({ type: 'err', text: data.error || 'Échec du replay' })
        return
      }
      const newSnap = data.snapshot as SnapshotRecord
      setSnapshots((prev) => [newSnap, ...prev])
      setActiveSnapshot(newSnap)
      setStatusBanner({
        type: 'ok',
        text: `Replay terminé : nouveau snapshot ${newSnap.snapshotLabel} créé sans écraser l'historique.`,
      })
      router.refresh()
    } finally {
      setReplayingId(null)
    }
  }

  const handleCompare = async () => {
    if (!compareA || !compareB) return
    setComparing(true)
    try {
      const res = await fetch(`/api/plu/compare?snapshotA=${compareA}&snapshotB=${compareB}`)
      const data = await res.json()
      setCompareResult(data)
    } finally {
      setComparing(false)
    }
  }

  const handleDeleteProject = async () => {
    if (!currentProject) return
    setDeletingProject(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/projects/${currentProject.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setDeleteError(
          data?.errors?.[0]?.message || 'Impossible de supprimer le projet (droits insuffisants).',
        )
        return
      }
      router.push('/')
      router.refresh()
    } catch {
      setDeleteError('Erreur réseau lors de la suppression du projet.')
    } finally {
      setDeletingProject(false)
    }
  }

  const calc = (activeSnapshot?.constructibilityCalculations || {}) as Record<string, unknown>
  const interp = (activeSnapshot?.regulatoryInterpretation || {}) as Record<string, unknown>
  const rules = (interp.rules || {}) as Record<string, unknown>
  const valReport = (activeSnapshot?.validationReport || {}) as Record<string, unknown>

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      {/* Top Control Panel */}
      <Card className="rounded-2xl">
        <CardContent className="p-5">
          <form onSubmit={handleRunAnalysis} className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-12">
              <div className="space-y-1.5 lg:col-span-3">
                <Label htmlFor="ws-project">Projet</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger id="ws-project">
                    <SelectValue placeholder="Sélectionner un projet" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name} ({p.codeInsee})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 lg:col-span-4">
                <Label htmlFor="ws-address">Adresse française (BAN / Géoplateforme)</Label>
                <Input
                  id="ws-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Ex: 12 Avenue Sextius, Aix-en-Provence"
                />
              </div>

              <div className="space-y-1.5 lg:col-span-3">
                <Label htmlFor="ws-idu">IDU Cadastral ou Parcelle enregistrée</Label>
                <Input
                  id="ws-idu"
                  value={idu}
                  onChange={(e) => setIdu(e.target.value)}
                  placeholder="IDU (ex: 13001000AB0123)"
                  className="font-mono"
                />
              </div>

              <div className="flex items-end lg:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleParcelLookup}
                  disabled={lookupLoading}
                  className="w-full"
                >
                  {lookupLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4 text-primary" />
                  )}
                  Localiser IGN
                </Button>
              </div>

              <div className="space-y-1.5 lg:col-span-3">
                <Label htmlFor="ws-parcel">Ou parcelle en base</Label>
                <Select
                  value={selectedParcelId || AUTO_PARCEL_VALUE}
                  onValueChange={(value) => {
                    const nextId = value === AUTO_PARCEL_VALUE ? '' : value
                    setSelectedParcelId(nextId)
                    const found = parcels.find((p) => String(p.id) === nextId)
                    if (found) {
                      setMapPreview({
                        centroid: found.centroid,
                        geometry: found.geometry,
                        label: `${found.idu} (${found.surfaceM2 ?? '?'} m²)`,
                      })
                    }
                  }}
                >
                  <SelectTrigger id="ws-parcel" className="font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AUTO_PARCEL_VALUE}>— Auto via recherche —</SelectItem>
                    {parcels.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.idu} ({p.surfaceM2 ?? '?'} m²)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 lg:col-span-7">
                <Label htmlFor="ws-prompt">
                  Prompt d&apos;analyse de faisabilité (chaque envoi crée une nouvelle version
                  immuable)
                </Label>
                <Input
                  id="ws-prompt"
                  required
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </div>

              <div className="flex items-end lg:col-span-2">
                <Button type="submit" disabled={analyzing} className="w-full">
                  {analyzing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  Analyser PLU
                </Button>
              </div>
            </div>

            {statusBanner && (
              <Alert variant={statusBanner.type === 'ok' ? 'success' : 'destructive'}>
                {statusBanner.type === 'ok' ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                <AlertDescription>{statusBanner.text}</AlertDescription>
              </Alert>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Active Snapshot Header & Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => handleTabChange(v as TabKey)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="constructibility">
              <Layers className="h-3.5 w-3.5" />
              Constructibilité & Carte
            </TabsTrigger>
            <TabsTrigger value="regulations">
              <FileText className="h-3.5 w-3.5" />
              Réglementation & Validation
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="h-3.5 w-3.5" />
              Historique ({snapshots.length})
            </TabsTrigger>
            <TabsTrigger value="compare">
              <GitCompare className="h-3.5 w-3.5" />
              Comparaison
            </TabsTrigger>
            <TabsTrigger value="json">
              <Code2 className="h-3.5 w-3.5" />
              Inspecteur JSON
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings className="h-3.5 w-3.5" />
              Paramètres
            </TabsTrigger>
          </TabsList>

          {activeSnapshot && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={`/api/plu/export/${activeSnapshot.id}?format=archicad`}>
                  <Download className="h-3.5 w-3.5 text-primary" />
                  Export Archicad
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={`/api/plu/export/${activeSnapshot.id}?format=markdown`}>
                  <Download className="h-3.5 w-3.5 text-emerald-600" />
                  Rapport MD
                </a>
              </Button>
            </div>
          )}
        </div>

        {/* TAB 1: Constructibility & Map */}
        <TabsContent value="constructibility">
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="space-y-3 lg:col-span-5">
              <ParcelMap
                centroid={mapPreview.centroid}
                geometry={mapPreview.geometry}
                parcelLabel={mapPreview.label}
                zoneCode={activeSnapshot?.zoneCode || mapPreview.zoneCode}
              />
              {activeSnapshot && (
                <Card>
                  <CardHeader className="p-4 pb-1">
                    <CardTitle className="text-xs font-bold">
                      {activeSnapshot.snapshotLabel}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <p className="text-xs text-muted-foreground">{activeSnapshot.originalPrompt}</p>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="space-y-4 lg:col-span-7">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  { label: 'Zone PLU', value: activeSnapshot?.zoneCode || 'Non identifiée' },
                  {
                    label: 'Surface parcelle',
                    value: calc.parcelSurfaceM2 ? `${calc.parcelSurfaceM2} m²` : 'N/A',
                  },
                  {
                    label: 'Emprise au sol max',
                    value: calc.maxFootprintM2 ? `${calc.maxFootprintM2} m²` : 'N/A',
                  },
                  {
                    label: 'Emprise après reculs',
                    value: calc.estimatedBuildableFootprintM2
                      ? `${calc.estimatedBuildableFootprintM2} m²`
                      : 'N/A',
                  },
                  {
                    label: 'Hauteur max',
                    value: calc.maxHeightM ? `${calc.maxHeightM} m` : 'N/A',
                  },
                  {
                    label: 'Niveaux estimés',
                    value: calc.estimatedStoreys ? `R+${Number(calc.estimatedStoreys) - 1}` : 'N/A',
                  },
                  {
                    label: 'SDP max estimée',
                    value: calc.maxFloorAreaSdpM2 ? `${calc.maxFloorAreaSdpM2} m²` : 'N/A',
                  },
                  {
                    label: 'Volume max estimé',
                    value: calc.maxVolumeM3 ? `${calc.maxVolumeM3} m³` : 'N/A',
                  },
                  {
                    label: 'Pleine terre min',
                    value: calc.minGreenSpaceM2 ? `${calc.minGreenSpaceM2} m²` : 'N/A',
                  },
                ].map((kpi) => (
                  <Card key={kpi.label}>
                    <CardHeader className="p-4 pb-1">
                      <CardDescription className="text-[11px] font-semibold uppercase tracking-wide">
                        {kpi.label}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      <div className="text-lg font-bold text-foreground">{kpi.value}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {interp.summary ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Synthèse réglementaire
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed text-foreground/90">
                      {String(interp.summary)}
                    </p>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: Regulations & Validation */}
        <TabsContent value="regulations">
          {activeSnapshot && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
                  <CardTitle className="text-sm font-bold">
                    Validation & Paramètres extraits
                  </CardTitle>
                  <Badge variant={activeSnapshot.validationStatus === 'valid' ? 'success' : 'warning'}>
                    {activeSnapshot.validationStatus === 'valid' ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    )}
                    {activeSnapshot.validationStatus} ({String(valReport.completenessScore ?? 0)}%)
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(rules).map(([k, v]) => (
                      <div
                        key={k}
                        className="flex items-center justify-between rounded-lg bg-muted px-3 py-2"
                      >
                        <span className="font-mono text-muted-foreground">{k}</span>
                        <span className="font-bold text-foreground">
                          {v !== null ? String(v) : '—'}
                        </span>
                      </div>
                    ))}
                  </div>

                  {Array.isArray(valReport.issues) && valReport.issues.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-xs font-bold text-muted-foreground">
                        Alertes de validation
                      </div>
                      {(valReport.issues as Array<{ severity: string; message: string }>).map(
                        (issue, idx) => (
                          <Alert key={idx} variant="warning">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>
                              <strong>[{issue.severity}]</strong> {issue.message}
                            </AlertDescription>
                          </Alert>
                        ),
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold">
                    Articles PLU extraits ({activeSnapshot.extractedArticles?.length || 0})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[420px] space-y-3 overflow-auto">
                    {(activeSnapshot.extractedArticles || []).map((art, i) => (
                      <div key={i} className="rounded-lg border bg-muted/50 p-3">
                        <div className="text-xs font-bold text-primary">
                          {art.articleNumber} — {art.title}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-xs text-foreground/80">
                          {art.content}
                        </p>
                      </div>
                    ))}
                    {(!activeSnapshot.extractedArticles ||
                      activeSnapshot.extractedArticles.length === 0) && (
                      <p className="text-xs text-muted-foreground">
                        Aucun article officiel lié. Téléversez un règlement PLU dans &quot;Documents
                        PLU&quot;.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* TAB 3: Prompt History & Replay */}
        <TabsContent value="history">
          <div className="space-y-3">
            {snapshots.map((snap) => (
              <Card
                key={snap.id}
                className={activeSnapshot?.id === snap.id ? 'border-primary bg-primary/5' : ''}
              >
                <CardContent className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="default" className="rounded font-mono text-[11px]">
                        v{snap.version}
                      </Badge>
                      <span className="text-sm font-bold text-foreground">
                        {snap.snapshotLabel}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(snap.createdAt).toLocaleString('fr-FR')}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{snap.originalPrompt}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setActiveSnapshot(snap)
                        handleTabChange('constructibility')
                      }}
                    >
                      Rouvrir
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleReplay(snap.id)}
                      disabled={replayingId === snap.id}
                    >
                      {replayingId === snap.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      Rejouer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* TAB 4: Historical Comparison */}
        <TabsContent value="compare">
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[220px] space-y-1.5">
                  <Label htmlFor="compare-a">Snapshot A</Label>
                  <Select value={compareA} onValueChange={setCompareA}>
                    <SelectTrigger id="compare-a" className="text-xs">
                      <SelectValue placeholder="Sélectionner Snapshot A" />
                    </SelectTrigger>
                    <SelectContent>
                      {snapshots.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)} className="text-xs">
                          {s.snapshotLabel}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-[220px] space-y-1.5">
                  <Label htmlFor="compare-b">Snapshot B</Label>
                  <Select value={compareB} onValueChange={setCompareB}>
                    <SelectTrigger id="compare-b" className="text-xs">
                      <SelectValue placeholder="Sélectionner Snapshot B" />
                    </SelectTrigger>
                    <SelectContent>
                      {snapshots.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)} className="text-xs">
                          {s.snapshotLabel}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCompare}
                  disabled={comparing}
                >
                  {comparing ? 'Comparaison...' : 'Comparer les versions'}
                </Button>
              </div>

              {compareResult && Array.isArray(compareResult.constructibilityDiff) && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Métrique</TableHead>
                      <TableHead>Snapshot A</TableHead>
                      <TableHead>Snapshot B</TableHead>
                      <TableHead>Delta</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(
                      compareResult.constructibilityDiff as Array<{
                        metric: string
                        snapshotA: unknown
                        snapshotB: unknown
                        delta: number | null
                      }>
                    ).map((row) => (
                      <TableRow key={row.metric}>
                        <TableCell className="font-mono font-semibold">{row.metric}</TableCell>
                        <TableCell>{String(row.snapshotA ?? '—')}</TableCell>
                        <TableCell>{String(row.snapshotB ?? '—')}</TableCell>
                        <TableCell className="font-semibold text-primary">
                          {row.delta !== null ? (row.delta > 0 ? `+${row.delta}` : row.delta) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 5: Payload JSON Inspector */}
        <TabsContent value="json">
          {activeSnapshot && (
            <Card>
              <CardContent className="space-y-3 p-5">
                <div className="flex flex-wrap gap-2">
                  {(['snapshot', 'archicad', 'gis', 'logs'] as const).map((sec) => (
                    <Button
                      key={sec}
                      type="button"
                      size="sm"
                      variant={jsonSection === sec ? 'default' : 'secondary'}
                      onClick={() => setJsonSection(sec)}
                    >
                      {sec.toUpperCase()}
                    </Button>
                  ))}
                </div>
                <pre className="max-h-[500px] overflow-auto rounded-lg bg-slate-900 p-4 font-mono text-xs text-emerald-300">
                  {JSON.stringify(
                    jsonSection === 'snapshot'
                      ? activeSnapshot
                      : jsonSection === 'archicad'
                        ? activeSnapshot.archicadExport
                        : jsonSection === 'gis'
                          ? activeSnapshot.zoningAndGis
                          : {
                              logs: activeSnapshot.executionLogs,
                              errors: activeSnapshot.executionErrors,
                            },
                    null,
                    2,
                  )}
                </pre>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TAB 6: Project Settings */}
        <TabsContent value="settings">
          {currentProject ? (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Informations du projet</CardTitle>
                  <CardDescription className="text-xs">
                    Paramètres généraux du projet sélectionné dans l&apos;espace de travail
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground">Nom</div>
                    <div className="mt-1 font-semibold text-foreground">{currentProject.name}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground">Commune</div>
                    <div className="mt-1 text-foreground">{currentProject.commune}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground">Code INSEE</div>
                    <div className="mt-1 font-mono text-foreground">{currentProject.codeInsee}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground">Territoire</div>
                    <div className="mt-1">
                      <Badge variant="info">
                        {currentProject.territory === 'amp' ? 'Métropole AMP' : 'GPU National'}
                      </Badge>
                    </div>
                  </div>
                  {currentProject.description && (
                    <div className="sm:col-span-2 lg:col-span-4">
                      <div className="text-xs font-semibold text-muted-foreground">Description</div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {currentProject.description}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-destructive/40">
                <CardHeader>
                  <CardTitle className="text-base text-destructive">Zone de danger</CardTitle>
                  <CardDescription className="text-xs">
                    La suppression du projet est définitive. Les analyses, snapshots et historiques
                    associés seront supprimés, et les documents liés seront détachés du projet.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {deleteError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{deleteError}</AlertDescription>
                    </Alert>
                  )}

                  {!canDeleteProject && (
                    <Alert variant="warning">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        Votre rôle ({userRole}) ne permet pas de supprimer un projet.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="flex flex-col justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center">
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        Supprimer le projet « {currentProject.name} »
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Cette action supprimera le projet de la liste des études actives.
                      </p>
                    </div>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="destructive"
                          disabled={!canDeleteProject || deletingProject}
                        >
                          {deletingProject ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          Supprimer le projet
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Confirmer la suppression du projet</AlertDialogTitle>
                          <AlertDialogDescription>
                            Êtes-vous sûr de vouloir supprimer définitivement le projet{' '}
                            <strong className="text-foreground">{currentProject.name}</strong> ?
                            Cette action est irréversible.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDeleteProject}>
                            Supprimer définitivement
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Sélectionnez un projet pour accéder à ses paramètres.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
