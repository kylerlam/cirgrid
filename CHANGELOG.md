# Changelog

## 1.2.0 — 2026-11-06

- Add optional habit descriptions in the habit editor, preserved in JSON/YAML backups.
- Require a start date for new and edited habits, defaulting to today for new habits, and reject end dates before the start date.
- Disable dates before a habit starts in both trackers and history. Exclude those dates and weeks from missed outcomes.
- Upgrade older data with empty descriptions and inferred start dates while retaining existing check-ins. Use the earliest check-in, or today when there is none, capped at the end date.
- Close habit dialogs by clicking their backdrop, with the same behavior for Settings. Clicks and drags starting inside a dialog keep it open.

## 1.1.0 — 2026-11-05

- Reorder sidebar habits after a 0.3-second hold, with a highlighted drag preview, Escape cancellation, and Alt+Up/Down keyboard controls. Save the order across devices and both trackers.
- Place the grid tracker before the circular tracker.
- Highlight today's full grid column and circular sector with a theme-colored outline and shadow.
- Close Settings by clicking its backdrop; clicks inside the form keep it open.
- Keep sorting unlocked after a long press is released, and prevent native text selection or dragging from interrupting sorting.

## 1.0.0 — 2026-11-04

- Start new installations with an empty tracker; retain existing and imported records.
- Sign in with an independent account backed by Python, SQLite, and Docker.
- Track weekly goals, historical targets, and makeup check-ins with gold outlines.
- Create ongoing or staged habits with an optional end date and goal text.
- Browse month and year history with inline date details and an explicit weekly-tracker action.
- Choose preset or hexadecimal habit colors, ten themes, and four interface languages.
- Import and export backups while keeping local documents, databases, and exports out of Git and container builds.

The separate `codex/demo` branch uses fictional samples and browser-local storage. It does not connect to the private application's account or database.
