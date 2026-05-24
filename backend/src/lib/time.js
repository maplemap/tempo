export function nowIso() {
  return new Date().toISOString();
}

export function diffSeconds(startIso, endIso) {
  return Math.max(0, Math.round((new Date(endIso) - new Date(startIso)) / 1000));
}

export function parseRange(from, to) {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { fromIso: start.toISOString(), toIso: end.toISOString() };
}
