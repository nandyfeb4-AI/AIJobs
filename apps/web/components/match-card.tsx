import { Bookmark, BriefcaseBusiness, DollarSign, MapPin, Sparkles, Globe } from 'lucide-react'

import { type MatchJob, scoreColor, scoreLabel } from '@/lib/matches'
import { CompanyMark } from './company-mark'

// ─── Compact: dashboard preview card ─────────────────────────────────────────

function CompactCard({ job }: { job: MatchJob }) {
  const accent = job.score >= 90 ? 'text-positive' : job.score >= 75 ? 'text-accent' : 'text-amber-600'

  return (
    <article className="bg-card rounded-2xl px-6 py-5 shadow-[0_2px_12px_rgba(26,32,24,0.06)] hover:shadow-[0_4px_20px_rgba(26,32,24,0.09)] transition-shadow duration-200">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <CompanyMark
            company={job.company}
            logoUrl={job.companyLogoUrl ?? undefined}
          />
          <div>
            <h3 className="text-ink text-sm font-semibold leading-tight">{job.title}</h3>
            <p className="text-sage text-xs mt-0.5">{job.company}</p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <span className={`text-base font-bold tabular-nums ${accent}`}>{job.score}%</span>
          <p className="text-sage text-[10px] mt-0.5 leading-none">match</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-sage mb-3">
        <span className="flex items-center gap-1">
          <MapPin size={11} strokeWidth={1.5} />
          {job.location}
        </span>
        <span>{job.salary}</span>
        <span className="px-1.5 py-0.5 bg-parchment rounded text-sage/80">{job.workMode}</span>
      </div>

      <div className="flex items-center gap-2 pt-4 border-t border-line">
        <button className="flex items-center gap-1.5 px-4 py-1.5 bg-ink text-white text-xs font-medium rounded-lg hover:bg-ink/85 transition-colors">
          <Sparkles size={11} />
          Tailor Resume
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-sage text-xs hover:text-ink transition-colors">
          <Bookmark size={11} />
          Save
        </button>
      </div>
    </article>
  )
}

// ─── Full: jobs page card with dark match panel ───────────────────────────────

function MetaCell({ icon: Icon, value }: { icon: typeof MapPin; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-sage">
      <Icon size={14} strokeWidth={1.5} className="flex-shrink-0 text-sage/60" />
      <span>{value}</span>
    </div>
  )
}

function FullCard({ job }: { job: MatchJob }) {
  const color = scoreColor(job.score)
  const label = scoreLabel(job.score)

  return (
    <article className="rounded-[24px] overflow-hidden shadow-[0_4px_24px_rgba(26,32,24,0.07)] hover:shadow-[0_8px_32px_rgba(26,32,24,0.11)] transition-shadow duration-200 flex">

      {/* ── Left: job details ── */}
      <div className="flex-1 bg-card px-7 py-6 min-w-0">

        {/* Header */}
        <div className="flex items-start gap-4 mb-5">
          <CompanyMark
            company={job.company}
            logoUrl={job.companyLogoUrl ?? undefined}
          />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <span className="text-[11px] text-sage/80 bg-parchment px-2.5 py-1 rounded-full">
                {job.postedLabel}
              </span>
              <span className="text-[11px] text-sage/80 bg-parchment px-2.5 py-1 rounded-full">
                {job.source}
              </span>
            </div>
            <h3 className="text-[18px] font-semibold text-ink leading-tight tracking-tight">
              {job.title}
            </h3>
            <p className="text-sage text-sm mt-1">{job.company} · {job.industry}</p>
          </div>
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-2.5 mb-5 py-4 border-y border-line">
          <MetaCell icon={MapPin} value={job.location} />
          <MetaCell icon={BriefcaseBusiness} value={job.employmentType} />
          <MetaCell icon={DollarSign} value={job.salary} />
          <MetaCell icon={Globe} value={job.workMode} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <a
              href={job.applyUrl ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 bg-ink text-white text-xs font-medium rounded-xl hover:bg-ink/85 transition-colors"
            >
              <Sparkles size={12} />
              Tailor Resume
            </a>
            <button className="flex items-center gap-1.5 px-3 py-2 text-sage text-xs hover:text-ink transition-colors">
              <Bookmark size={12} />
              Save
            </button>
          </div>
          <p className="text-sage text-[11px]">{job.applicants}</p>
        </div>
      </div>

      {/* ── Right: match panel ── */}
      <div
        className="w-44 flex-shrink-0 flex flex-col items-center justify-center gap-3 px-5"
        style={{ background: '#1a2018' }}
      >
        <p className="text-[10px] uppercase tracking-[0.14em] text-center font-medium"
          style={{ color: 'rgba(255,255,255,0.35)' }}>
          {label}
        </p>

        <p
          className="font-bold tabular-nums leading-none"
          style={{ fontSize: '3.25rem', letterSpacing: '-0.02em', color }}
        >
          {job.score}%
        </p>

        {/* Progress bar */}
        <div className="w-full rounded-full" style={{ height: '2px', background: 'rgba(255,255,255,0.1)' }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${job.score}%`, background: color }}
          />
        </div>
      </div>

    </article>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function MatchCard({ job, compact = false }: { job: MatchJob; compact?: boolean }) {
  if (compact) return <CompactCard job={job} />
  return <FullCard job={job} />
}
