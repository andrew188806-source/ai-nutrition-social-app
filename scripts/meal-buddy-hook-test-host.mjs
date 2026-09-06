// Minimal, generic single-hook test host: real useState/useRef/useCallback/useEffect semantics
// (cursor-based slots, Object.is state comparison, shallow dependency-array diffing), enough to drive
// ONE leaf hook (no context, no children) across manually-triggered renders. setState schedules an
// immediate synchronous re-render so the caller always observes the latest returned value.
export function createHookHost() {
  let stateCells = [];
  let refCells = [];
  let memoCells = [];
  let effectCells = [];
  let cursor, refCursor, memoCursor, effectCursor;
  let pendingEffects = [];
  let hookFn = null;
  let currentArgs = [];
  let latestResult;
  let rendering = false;

  function depsChanged(prev, next) {
    if (!prev) return true;
    if (prev.length !== next.length) return true;
    return next.some((d, i) => !Object.is(d, prev[i]));
  }

  function useState(init) {
    const i = cursor++;
    if (!(i in stateCells)) stateCells[i] = typeof init === "function" ? init() : init;
    const setState = (v) => {
      const next = typeof v === "function" ? v(stateCells[i]) : v;
      if (!Object.is(next, stateCells[i])) {
        stateCells[i] = next;
        if (!rendering) renderNow();
      }
    };
    return [stateCells[i], setState];
  }
  function useRef(init) {
    const i = refCursor++;
    if (!(i in refCells)) refCells[i] = { current: init };
    return refCells[i];
  }
  function useCallback(fn, deps) {
    const i = memoCursor++;
    const prev = memoCells[i];
    if (!prev || depsChanged(prev.deps, deps)) memoCells[i] = { deps, value: fn };
    return memoCells[i].value;
  }
  function useEffect(fn, deps) {
    const i = effectCursor++;
    const prev = effectCells[i];
    if (!prev || depsChanged(prev.deps, deps)) {
      effectCells[i] = { deps };
      pendingEffects.push(fn);
    }
  }
  function renderNow() {
    rendering = true;
    cursor = 0; refCursor = 0; memoCursor = 0; effectCursor = 0;
    pendingEffects = [];
    latestResult = hookFn(...currentArgs);
    const toRun = pendingEffects;
    pendingEffects = [];
    rendering = false;
    for (const fn of toRun) fn();
    return latestResult;
  }
  return {
    react: { useState, useRef, useCallback, useEffect },
    mount(fn, ...args) { hookFn = fn; currentArgs = args; return renderNow(); },
    rerender(...args) { currentArgs = args; return renderNow(); },
    get result() { return latestResult; }
  };
}
