import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PLU Analyzer — Urban-Planning Feasibility Platform',
  description:
    'French PLU/PLUi feasibility intelligence powered by Payload CMS, PostgreSQL, IGN API Carto, Métropole Aix-Marseille-Provence, and Groq.',
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  )
}
