# Hatch Operator Web App Design

Date: 2026-09-11
Status: Approved

## Goal

Build a TortoiseOS-branded operator web app around the existing Sui read-only arbitrage scanner. Match the useful information architecture of `eth-flashloan`: an overview home and a dedicated scanner workspace. Preserve the scanner safety boundary: no wallet, signing, programmable transaction block, submission, or execution capability.

## User and product posture

Primary user is the protocol operator running Hatch locally. The app turns raw JSONL evidence into a fast operational view for running bounded scans, judging net profitability, inspecting quote routes, and diagnosing provider failures.

Hatch must describe results as quote signals rather than executable profit. Provider overlap, shared pool use, quote age, and non-atomic round trips remain visible.

## Chosen architecture

Use a Next.js frontend backed by the Rust scanner service.

```text
Browser
  |-- Overview dashboard
  `-- Scanner workspace
          |
          v
Rust scanner HTTP service
  |-- POST /api/scans
  |-- GET  /api/scans/latest
  |-- GET  /api/scans
  `-- GET  /api/health
          |
          v
Cetus and Bluefin/7K quote APIs
```

Rust remains authoritative for quote requests, exact integer calculations, validation, and report history. Next.js handles presentation, local UI state, polling, theme, filtering, and disclosure. Atomic values cross the API as decimal strings and use browser `bigint`, never JavaScript `number`, for arithmetic.

## Rust service

Extend `apps/scanner` with an Axum server mode while keeping the current one-shot CLI behavior.

Endpoints:

- `GET /api/health`: process health, scan state, history count, latest observation time.
- `GET /api/config`: current default scan settings and supported providers.
- `POST /api/scans`: validate optional setting overrides and perform one bounded scan.
- `GET /api/scans/latest`: return newest successful report or a typed not-found response.
- `GET /api/scans?limit=20`: return newest-first in-memory history, capped at 100 reports.

Only one scan may run at once. A concurrent request returns `409` with `scan_in_progress`. Total upstream failure returns a structured error and preserves previous history. Partial provider failure returns a normal report containing both successful candidates and failure evidence. Service restart clears history; UI states this explicitly.

## Overview page

Route `/` provides a five-second system read:

- Sticky TortoiseOS header with turtle mark, Hatch name, Sui Mainnet label, theme toggle, API health, and persistent `READ ONLY` badge.
- Primary metric: best latest net return.
- Supporting metrics: candidates found, qualifying signals, provider failures, and report age.
- Primary navigation to scanner workspace.
- Secondary `Run scan` action.
- Recent scan list showing observation time, best result, candidate count, failures, and latency.

The overview never presents simulated totals as realized profit.

## Scanner page

Route `/scanner` follows the reference application's control-and-results layout.

Left control rail:

- Exact SUI input amount.
- Gas reserve.
- Minimum profit threshold in basis points.
- Request timeout and retry count.
- Cetus and Bluefin/7K source filters.
- `Run scan` action.

Right workspace:

- `Candidates`, `Routes`, `Failures`, and `History` tabs.
- Candidate rows show provider direction, venues, returned SUI, gross profit, gas reserve, net profit, basis points, and quote age.
- Expanded evidence shows hop order, pool IDs, quote IDs, latency, same-provider state, and shared-pool warning.
- Partial failures remain visible beside successful candidate data.

During refresh, prior results remain visible and action label becomes `Scanning quotes...`. Empty state explains purpose and offers `Run first scan`.

## Visual system

Use TortoiseOS identity rather than copying the Ethereum app's blue/purple palette:

- Primary teal `#02AAB0`, cyan `#00CDAC`, seafoam and deep-teal support colors.
- Cool tinted neutral scales in both themes.
- System theme on first load plus visible light/dark toggle and persisted preference.
- Fixed dashboard type scale, distinctive humanist sans-serif, and monospaced tabular numerals for atomic values.
- Restrained gradients on brand surfaces only; status semantics use explicit icons and labels, not color alone.
- Light mode uses subtle elevation. Dark mode uses stepped surface lightness rather than heavy shadows.
- Four-point spacing scale and clear section grouping without nested-card clutter.

Brand posture is deliberate, trustworthy, and technically sharp. Avoid casino styling, excessive glow, emoji-heavy cards, fake profitability, and execution affordances.

## Responsive and accessible behavior

- Desktop: fixed control rail and wide results table.
- Tablet: controls stack above results.
- Mobile: candidate table becomes labeled cards; route evidence uses accessible disclosure.
- Minimum 44px coarse-pointer targets, visible focus rings, keyboard-operable tabs, skip link, semantic headings, and descriptive status text.
- Meet WCAG AA contrast, preserve browser zoom, and honor `prefers-reduced-motion`.
- Motion stays within 100-300ms and uses transform/opacity only.

## Failure states

- Scanner offline: header and page show offline state plus local recovery command.
- Invalid setting: field-level message explains valid format or range.
- Total provider failure: current error shown; previous report remains visible.
- Partial failure: successful candidates plus provider-specific warning.
- Stale report: visible age label and stale state.
- Empty history after restart: message explains in-memory retention.

## Verification

- Rust handler tests cover validation, scan lock, history cap, latest/history responses, total failure, and partial failure.
- Existing scanner parsing, arithmetic, ranking, retry, formatting, Clippy, and live smoke checks continue passing.
- Frontend tests cover decimal-string formatting, theme behavior, tab navigation, and empty/loading/error/result states.
- Production build and type checking pass.
- Browser verification covers overview, scanner, light mode, dark mode, narrow viewport, and keyboard navigation.
- Repository search and API tests confirm no wallet, signing, PTB, submit, or execute route was added.

## Non-goals

Persistent database storage, authentication, multi-user dashboards, wallet connection, transaction simulation, PTB construction, signing, execution, flash-loan controls, alerts, and deployment remain outside this slice.
