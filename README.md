# bbrush

`bbrush` is a lightweight Chrome extension that lets you draw directly on any webpage during demos, presentations, and screen sharing.

## Features

- Pen tool for freehand drawing
- Hold `Shift` while drawing with pen to constrain to a straight line
- Eraser tool that removes complete objects (brush strokes, text, arrows, rectangles)
- In-tab whiteboard mode toggle (`W`) with a separate drawing scene
- Rectangle tool
- Rectangle drag and resize with selection handles
- Arrow tool
- Text tool with draggable/resizable text boxes
- Highlight tool for selected page text
- `Alt/Option + Drag` in text mode duplicates selected text while moving
- Draggable arrows
- Undo and clear actions
- Floating toolbar with shortcut help

## Install (Developer Mode)

1. Clone this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Run `npm install`.
5. Run `npm run build`.
6. Click **Load unpacked** and select the `dist/` folder.

## Usage

- Click the extension icon to enable/disable the overlay on the active tab.
- Use the toolbar to switch tools and adjust color/size.
- Switch to whiteboard mode with `W` (or toolbar button) to draw on a clean board, then switch back to page annotations anytime.

### Keyboard Shortcuts

- `Alt + D`: Toggle drawing mode
- `Alt + Shift + B`: Toggle toolbar panel
- `B`: Pen tool
- `E`: Eraser tool
- `R`: Rectangle tool
- `A`: Arrow tool
- `T`: Text tool
- `H`: Highlight text tool
- `Alt + Click` (highlight mode): Remove one highlight at pointer
- `W`: Toggle whiteboard mode
- Hold `Space`: Temporary click-through (interact with page without disabling tools)
- `Alt/Option + Drag` (text): Duplicate text
- `Ctrl/Cmd + Z`: Undo
- `C`: Clear
- `[ / ]`: Decrease/increase active tool size
- `?`: Toggle shortcuts panel
- `Esc`: Cancel current selection/editor

## Development

This project uses Vite for bundling and still has no automated test runner.

- Install dependencies: `npm install`
- Build the extension: `npm run build`
- Rebuild in watch mode: `npm run dev`
- Lint: `npm run lint`
- Lint with fixes: `npm run lint:fix`
- Format: `npm run format`
- Check formatting: `npm run format:check`

## Project Structure

- `src/background/`: service worker source entry
- `src/overlay/`: content-script entry, runtime, feature manifest, and per-feature modules
- `src/popup/`: popup source entry
- `src/shared/`: shared constants and icon catalog
- `src/public/`: manifest, popup HTML, toolbar CSS, and icons copied into `dist/`
- `dist/`: generated unpacked extension output loaded into Chrome

## License

MIT. See `LICENSE`.
