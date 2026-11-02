# Contributing

Keep changes focused and preserve the shared data model behind both trackers.

## Local checks

Use Node.js 22 or newer. No package installation is required.

```sh
npm test
npm run check
npm start
```

Before submitting a UI change, verify the real app at desktop and mobile widths:

- Toggle a grid cell and a circular segment; verify both views agree after a reload.
- Move to another week and return; existing check-ins must stay on their original dates.
- Add and edit a habit; changing a name or color must retain its check-ins.
- Cancel deletion, then confirm deletion; unrelated records must remain intact.
- Check the empty state after deleting all habits and add a habit again.
- At 320px and 390px widths, check the date controls, habit dialog, and all seven grid columns.
- Check for console errors, clipped content, and loss of keyboard focus.

Unit tests cover date boundaries, daylight-saving transitions, immutable changes, schema validation, and storage failures. Keep corrupt saved data intact; never replace it silently.

## Language and commits

Write documentation, code comments, user interface text, and commit messages in English.

Use Conventional Commits with a concrete summary:

```text
feat: add a tracker capability
fix: preserve check-ins when editing a habit
docs: explain the local storage model
```

Commit one complete logical change at a time. Include relevant tests and explain any remaining limitations.
