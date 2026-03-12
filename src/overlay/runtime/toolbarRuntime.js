import { ICON_KEYS } from '../../shared/iconCatalog.js';
import { PLUGIN_IDS } from '../../shared/pluginIds.js';

export function createToolbarRuntime({
  state,
  getActiveToolPlugin,
  getPluginContext,
  resolveIconMarkup,
  updateOverlayInteractionState,
  toggleDrawingMode
}) {
  function getActiveSizeConfig() {
    if (state.core.activeToolId === PLUGIN_IDS.TEXT) {
      return {
        label: 'Text size',
        min: 12,
        max: 96,
        value: state.shared.textSize
      };
    }

    if (state.core.activeToolId === PLUGIN_IDS.ERASER) {
      return {
        label: 'Eraser size',
        min: 1,
        max: 24,
        value: state.shared.penSize
      };
    }

    return {
      label: 'Pen size',
      min: 1,
      max: 24,
      value: state.shared.penSize
    };
  }

  function getLauncherToolLabel() {
    if (state.core.canvasMode === 'whiteboard') {
      return 'WB';
    }

    const activePlugin = getActiveToolPlugin();
    if (!activePlugin || typeof activePlugin.launcherLabel !== 'string') {
      return 'P';
    }

    return activePlugin.launcherLabel;
  }

  function applyDynamicButtonState(records) {
    for (const record of records) {
      if (!record.button) {
        continue;
      }

      const plugin = getPluginContext(record.pluginId);
      if (!plugin) {
        continue;
      }

      const { descriptor } = record;
      const isActive = typeof descriptor.isActive === 'function' && descriptor.isActive(plugin);
      const isDisabled =
        typeof descriptor.isDisabled === 'function' && descriptor.isDisabled(plugin);

      record.button.classList.toggle('is-active', Boolean(isActive));
      record.button.disabled = Boolean(isDisabled);

      if (typeof descriptor.getTitle === 'function') {
        record.button.title = descriptor.getTitle(plugin);
      }
    }
  }

  function updateToolbarState() {
    if (!state.core.toolbarElements) {
      return;
    }

    if (!state.core.isDrawingMode) {
      state.core.isSizeExpanded = false;
      state.core.showShortcuts = false;
      state.core.showQuickMenu = false;
      state.core.isToolbarExpanded = false;
    }

    const { toolbarElements } = state.core;
    const sizeConfig = getActiveSizeConfig();

    toolbarElements.quickMenu.classList.toggle('is-open', state.core.showQuickMenu);
    toolbarElements.quickMenu.hidden = !state.core.showQuickMenu;
    toolbarElements.panel.classList.toggle('is-open', state.core.isToolbarExpanded);
    toolbarElements.panel.hidden = !state.core.isToolbarExpanded;
    toolbarElements.shortcutsPanel.classList.toggle('is-open', state.core.showShortcuts);
    toolbarElements.sizeField.classList.toggle('is-expanded', state.core.isSizeExpanded);
    toolbarElements.sizeToggle.classList.toggle('is-active', state.core.isSizeExpanded);
    toolbarElements.toolbar.classList.toggle('is-drawing', state.core.isDrawingMode);
    toolbarElements.launcher.classList.toggle('is-annotating', state.core.isDrawingMode);
    toolbarElements.launcherTool.textContent = getLauncherToolLabel();
    toolbarElements.launcher.style.borderColor = state.shared.brushColor;
    toolbarElements.launcher.style.boxShadow = state.core.isDrawingMode
      ? `0 0 0 3px ${state.shared.brushColor}55, 0 10px 24px rgba(0, 0, 0, 0.26)`
      : '0 10px 24px rgba(0, 0, 0, 0.26)';
    toolbarElements.annotateToggleButton.classList.toggle('is-active', state.core.isDrawingMode);
    toolbarElements.annotateToggleButton.title = state.core.isDrawingMode
      ? 'Disable annotation'
      : 'Enable annotation';
    toolbarElements.sizeToggle.title = state.core.isSizeExpanded ? 'Hide size' : 'Show size';
    toolbarElements.sizeLabel.textContent = sizeConfig.label;
    toolbarElements.sizeInput.min = String(sizeConfig.min);
    toolbarElements.sizeInput.max = String(sizeConfig.max);
    toolbarElements.sizeInput.value = String(sizeConfig.value);
    toolbarElements.colorInput.value = state.shared.brushColor;
    toolbarElements.colorInput.disabled = !state.core.isDrawingMode;
    toolbarElements.sizeToggle.disabled = !state.core.isDrawingMode;
    toolbarElements.sizeInput.disabled = !state.core.isDrawingMode;

    applyDynamicButtonState(state.core.toolbarButtonRecords);
    applyDynamicButtonState(state.core.quickActionRecords);

    if (state.core.canvas) {
      state.core.canvas.style.boxShadow = state.core.isDrawingMode
        ? 'inset 0 0 0 2px rgba(23, 98, 166, 0.9)'
        : 'none';
    }

    updateOverlayInteractionState();
  }

  function setToolbarExpanded(expanded) {
    state.core.isToolbarExpanded = expanded;

    if (!expanded) {
      state.core.showShortcuts = false;
    }

    updateToolbarState();
  }

  function toggleToolbarExpanded() {
    setToolbarExpanded(!state.core.isToolbarExpanded);
  }

  function setQuickMenuVisible(visible) {
    state.core.showQuickMenu = visible;
    updateToolbarState();
  }

  function toggleShortcuts() {
    state.core.showShortcuts = !state.core.showShortcuts;

    if (state.core.showShortcuts) {
      state.core.isToolbarExpanded = true;
    }

    updateToolbarState();
  }

  function buildIconButton(descriptor) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bbrush-icon-button';
    button.setAttribute('aria-label', descriptor.ariaLabel || '');
    button.title = descriptor.title || '';
    button.innerHTML = resolveIconMarkup(
      descriptor.iconKey,
      `toolbar item "${descriptor.id || 'unknown'}"`
    );
    return button;
  }

  function buildQuickActionButton(descriptor) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = descriptor.label || '';
    return button;
  }

  function populateToolbarUi(shadowRoot) {
    const dynamicButtonsRoot = shadowRoot.querySelector('[data-role="dynamic-buttons"]');
    const quickMenu = shadowRoot.querySelector('[data-role="quick-menu"]');
    const shortcutsPanel = shadowRoot.querySelector('[data-role="shortcuts-panel"]');

    for (const record of state.core.toolbarButtonRecords) {
      const button = buildIconButton(record.descriptor);
      button.addEventListener('click', (event) => {
        const ctx = getPluginContext(record.pluginId);
        if (!ctx || typeof record.descriptor.onClick !== 'function') {
          return;
        }

        record.descriptor.onClick(ctx, event);
      });
      dynamicButtonsRoot.appendChild(button);
      record.button = button;
    }

    for (const record of state.core.quickActionRecords) {
      const button = buildQuickActionButton(record.descriptor);
      button.addEventListener('click', (event) => {
        const ctx = getPluginContext(record.pluginId);
        if (!ctx || typeof record.descriptor.onClick !== 'function') {
          return;
        }

        record.descriptor.onClick(ctx, event);
      });
      quickMenu.appendChild(button);
      record.button = button;
    }

    for (const shortcutLine of state.core.shortcutLines) {
      const line = document.createElement('span');
      line.textContent = shortcutLine.text;
      shortcutsPanel.appendChild(line);
    }
  }

  function createToolbar() {
    if (state.core.toolbarHost) {
      return;
    }

    const host = document.createElement('div');
    host.id = 'bbrush-toolbar-host';
    host.style.left = '24px';
    host.style.position = 'fixed';
    host.style.top = '24px';
    host.style.zIndex = '2147483647';
    host.style.display = 'none';
    host.style.visibility = 'hidden';

    const shadowRoot = host.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `
        <div class="bbrush-launcher-wrap">
          <button class="bbrush-launcher" data-role="launcher" title="Open bbrush panel">
            <span class="bbrush-launcher-label">BB</span>
            <span class="bbrush-launcher-tool" data-role="launcher-tool">P</span>
          </button>
          <div class="bbrush-quick-menu" data-role="quick-menu" hidden></div>
        </div>
        <div class="bbrush-panel" data-role="panel" hidden>
          <div class="bbrush-toolbar">
            <div class="bbrush-toolbar-handle" data-role="drag">bbrush</div>
            <button class="bbrush-icon-button" data-role="annotate-toggle" aria-label="Toggle annotation" title="Enable annotation"></button>
            <label class="bbrush-toolbar-field">
              <span class="bbrush-visually-hidden">Color</span>
              <input data-role="color" type="color" value="#ff00bb" />
            </label>
            <button class="bbrush-icon-button" data-role="size-toggle" aria-label="Toggle size" title="Show size"></button>
            <label class="bbrush-toolbar-field bbrush-toolbar-size" data-role="size-field">
              <span data-role="size-label">Pen size</span>
              <input data-role="size" type="range" min="1" max="24" value="4" />
            </label>
            <div data-role="dynamic-buttons" style="display: contents;"></div>
            <div class="bbrush-shortcuts" data-role="shortcuts-panel">
              <strong>Shortcuts</strong>
            </div>
          </div>
        </div>
      `;

    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = chrome.runtime.getURL('toolbar.css');
    stylesheet.addEventListener('load', () => {
      host.style.visibility = 'visible';
    });
    shadowRoot.prepend(stylesheet);

    populateToolbarUi(shadowRoot);

    const launcher = shadowRoot.querySelector('[data-role="launcher"]');
    const launcherTool = shadowRoot.querySelector('[data-role="launcher-tool"]');
    const quickMenu = shadowRoot.querySelector('[data-role="quick-menu"]');
    const panel = shadowRoot.querySelector('[data-role="panel"]');
    const dragHandle = shadowRoot.querySelector('[data-role="drag"]');
    const annotateToggleButton = shadowRoot.querySelector('[data-role="annotate-toggle"]');
    const colorInput = shadowRoot.querySelector('[data-role="color"]');
    const sizeToggle = shadowRoot.querySelector('[data-role="size-toggle"]');
    const sizeField = shadowRoot.querySelector('[data-role="size-field"]');
    const sizeLabel = shadowRoot.querySelector('[data-role="size-label"]');
    const sizeInput = shadowRoot.querySelector('[data-role="size"]');
    const toolbar = shadowRoot.querySelector('.bbrush-toolbar');
    const shortcutsPanel = shadowRoot.querySelector('[data-role="shortcuts-panel"]');

    annotateToggleButton.innerHTML = resolveIconMarkup(
      ICON_KEYS.SHELL_ANNOTATE_TOGGLE || 'shell-annotate-toggle',
      'toolbar shell button "annotate-toggle"'
    );
    sizeToggle.innerHTML = resolveIconMarkup(
      ICON_KEYS.SHELL_SIZE_TOGGLE || 'shell-size-toggle',
      'toolbar shell button "size-toggle"'
    );

    launcher.addEventListener('click', () => {
      if (state.core.suppressNextLauncherClick) {
        state.core.suppressNextLauncherClick = false;
        return;
      }

      if (state.core.showQuickMenu) {
        setQuickMenuVisible(false);
      }

      toggleToolbarExpanded();
    });

    launcher.addEventListener('pointerdown', (event) => {
      state.core.isDraggingLauncher = false;
      state.core.launcherDragStartX = event.clientX;
      state.core.launcherDragStartY = event.clientY;
      state.core.dragOffsetX = event.clientX - state.core.toolbarHost.offsetLeft;
      state.core.dragOffsetY = event.clientY - state.core.toolbarHost.offsetTop;
      state.core.launcherPointerId = event.pointerId;
      launcher.setPointerCapture(event.pointerId);
    });

    launcher.addEventListener('pointermove', (event) => {
      if (state.core.launcherPointerId !== event.pointerId) {
        return;
      }

      const moveX = Math.abs(event.clientX - state.core.launcherDragStartX);
      const moveY = Math.abs(event.clientY - state.core.launcherDragStartY);

      if (!state.core.isDraggingLauncher && (moveX > 3 || moveY > 3)) {
        state.core.isDraggingLauncher = true;
      }

      if (!state.core.isDraggingLauncher) {
        return;
      }

      const left = event.clientX - state.core.dragOffsetX;
      const top = event.clientY - state.core.dragOffsetY;

      state.core.toolbarHost.style.left = `${Math.max(0, left)}px`;
      state.core.toolbarHost.style.top = `${Math.max(0, top)}px`;
      state.core.suppressNextLauncherClick = true;
      setQuickMenuVisible(false);
    });

    launcher.addEventListener('pointerup', (event) => {
      if (state.core.launcherPointerId !== event.pointerId) {
        return;
      }

      if (launcher.hasPointerCapture(event.pointerId)) {
        launcher.releasePointerCapture(event.pointerId);
      }

      state.core.launcherPointerId = null;
      state.core.isDraggingLauncher = false;
    });

    launcher.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      setQuickMenuVisible(!state.core.showQuickMenu);
    });

    dragHandle.addEventListener('pointerdown', (event) => {
      state.core.isDraggingToolbar = true;
      state.core.dragOffsetX = event.clientX - state.core.toolbarHost.offsetLeft;
      state.core.dragOffsetY = event.clientY - state.core.toolbarHost.offsetTop;
      dragHandle.setPointerCapture(event.pointerId);
    });

    dragHandle.addEventListener('pointermove', (event) => {
      if (!state.core.isDraggingToolbar) {
        return;
      }

      const left = event.clientX - state.core.dragOffsetX;
      const top = event.clientY - state.core.dragOffsetY;

      state.core.toolbarHost.style.left = `${Math.max(0, left)}px`;
      state.core.toolbarHost.style.top = `${Math.max(0, top)}px`;
    });

    dragHandle.addEventListener('pointerup', (event) => {
      state.core.isDraggingToolbar = false;
      if (dragHandle.hasPointerCapture(event.pointerId)) {
        dragHandle.releasePointerCapture(event.pointerId);
      }
    });

    annotateToggleButton.addEventListener('click', () => {
      toggleDrawingMode();
    });

    colorInput.addEventListener('input', () => {
      state.shared.brushColor = colorInput.value;
      updateToolbarState();
    });

    sizeToggle.addEventListener('click', () => {
      state.core.isSizeExpanded = !state.core.isSizeExpanded;
      updateToolbarState();
    });

    sizeInput.addEventListener('input', () => {
      if (state.core.activeToolId === PLUGIN_IDS.TEXT) {
        state.shared.textSize = Number(sizeInput.value);
      } else {
        state.shared.penSize = Number(sizeInput.value);
      }

      updateToolbarState();
    });

    document.body.appendChild(host);

    state.core.toolbarHost = host;
    state.core.toolbarShadowRoot = shadowRoot;
    state.core.toolbarElements = {
      launcher,
      launcherTool,
      quickMenu,
      panel,
      toolbar,
      annotateToggleButton,
      colorInput,
      sizeToggle,
      sizeField,
      sizeLabel,
      sizeInput,
      shortcutsPanel
    };
  }

  return {
    createToolbar,
    updateToolbarState,
    setToolbarExpanded,
    toggleToolbarExpanded,
    setQuickMenuVisible,
    toggleShortcuts
  };
}
