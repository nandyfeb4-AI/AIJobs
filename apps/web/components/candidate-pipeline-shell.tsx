"use client";

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type CandidateCompanyStatus =
  | "candidate"
  | "discovering"
  | "discovered"
  | "no_supported_board"
  | "failed"
  | "promoted";

type CandidateBoardStatus = "discovered" | "validating" | "validated" | "rejected" | "promoted";

type CandidateCompany = {
  id: string;
  company: string;
  homepage: string;
  careersUrl: string | null;
  companyDomain: string | null;
  segments: string[];
  sourceHint: string | null;
  confidence: number | null;
  origin: string | null;
  notes: string | null;
  status: CandidateCompanyStatus;
  lastDiscoveredAt: string | null;
  lastDiscoveryError: string | null;
  createdAt: string;
  updatedAt: string;
  candidateBoards?: { id: string }[];
};

type CandidateBoard = {
  id: string;
  candidateCompanyId: string;
  sourceName: string;
  boardToken: string;
  evidenceUrl: string | null;
  status: CandidateBoardStatus;
  validationError: string | null;
  validatedAt: string | null;
  promotedAt: string | null;
  promotedBoardId: string | null;
  createdAt: string;
  updatedAt: string;
  candidateCompany?: { company: string };
};

type CandidateImportInput = {
  company: string;
  homepage: string;
  careersUrl?: string;
  companyDomain?: string;
  segments?: string[];
  sourceHint?: string;
  confidence?: number;
  origin?: string;
  notes?: string;
};

function apiBase() {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
}

const DEFAULT_IT_FOCUS_AREAS = [
  "software engineering",
  "data",
  "product",
  "qa",
  "cloud infrastructure",
  "security",
  "it support",
  "business systems",
  "erp crm",
  "design",
].join(", ");

function formatRelativeish(timestamp?: string | null) {
  if (!timestamp) return "—";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function companyStatusTone(status: CandidateCompanyStatus) {
  switch (status) {
    case "promoted":
      return { bg: "rgba(37,104,73,0.08)", color: "#256849", label: "Promoted" };
    case "discovered":
      return { bg: "rgba(59,130,246,0.08)", color: "#2563eb", label: "Discovered" };
    case "discovering":
      return { bg: "rgba(201,100,40,0.08)", color: "#c96428", label: "Discovering" };
    case "no_supported_board":
      return { bg: "rgba(26,32,24,0.06)", color: "#5a6455", label: "No Board" };
    case "failed":
      return { bg: "rgba(190,24,93,0.08)", color: "#be185d", label: "Failed" };
    default:
      return { bg: "rgba(26,32,24,0.06)", color: "#5a6455", label: "Candidate" };
  }
}

function boardStatusTone(status: CandidateBoardStatus) {
  switch (status) {
    case "promoted":
      return { bg: "rgba(37,104,73,0.08)", color: "#256849", label: "Promoted" };
    case "validated":
      return { bg: "rgba(59,130,246,0.08)", color: "#2563eb", label: "Validated" };
    case "validating":
      return { bg: "rgba(201,100,40,0.08)", color: "#c96428", label: "Validating" };
    case "rejected":
      return { bg: "rgba(190,24,93,0.08)", color: "#be185d", label: "Rejected" };
    default:
      return { bg: "rgba(26,32,24,0.06)", color: "#5a6455", label: "Discovered" };
  }
}

function classifyResearchBacklog(company: CandidateCompany) {
  const url = `${company.careersUrl ?? ""} ${company.lastDiscoveryError ?? ""}`.toLowerCase();

  if (url.includes("myworkdayjobs.com") || url.includes("workdayjobs.com")) return "Workday";
  if (url.includes("smartrecruiters.com")) return "SmartRecruiters";
  if (url.includes("icims.com")) return "iCIMS";
  if (url.includes("jobvite.com")) return "Jobvite";
  if (url.includes("bamboohr.com")) return "BambooHR";
  if (url.includes("workable.com")) return "Workable";
  if (url.includes("teamtailor.com")) return "Teamtailor";
  if (url.includes("rippling.com")) return "Rippling";
  if (url.includes("greenhouse.io") || url.includes("lever.co") || url.includes("ashbyhq.com")) {
    return "Retry Supported ATS";
  }
  if (company.careersUrl) return "Direct Careers";
  if (url.includes("403") || url.includes("aborted") || url.includes("fetch failed")) return "Blocked";
  return "Unknown";
}

function parseCsvRows(input: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const nextChar = input[index + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(cell.trim());
      cell = "";
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) {
    rows.push(row);
  }

  return rows;
}

function normalizeCsvHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function looksLikeCsv(input: string) {
  const firstLine = input.trim().split(/\r?\n/, 1)[0] ?? "";
  const normalizedHeaders = firstLine.split(",").map(normalizeCsvHeader);
  return normalizedHeaders.includes("company") && normalizedHeaders.includes("homepage");
}

function looksLikeCandidateCsv(input: string) {
  const normalizedStart = input.trimStart().slice(0, 80).toLowerCase();
  return (
    looksLikeCsv(input) ||
    normalizedStart.startsWith("company,") ||
    normalizedStart.includes("company,homepage,companydomain")
  );
}

function parseCandidateCsv(input: string) {
  const rows = parseCsvRows(input);
  if (rows.length < 2) {
    throw new Error("CSV must include a header row and at least one company row.");
  }

  const headers = rows[0].map(normalizeCsvHeader);
  const companyIndex = headers.indexOf("company");
  const homepageIndex = headers.indexOf("homepage");

  if (companyIndex < 0 || homepageIndex < 0) {
    throw new Error("CSV must include company and homepage columns.");
  }

  const columnIndex = (name: string) => headers.indexOf(normalizeCsvHeader(name));
  const careersUrlIndex = columnIndex("careersUrl");
  const boardUrlIndex = columnIndex("boardUrl");
  const companyDomainIndex = columnIndex("companyDomain");
  const sourceHintIndex = columnIndex("sourceHint");
  const atsIndex = columnIndex("ats");
  const segmentsIndex = columnIndex("segments");
  const tierIndex = columnIndex("tier");
  const originIndex = columnIndex("origin");
  const notesIndex = columnIndex("notes");
  const usEvidenceIndex = columnIndex("usEvidence");

  const companies = rows.slice(1).flatMap((row): CandidateImportInput[] => {
    const company = row[companyIndex]?.trim();
    const homepage = row[homepageIndex]?.trim();

    if (!company || !homepage) {
      return [];
    }

    const sourceHint =
      sourceHintIndex >= 0
        ? row[sourceHintIndex]?.trim().toLowerCase()
        : atsIndex >= 0
          ? row[atsIndex]?.trim().toLowerCase()
          : "";
    const normalizedSourceHint =
      sourceHint === "greenhouse" || sourceHint === "lever" || sourceHint === "ashby"
        ? sourceHint
        : undefined;
    const tier = tierIndex >= 0 ? row[tierIndex]?.trim() : "";
    const notes = notesIndex >= 0 ? row[notesIndex]?.trim() : "";
    const usEvidence = usEvidenceIndex >= 0 ? row[usEvidenceIndex]?.trim() : "";
    const origin = originIndex >= 0 ? row[originIndex]?.trim() : "";
    const careersUrl =
      careersUrlIndex >= 0 && row[careersUrlIndex]?.trim()
        ? row[careersUrlIndex].trim()
        : boardUrlIndex >= 0 && row[boardUrlIndex]?.trim()
          ? row[boardUrlIndex].trim()
          : "";
    const segments =
      segmentsIndex >= 0
        ? row[segmentsIndex]
            ?.split("|")
            .map((segment) => segment.trim())
            .filter(Boolean)
        : undefined;

    return [
      {
        company,
        homepage,
        ...(careersUrl ? { careersUrl } : {}),
        ...(companyDomainIndex >= 0 && row[companyDomainIndex]?.trim()
          ? { companyDomain: row[companyDomainIndex].trim().toLowerCase() }
          : {}),
        ...(normalizedSourceHint ? { sourceHint: normalizedSourceHint } : {}),
        ...(segments && segments.length > 0 ? { segments } : {}),
        ...(origin ? { origin } : { origin: "manual:csv-import" }),
        ...(notes || usEvidence || tier
          ? { notes: [notes, usEvidence ? `usEvidence=${usEvidence}` : "", tier ? `tier=${tier}` : ""].filter(Boolean).join(" | ") }
          : {}),
      },
    ];
  });

  if (!companies.length) {
    throw new Error("CSV did not include any importable company rows.");
  }

  return { companies };
}

function parseCandidateImportPayload(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Paste JSON or CSV before importing.");
  }

  if (looksLikeCandidateCsv(trimmed)) {
    return parseCandidateCsv(trimmed);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON.";
    throw new Error(
      `${message} If this is a CSV file, refresh the page and upload it again so the CSV importer is active.`,
    );
  }

  return parsed && typeof parsed === "object" && "companies" in parsed
    ? parsed
    : { companies: Array.isArray(parsed) ? parsed : [parsed] };
}

function MetricPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "positive" | "warning" | "danger" | "neutral" | "info";
}) {
  const colorMap = {
    positive: { bg: "rgba(37,104,73,0.08)", color: "#256849" },
    warning: { bg: "rgba(201,100,40,0.08)", color: "#c96428" },
    danger: { bg: "rgba(190,24,93,0.08)", color: "#be185d" },
    neutral: { bg: "rgba(26,32,24,0.06)", color: "#5a6455" },
    info: { bg: "rgba(59,130,246,0.08)", color: "#2563eb" },
  } as const;

  const colors = colorMap[tone];

  return (
    <div className="rounded-xl px-4 py-3" style={{ background: colors.bg, color: colors.color }}>
      <p className="text-[10px] uppercase tracking-[0.12em]">{label}</p>
      <p className="text-xl font-semibold tabular-nums mt-1">{value}</p>
    </div>
  );
}

function CandidateCompaniesPanel() {
  const [companies, setCompanies] = useState<CandidateCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [sourceForm, setSourceForm] = useState<{
    tier: "top" | "priority" | "growth";
    limit: number;
    focusAreas: string;
    customQuery: string;
  }>({ tier: "top", limit: 25, focusAreas: DEFAULT_IT_FOCUS_AREAS, customQuery: "" });
  const [importJson, setImportJson] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<{
    kind: "import" | "discover" | "enrich" | "pipeline" | "source" | null;
    pending: boolean;
    message: string | null;
  }>({ kind: null, pending: false, message: null });

  async function loadCompanies(silent = false) {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const response = await fetch(`${apiBase()}/jobs/candidate-companies`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);
      const payload = (await response.json()) as CandidateCompany[];
      setCompanies(payload);
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setCompanies([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void loadCompanies();

    const interval = window.setInterval(() => {
      if (!cancelled) void loadCompanies(true);
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  async function handleImport() {
    setImportError(null);

    let body: unknown;
    try {
      body = parseCandidateImportPayload(importJson);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Invalid import payload.");
      return;
    }

    try {
      setActionState({ kind: "import", pending: true, message: "Importing candidates..." });
      const response = await fetch(`${apiBase()}/jobs/candidate-companies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);
      const result = (await response.json()) as { imported?: number; skipped?: number };
      setActionState({
        kind: "import",
        pending: false,
        message: `Imported ${result.imported ?? "some"} candidates${result.skipped ? `, ${result.skipped} skipped` : ""}.`,
      });
      setImportJson("");
      await loadCompanies(true);
    } catch (err) {
      setActionState({
        kind: "import",
        pending: false,
        message: err instanceof Error ? err.message : "Import failed",
      });
    }
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setImportError(null);
      setImportJson(text);
      setActionState({
        kind: "import",
        pending: false,
        message: `Loaded ${file.name}. Click Import Candidates to stage it.`,
      });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Could not read import file.");
    } finally {
      input.value = "";
    }
  }

  async function handleDiscover() {
    try {
      setActionState({ kind: "discover", pending: true, message: "Queuing candidate discovery..." });
      const response = await fetch(`${apiBase()}/jobs/candidate-discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 100 }),
      });
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);
      const result = (await response.json()) as { enqueued?: number; queued?: number; candidateCompanies?: number };
      setActionState({
        kind: "discover",
        pending: false,
        message: `Discovery queued for ${result.enqueued ?? result.queued ?? 0} companies${result.candidateCompanies ? ` out of ${result.candidateCompanies} eligible` : ""}.`,
      });
      await loadCompanies(true);
    } catch (err) {
      setActionState({
        kind: "discover",
        pending: false,
        message: err instanceof Error ? err.message : "Discovery failed",
      });
    }
  }

  async function handleSource() {
    try {
      setActionState({ kind: "source", pending: true, message: "Sourcing companies from the web..." });
      const focusAreas = sourceForm.focusAreas
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const body: Record<string, unknown> = {
        tier: sourceForm.tier,
        limit: sourceForm.limit,
      };
      if (focusAreas.length) body.focusAreas = focusAreas;
      if (sourceForm.customQuery.trim()) body.customQuery = sourceForm.customQuery.trim();

      const response = await fetch(`${apiBase()}/jobs/candidate-companies/source`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);
      const result = (await response.json()) as { imported?: number; sourced?: number; companies?: unknown[] };
      const count = result.imported ?? result.sourced ?? result.companies?.length ?? 0;
      setActionState({
        kind: "source",
        pending: false,
        message: `Sourced ${count} companies into staging. Run enrichment next, then discovery.`,
      });
      await loadCompanies(true);
    } catch (err) {
      setActionState({
        kind: "source",
        pending: false,
        message: err instanceof Error ? err.message : "Sourcing failed",
      });
    }
  }

  async function handleEnrich() {
    try {
      setActionState({ kind: "enrich", pending: true, message: "Enriching candidates..." });
      const response = await fetch(`${apiBase()}/jobs/candidate-companies/enrich`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 100 }),
      });
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);
      const result = (await response.json()) as {
        processed?: number;
        llmAssistanceEnabled?: boolean;
      };
      const llmNote = result.llmAssistanceEnabled
        ? " LLM assistance was used."
        : " LLM assistance was not enabled.";
      setActionState({
        kind: "enrich",
        pending: false,
        message: `Enriched ${result.processed ?? 0} candidates.${llmNote}`,
      });
      await loadCompanies(true);
    } catch (err) {
      setActionState({
        kind: "enrich",
        pending: false,
        message: err instanceof Error ? err.message : "Enrichment failed",
      });
    }
  }

  async function handlePipeline() {
    try {
      setActionState({ kind: "pipeline", pending: true, message: "Queuing background candidate pipeline..." });
      const response = await fetch(`${apiBase()}/jobs/candidate-pipeline/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 1000 }),
      });
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);
      const result = (await response.json()) as { enqueued?: number; candidateCompanies?: number };
      setActionState({
        kind: "pipeline",
        pending: false,
        message: `Background pipeline queued for ${result.enqueued ?? 0} companies.`,
      });
      await loadCompanies(true);
    } catch (err) {
      setActionState({
        kind: "pipeline",
        pending: false,
        message: err instanceof Error ? err.message : "Pipeline failed",
      });
    }
  }

  const stats = useMemo(() => {
    const total = companies.length;
    const pending = companies.filter(
      (c) => c.status === "candidate" || c.status === "discovering",
    ).length;
    const discovered = companies.filter((c) => c.status === "discovered").length;
    const promoted = companies.filter((c) => c.status === "promoted").length;
    return { total, pending, discovered, promoted };
  }, [companies]);

  return (
    <div className="space-y-6">
      {error ? (
        <section className="bg-card rounded-2xl p-6 shadow-[0_2px_12px_rgba(26,32,24,0.06)]">
          <p className="text-sm text-red-700">Could not load candidate companies: {error}</p>
        </section>
      ) : null}

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricPill label="Total Candidates" value={stats.total} tone="neutral" />
        <MetricPill label="Pending Discovery" value={stats.pending} tone="warning" />
        <MetricPill label="Discovered" value={stats.discovered} tone="info" />
        <MetricPill label="Promoted" value={stats.promoted} tone="positive" />
      </section>

      <section className="rounded-2xl border border-line bg-card p-5">
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-ink text-sm font-semibold tracking-tight">Company-First Sourcing</h2>
            <span className="rounded-full border border-line px-2.5 py-0.5 text-[10px] text-sage">Fallback</span>
          </div>
          <p className="text-sage text-xs leading-5">
            Use this when board-first sourcing misses a company. Source companies by tier, enrich to find their ATS URL, then run discovery. For most cases, start from the <span className="font-medium text-ink">Candidate Boards</span> tab instead.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="block text-[11px] uppercase tracking-[0.12em] text-sage mb-1.5">Tier</label>
            <select
              value={sourceForm.tier}
              onChange={(e) => setSourceForm((f) => ({ ...f, tier: e.target.value as "top" | "priority" | "growth" }))}
              className="w-full rounded-xl border border-line bg-parchment/50 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent/40"
            >
              <option value="top">Top</option>
              <option value="priority">Priority</option>
              <option value="growth">Growth</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-[0.12em] text-sage mb-1.5">Limit</label>
            <input
              type="number"
              min={1}
              max={100}
              value={sourceForm.limit}
              onChange={(e) => setSourceForm((f) => ({ ...f, limit: Math.max(1, Number(e.target.value)) }))}
              className="w-full rounded-xl border border-line bg-parchment/50 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent/40"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-[11px] uppercase tracking-[0.12em] text-sage mb-1.5">Focus Areas</label>
            <input
              type="text"
              value={sourceForm.focusAreas}
              onChange={(e) => setSourceForm((f) => ({ ...f, focusAreas: e.target.value }))}
              placeholder={DEFAULT_IT_FOCUS_AREAS}
              className="w-full rounded-xl border border-line bg-parchment/50 px-3 py-2 text-sm text-ink placeholder:text-sage/50 focus:outline-none focus:ring-1 focus:ring-accent/40"
            />
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-[11px] uppercase tracking-[0.12em] text-sage mb-1.5">Custom Query <span className="normal-case tracking-normal">(optional)</span></label>
          <textarea
            value={sourceForm.customQuery}
            onChange={(e) => setSourceForm((f) => ({ ...f, customQuery: e.target.value }))}
            placeholder="e.g. AI-native startups hiring product managers in 2024"
            rows={2}
            className="w-full rounded-xl border border-line bg-parchment/50 px-3 py-2 text-sm text-ink placeholder:text-sage/50 focus:outline-none focus:ring-1 focus:ring-accent/40 resize-none"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSource()}
            disabled={actionState.pending && actionState.kind === "source"}
            className="inline-flex items-center justify-center rounded-full border border-line px-5 py-2 text-sm font-medium text-ink transition-all hover:bg-parchment active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
          >
            {actionState.pending && actionState.kind === "source" ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />
                Sourcing...
              </span>
            ) : (
              "Source Companies"
            )}
          </button>
          {actionState.message && actionState.kind === "source" && !actionState.pending ? (
            <p className="text-xs text-sage" aria-live="polite">{actionState.message}</p>
          ) : null}
        </div>
      </section>

      <section className="bg-card rounded-2xl p-5 shadow-[0_2px_12px_rgba(26,32,24,0.06)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex-1">
            <h2 className="text-ink text-sm font-semibold tracking-tight mb-1">Import Candidates</h2>
            <p className="text-sage text-xs leading-5 mb-3">
              Paste JSON or CSV. Duplicates are handled by normalized company, homepage, and domain. Use either a{" "}
              <code className="font-mono bg-parchment px-1 rounded">{"{ companies: [...] }"}</code>{" "}
              object, a bare array, or CSV with company/homepage columns.
            </p>
            <textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder={"company,homepage,companyDomain,careersUrl,sourceHint,segments,tier,origin,notes\nExample AI,https://example.ai,example.ai,,greenhouse,ai|software engineering,priority,manual:csv-import,AI infrastructure with US roles"}
              rows={7}
              className="w-full rounded-xl border border-line bg-parchment/50 px-4 py-3 text-xs font-mono text-ink placeholder:text-sage/60 focus:outline-none focus:ring-1 focus:ring-accent/40 resize-y"
            />
            {importError ? (
              <p className="text-xs text-red-600 mt-1">{importError}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-3 md:pt-8 md:min-w-[200px]">
            <input
              ref={importFileInputRef}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              onChange={(event) => void handleImportFile(event)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => importFileInputRef.current?.click()}
              disabled={actionState.pending}
              className="inline-flex items-center justify-center rounded-full border border-line px-4 py-2.5 text-sm font-medium text-ink transition-all hover:bg-parchment active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
            >
              Choose CSV/JSON
            </button>
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={!importJson.trim() || (actionState.pending && actionState.kind === "import")}
              className="inline-flex items-center justify-center rounded-full bg-[#1a2018] px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-[#242b21] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {actionState.pending && actionState.kind === "import" ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Importing...
                </span>
              ) : (
                "Import Candidates"
              )}
            </button>
            <button
              type="button"
              onClick={() => void handleEnrich()}
              disabled={actionState.pending && actionState.kind === "enrich"}
              className="inline-flex items-center justify-center rounded-full border border-line px-4 py-2.5 text-sm font-medium text-ink transition-all hover:bg-parchment active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
            >
              {actionState.pending && actionState.kind === "enrich" ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />
                  Enriching...
                </span>
              ) : (
                "Enrich Candidates"
              )}
            </button>
            <button
              type="button"
              onClick={() => void handleDiscover()}
              disabled={actionState.pending && actionState.kind === "discover"}
              className="inline-flex items-center justify-center rounded-full border border-line px-4 py-2.5 text-sm font-medium text-ink transition-all hover:bg-parchment active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
            >
              {actionState.pending && actionState.kind === "discover" ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />
                  Queuing...
                </span>
              ) : (
                "Run Discovery"
              )}
            </button>
            <button
              type="button"
              onClick={() => void handlePipeline()}
              disabled={actionState.pending && actionState.kind === "pipeline"}
              className="inline-flex items-center justify-center rounded-full bg-[#1a2018] px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-[#242b21] active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
            >
              {actionState.pending && actionState.kind === "pipeline" ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Queuing...
                </span>
              ) : (
                "Run Background Pipeline"
              )}
            </button>
          </div>
        </div>
        {actionState.message && actionState.kind !== null ? (
          <p className="text-xs text-sage mt-3" aria-live="polite">
            {actionState.message}
          </p>
        ) : null}
      </section>

      <section className="bg-card rounded-2xl shadow-[0_2px_12px_rgba(26,32,24,0.06)] overflow-hidden">
        <div className="px-6 py-5 border-b border-line">
          <h2 className="text-ink text-sm font-semibold tracking-tight">Candidate Companies</h2>
          <p className="text-sage text-xs mt-1">
            {loading
              ? "Loading candidate companies..."
              : `${companies.length} candidate${companies.length === 1 ? "" : "s"} in staging`}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1060px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-sage">
                <th className="px-6 py-4 font-medium">Company</th>
                <th className="px-4 py-4 font-medium">Homepage</th>
                <th className="px-4 py-4 font-medium">Careers URL</th>
                <th className="px-4 py-4 font-medium">Source Hint</th>
                <th className="px-4 py-4 font-medium">Confidence</th>
                <th className="px-4 py-4 font-medium">Segments</th>
                <th className="px-4 py-4 font-medium">Status</th>
                <th className="px-4 py-4 font-medium">Boards</th>
                <th className="px-4 py-4 font-medium">Last Discovered</th>
                <th className="px-4 py-4 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-6 py-8 text-center text-sm text-sage">
                    Loading...
                  </td>
                </tr>
              ) : companies.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-8 text-center text-sm text-sage">
                    No candidate companies yet. Import some above to get started.
                  </td>
                </tr>
              ) : (
                companies.map((company) => {
                  const tone = companyStatusTone(company.status);
                  return (
                    <tr key={company.id} className="border-t border-line/70 align-top">
                      <td className="px-6 py-4">
                        <p className="text-ink text-sm font-medium">{company.company}</p>
                        {company.companyDomain ? (
                          <p className="text-sage text-xs mt-0.5">{company.companyDomain}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 text-xs">
                        {company.homepage ? (
                          <a
                            href={company.homepage}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:underline truncate max-w-[140px] block"
                          >
                            {company.homepage.replace(/^https?:\/\//, "")}
                          </a>
                        ) : (
                          <span className="text-sage">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-xs">
                        {company.careersUrl ? (
                          <a
                            href={company.careersUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:underline truncate max-w-[140px] block"
                          >
                            {company.careersUrl.replace(/^https?:\/\//, "")}
                          </a>
                        ) : (
                          <span className="text-sage">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-ink">{company.sourceHint ?? "—"}</td>
                      <td className="px-4 py-4 text-sm text-ink tabular-nums">
                        {company.confidence != null
                          ? `${Math.round(company.confidence * 100)}%`
                          : "—"}
                      </td>
                      <td className="px-4 py-4 max-w-[160px]">
                        {company.segments.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {company.segments.slice(0, 3).map((seg) => (
                              <span
                                key={seg}
                                className="rounded-full bg-parchment px-2 py-0.5 text-[10px] text-sage"
                              >
                                {seg}
                              </span>
                            ))}
                            {company.segments.length > 3 ? (
                              <span className="text-[10px] text-sage">
                                +{company.segments.length - 3}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-sage text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium"
                          style={{ background: tone.bg, color: tone.color }}
                        >
                          {tone.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-ink tabular-nums">
                        {company.candidateBoards?.length ?? 0}
                      </td>
                      <td className="px-4 py-4 text-sm text-sage">
                        {formatRelativeish(company.lastDiscoveredAt)}
                      </td>
                      <td className="px-4 py-4 text-xs text-sage max-w-[180px]">
                        {company.lastDiscoveryError ?? "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

type BoardSourceResult = {
  requested?: number;
  discovered?: number;
  deduped?: number;
  validated?: number;
  skippedDuplicates?: number;
  skippedDuplicateBoards?: Array<{
    source?: string;
    boardToken?: string;
    evidenceUrl?: string;
  }>;
  failedValidationCount?: number;
  failedValidations?: Array<{
    source?: string;
    boardToken?: string;
    reason?: string;
    evidenceUrl?: string;
  }>;
  sourceBreakdown?: Record<
    string,
    {
      requested?: number;
      discovered?: number;
      deduped?: number;
      skipped?: number;
      validated?: number;
      failed?: number;
    }
  >;
};

function CandidateBoardsPanel() {
  const [boards, setBoards] = useState<CandidateBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [boardSourceForm, setBoardSourceForm] = useState({
    limit: 25,
    focusAreas: DEFAULT_IT_FOCUS_AREAS,
    customQuery: "",
  });
  const [boardSourceResult, setBoardSourceResult] = useState<BoardSourceResult | null>(null);
  const [actionState, setActionState] = useState<{
    kind: "validate" | "promote" | "source" | null;
    pending: boolean;
    message: string | null;
  }>({ kind: null, pending: false, message: null });

  async function loadBoards(silent = false) {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const response = await fetch(`${apiBase()}/jobs/candidate-boards`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);
      const payload = (await response.json()) as CandidateBoard[];
      setBoards(payload);
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setBoards([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void loadBoards();

    const interval = window.setInterval(() => {
      if (!cancelled) void loadBoards(true);
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  async function handleBoardSource() {
    try {
      setBoardSourceResult(null);
      setActionState({ kind: "source", pending: true, message: null });
      const focusAreas = boardSourceForm.focusAreas
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const body: Record<string, unknown> = { limit: boardSourceForm.limit };
      if (focusAreas.length) body.focusAreas = focusAreas;
      if (boardSourceForm.customQuery.trim()) body.customQuery = boardSourceForm.customQuery.trim();

      const response = await fetch(`${apiBase()}/jobs/candidate-boards/source`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);
      const result = (await response.json()) as BoardSourceResult;
      setBoardSourceResult(result);
      setActionState({ kind: "source", pending: false, message: null });
      await loadBoards(true);
    } catch (err) {
      setActionState({
        kind: "source",
        pending: false,
        message: err instanceof Error ? err.message : "Board sourcing failed",
      });
    }
  }

  async function handleValidate() {
    try {
      setActionState({ kind: "validate", pending: true, message: "Queuing validation..." });
      const response = await fetch(`${apiBase()}/jobs/candidate-boards/validate`, {
        method: "POST",
      });
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);
      const result = (await response.json()) as { enqueued?: number; queued?: number; validated?: number };
      setActionState({
        kind: "validate",
        pending: false,
        message: `Validation queued for ${result.enqueued ?? result.queued ?? result.validated ?? 0} boards.`,
      });
      await loadBoards(true);
    } catch (err) {
      setActionState({
        kind: "validate",
        pending: false,
        message: err instanceof Error ? err.message : "Validation failed",
      });
    }
  }

  async function handlePromote() {
    try {
      setActionState({ kind: "promote", pending: true, message: "Promoting validated boards..." });
      const response = await fetch(`${apiBase()}/jobs/candidate-boards/promote`, {
        method: "POST",
      });
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);
      const result = (await response.json()) as { promoted?: number; enqueued?: number };
      setActionState({
        kind: "promote",
        pending: false,
        message: `${result.promoted ?? result.enqueued ?? 0} boards promoted to tracked registry.`,
      });
      await loadBoards(true);
    } catch (err) {
      setActionState({
        kind: "promote",
        pending: false,
        message: err instanceof Error ? err.message : "Promotion failed",
      });
    }
  }

  const stats = useMemo(() => {
    const discovered = boards.filter((b) => b.status === "discovered").length;
    const validated = boards.filter((b) => b.status === "validated").length;
    const rejected = boards.filter((b) => b.status === "rejected").length;
    const promoted = boards.filter((b) => b.status === "promoted").length;
    return { discovered, validated, rejected, promoted };
  }, [boards]);

  const validatedCount = stats.validated;

  return (
    <div className="space-y-6">
      {error ? (
        <section className="bg-card rounded-2xl p-6 shadow-[0_2px_12px_rgba(26,32,24,0.06)]">
          <p className="text-sm text-red-700">Could not load candidate boards: {error}</p>
        </section>
      ) : null}

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricPill label="Discovered" value={stats.discovered} tone="neutral" />
        <MetricPill label="Validated" value={stats.validated} tone="info" />
        <MetricPill label="Rejected" value={stats.rejected} tone="danger" />
        <MetricPill label="Promoted" value={stats.promoted} tone="positive" />
      </section>

      <section className="bg-card rounded-2xl p-5 shadow-[0_2px_12px_rgba(26,32,24,0.06)]">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-ink text-sm font-semibold tracking-tight">Board-First Sourcing</h2>
              <span className="rounded-full bg-[#1a2018] px-2.5 py-0.5 text-[10px] font-medium text-white">Preferred</span>
            </div>
            <p className="text-sage text-xs leading-5">
              Discover public Greenhouse, Lever, and Ashby boards directly — boards land pre-validated in staging, ready to promote.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-[11px] uppercase tracking-[0.12em] text-sage mb-1.5">Limit</label>
            <input
              type="number"
              min={1}
              max={200}
              value={boardSourceForm.limit}
              onChange={(e) =>
                setBoardSourceForm((f) => ({
                  ...f,
                  limit: Math.min(200, Math.max(1, Number(e.target.value))),
                }))
              }
              className="w-full rounded-xl border border-line bg-parchment/50 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent/40"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-[11px] uppercase tracking-[0.12em] text-sage mb-1.5">Focus Areas</label>
            <input
              type="text"
              value={boardSourceForm.focusAreas}
              onChange={(e) => setBoardSourceForm((f) => ({ ...f, focusAreas: e.target.value }))}
              placeholder={DEFAULT_IT_FOCUS_AREAS}
              className="w-full rounded-xl border border-line bg-parchment/50 px-3 py-2 text-sm text-ink placeholder:text-sage/50 focus:outline-none focus:ring-1 focus:ring-accent/40"
            />
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-[11px] uppercase tracking-[0.12em] text-sage mb-1.5">
            Custom Query <span className="normal-case tracking-normal">(optional)</span>
          </label>
          <textarea
            value={boardSourceForm.customQuery}
            onChange={(e) => setBoardSourceForm((f) => ({ ...f, customQuery: e.target.value }))}
            placeholder="e.g. fast-growing AI startups with open product and engineering roles"
            rows={2}
            className="w-full rounded-xl border border-line bg-parchment/50 px-3 py-2 text-sm text-ink placeholder:text-sage/50 focus:outline-none focus:ring-1 focus:ring-accent/40 resize-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleBoardSource()}
            disabled={actionState.pending && actionState.kind === "source"}
            className="inline-flex items-center justify-center rounded-full bg-[#1a2018] px-5 py-2 text-sm font-medium text-white transition-all hover:bg-[#242b21] active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
          >
            {actionState.pending && actionState.kind === "source" ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Sourcing...
              </span>
            ) : (
              "Source Boards"
            )}
          </button>
          {actionState.message && actionState.kind === "source" ? (
            <p className="text-xs text-red-600" aria-live="polite">{actionState.message}</p>
          ) : null}
        </div>

        {boardSourceResult ? (
          <div className="mt-4 rounded-xl border border-line bg-parchment/40 px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-sage mb-2">Last Run</p>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink">
              <span><span className="text-sage">Requested</span> {boardSourceResult.requested ?? "—"}</span>
              <span><span className="text-sage">Discovered</span> {boardSourceResult.discovered ?? "—"}</span>
              <span><span className="text-sage">Deduped</span> {boardSourceResult.deduped ?? "—"}</span>
              <span><span className="text-sage">Validated</span> <span className="font-medium text-positive">{boardSourceResult.validated ?? "—"}</span></span>
              <span><span className="text-sage">Skipped</span> {boardSourceResult.skippedDuplicates ?? "—"}</span>
              {boardSourceResult.failedValidationCount != null && boardSourceResult.failedValidationCount > 0 ? (
                <span style={{ color: "#be185d" }}>
                  <span className="font-medium">{boardSourceResult.failedValidationCount}</span> failed validation
                </span>
              ) : null}
            </div>
            {boardSourceResult.sourceBreakdown &&
            Object.keys(boardSourceResult.sourceBreakdown).length > 0 ? (
              <div className="mt-3 space-y-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-sage">Source Breakdown</p>
                <div className="grid gap-2 md:grid-cols-3">
                  {Object.entries(boardSourceResult.sourceBreakdown).map(([source, stats]) => (
                    <div
                      key={source}
                      className="rounded-lg border border-line bg-card/70 px-3 py-2 text-xs text-sage"
                    >
                      <p className="text-ink font-medium capitalize">{source}</p>
                      <div className="mt-1 space-y-0.5">
                        <p>Requested {stats.requested ?? 0}</p>
                        <p>Discovered {stats.discovered ?? 0}</p>
                        <p>Deduped {stats.deduped ?? 0}</p>
                        <p>Skipped {stats.skipped ?? 0}</p>
                        <p>Validated {stats.validated ?? 0}</p>
                        <p>Failed {stats.failed ?? 0}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {boardSourceResult.skippedDuplicateBoards &&
            boardSourceResult.skippedDuplicateBoards.length > 0 ? (
              <div className="mt-3 space-y-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-sage">Skipped As Duplicates</p>
                <div className="space-y-2">
                  {boardSourceResult.skippedDuplicateBoards.slice(0, 5).map((duplicate, index) => (
                    <div
                      key={`${duplicate.source ?? "unknown"}:${duplicate.boardToken ?? index}:${index}`}
                      className="rounded-lg border border-line bg-card/70 px-3 py-2 text-xs text-sage"
                    >
                      <p className="text-ink">
                        <span className="font-medium">
                          {duplicate.source ?? "unknown"} / {duplicate.boardToken ?? "unknown"}
                        </span>
                      </p>
                      {duplicate.evidenceUrl ? (
                        <p className="truncate">
                          <span className="text-sage">Evidence:</span>{" "}
                          <a
                            href={duplicate.evidenceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent hover:underline"
                          >
                            {duplicate.evidenceUrl}
                          </a>
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {boardSourceResult.failedValidations && boardSourceResult.failedValidations.length > 0 ? (
              <div className="mt-3 space-y-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-sage">Failure Details</p>
                <div className="space-y-2">
                  {boardSourceResult.failedValidations.slice(0, 5).map((failure, index) => (
                    <div
                      key={`${failure.source ?? "unknown"}:${failure.boardToken ?? index}:${index}`}
                      className="rounded-lg border border-line bg-card/70 px-3 py-2 text-xs text-sage"
                    >
                      <p className="text-ink">
                        <span className="font-medium">
                          {failure.source ?? "unknown"} / {failure.boardToken ?? "unknown"}
                        </span>
                      </p>
                      <p>{failure.reason ?? "Validation failed"}</p>
                      {failure.evidenceUrl ? (
                        <p className="truncate">
                          <span className="text-sage">Evidence:</span>{" "}
                          <a
                            href={failure.evidenceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent hover:underline"
                          >
                            {failure.evidenceUrl}
                          </a>
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 pt-4 border-t border-line">
          <p className="text-[11px] text-sage leading-5">
            <span className="font-medium text-ink">Fallback:</span> source companies first, then test whether they expose a supported ATS board.
            Use the Candidate Companies tab for that flow.
          </p>
        </div>
      </section>

      <section className="bg-card rounded-2xl p-5 shadow-[0_2px_12px_rgba(26,32,24,0.06)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-ink text-sm font-semibold tracking-tight">Staging Actions</h2>
            <p className="text-sage text-xs mt-1 leading-5">
              Manual board sourcing leaves validated boards here for promotion. The background pipeline
              validates and promotes matching boards automatically.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleValidate()}
              disabled={actionState.pending && actionState.kind === "validate"}
              className="inline-flex min-w-[196px] items-center justify-center rounded-full border border-line px-4 py-2 text-sm font-medium text-ink transition-all hover:bg-parchment active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
            >
              {actionState.pending && actionState.kind === "validate" ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />
                  Validating...
                </span>
              ) : (
                "Validate Candidate Boards"
              )}
            </button>
            <button
              type="button"
              onClick={() => void handlePromote()}
              disabled={
                (actionState.pending && actionState.kind === "promote") || validatedCount === 0
              }
              className="inline-flex min-w-[196px] items-center justify-center rounded-full bg-[#1a2018] px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#242b21] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {actionState.pending && actionState.kind === "promote" ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Promoting...
                </span>
              ) : (
                `Promote to Tracked Boards${validatedCount > 0 ? ` (${validatedCount})` : ""}`
              )}
            </button>
          </div>
        </div>
        {actionState.message ? (
          <p className="text-xs text-sage mt-3" aria-live="polite">
            {actionState.message}
          </p>
        ) : null}
      </section>

      <section className="bg-card rounded-2xl shadow-[0_2px_12px_rgba(26,32,24,0.06)] overflow-hidden">
        <div className="px-6 py-5 border-b border-line">
          <h2 className="text-ink text-sm font-semibold tracking-tight">Candidate Boards</h2>
          <p className="text-sage text-xs mt-1">
            {loading
              ? "Loading candidate boards..."
              : `${boards.length} candidate board${boards.length === 1 ? "" : "s"} tracked`}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-sage">
                <th className="px-6 py-4 font-medium">Company</th>
                <th className="px-4 py-4 font-medium">Source</th>
                <th className="px-4 py-4 font-medium">Board Token</th>
                <th className="px-4 py-4 font-medium">Evidence URL</th>
                <th className="px-4 py-4 font-medium">Status</th>
                <th className="px-4 py-4 font-medium">Validation Error</th>
                <th className="px-4 py-4 font-medium">Validated At</th>
                <th className="px-4 py-4 font-medium">Promoted At</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-sm text-sage">
                    Loading...
                  </td>
                </tr>
              ) : boards.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-sm text-sage">
                    No candidate boards yet. Use Source Boards first, or use Candidate Companies as the fallback path.
                  </td>
                </tr>
              ) : (
                boards.map((board) => {
                  const tone = boardStatusTone(board.status);
                  const isRejected = board.status === "rejected";
                  return (
                    <tr
                      key={board.id}
                      className="border-t border-line/70 align-top"
                      style={isRejected ? { background: "rgba(190,24,93,0.03)" } : undefined}
                    >
                      <td className="px-6 py-4">
                        <p className="text-ink text-sm font-medium">
                          {board.candidateCompany?.company ?? "—"}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-sm text-ink capitalize">{board.sourceName}</td>
                      <td className="px-4 py-4 text-sm text-sage font-mono">{board.boardToken}</td>
                      <td className="px-4 py-4 text-xs">
                        {board.evidenceUrl ? (
                          <a
                            href={board.evidenceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:underline truncate max-w-[160px] block"
                          >
                            {board.evidenceUrl.replace(/^https?:\/\//, "")}
                          </a>
                        ) : (
                          <span className="text-sage">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium"
                          style={{ background: tone.bg, color: tone.color }}
                        >
                          {tone.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs max-w-[200px]" style={{ color: isRejected && board.validationError ? "#be185d" : "#5a6455" }}>
                        {board.validationError ?? "—"}
                      </td>
                      <td className="px-4 py-4 text-sm text-sage">
                        {formatRelativeish(board.validatedAt)}
                      </td>
                      <td className="px-4 py-4 text-sm text-sage">
                        {formatRelativeish(board.promotedAt)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ResearchBacklogPanel() {
  const [companies, setCompanies] = useState<CandidateCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadBacklog(silent = false) {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const response = await fetch(`${apiBase()}/jobs/candidate-research-backlog`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);
      const payload = (await response.json()) as CandidateCompany[];
      setCompanies(payload);
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setCompanies([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void loadBacklog();

    const interval = window.setInterval(() => {
      if (!cancelled) void loadBacklog(true);
    }, 8000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const stats = useMemo(() => {
    const byKind = companies.reduce<Record<string, number>>((acc, company) => {
      const kind = classifyResearchBacklog(company);
      acc[kind] = (acc[kind] ?? 0) + 1;
      return acc;
    }, {});

    return {
      total: companies.length,
      direct: byKind["Direct Careers"] ?? 0,
      retry: byKind["Retry Supported ATS"] ?? 0,
      blocked: byKind.Blocked ?? 0,
      byKind,
    };
  }, [companies]);

  return (
    <div className="space-y-6">
      {error ? (
        <section className="bg-card rounded-2xl p-6 shadow-[0_2px_12px_rgba(26,32,24,0.06)]">
          <p className="text-sm text-red-700">Could not load research backlog: {error}</p>
        </section>
      ) : null}

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricPill label="Backlog Items" value={stats.total} tone="neutral" />
        <MetricPill label="Direct Careers" value={stats.direct} tone="info" />
        <MetricPill label="Retry ATS" value={stats.retry} tone="warning" />
        <MetricPill label="Blocked" value={stats.blocked} tone="danger" />
      </section>

      <section className="bg-card rounded-2xl p-5 shadow-[0_2px_12px_rgba(26,32,24,0.06)]">
        <h2 className="text-ink text-sm font-semibold tracking-tight mb-1">Research Backlog</h2>
        <p className="text-sage text-xs leading-5">
          These companies are out of active staging. Keep them here for future ATS adapters, direct-career ingestion, or selective retries.
        </p>
      </section>

      <section className="bg-card rounded-2xl shadow-[0_2px_12px_rgba(26,32,24,0.06)] overflow-hidden">
        <div className="px-6 py-5 border-b border-line">
          <h2 className="text-ink text-sm font-semibold tracking-tight">Backlog Companies</h2>
          <p className="text-sage text-xs mt-1">
            {loading
              ? "Loading research backlog..."
              : `${companies.length} compan${companies.length === 1 ? "y" : "ies"} outside active staging`}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-sage">
                <th className="px-6 py-4 font-medium">Company</th>
                <th className="px-4 py-4 font-medium">Kind</th>
                <th className="px-4 py-4 font-medium">Homepage</th>
                <th className="px-4 py-4 font-medium">Careers URL</th>
                <th className="px-4 py-4 font-medium">Status</th>
                <th className="px-4 py-4 font-medium">Last Checked</th>
                <th className="px-4 py-4 font-medium">Signal</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-sm text-sage">
                    Loading...
                  </td>
                </tr>
              ) : companies.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-sm text-sage">
                    No research backlog yet.
                  </td>
                </tr>
              ) : (
                companies.map((company) => {
                  const tone = companyStatusTone(company.status);
                  const kind = classifyResearchBacklog(company);

                  return (
                    <tr key={company.id} className="border-t border-line/70 align-top">
                      <td className="px-6 py-4">
                        <p className="text-ink text-sm font-medium">{company.company}</p>
                        {company.companyDomain ? (
                          <p className="text-sage text-xs mt-0.5">{company.companyDomain}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 text-sm text-ink">{kind}</td>
                      <td className="px-4 py-4 text-xs">
                        <a
                          href={company.homepage}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:underline truncate max-w-[150px] block"
                        >
                          {company.homepage.replace(/^https?:\/\//, "")}
                        </a>
                      </td>
                      <td className="px-4 py-4 text-xs">
                        {company.careersUrl ? (
                          <a
                            href={company.careersUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:underline truncate max-w-[180px] block"
                          >
                            {company.careersUrl.replace(/^https?:\/\//, "")}
                          </a>
                        ) : (
                          <span className="text-sage">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium"
                          style={{ background: tone.bg, color: tone.color }}
                        >
                          {tone.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-sage">
                        {formatRelativeish(company.lastDiscoveredAt)}
                      </td>
                      <td className="px-4 py-4 text-xs text-sage max-w-[240px]">
                        <span className="line-clamp-3">{company.lastDiscoveryError ?? company.notes ?? "—"}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

type PipelineTab = "companies" | "boards" | "backlog";

export function CandidatePipelineShell() {
  const [tab, setTab] = useState<PipelineTab>("companies");

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-2xl p-1 shadow-[0_2px_12px_rgba(26,32,24,0.06)] inline-flex gap-1">
        <button
          type="button"
          onClick={() => setTab("companies")}
          className="rounded-xl px-5 py-2 text-sm font-medium transition-all"
          style={
            tab === "companies"
              ? { background: "#1a2018", color: "#ffffff" }
              : { color: "#5a6455" }
          }
        >
          Candidate Companies
        </button>
        <button
          type="button"
          onClick={() => setTab("boards")}
          className="rounded-xl px-5 py-2 text-sm font-medium transition-all"
          style={
            tab === "boards"
              ? { background: "#1a2018", color: "#ffffff" }
              : { color: "#5a6455" }
          }
        >
          Candidate Boards
        </button>
        <button
          type="button"
          onClick={() => setTab("backlog")}
          className="rounded-xl px-5 py-2 text-sm font-medium transition-all"
          style={
            tab === "backlog"
              ? { background: "#1a2018", color: "#ffffff" }
              : { color: "#5a6455" }
          }
        >
          Research Backlog
        </button>
      </div>

      {tab === "companies" ? (
        <CandidateCompaniesPanel />
      ) : tab === "boards" ? (
        <CandidateBoardsPanel />
      ) : (
        <ResearchBacklogPanel />
      )}
    </div>
  );
}
