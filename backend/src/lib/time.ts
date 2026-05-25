export function nowIso(): string {
  return new Date().toISOString();
}

export function diffSeconds(startIso: string, endIso: string): number {
  return Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000));
}

export function parseRange(
  from: string | undefined,
  to: string | undefined
): { fromIso: string; toIso: string } {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { fromIso: start.toISOString(), toIso: end.toISOString() };
}
