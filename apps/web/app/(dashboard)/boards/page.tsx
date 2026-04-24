import { BoardCoverageShell } from "@/components/board-coverage-shell";
import { CandidatePipelineShell } from "@/components/candidate-pipeline-shell";

const coverageFilters = [
  "Internal Coverage",
  "Greenhouse / Lever / Ashby",
  "Seed Registry",
  "Board Health",
  "US-first",
];

type SearchParams = Promise<{ tab?: string }>;

export default async function BoardsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const tab = params.tab === "candidates" ? "candidates" : "coverage";

  return (
    <div className="px-10 py-9 max-w-6xl mx-auto">
      <header className="mb-8">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
          <div>
            <h1 className="text-[1.375rem] font-semibold text-ink tracking-tight">Board Coverage</h1>
            <p className="text-sage text-sm mt-1">
              Track which ATS boards are seeded, healthy, and actually producing target-role inventory.
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-[0.14em] text-sage">Registry Health</p>
            <p className="text-sm font-semibold text-ink mt-1">Seed quality · coverage depth · sync status</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-full border border-line bg-card p-0.5 gap-0.5">
            <a
              href="/boards"
              className="rounded-full px-4 py-1.5 text-xs font-medium transition-all"
              style={
                tab === "coverage"
                  ? { background: "#1a2018", color: "#ffffff" }
                  : { color: "#5a6455" }
              }
            >
              Board Coverage
            </a>
            <a
              href="/boards?tab=candidates"
              className="rounded-full px-4 py-1.5 text-xs font-medium transition-all"
              style={
                tab === "candidates"
                  ? { background: "#1a2018", color: "#ffffff" }
                  : { color: "#5a6455" }
              }
            >
              Candidate Pipeline
            </a>
          </div>

          {tab === "coverage"
            ? coverageFilters.map((filter) => (
                <span
                  key={filter}
                  className="rounded-full border border-line bg-card px-3.5 py-2 text-xs text-sage"
                >
                  {filter}
                </span>
              ))
            : (
              <span className="rounded-full border border-line bg-parchment px-3.5 py-2 text-xs text-sage">
                Staging · Not yet promoted to registry
              </span>
            )}
        </div>
      </header>

      {tab === "coverage" ? <BoardCoverageShell /> : <CandidatePipelineShell />}
    </div>
  );
}
