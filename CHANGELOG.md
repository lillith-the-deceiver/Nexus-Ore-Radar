# Changelog

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
