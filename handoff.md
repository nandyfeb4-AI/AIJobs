# Claude Code UI Handoff

No required UI work is pending right now.

The following are already wired and should be treated as complete:

- board-first sourcing is the preferred path in `Candidate Boards`
- company-first remains visible only as fallback in `Candidate Companies`
- board-first last-run summary shows:
  - requested
  - discovered
  - deduped
  - validated
  - skipped duplicates
  - failed validation count
  - compact failure details
- rejected board-first candidates are visible in the candidate boards table
- candidate boards table surfaces `validationError`
- candidate pipeline polling / refresh behavior is already in place

## Optional Future Enhancement

The backend board-first sourcing response now also includes a per-source breakdown internally useful for debugging query balance across:

- greenhouse
- lever
- ashby

Do not wire this unless explicitly requested. It is optional observability, not pending work.

## Only If A New Request Comes In

If future UI work is requested, keep these constraints:

- do not redesign the boards page
- do not move the product back toward company-first as the main flow
- keep board-first as the primary expansion path
- keep company-first as fallback only
- do not touch the existing verified board coverage tab unless explicitly asked

## Likely File

- `apps/web/components/candidate-pipeline-shell.tsx`
