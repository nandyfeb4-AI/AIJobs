import type { ReactNode } from 'react'
import Sidebar from '@/components/sidebar'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-parchment">
        {children}
      </main>
    </div>
  )
}
