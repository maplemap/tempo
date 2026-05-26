interface ConfirmInlineProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmInline({ message, onConfirm, onCancel }: ConfirmInlineProps) {
  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      <span className="muted" style={{ fontSize: 12 }}>{message}</span>
      <button className="btn icon-btn" onClick={onConfirm}>[ YES ]</button>
      <button className="btn icon-btn" onClick={onCancel}>[ NO ]</button>
    </span>
  );
}
