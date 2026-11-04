# CirGrid

CirGrid is a private, open-source habit tracker with synchronized circular and grid views. It is a sister app to [Daily Todo](https://github.com/kylerlam/daily-todo), with its own account and database.

- Check in through either tracker and browse Monday-to-Sunday weeks.
- Set a weekly target of 1–7 days for each habit. The default is 5. Changes apply to the current week and later weeks.
- See each week's score and outcome. Make up missed check-ins in past weeks. The gold outline identifies a check-in added after its week ended.
- Open Habit history to see one habit's check-ins over the last 12 weeks. Select a day in the heatmap to jump to its week.
- Leave the end date blank for an ongoing habit. Set an end date to make it a stage, with optional goal text such as “55 kg → 53 kg”. The end date is the last eligible day. The stage disappears from the current tracker the following day, and its past weeks remain available for review and makeup check-ins.
- Pick a preset or custom habit color. Choose from ten Daily Todo themes and switch among English, Spanish, Simplified Chinese, and Traditional Chinese. Theme and language are saved per browser.
- Sign in on desktop or mobile to use the same saved habits and check-ins.

## Run locally

Use Python 3.13. No package installation or frontend build is required.

```sh
python3 server.py
```

Open **http://127.0.0.1:4173** and sign in with the initial account, **admin / admin123**, shown below the sign-in form. Change the password in **Settings → Account** after signing in. New passwords must contain at least 12 characters. The initial-credentials panel disappears after a successful change to a different password. Username-only changes keep the panel visible with the current username.

The default server binds to the loopback interface. Set `HOST`, `PORT`, or `DATA_DIR` to change the listener or database directory. The initial account is created automatically when the database has no account.

## Run with Docker Compose

```sh
docker compose up --build -d
```

Open **http://127.0.0.1:4173** and sign in using the initial account shown below the form. Compose stores SQLite and the export snapshot in the `cirgrid-data` volume. Set `CIRGRID_PORT` to change the host port. For an HTTPS reverse proxy, preserve the public Host header and set `SESSION_COOKIE_SECURE=true`. The default published address is loopback and can be changed with `CIRGRID_BIND_ADDRESS`.

## Bring over browser records

Open the new CirGrid at the same hostname, port, and protocol as the previous version, using the same browser profile. After signing in, select **Import browser records** when the tracker detects the old data. The original browser copy is retained. For a different destination URL, use **Download browser backup** at the old origin and import that JSON file at the new destination.

## Data and backups

Use **Settings → Data** to download YAML or JSON, or import a CirGrid backup. Exports contain habits, weekly targets, and check-ins. They exclude credentials and sessions. Export also refreshes the server-side `cirgrid.yml` snapshot. The primary database is `data/cirgrid.sqlite3` for a local run, or `/app/data/cirgrid.sqlite3` in Docker.

Import adds missing records and rejects conflicting backups as a batch. Importing legacy browser data preserves the current settings and existing check-ins for habits with matching IDs. Make a fresh export before moving or restoring data.

## Development

```sh
npm test
npm run check
python3 -B -m unittest discover -s test -p 'test_*.py' -v
docker compose config --quiet
```

Use Node.js 22 or later for JavaScript checks. See [CONTRIBUTING.md](CONTRIBUTING.md) for browser verification and commit conventions.

## License

MIT. See [LICENSE](LICENSE).
