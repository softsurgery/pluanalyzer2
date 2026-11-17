'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Building2, FileText, FolderKanban, LogOut, MapPin, ShieldCheck } from 'lucide-react'
import type { AuthUser } from '@/access/roles'

export function Navbar({ user }: { user: AuthUser | null }) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    await fetch('/api/users/logout', { method: 'POST' })
    router.refresh()
  }

  const navItems = [
    { href: '/', label: 'Projets', icon: FolderKanban },
    { href: '/workspace', label: 'Analyse PLU & Carte', icon: MapPin },
    { href: '/documents', label: 'Documents PLU', icon: FileText },
  ]

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5 font-semibold text-slate-900">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
              <Building2 className="h-5 w-5" />
            </span>
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-tight">PLU Analyzer</div>
              <div className="text-[11px] font-medium text-slate-500">
                Aix-Marseille-Provence · GPU
              </div>
            </div>
          </Link>

          {user && (
            <nav className="hidden items-center gap-1 md:flex">
              {navItems.map((item) => {
                const Icon = item.icon
                const active = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                      active
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
            Payload Admin
          </Link>

          {user && (
            <div className="flex items-center gap-3 border-l border-slate-200 pl-3">
              <div className="hidden text-right sm:block">
                <div className="text-xs font-semibold text-slate-800">
                  {user.fullName || user.email}
                </div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500">
                  {user.role}
                </div>
              </div>
              <button
                onClick={handleLogout}
                title="Déconnexion"
                className="rounded-lg p-2 text-slate-500 transition hover:bg-red-50 hover:text-red-600"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
