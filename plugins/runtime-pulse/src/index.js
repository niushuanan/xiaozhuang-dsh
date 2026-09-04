/**
 * Runtime Pulse is intentionally client-only. The browser reads the same
 * durable session projections as Harness' native stats row; it does not add a
 * second collector, persistence layer, or network route.
 */
export const name = 'runtime-pulse'

export function apply() {}
