import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Alert, Field, Input } from '../components/ui';
import { errorMessage, useSession } from '../lib/session';

/**
 * `adminMode` only changes the wording. The credentials, the endpoint and the
 * checks behind it are identical — the separate address keeps the public page
 * tidy, it does not gate anything.
 */
export function Login({ adminMode = false }: { adminMode?: boolean }): JSX.Element {
  const { signIn, siteName } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(username.trim(), password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? '/app', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-full place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex justify-center">
          <Logo size="lg" siteName={siteName} />
        </Link>

        <form onSubmit={(e) => void submit(e)} className="card flex flex-col gap-4 p-6">
          <div>
            <h1 className="text-2xl">{adminMode ? 'Administração' : 'Entrar'}</h1>
            <p className="mt-1 text-sm text-mist">
              {adminMode
                ? 'Acesso restrito à administração da plataforma.'
                : 'Acesse com o usuário e a senha que você recebeu por e-mail.'}
            </p>
          </div>

          {error && <Alert>{error}</Alert>}

          <Field label="Usuário">
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </Field>

          <Field label="Senha">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>

          <button type="submit" className="btn-primary mt-1 w-full justify-center" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>

          {!adminMode && (
            <p className="text-center text-xs text-faint">
              Ainda não tem acesso?{' '}
              <Link to="/criar-conta" className="text-sky">
                Solicite uma conta
              </Link>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
