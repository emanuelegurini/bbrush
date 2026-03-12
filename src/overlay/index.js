import { FEATURES } from './features/index.js';
import { createBbrushRuntime } from './runtime/createRuntime.js';

if (!window.__BBRUSH_RUNTIME__ || !window.__BBRUSH_RUNTIME__.initialized) {
  const runtime = createBbrushRuntime(FEATURES);
  window.__BBRUSH_RUNTIME__ = runtime;
  runtime.init();
}
