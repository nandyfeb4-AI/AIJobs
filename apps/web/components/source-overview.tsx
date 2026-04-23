import { mapAggregatedJobToMatchJob } from "@/lib/matches";

import type { AggregatedJob } from "@aijobs/types";

const filters = [
  { label: "Role", value: "Product Manager" },
  { label: "Location", value: "US / Remote" },
  { label: "Level", value: "Senior" },
  { label: "Type", value: "Full-time" },
];

export function SourceOverview({ jobs }: { jobs: AggregatedJob[] }) {
  const matches = jobs.map(mapAggregatedJobToMatchJob);
  const strong = matches.filter((j) => j.score >= 90).length;
  const good = matches.filter((j) => j.score >= 75 && j.score < 90).length;
  const fair = matches.filter((j) => j.score < 75).length;
  const total = Math.max(matches.length, 1);

  return (
    <div className="space-y-4">
      <section className="bg-card rounded-2xl p-5 shadow-[0_2px_12px_rgba(26,32,24,0.06)]">
        <h2 className="text-ink text-sm font-semibold tracking-tight mb-4">Your Match Filters</h2>
        <div className="space-y-2.5">
          {filters.map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between text-xs">
              <span className="text-sage">{label}</span>
              <span className="text-ink font-medium bg-parchment px-2.5 py-1 rounded-lg">{value}</span>
            </div>
          ))}
        </div>
        <button className="w-full mt-4 text-xs text-accent font-medium hover:underline text-left">
          Edit preferences
        </button>
      </section>

      <section className="bg-card rounded-2xl p-5 shadow-[0_2px_12px_rgba(26,32,24,0.06)]">
        <h2 className="text-ink text-sm font-semibold tracking-tight mb-4">Today&apos;s Breakdown</h2>
        <div className="space-y-3">
          <BreakdownRow label="Strong match" count={strong} color="#c96428" pct={(strong / total) * 100} />
          <BreakdownRow label="Good match" count={good} color="rgba(26,32,24,0.5)" pct={(good / total) * 100} />
          <BreakdownRow label="Fair match" count={fair} color="rgba(26,32,24,0.2)" pct={(fair / total) * 100} />
        </div>
      </section>
    </div>
  );
}

function BreakdownRow({ label, count, color, pct }: { label: string; count: number; color: string; pct: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-sage">{label}</span>
        <span className="text-ink font-semibold tabular-nums">{count}</span>
      </div>
      <div className="h-1 w-full rounded-full bg-parchment">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
