interface AsciiBarProps {
  ratio: number;
}

const N = 100;

export default function AsciiBar({ ratio }: AsciiBarProps) {
  const r = Math.max(0, Math.min(1, ratio || 0));
  return (
    <span className="bar">
      <span style={{ overflow: 'hidden', whiteSpace: 'pre', flexShrink: 0, width: `${r * 100}%` }}>{'█'.repeat(N)}</span>
      <span style={{ overflow: 'hidden', whiteSpace: 'pre', flex: 1 }}>{'░'.repeat(N)}</span>
    </span>
  );
}
