# AGENTS.md

Guidance for coding agents working in this repository.
This project is a plain Chrome extension codebase (Manifest V3, no build step, no test runner).

## Project Snapshot

- Name: `bbrush`
- Stack: JavaScript, CSS, HTML
- Runtime: service worker (`background.js`), content script (`content_script.js`), popup (`popup.js`)
- Package manager: npm
- Module mode: `"type": "commonjs"`

## Source Layout

- `manifest.json`: permissions, commands, extension metadata
- `background.js`: tab messaging, overlay activation/deactivation, command handlers
- `content_script.js`: drawing engine, toolbar UI, pointer/keyboard logic, message listener
- `popup.html` + `popup.js`: popup UI/status and toggle control
- `toolbar.css`: Shadow DOM toolbar styles
- `eslint.config.js`, `.prettierrc`, `.editorconfig`: lint/format standards

## Build / Lint / Test Commands

There is currently **no build script** and **no automated test suite**.

- Install deps: `npm install`
- Lint all JS: `npm run lint`
- Lint with autofix: `npm run lint:fix`
- Format all files: `npm run format`
- Check formatting: `npm run format:check`

## Single-Test Execution (Current State)

- No `test` script exists in `package.json`.
- No test framework dependency is configured.
- No `*.test.*` or `*.spec.*` files exist.
- Running a single automated test is **not possible yet**.

If a test runner is added later, document scripts here explicitly (including single-file and single-test-name commands).

## Manual Validation Workflow

Use this for functional verification:

1. Run `npm run lint`.
2. Run `npm run format:check`.
3. Open `chrome://extensions` and enable Developer Mode.
4. Load unpacked extension from repository root.
5. Verify popup status text and toggle button behavior.
6. On a normal webpage, verify overlay toggle, drawing mode toggle, pen/text/arrow tools, undo/clear, and shortcuts panel.
7. Reload extension after changing `background.js` or `content_script.js`.

## Lint Rules (Enforced)

From `eslint.config.js`:

- Files: `**/*.js`
- `ecmaVersion: 'latest'`
- `sourceType: 'script'` (non-ESM)
- `eqeqeq: ['error', 'always']`
- `curly: ['error', 'all']`
- `no-unused-vars: error` with ignore pattern for names prefixed with `_`
- Unused eslint-disable directives are reported

## Formatting Rules (Enforced)

From `.prettierrc` + `.editorconfig`:

- Indentation: 2 spaces
- Charset: UTF-8
- End of line: LF
- Final newline required
- Trim trailing whitespace
- Single quotes in JS
- Semicolons enabled
- No trailing commas
- Print width: 100

## Code Style Guidelines

### Imports / Modules

- Keep current script-based architecture; do not introduce `import`/`export` casually.
- If module migration is needed, update manifest/runtime config holistically first.

### Function Style

- Prefer small functions with single responsibility.
- Use guard clauses and early returns.
- Keep branching explicit for input/pointer/message handling paths.
- Use descriptive verb-first names (`toggleDrawingMode`, `updateToolbarState`).

### State Management

- Keep mutable UI/runtime data inside centralized `state` objects (as in `content_script.js`).
- Keep no-selection states explicit via `null` where current code already does so.
- Update related state fields together to avoid mode drift (tool, selection, interaction mode).

### Naming Conventions

- Functions/variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Boolean flags: `is*`, `has*`, `show*`
- Event handlers: `handle*`
- Message types: prefixed upper snake case (`BBRUSH_*`, `POPUP_*`)
- `data-role` values: kebab-case

### Types and Runtime Validation

- No TypeScript; rely on runtime checks at boundaries.
- Validate external inputs before use:
  - `typeof message.type === 'string'`
  - `typeof tab.id === 'number'`
- Preserve stable shapes for stroke entries (`brush`, `text`, `arrow`).

### Error Handling

- Check `chrome.runtime.lastError` in callback-based Chrome API usage.
- For recoverable failures, return structured payloads (`{ ok: false, error: '...' }`).
- Prefer stable low-cardinality error codes (`unsupported_url`, `injection_failed`).
- Prefer safe no-op returns in user-interaction flows over exceptions.
- Keep popup/user-facing error copy short and actionable.

### Async and Messaging

- Use explicit message contracts via `type`.
- Validate message payloads before branching.
- Return `true` from listeners when responding asynchronously.
- Wrap callback APIs in promises when it improves clarity.

### UI / DOM / CSS

- Preserve Shadow DOM encapsulation for toolbar UI.
- Reuse CSS variables (`--bb-*`) for visual changes.
- Keep z-index and pointer-event behavior consistent with overlay model.
- Keep class toggles and disabled states synchronized with internal state.
- Preserve accessibility attributes already in use (`aria-label`, visually hidden labels).

### Performance / Robustness

- Keep `replayStrokes()` as canonical redraw path.
- Avoid unnecessary redraws and unnecessary deep clones.
- Preserve history-cap and undo semantics unless intentionally changing behavior.

### Security / Permissions

- Avoid permission creep in `manifest.json`.
- Treat unsupported pages (`chrome://`, extension pages, stores) as expected failures.
- Do not inject remote scripts or external runtime resources.

## Agent Checklist Before Finishing

1. Run `npm run lint`.
2. Run `npm run format:check`.
3. If needed, run `npm run lint:fix` / `npm run format`, then re-check.
4. Manually validate changed behavior in Chrome.
5. Update this file if scripts/conventions changed.

## Cursor / Copilot Rules

- `.cursorrules`: not present
- `.cursor/rules/`: not present
- `.github/copilot-instructions.md`: not present
- If these files appear later, merge their rules into this file and treat them as authoritative.
