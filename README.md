# CirGrid

An open-source habit tracker with synchronized circular and grid views.

One ring per habit. One column per day. Two ways to see the same daily practice.

## Features

- Click a circular segment or grid cell to check in; both views update together.
- Browse Monday-to-Sunday weeks with the date picker, previous/next controls, or Today.
- Add habits, change their names and colors, and delete habits with confirmation.
- Keep records after a refresh using browser-local storage.
- Use the tracker with a mouse, touch, or keyboard. On small screens, the panels stack and all seven grid columns remain visible.
- Start with Sunscreen, Exercise, and Reading, with no invented completion records.

## Run locally

Requires Node.js 22 or newer and a modern browser. No dependency installation or build step is needed.

```sh
git clone https://github.com/kylerlam/cirgrid.git
cd cirgrid
npm start
```

Open **http://127.0.0.1:4173**.

The default server binds to the local machine. To choose a different address or port:

```sh
HOST=0.0.0.0 PORT=8080 npm start
```

The included server serves only the application entry point, source modules, and assets. It does not expose repository metadata or local records.

## Use the tracker

1. Click **New habit**, or select a habit in the sidebar to edit it.
2. Click any day in either tracker to add or remove a check-in. Grid buttons and circular segments also support Enter and Space.
3. Choose a date to show its week. Records are keyed by local calendar date, so moving between weeks does not move or replace check-ins.
4. Rename a habit or change its color without losing its records. Deleting a habit permanently removes its check-ins after confirmation.

There is no separate History page; the date controls provide the same navigation in the main tracker.

## Data and privacy

Habit names, colors, and check-ins are stored in `localStorage` under `cirgrid.state.v1`. Data belongs to the current browser and site origin. It is not sent to a server or synchronized across devices. Clearing this site's browser data removes its saved records.

If saved data is corrupt or browser storage is unavailable, CirGrid reports the problem and does not silently replace existing data or pretend a failed change was saved.

Changing the hostname, protocol, or port uses a different browser storage origin. Use a consistent URL for your personal records.

On localhost and HTTPS, modern browsers use Web Locks to serialize changes from multiple tabs. On plain HTTP origins without Web Locks, use one tab at a time when editing records.

## Development

The app uses HTML, CSS, and JavaScript ES modules, with no runtime dependencies.

```sh
npm test
npm run check
```

- `src/model.js`: calendar dates, habit operations, validation, and persistence.
- `src/views.js`: circular and grid renderers.
- `src/editor.js`: accessible native habit dialog.
- `src/app.js`: application state and event wiring.
- `src/styles.css`: shared design tokens and responsive layouts.
- `scripts/serve.js`: local static server.

For static hosting, publish `index.html`, `src/`, and `assets/` at the site root. No server-side database is required.

See [CONTRIBUTING.md](CONTRIBUTING.md) for validation and commit conventions.

## Design reference

CirGrid follows the quiet white surfaces, sage navigation, system typography, and light borders of its sister project [Daily Todo](https://github.com/kylerlam/daily-todo). Habit colors use a blue, yellow, and pink palette, with additional colors available in the editor.

## License

MIT. See [LICENSE](LICENSE).
