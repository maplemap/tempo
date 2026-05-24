export default function AsciiBar({ ratio, width = 20 }) {
  const r = Math.max(0, Math.min(1, ratio || 0));
  const filled = Math.round(r * width);
  return <span className="bar">{'█'.repeat(filled)}{'░'.repeat(width - filled)}</span>;
}
