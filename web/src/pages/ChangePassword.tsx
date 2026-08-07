import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Alert, Field, Input } from '../components/ui';
import { api } from '../lib/api';
import { errorMessage, useSession } from '../lib/session';

/**
 * The exit from provisional credentials.
 *
 * Changing the password drops every session for the account — including this
 * one — so the flow always ends back at the login screen rather than pretending
 * the current session survived.
 */
export function ChangePassword(): JSX.Element {
  const { user, loading, mustChangePassword, signOut, siteName } = useSession();
  const navigate = useNavigate();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <div />;
  if (!user) return <Navigate to="/entrar" replace />;
  if (!mustChangePassword) return <Navigate to="/app" replace />;

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (next !== repeat) {
      setError('As duas senhas novas não coincidem.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.changePassword(current, next);
      await signOut();
      navigate('/entrar', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-full place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo size="lg" siteName={siteName} />
        </div>

        <form onSubmit={(e) => void submit(e)} className="card flex flex-col gap-4 p-6">
          <div>
            <h1 className="text-2xl">Defina sua senha</h1>
            <p className="mt-1 text-sm leading-relaxed text-mist">
              Olá, {user.displayName.split(' ')[0]}. A senha que você recebeu é provisória
              e precisa ser trocada antes de usar a plataforma.
            </p>
          </div>

          {error && <Alert>{error}</Alert>}

          <Field label="Senha provisória">
            <Input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              autoFocus
              required
            />
          </Field>

          <Field label="Nova senha" hint="Mínimo de 8 caracteres.">
            <Input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>

          <Field label="Repita a nova senha">
            <Input
              type="password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>

          <button type="submit" className="btn-primary mt-1 w-full justify-center" disabled={busy}>
            {busy ? 'Salvando…' : 'Definir senha e entrar'}
          </button>

          <p className="text-center text-xs text-faint">
            Você será levado ao login para entrar com a senha nova.
          </p>
        </form>
      </div>
    </div>
  );
}
