'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
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
} from 'lucide-react'
import { ParcelMap } from './ParcelMap'

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

interface WorkspaceClientProps {
  projects: Array<{ id: number | string; name: string; commune: string; codeInsee: string }>
  parcels: ParcelRecord[]
  snapshots: SnapshotRecord[]
  initialProjectId?: string
}

type TabKey = 'constructibility' | 'regulations' | 'history' | 'compare' | 'json'

export function WorkspaceClient({
  projects,
  parcels,
  snapshots: initialSnapshots,
  initialProjectId,
}: WorkspaceClientProps) {
  const router = useRouter()
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>(initialSnapshots)
  const [activeSnapshot, setActiveSnapshot] = useState<SnapshotRecord | null>(
    initialSnapshots[0] || null,
  )
  const [activeTab, setActiveTab] = useState<TabKey>('constructibility')

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
        setStatusBanner({ type: 'err', text: data.error || 'Échec de l\'analyse PLU' })
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
      setStatusBanner({ type: 'err', text: 'Erreur réseau lors de l\'exécution du pipeline.' })
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

  const calc = (activeSnapshot?.constructibilityCalculations || {}) as Record<string, unknown>
  const interp = (activeSnapshot?.regulatoryInterpretation || {}) as Record<string, unknown>
  const rules = (interp.rules || {}) as Record<string, unknown>
  const valReport = (activeSnapshot?.validationReport || {}) as Record<string, unknown>

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      {/* Top Control Panel */}
      <form
        onSubmit={handleRunAnalysis}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-3">
            <label className="mb-1 block text-xs font-semibold text-slate-600">Projet</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.codeInsee})
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-4">
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Adresse française (BAN / Géoplateforme)
            </label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Ex: 12 Avenue Sextius, Aix-en-Provence"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="lg:col-span-3">
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              IDU Cadastral ou Parcelle enregistrée
            </label>
            <div className="flex gap-2">
              <input
                value={idu}
                onChange={(e) => setIdu(e.target.value)}
                placeholder="IDU (ex: 13001000AB0123)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>

          <div className="flex items-end gap-2 lg:col-span-2">
            <button
              type="button"
              onClick={handleParcelLookup}
              disabled={lookupLoading}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              {lookupLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4 text-blue-600" />
              )}
              Localiser IGN
            </button>
          </div>

          <div className="lg:col-span-3">
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Ou parcelle en base
            </label>
            <select
              value={selectedParcelId}
              onChange={(e) => {
                setSelectedParcelId(e.target.value)
                const found = parcels.find((p) => String(p.id) === e.target.value)
                if (found) {
                  setMapPreview({
                    centroid: found.centroid,
                    geometry: found.geometry,
                    label: `${found.idu} (${found.surfaceM2 ?? '?'} m²)`,
                  })
                }
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            >
              <option value="">— Auto via recherche —</option>
              {parcels.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.idu} ({p.surfaceM2 ?? '?'} m²)
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-7">
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Prompt d&apos;analyse de faisabilité (chaque envoi crée une nouvelle version immuable)
            </label>
            <input
              required
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex items-end lg:col-span-2">
            <button
              type="submit"
              disabled={analyzing}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
            >
              {analyzing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Analyser PLU
            </button>
          </div>
        </div>

        {statusBanner && (
          <div
            className={`mt-4 rounded-lg border px-4 py-2.5 text-xs font-medium ${
              statusBanner.type === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {statusBanner.text}
          </div>
        )}
      </form>

      {/* Active Snapshot Header & Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: 'constructibility', label: 'Constructibilité & Carte', icon: Layers },
              { id: 'regulations', label: 'Réglementation & Validation', icon: FileText },
              { id: 'history', label: `Historique (${snapshots.length})`, icon: History },
              { id: 'compare', label: 'Comparaison', icon: GitCompare },
              { id: 'json', label: 'Inspecteur JSON', icon: Code2 },
            ] as const
          ).map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                  activeTab === t.id
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>

        {activeSnapshot && (
          <div className="flex items-center gap-2">
            <a
              href={`/api/plu/export/${activeSnapshot.id}?format=archicad`}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5 text-blue-600" />
              Export Archicad
            </a>
            <a
              href={`/api/plu/export/${activeSnapshot.id}?format=markdown`}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5 text-emerald-600" />
              Rapport MD
            </a>
          </div>
        )}
      </div>

      {/* TAB 1: Constructibility & Map */}
      {activeTab === 'constructibility' && (
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-5">
            <ParcelMap
              centroid={mapPreview.centroid}
              geometry={mapPreview.geometry}
              parcelLabel={mapPreview.label}
              zoneCode={activeSnapshot?.zoneCode || mapPreview.zoneCode}
            />
            {activeSnapshot && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs">
                <div className="font-bold text-slate-900">{activeSnapshot.snapshotLabel}</div>
                <div className="mt-1 text-slate-500">{activeSnapshot.originalPrompt}</div>
              </div>
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
                <div
                  key={kpi.label}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {kpi.label}
                  </div>
                  <div className="mt-1 text-lg font-bold text-slate-900">{kpi.value}</div>
                </div>
              ))}
            </div>

            {interp.summary ? (
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Synthèse réglementaire
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">
                  {String(interp.summary)}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* TAB 2: Regulations & Validation */}
      {activeTab === 'regulations' && activeSnapshot && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Validation & Paramètres extraits</h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {activeSnapshot.validationStatus === 'valid' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                )}
                {activeSnapshot.validationStatus} ({String(valReport.completenessScore ?? 0)}%)
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {Object.entries(rules).map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                >
                  <span className="font-mono text-slate-600">{k}</span>
                  <span className="font-bold text-slate-900">{v !== null ? String(v) : '—'}</span>
                </div>
              ))}
            </div>

            {Array.isArray(valReport.issues) && valReport.issues.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-slate-600">Alertes de validation</div>
                {(valReport.issues as Array<{ severity: string; message: string }>).map(
                  (issue, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                    >
                      <strong>[{issue.severity}]</strong> {issue.message}
                    </div>
                  ),
                )}
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900">
              Articles PLU extraits ({activeSnapshot.extractedArticles?.length || 0})
            </h3>
            <div className="max-h-[420px] space-y-3 overflow-auto">
              {(activeSnapshot.extractedArticles || []).map((art, i) => (
                <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-bold text-blue-700">
                    {art.articleNumber} — {art.title}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{art.content}</p>
                </div>
              ))}
              {(!activeSnapshot.extractedArticles ||
                activeSnapshot.extractedArticles.length === 0) && (
                <p className="text-xs text-slate-500">
                  Aucun article officiel lié. Téléversez un règlement PLU dans &quot;Documents
                  PLU&quot;.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Prompt History & Replay */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          {snapshots.map((snap) => (
            <div
              key={snap.id}
              className={`flex flex-col justify-between gap-3 rounded-xl border p-4 sm:flex-row sm:items-center ${
                activeSnapshot?.id === snap.id
                  ? 'border-blue-500 bg-blue-50/40'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-white">
                    v{snap.version}
                  </span>
                  <span className="text-sm font-bold text-slate-900">{snap.snapshotLabel}</span>
                  <span className="text-xs text-slate-400">
                    {new Date(snap.createdAt).toLocaleString('fr-FR')}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">{snap.originalPrompt}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveSnapshot(snap)
                    setActiveTab('constructibility')
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Rouvrir
                </button>
                <button
                  type="button"
                  onClick={() => handleReplay(snap.id)}
                  disabled={replayingId === snap.id}
                  className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {replayingId === snap.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  Rejouer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 4: Historical Comparison */}
      {activeTab === 'compare' && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Snapshot A</label>
              <select
                value={compareA}
                onChange={(e) => setCompareA(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              >
                {snapshots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.snapshotLabel}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Snapshot B</label>
              <select
                value={compareB}
                onChange={(e) => setCompareB(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              >
                {snapshots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.snapshotLabel}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleCompare}
              disabled={comparing}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              {comparing ? 'Comparaison...' : 'Comparer les versions'}
            </button>
          </div>

          {compareResult && Array.isArray(compareResult.constructibilityDiff) && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2">Métrique</th>
                    <th className="py-2">Snapshot A</th>
                    <th className="py-2">Snapshot B</th>
                    <th className="py-2">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    compareResult.constructibilityDiff as Array<{
                      metric: string
                      snapshotA: unknown
                      snapshotB: unknown
                      delta: number | null
                    }>
                  ).map((row) => (
                    <tr key={row.metric} className="border-b border-slate-100">
                      <td className="py-2 font-mono font-semibold">{row.metric}</td>
                      <td className="py-2">{String(row.snapshotA ?? '—')}</td>
                      <td className="py-2">{String(row.snapshotB ?? '—')}</td>
                      <td className="py-2 font-semibold text-blue-600">
                        {row.delta !== null ? (row.delta > 0 ? `+${row.delta}` : row.delta) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: Payload JSON Inspector */}
      {activeTab === 'json' && activeSnapshot && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex gap-2">
            {(['snapshot', 'archicad', 'gis', 'logs'] as const).map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => setJsonSection(sec)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  jsonSection === sec
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {sec.toUpperCase()}
              </button>
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
        </div>
      )}
    </div>
  )
}
