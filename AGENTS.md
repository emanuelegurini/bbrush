# AGENTS.md

Guidance for coding agents working in this repository.
This project is a Vite-built Chrome extension codebase (Manifest V3, no automated test runner).

## Project Snapshot

- Name: `bbrush`
- Stack: JavaScript, CSS, HTML
- Runtime outputs: service worker (`dist/background.js`), content script (`dist/content-script.js`), popup (`dist/popup.js`)
- Package manager: npm
- Module mode: `"type": "commonjs"`
- Supported Node: `^20.19.0 || >=22.12.0`

## Source Layout

- `src/background/`: service worker module source
- `src/overlay/`: content-script entry, runtime core, feature manifest, and feature modules
- `src/popup/`: popup module source
- `src/shared/`: shared constants and icon catalog
- `src/public/`: manifest, popup HTML, toolbar CSS, and icons copied to `dist/`
- `dist/`: generated unpacked extension loaded into Chrome
- `eslint.config.js`, `.prettierrc`, `.editorconfig`: lint/format standards
- `vite.config.js`: build configuration

## Build / Lint / Test Commands

There is currently **no automated test suite**.

- Install deps: `npm install`
- Build extension: `npm run build`
- Watch rebuilds into `dist/`: `npm run dev`
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
3. Run `npm run build`.
4. Open `chrome://extensions` and enable Developer Mode.
5. Load unpacked extension from `dist/`.
6. Verify popup status text and toggle button behavior.
7. On a normal webpage, verify overlay toggle, drawing mode toggle, pen/text/arrow tools, undo/clear, and shortcuts panel.
8. Reload extension after changing files under `src/` and rebuilding.

## Lint Rules (Enforced)

From `eslint.config.js`:

- Files: `**/*.js`
- `ecmaVersion: 'latest'`
- `sourceType: 'module'` for `src/**/*.js`
- `sourceType: 'commonjs'` for repo-root config files and `scripts/**/*.js`
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

- Use ESM in `src/**/*.js`.
- Keep repo-root config and helper scripts in CommonJS unless there is a clear reason to change them.
- Preserve the current Vite entry/output contract when adding or moving runtime modules.

### Function Style

- Prefer small functions with single responsibility.
- Use guard clauses and early returns.
- Keep branching explicit for input/pointer/message handling paths.
- Use descriptive verb-first names (`toggleDrawingMode`, `updateToolbarState`).

### State Management

- Keep mutable UI/runtime data inside centralized `state` objects in the overlay runtime.
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
- Keep the content script build output to a single injected artifact (`dist/content-script.js`).

### Security / Permissions

- Avoid permission creep in `manifest.json`.
- Treat unsupported pages (`chrome://`, extension pages, stores) as expected failures.
- Do not inject remote scripts or external runtime resources.
- Keep JavaScript modules out of `web_accessible_resources`; only true static assets should be exposed there.

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
