import { JobsFeedShell } from "@/components/jobs-feed-shell";

const filters = [
  "United States",
  "Direct ATS Sources",
  "Greenhouse / Lever / Ashby",
  "Live Preview",
  "US-first",
];

export default function JobsPage() {
  return (
    <div className="px-10 py-9 max-w-6xl mx-auto">
      <header className="mb-8">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
          <div>
            <h1 className="text-[1.375rem] font-semibold text-ink tracking-tight">Today&apos;s Matches</h1>
            <p className="text-sage text-sm mt-1">
              Preview live jobs from our first source integrations before we persist or score them.
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-[0.14em] text-sage">Feed Health</p>
            <p className="text-sm font-semibold text-ink mt-1">Direct-source first · Integration preview</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <span
              key={filter}
              className="rounded-full border border-line bg-card px-3.5 py-2 text-xs text-sage"
            >
              {filter}
            </span>
          ))}
        </div>
      </header>

      <JobsFeedShell />
    </div>
  );
}
