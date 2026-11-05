# CirGrid — Browser Demo

This `codex/demo` branch demonstrates CirGrid 1.1.0 with fictional habits and check-ins. It has no sign-in, accounts, database, or network API access. Each browser keeps its own changes until the next Hong Kong calendar day. **Reset sample data** restores the examples manually.

The production `main` branch starts empty and keeps its account and SQLite storage separate.

## Try locally

No application dependencies or package installation are required.

```sh
npm run build
npm start
```

Open **http://127.0.0.1:4174**. Python only serves the static `dist/` directory; the demo does not run the production Python server. Use HTTP rather than opening the HTML as a file.

## Features to explore

- Check in through synchronized circular and grid views.
- Hold a sidebar habit for 0.3 seconds to unlock sorting. Drag immediately or release first; the highlighted row stays unlocked for the next drag. Release after moving to save, press Escape to cancel, or use Alt+Up/Down. Both trackers share the saved browser-local order.
- Use the grid on the left and circle on the right, with today outlined across the full grid column and circular sector.
- Compare different weekly targets and past weekly outcomes.
- Make up a missed day in a past week and see its gold outline.
- Review active and expired staged habits with end dates and optional goals.
- Browse month and year history and read selected dates without leaving the calendar.
- Edit habits, choose hexadecimal colors, switch themes, and try four interface languages.

## Isolation and reset

Only the `cirgrid.demo.state.v1` localStorage key contains demo records. The demo does not read production tracker data, cookies, credentials, or backups. Browser profiles and site origins are independent; two tabs on the same origin share demo changes.

Changes persist during the same Hong Kong calendar day. The app checks for a new day on focus, visibility return, and every 60 seconds. A new day restores fictional samples. Browser storage can be cleared or unavailable and is not a private account or a backup.

## Publication

Deploy **only `dist/`** to the independent Cloudflare Pages project `cirgrid-demo`, using the `codex/demo` production branch label. A Git push does not publish a Direct Upload project. The build copies an explicit public-file allowlist and rejects JavaScript API clients. CSP blocks network connections.

The retained Python server, Docker configuration, login page, and production tests are reference source only. Never deploy the repository root, run the production server for this demo, or mount production data. Private documents, databases, environment files, build output, and credentials are excluded.

## Checks

```sh
npm test
npm run check
npm run build
```

The demo store tests cover samples, validation, persistence, conflicts, manual reset, Hong Kong midnight, clock rollback, and storage failures.

Released under the MIT License. See [LICENSE](LICENSE).
