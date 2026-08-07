import { useCallback, useEffect, useState } from 'react';
import { Alert, Card, Empty, Field, Input, SectionHead, Toggle } from '../components/ui';
import { api } from '../lib/api';
import { dateTime, relativeTime } from '../lib/format';
import { errorMessage, useSession } from '../lib/session';
import {
  PERMISSION_LABELS,
  PERMISSION_ORDER,
  type Ingest,
  type Permission,
  type User,
} from '../lib/types';

export function Users(): JSX.Element {
  const { user: me } = useSession();

  const [users, setUsers] = useState<User[]>([]);
  const [ingests, setIngests] = useState<Ingest[]>([]);
  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Draft state for the open editor.
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isAdminRole, setIsAdminRole] = useState(false);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [ingestIds, setIngestIds] = useState<string[]>([]);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setUsers(await api.users());
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
    void api.listIngests().then(setIngests).catch(() => undefined);
  }, [refresh]);

  const openEdit = (user: User): void => {
    setCreating(false);
    setEditing(user);
    setDisplayName(user.displayName);
    setUsername(user.username);
    setPassword('');
    setIsAdminRole(user.role === 'admin');
    setPermissions(user.permissions);
    setIngestIds(user.ingestIds);
  };

  const openCreate = (): void => {
    setEditing(null);
    setCreating(true);
    setDisplayName('');
    setUsername('');
    setPassword('');
    setIsAdminRole(false);
    setPermissions(['ingest.monitor']);
    setIngestIds([]);
  };

  const close = (): void => {
    setEditing(null);
    setCreating(false);
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const body = {
        displayName: displayName.trim(),
        role: isAdminRole ? 'admin' : 'operator',
        permissions,
        ingestIds,
        ...(password ? { password } : {}),
      };
      if (creating) {
        await api.createUser({ ...body, username: username.trim(), password });
      } else if (editing) {
        await api.updateUser(editing.id, body);
      }
      close();
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (user: User): Promise<void> => {
    if (!confirm(`Apagar o usuário "${user.displayName}"? Isso não pode ser desfeito.`)) return;
    try {
      await api.deleteUser(user.id);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const editorOpen = creating || editing !== null;

  return (
    <div>
      <SectionHead
        eyebrow="Controle de acesso"
        title="Usuários"
        action={
          <button className="btn-primary" onClick={openCreate}>
            + Novo usuário
          </button>
        }
      />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {editorOpen && (
        <Card className="mb-5">
          <h3 className="mb-1 text-xl">
            {creating ? 'Novo usuário' : `Editando: ${editing?.displayName}`}
          </h3>
          <p className="mb-5 text-sm text-mist">
            Permissão diz <em>o que</em> o usuário pode fazer. Acesso diz{' '}
            <em>em quais recepções</em>. As duas coisas são independentes.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome exibido">
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </Field>

            <Field
              label="Nome de usuário"
              hint={creating ? undefined : 'O próprio usuário pode alterar isso depois.'}
            >
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={!creating}
                required={creating}
              />
            </Field>

            <Field
              label={creating ? 'Senha' : 'Nova senha (opcional)'}
              hint={
                creating
                  ? 'Mínimo de 8 caracteres.'
                  : 'Preencher encerra todas as sessões desta conta.'
              }
            >
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required={creating}
              />
            </Field>
          </div>

          <div className="mt-5 grid gap-6 border-t border-ink-600 pt-5 lg:grid-cols-2">
            <div>
              <span className="label">Perfil e permissões</span>
              <div className="mt-2 flex flex-col gap-2.5">
                <Toggle
                  checked={isAdminRole}
                  onChange={setIsAdminRole}
                  label="Administrador"
                  hint="Tem todas as permissões e gerencia a plataforma."
                />
                <div className="my-1 h-px bg-ink-600" />
                {PERMISSION_ORDER.map((permission) => (
                  <Toggle
                    key={permission}
                    checked={isAdminRole || permissions.includes(permission)}
                    disabled={isAdminRole}
                    onChange={(on) =>
                      setPermissions((prev) =>
                        on ? [...prev, permission] : prev.filter((p) => p !== permission),
                      )
                    }
                    label={PERMISSION_LABELS[permission]}
                  />
                ))}
              </div>
              {isAdminRole && (
                <p className="mt-3 text-xs text-faint">
                  Administradores têm todas as permissões implicitamente.
                </p>
              )}
            </div>

            <div>
              <span className="label">Recepções liberadas</span>
              <div className="mt-2 flex flex-col gap-2.5">
                {ingests.length === 0 ? (
                  <p className="text-sm text-faint">Nenhuma recepção cadastrada ainda.</p>
                ) : (
                  ingests.map((ingest) => (
                    <Toggle
                      key={ingest.id}
                      checked={isAdminRole || ingestIds.includes(ingest.id)}
                      disabled={isAdminRole}
                      onChange={(on) =>
                        setIngestIds((prev) =>
                          on ? [...prev, ingest.id] : prev.filter((id) => id !== ingest.id),
                        )
                      }
                      label={ingest.name}
                    />
                  ))
                )}
              </div>
              {isAdminRole && (
                <p className="mt-3 text-xs text-faint">
                  Administradores enxergam todas as recepções.
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 flex gap-2">
            <button className="btn-primary" disabled={busy} onClick={() => void save()}>
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
            <button className="btn-ghost" onClick={close}>
              Cancelar
            </button>
          </div>
        </Card>
      )}

      {users.length === 0 ? (
        <Empty>Nenhum usuário cadastrado.</Empty>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-600 text-left">
                  <th className="th pb-3">Usuário</th>
                  <th className="th pb-3">Perfil</th>
                  <th className="th pb-3">Permissões</th>
                  <th className="th pb-3">Recepções</th>
                  <th className="th pb-3">Último acesso</th>
                  <th className="th pb-3" />
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-ink-600 last:border-0">
                    <td className="py-3 pr-3">
                      <span className="block font-semibold">{user.displayName}</span>
                      <span className="block font-mono text-xs text-faint">
                        {user.username}
                        {user.email ? ` · ${user.email}` : ''}
                      </span>
                      {!user.enabled && (
                        <span className="mt-0.5 block text-xs text-signal-fault">desativado</span>
                      )}
                      {user.mustChangePassword && (
                        <span className="mt-0.5 block text-xs text-signal-warn">
                          senha provisória
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      <span
                        className={`font-display text-sm font-bold uppercase tracking-wide ${
                          user.role === 'admin' ? 'text-sky' : 'text-mist'
                        }`}
                      >
                        {user.role === 'admin' ? 'Admin' : 'Operador'}
                      </span>
                    </td>
                    <td className="max-w-xs py-3 pr-3">
                      {user.role === 'admin' ? (
                        <span className="rounded border border-sky/30 bg-sky/10 px-1.5 py-0.5 font-mono text-[10px] text-sky">
                          todas
                        </span>
                      ) : user.permissions.length === 0 ? (
                        <span className="text-xs text-faint">nenhuma</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {user.permissions.map((p) => (
                            <span
                              key={p}
                              className="rounded border border-sky/30 bg-sky/10 px-1.5 py-0.5 font-mono text-[10px] text-sky"
                              title={PERMISSION_LABELS[p]}
                            >
                              {p.split('.')[1]}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-3 font-mono text-xs text-faint">
                      {user.role === 'admin'
                        ? 'todas'
                        : user.ingestIds.length === 0
                          ? 'nenhuma'
                          : `${user.ingestIds.length}`}
                    </td>
                    <td className="py-3 pr-3 font-mono text-xs text-faint" title={dateTime(user.lastLoginAt)}>
                      {user.lastLoginAt ? relativeTime(user.lastLoginAt) : 'nunca'}
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        <button className="btn-ghost" onClick={() => openEdit(user)}>
                          Editar
                        </button>
                        {user.id !== me?.id && (
                          <button className="btn-danger" onClick={() => void remove(user)}>
                            Apagar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
