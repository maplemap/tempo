export default function ConfirmInline({ message, onConfirm, onCancel }) {
  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      <span className="muted" style={{ fontSize: 12 }}>{message}</span>
      <button className="btn" onClick={onConfirm}>[ YES ]</button>
      <button className="btn" onClick={onCancel}>[ NO ]</button>
    </span>
  );
}
