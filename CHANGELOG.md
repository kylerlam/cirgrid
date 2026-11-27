# Changelog

## 1.3.0 — 2026-11-27

- Save each check-in on its own through `POST /api/checkin`, instead of uploading every habit and the whole check-in history on each tap. Habit edits still save the full tracker.
- Count sign-in attempts by the visitor address that Cloudflare reports in `CF-Connecting-IP`, but only for requests from the reverse proxies listed in `TRUSTED_PROXY_IPS` whose `X-Real-IP` is a Cloudflare edge. Previously every visitor behind the proxy shared one limit, so failed attempts by anyone could lock out the owner for a few minutes.
- Add `?v=<version>` to script and stylesheet URLs so browsers and Cloudflare cannot mix files from two releases.
- Send `X-Frame-Options: DENY`, and HSTS when secure cookies are enabled.
- Name export files with the Hong Kong date (or the `TZ` setting) rather than the container clock.

## 1.2.2 — 2026-11-06

- Limit new and edited habit start dates to today or earlier, while allowing future end dates and preserving existing check-ins.
- Pad Chinese week-range months and days, use tabular numerals, and keep week-navigation arrows in a fixed position at desktop and mobile widths.

## 1.2.1 — 2026-11-06

- Keep today's transparent grid-column outline continuous on mobile, including habit labels and wrapped stage details, without blocking check-ins.

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
