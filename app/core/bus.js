// Barramento de eventos mínimo — desacopla store, views e assistente.

const handlers = new Map();

export function on(event, fn) {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event).add(fn);
  return () => off(event, fn);
}

export function off(event, fn) {
  handlers.get(event)?.delete(fn);
}

export function emit(event, payload) {
  for (const fn of handlers.get(event) ?? []) {
    try { fn(payload); } catch (err) { console.error(`[bus:${event}]`, err); }
  }
  for (const fn of handlers.get('*') ?? []) {
    try { fn(event, payload); } catch (err) { console.error('[bus:*]', err); }
  }
}
