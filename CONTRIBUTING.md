# Contributing

Keep changes focused and preserve the shared data model behind both trackers.

## Local checks

Use Node.js 22 or newer and Python 3.13. No package installation is required.

```sh
npm test
npm run check
python3 -B -m unittest discover -s test -p 'test_*.py' -v
docker compose config --quiet
npm start
```

Before submitting a UI change, verify the real app at desktop and mobile widths:

- Toggle a grid cell and a circular segment; verify both views agree after a reload.
- Move to another week and return; existing check-ins must stay on their original dates.
- Edit different habits in two tabs concurrently; both changes must survive and both views must converge.
- Add and edit a habit; changing a name or color must retain its check-ins.
- Change a weekly target and confirm an earlier week's target stays the same. Make up a past check-in and check its gold outline and effect on the weekly score.
- Give a habit an end date and verify new check-ins are limited to eligible dates.
- Cancel deletion, then confirm deletion; unrelated records must remain intact.
- Check the empty state after deleting all habits and add a habit again.
- At 320px and 390px widths, check the date controls, habit dialog, and all seven grid columns.
- Check for console errors, clipped content, and loss of keyboard focus.
- Use a temporary data directory to verify first-run setup, legacy browser import, and JSON/YAML round-tripping.

Tests cover date boundaries, daylight-saving transitions, legacy data, weekly target history, account sessions, import/export, and concurrent writes. Keep corrupt saved data intact; never replace it silently.

## Language and commits

Write documentation, code comments, default interface text, and commit messages in English. Add Spanish, Simplified Chinese, and Traditional Chinese translations for new interface text.

Use Conventional Commits with a concrete summary:

```text
feat: add a tracker capability
fix: preserve check-ins when editing a habit
docs: explain the local storage model
```

Commit one complete logical change at a time. Include relevant tests and explain any remaining limitations.
