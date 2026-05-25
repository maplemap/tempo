import { useState } from 'react';
import { api, ApiError } from '../lib/api';

interface LoginPageProps { onLogin: () => void; }

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api.auth.login(password);
      onLogin?.();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>Tempo</h1>
        <div className="row">
          <label className="label">Password</label>
          <input
            className="input"
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="btn solid" type="submit" disabled={busy || !password}>
          {busy ? '...' : '[ ENTER ]'}
        </button>
        {err && <div className="err">! {err}</div>}
      </form>
    </div>
  );
}
