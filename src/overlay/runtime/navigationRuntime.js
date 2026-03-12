export function createNavigationRuntime({
  state,
  getPlugins,
  callPluginHook,
  releaseTemporaryPassthrough
}) {
  let historyPatched = false;

  function handleLocationChange() {
    const nextHref = window.location.href;

    if (!state.core.enabled) {
      state.core.lastLocationHref = nextHref;
      return;
    }

    if (state.core.lastLocationHref === nextHref) {
      return;
    }

    const previousHref = state.core.lastLocationHref;
    state.core.lastLocationHref = nextHref;

    if (!state.core.isSpacePressed) {
      releaseTemporaryPassthrough();
    }

    for (const plugin of getPlugins()) {
      callPluginHook(plugin, 'onLocationChange', {
        previousHref,
        nextHref
      });
    }
  }

  function patchHistory() {
    if (historyPatched) {
      return;
    }

    historyPatched = true;
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function pushStateOverride(...args) {
      const result = originalPushState.apply(this, args);
      handleLocationChange();
      return result;
    };

    history.replaceState = function replaceStateOverride(...args) {
      const result = originalReplaceState.apply(this, args);
      handleLocationChange();
      return result;
    };
  }

  function installNavigationListeners() {
    window.addEventListener('hashchange', handleLocationChange);
    window.addEventListener('popstate', handleLocationChange);
    patchHistory();
  }

  return {
    installNavigationListeners
  };
}
