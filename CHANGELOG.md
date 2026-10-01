# Changelog

## 0.3.0 — 2026-10-01

- Fixed missed mining reports and unintended analytics loss after extension updates or long sessions.
- Fixed stalled and failed belt updates during temporary Nexus reloads while preserving prior results.
- Restored Personal App scan pacing and candidate priority behavior.

## 0.2.9 — 2026-09-30

- Added a Chrome side-panel view that is available only on Nexus Legacy tabs.
- Added switching between the sidebar and full-tab views, remembering the last view used while keeping only one Radar view open.
- Added a compact, responsive sidebar layout for narrow, medium and wide panel sizes.
- Fixed the full-view Radar tab remaining open after switching to the sidebar.
- Fixed Fleet & Presets stretching across wide sidebars, closing while fleet values were edited and losing input focus during refreshes.

## 0.2.8 — 2026-09-30

- Fixed missed mining reports during long or intensive play sessions.
- Added an extension-owned six-second report capture loop that continues while the Nexus tab is hidden.
- Prioritized short-lived report feeds and saved raw reports before mission linking, fuel calculations and uploads.
- Added watchdog recovery if Chrome stops and later restarts the extension worker.

## 0.2.7 — 2026-09-30

- Added Fleet & Presets with account-and-season-specific saved fleets.
- Added yield, fuel and time optimization using the Personal app calculations, current ship values, the full selected fleet, Excavator bonuses and belt richness.
- Added historical Miner and Ice Drill breakdown baselines until five attributable local runs are available for each hull.
- Added yield-per-hour, fuel-per-unit and mission-duration estimates to optimized belt results.
- Added exact active-mission field markers and improved scan preparation, cancellation and analytics refresh behavior.
