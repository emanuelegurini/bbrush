# bbrush

`bbrush` is a lightweight Chrome extension that lets you draw directly on any webpage during demos, presentations, and screen sharing.

## Features

- Pen tool for freehand drawing
- Hold `Shift` while drawing with pen to constrain to a straight line
- Eraser tool that removes complete objects (brush strokes, text, arrows, rectangles)
- Rectangle tool
- Rectangle drag and resize with selection handles
- Arrow tool
- Text tool with draggable/resizable text boxes
- `Alt/Option + Drag` in text mode duplicates selected text while moving
- Draggable arrows
- Undo and clear actions
- Floating toolbar with shortcut help

## Install (Developer Mode)

1. Clone this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select this project folder.

## Usage

- Click the extension icon to enable/disable the overlay on the active tab.
- Use the toolbar to switch tools and adjust color/size.

### Keyboard Shortcuts

- `Alt + D`: Toggle drawing mode
- `Alt + Shift + B`: Toggle toolbar panel
- `B`: Pen tool
- `E`: Eraser tool
- `R`: Rectangle tool
- `A`: Arrow tool
- `T`: Text tool
- `Alt/Option + Drag` (text): Duplicate text
- `Ctrl/Cmd + Z`: Undo
- `C`: Clear
- `[ / ]`: Decrease/increase active tool size
- `?`: Toggle shortcuts panel
- `Esc`: Cancel current selection/editor

## Development

This project has no build step and no automated test runner.

- Install dependencies: `npm install`
- Lint: `npm run lint`
- Lint with fixes: `npm run lint:fix`
- Format: `npm run format`
- Check formatting: `npm run format:check`

## Project Structure

- `manifest.json`: extension metadata, permissions, and commands
- `background.js`: service worker, command/action handling, tab messaging
- `content_script.js`: drawing engine, state, interactions, toolbar injection
- `popup.html` + `popup.js`: popup UI
- `toolbar.css`: toolbar styles (Shadow DOM)

## License

MIT. See `LICENSE`.
