import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Card, Field, Input, SectionHead } from '../components/ui';
import { api } from '../lib/api';
import { maskPhone } from '../lib/format';
import { errorMessage, useSession } from '../lib/session';
import { PERMISSION_LABELS, PERMISSION_ORDER } from '../lib/types';

export function Account(): JSX.Element {
  const { user, refresh, signOut, isAdmin } = useSession();
  const navigate = useNavigate();

  const [username, setUsername] = useState(user?.username ?? '');
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(maskPhone(user?.phone ?? ''));

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');

  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const saveProfile = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setProfileError(null);
    try {
      await api.updateProfile({
        username: username.trim(),
        displayName: displayName.trim(),
        email: email.trim(),
        phone: phone.replace(/\D/g, ''),
      });
      await refresh();
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    } catch (err) {
      setProfileError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (next !== repeat) {
      setPasswordError('As duas senhas novas não coincidem.');
      return;
    }
    setBusy(true);
    setPasswordError(null);
    try {
      await api.changePassword(current, next);
      // The server drops every session for the account, this one included.
      await signOut();
      navigate('/entrar', { replace: true });
    } catch (err) {
      setPasswordError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <SectionHead eyebrow="Sua conta" title="Minha conta" />

      <div className="flex flex-col gap-5">
        <Card>
          <h3 className="mb-4 text-xl">Dados de acesso</h3>
          <form onSubmit={(e) => void saveProfile(e)} className="flex flex-col gap-4">
            {profileError && <Alert>{profileError}</Alert>}
            {profileSaved && <Alert tone="ok">Dados salvos.</Alert>}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Nome de usuário"
                hint="É com ele que você entra na plataforma."
              >
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  pattern="[a-zA-Z0-9._-]+"
                  minLength={3}
                  required
                />
              </Field>

              <Field label="Nome exibido">
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </Field>

              <Field label="E-mail">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>

              <Field label="Celular">
                <Input
                  value={phone}
                  onChange={(e) => setPhone(maskPhone(e.target.value))}
                  inputMode="tel"
                />
              </Field>
            </div>

            <div>
              <button type="submit" className="btn-primary" disabled={busy}>
                Salvar
              </button>
            </div>
          </form>
        </Card>

        <Card>
          <h3 className="mb-1 text-xl">Trocar senha</h3>
          <p className="mb-4 text-sm text-mist">
            Ao salvar, todas as sessões desta conta são encerradas e você entra de novo.
          </p>

          <form onSubmit={(e) => void changePassword(e)} className="flex flex-col gap-4">
            {passwordError && <Alert>{passwordError}</Alert>}

            <Field label="Senha atual">
              <Input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
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
            </div>

            <div>
              <button type="submit" className="btn-primary" disabled={busy}>
                Trocar senha
              </button>
            </div>
          </form>
        </Card>

        <Card>
          <h3 className="mb-4 text-xl">Seus acessos</h3>
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-mist">Função</span>
              <span>{user?.jobTitle ?? '—'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-mist">Perfil</span>
              <span className="font-display font-bold uppercase tracking-wide text-sky">
                {isAdmin ? 'Administrador' : 'Operador'}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="shrink-0 text-mist">Permissões</span>
              <span className="flex flex-wrap justify-end gap-1">
                {PERMISSION_ORDER.map((permission) => {
                  const granted = isAdmin || (user?.permissions.includes(permission) ?? false);
                  return (
                    <span
                      key={permission}
                      title={PERMISSION_LABELS[permission]}
                      className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                        granted
                          ? 'border-sky/30 bg-sky/10 text-sky'
                          : 'border-ink-500 text-faint'
                      }`}
                    >
                      {permission.split('.')[1]}
                    </span>
                  );
                })}
              </span>
            </div>
          </div>
          <p className="mt-4 text-xs text-faint">
            Permissões e recepções são definidas pelo administrador. Fale com ele para
            alterar.
          </p>
        </Card>
      </div>
    </div>
  );
}
