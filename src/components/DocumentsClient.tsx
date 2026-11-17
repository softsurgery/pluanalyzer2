'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Loader2, Sparkles, Upload } from 'lucide-react'

interface DocumentItem {
  id: number | string
  title: string
  documentType: string
  commune?: string | null
  codeInsee?: string | null
  zoneCode?: string | null
  extractionStatus?: string | null
  pageCount?: number | null
  extractedText?: string | null
  filename?: string | null
  updatedAt: string
}

export function DocumentsClient({
  documents,
  projects,
}: {
  documents: DocumentItem[]
  projects: Array<{ id: number | string; name: string }>
}) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [zoneCode, setZoneCode] = useState('UA')
  const [codeInsee, setCodeInsee] = useState('13001')
  const [projectId, setProjectId] = useState<string>(projects[0] ? String(projects[0].id) : '')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [extractingId, setExtractingId] = useState<string | number | null>(null)
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(documents[0] || null)
  const [message, setMessage] = useState<string | null>(null)

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    setUploading(true)
    setMessage(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append(
        '_payload',
        JSON.stringify({
          title: title || file.name,
          documentType: 'reglement',
          zoneCode,
          codeInsee,
          commune: 'Aix-en-Provence',
          project: projectId ? Number(projectId) : undefined,
        }),
      )

      const res = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        setMessage('Erreur lors de l\'upload vers Payload CMS.')
        return
      }
      setTitle('')
      setFile(null)
      setMessage('Document enregistré dans Payload CMS.')
      router.refresh()
    } finally {
      setUploading(false)
    }
  }

  const handleExtract = async (id: number | string) => {
    setExtractingId(id)
    setMessage(null)
    try {
      const res = await fetch(`/api/plu/documents/${id}/extract`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setMessage(data.error || 'Échec de l\'extraction PDF')
        return
      }
      setSelectedDoc(data.document)
      setMessage(`Extraction terminée (${data.articles?.length || 0} article(s) détecté(s)).`)
      router.refresh()
    } finally {
      setExtractingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Gestion des Documents PLU</h1>
        <p className="mt-1 text-sm text-slate-500">
          Stockage Payload CMS, extraction de texte PDF & découpage automatique par articles
        </p>
      </div>

      {/* Upload Form */}
      <form
        onSubmit={handleUpload}
        className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-5"
      >
        <div className="lg:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-slate-600">Titre</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Règlement Zone UA Aix-en-Provence"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Zone</label>
          <input
            value={zoneCode}
            onChange={(e) => setZoneCode(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Code INSEE</label>
          <input
            value={codeInsee}
            onChange={(e) => setCodeInsee(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Projet</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2 lg:col-span-5">
          <input
            type="file"
            accept=".pdf,.txt"
            required
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="text-xs text-slate-600"
          />
          <button
            type="submit"
            disabled={uploading || !file}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Téléverser dans Payload
          </button>
        </div>
      </form>

      {message && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-medium text-blue-800">
          {message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600">
            Documents ({documents.length})
          </h2>
          {documents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-xs text-slate-500">
              Aucun document téléversé pour le moment.
            </div>
          ) : (
            documents.map((doc) => (
              <div
                key={doc.id}
                onClick={() => setSelectedDoc(doc)}
                className={`cursor-pointer rounded-xl border p-4 transition ${
                  selectedDoc?.id === doc.id
                    ? 'border-blue-500 bg-blue-50/40'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 h-5 w-5 text-blue-600" />
                    <div>
                      <div className="text-sm font-bold text-slate-900">{doc.title}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        Zone {doc.zoneCode || '—'} · INSEE {doc.codeInsee || '—'} · Statut :{' '}
                        <span className="font-semibold">{doc.extractionStatus || 'pending'}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleExtract(doc.id)
                    }}
                    disabled={extractingId === doc.id}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {extractingId === doc.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    )}
                    Extraire PDF
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600">
            Visionneuse de texte extrait
          </h2>
          {selectedDoc ? (
            <div className="mt-3 space-y-2">
              <div className="text-sm font-bold text-slate-900">{selectedDoc.title}</div>
              <pre className="max-h-[460px] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-4 font-mono text-xs text-slate-100">
                {selectedDoc.extractedText ||
                  'Aucun texte extrait. Cliquez sur "Extraire PDF" pour lancer l\'analyse.'}
              </pre>
            </div>
          ) : (
            <p className="mt-4 text-xs text-slate-500">
              Sélectionnez un document pour inspecter son contenu réglementaire.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
