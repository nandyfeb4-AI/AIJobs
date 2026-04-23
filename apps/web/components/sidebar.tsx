'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Briefcase,
  FolderKanban,
  FileText,
  BarChart3,
  Database,
  Settings,
} from 'lucide-react'

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/jobs', label: 'Job Matches', icon: Briefcase },
  { href: '/tracker', label: 'Applications', icon: FolderKanban },
  { href: '/resume', label: 'Resume', icon: FileText },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/boards', label: 'Board Coverage', icon: Database },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-[220px] flex-shrink-0 h-full flex flex-col" style={{ background: '#1a2018' }}>

      {/* Logo */}
      <div className="px-5 py-[22px]" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ background: '#c96428' }}
          >
            <span className="text-white text-[10px] font-bold tracking-tight">AI</span>
          </div>
          <span className="text-white text-[13px] font-semibold tracking-wide">AIJobs</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-px overflow-y-auto">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={[
                'flex items-center gap-3 px-3 py-[9px] rounded-lg text-[13px] transition-colors duration-100',
                active
                  ? 'text-white font-medium'
                  : 'font-normal hover:bg-white/5',
              ].join(' ')}
              style={active ? { background: 'rgba(201,100,40,0.14)', color: '#e8834a' } : { color: 'rgba(255,255,255,0.45)' }}
            >
              <Icon size={15} strokeWidth={active ? 2 : 1.75} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-[9px] rounded-lg text-[13px] transition-colors duration-100 hover:bg-white/5"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          <Settings size={15} strokeWidth={1.75} />
          Settings
        </Link>

        <div className="flex items-center gap-3 px-3 pt-3 mt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-semibold"
            style={{ background: 'rgba(201,100,40,0.18)', color: '#e8834a' }}
          >
            N
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-medium truncate" style={{ color: 'rgba(255,255,255,0.7)' }}>Nandhini</p>
            <p className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.28)' }}>nandyfeb4@gmail.com</p>
          </div>
        </div>
      </div>

    </aside>
  )
}
