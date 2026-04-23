import { ArrowRight } from 'lucide-react'

import { MatchCard } from '@/components/match-card'
import { todaysMatches } from '@/lib/matches'

// ─── Mock data ────────────────────────────────────────────────────────────────

const stats = [
  { label: 'Applications sent', value: '18', sub: 'this month' },
  { label: 'Interviews secured', value: '5', sub: '+2 this week', accent: true },
  { label: 'Active pipeline', value: '7', sub: 'in progress' },
  { label: 'Avg ATS score', value: '74', sub: 'up 13 pts from baseline' },
]

const attention = [
  {
    borderColor: '#fbbf24',
    text: 'No response from Airbnb in 14 days',
    action: 'Send follow-up',
  },
  {
    borderColor: '#f87171',
    text: 'ATS score for Senior PM at Linear is 58 — below threshold',
    action: 'Review resume',
  },
  {
    borderColor: '#c96428',
    text: 'Profile is 72% complete — gaps affect match quality',
    action: 'Complete profile',
  },
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function AttentionItem({ borderColor, text, action }: (typeof attention)[0]) {
  return (
    <div
      className="bg-card rounded-xl pl-4 pr-5 py-4 shadow-[0_1px_4px_rgba(26,32,24,0.06)]"
      style={{ borderLeft: `3px solid ${borderColor}` }}
    >
      <p className="text-ink text-xs leading-relaxed">{text}</p>
      <button className="text-accent text-xs font-medium mt-1.5 hover:underline flex items-center gap-1">
        {action} <ArrowRight size={10} />
      </button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  return (
    <div className="px-10 py-9 max-w-5xl mx-auto">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[1.375rem] font-semibold text-ink tracking-tight">Good morning, Nandhini</h1>
        <p className="text-sage text-sm mt-1">Here&apos;s where your job search stands — April 22, 2026</p>
      </div>

      {/* Interview Rate — hero card */}
      <div
        className="rounded-2xl px-10 py-9 mb-7 flex items-center gap-12"
        style={{ background: '#1a2018' }}
      >
        {/* Left: the number */}
        <div className="flex-1 min-w-0">
          <p className="text-white/35 text-[10px] uppercase tracking-[0.15em] font-medium mb-4">
            Interview Rate · April 2026
          </p>
          <div className="flex items-baseline gap-4 mb-3">
            <span
              className="text-accent font-bold tabular-nums leading-none"
              style={{ fontSize: '5rem', letterSpacing: '-0.02em' }}
            >
              28%
            </span>
          </div>
          <p className="text-white/55 text-sm leading-relaxed">
            You&apos;re converting 2.6× the industry average — top 8% of active job seekers on the platform.
          </p>
          <p className="text-white/25 text-xs mt-2">
            18 applications sent · 5 interviews booked this month
          </p>
        </div>

        {/* Divider */}
        <div className="hidden md:block w-px self-stretch bg-white/10 flex-shrink-0" />

        {/* Right: proportional bar chart */}
        <div className="hidden md:flex flex-col items-end gap-3 flex-shrink-0 pr-1">
          <p className="text-white/25 text-[10px] uppercase tracking-[0.12em] self-start">Benchmark</p>

          {/* Bars — heights are proportional: 10.8 / 28 = 38.6% */}
          <div className="flex items-end gap-4" style={{ height: '80px' }}>
            <div className="flex flex-col items-center gap-0 justify-end h-full">
              <div
                className="w-8 rounded-t-sm"
                style={{ height: `${Math.round((10.8 / 28) * 80)}px`, background: 'rgba(255,255,255,0.15)' }}
              />
            </div>
            <div className="flex flex-col items-center gap-0 justify-end h-full">
              <div
                className="w-8 rounded-t-sm"
                style={{ height: '80px', background: '#c96428' }}
              />
            </div>
          </div>

          {/* Labels */}
          <div className="flex gap-4 w-full">
            <div className="flex flex-col items-center w-8">
              <p className="text-white/30 text-[10px] text-center leading-tight">10.8%</p>
              <p className="text-white/20 text-[9px] text-center leading-tight mt-0.5">Industry</p>
            </div>
            <div className="flex flex-col items-center w-8">
              <p className="text-accent text-[10px] text-center leading-tight font-medium">28%</p>
              <p className="text-white/20 text-[9px] text-center leading-tight mt-0.5">You</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-9">
        {stats.map(({ label, value, sub, accent }) => (
          <div
            key={label}
            className="bg-card rounded-xl px-5 py-5 shadow-[0_1px_4px_rgba(26,32,24,0.07)]"
          >
            <p className="text-sage text-[10px] font-medium uppercase tracking-wide mb-3">{label}</p>
            <p className={`text-[2rem] font-bold tabular-nums leading-none mb-1.5 ${accent ? 'text-positive' : 'text-ink'}`}>
              {value}
            </p>
            <p className="text-sage text-xs">{sub}</p>
          </div>
        ))}
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Matches */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-ink text-sm font-semibold tracking-tight">Today&apos;s Matches</h2>
            <a href="/jobs" className="text-accent text-xs font-medium flex items-center gap-1 hover:underline">
              View all 12 <ArrowRight size={11} />
            </a>
          </div>
          <div className="space-y-3">
            {todaysMatches.slice(0, 3).map((job) => (
              <MatchCard key={job.id} job={job} compact />
            ))}
          </div>
        </div>

        {/* Attention */}
        <div>
          <h2 className="text-ink text-sm font-semibold tracking-tight mb-4">Needs Attention</h2>
          <div className="space-y-2.5">
            {attention.map((item) => (
              <AttentionItem key={item.text} {...item} />
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
