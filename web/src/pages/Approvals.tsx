import { useCallback, useEffect, useState } from 'react';
import { Alert, Card, Empty, Field, Input, SectionHead, Toggle } from '../components/ui';
import { api } from '../lib/api';
import { maskPhone, relativeTime } from '../lib/format';
import { errorMessage } from '../lib/session';
import {
  PERMISSION_LABELS,
  PERMISSION_ORDER,
  type Ingest,
  type MailStatus,
  type Permission,
  type SignupRequest,
} from '../lib/types';

type Filter = 'pending' | 'approved' | 'rejected';

export function Approvals(): JSX.Element {
  const [filter, setFilter] = useState<Filter>('pending');
  const [requests, setRequests] = useState<SignupRequest[]>([]);
  const [ingests, setIngests] = useState<Ingest[]>([]);
  const [mail, setMail] = useState<MailStatus | null>(null);
  const [queued, setQueued] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>(['ingest.monitor']);
  const [ingestIds, setIngestIds] = useState<string[]>([]);
  const [rejectNote, setRejectNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const data = await api.signups(filter);
      setRequests(data.requests);
      setMail(data.mail);
      setQueued(data.queuedMail);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [filter]);

  useEffect(() => {
    void refresh();
    void api.listIngests().then(setIngests).catch(() => undefined);
  }, [refresh]);

  const open = (request: SignupRequest): void => {
    setOpenId(request.id);
    // Nothing is granted by default — an approval is a deliberate act.
    setPermissions(['ingest.monitor']);
    setIngestIds([]);
    setRejectNote('');
    setIssued(null);
  };

  const approve = async (request: SignupRequest): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.approveSignup(request.id, {
        role: 'operator',
        permissions,
        ingestIds,
      });
      setIssued(result.credentials);
      setOpenId(null);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const reject = async (request: SignupRequest): Promise<void> => {
    if (!confirm(`Recusar a solicitação de ${request.firstName} ${request.lastName}?`)) return;
    setBusy(true);
    try {
      await api.rejectSignup(request.id, rejectNote.trim() || null);
      setOpenId(null);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SectionHead
        eyebrow="Controle de acesso"
        title="Solicitações"
        action={
          <div className="flex gap-2">
            {(
              [
                ['pending', 'Pendentes'],
                ['approved', 'Aprovadas'],
                ['rejected', 'Recusadas'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={filter === value ? 'btn-primary' : 'btn-ghost'}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      <div className="mb-5 flex flex-col gap-3">
        {error && <Alert>{error}</Alert>}

        {mail && !mail.configured && (
          <Alert tone="warn">
            O envio de e-mail não está configurado (<code>SMTP_HOST</code>). As mensagens
            ficam na fila e as credenciais aparecem aqui na tela após a aprovação —
            repasse-as manualmente.
          </Alert>
        )}

        {mail?.configured && queued > 0 && (
          <Alert tone="warn">
            {queued} {queued === 1 ? 'mensagem aguardando' : 'mensagens aguardando'} envio.
            {mail.error && <> Último erro: {mail.error}</>}
          </Alert>
        )}

        {issued && (
          <Alert tone="ok">
            Conta criada. Usuário <strong>{issued.username}</strong>, senha provisória{' '}
            <strong>{issued.password}</strong>. Guarde agora — esta senha não volta a ser
            exibida, e ela precisa ser trocada no primeiro acesso.
          </Alert>
        )}
      </div>

      {requests.length === 0 ? (
        <Empty>
          {filter === 'pending'
            ? 'Nenhuma solicitação pendente.'
            : 'Nada nesta categoria.'}
        </Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.map((request) => (
            <li key={request.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg">
                      {request.firstName} {request.lastName}
                    </h3>
                    <p className="mt-1 font-mono text-xs text-faint">
                      {request.jobTitle} · {maskPhone(request.phone)} · {request.email}
                    </p>
                    {request.rejectNote && (
                      <p className="mt-1 text-xs text-signal-warn">
                        Motivo: {request.rejectNote}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-faint">
                      {relativeTime(request.createdAt)}
                    </span>
                    {request.status === 'pending' &&
                      (openId === request.id ? (
                        <button className="btn-ghost" onClick={() => setOpenId(null)}>
                          Fechar
                        </button>
                      ) : (
                        <button className="btn-primary" onClick={() => open(request)}>
                          Analisar
                        </button>
                      ))}
                  </div>
                </div>

                {openId === request.id && (
                  <div className="mt-5 grid gap-6 border-t border-ink-600 pt-5 lg:grid-cols-2">
                    <div>
                      <span className="label">Permissões a conceder</span>
                      <div className="mt-2 flex flex-col gap-2.5">
                        {PERMISSION_ORDER.map((permission) => (
                          <Toggle
                            key={permission}
                            checked={permissions.includes(permission)}
                            onChange={(on) =>
                              setPermissions((prev) =>
                                on
                                  ? [...prev, permission]
                                  : prev.filter((p) => p !== permission),
                              )
                            }
                            label={PERMISSION_LABELS[permission]}
                          />
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="label">Recepções liberadas</span>
                      <div className="mt-2 flex flex-col gap-2.5">
                        {ingests.length === 0 ? (
                          <p className="text-sm text-faint">
                            Nenhuma recepção cadastrada ainda.
                          </p>
                        ) : (
                          ingests.map((ingest) => (
                            <Toggle
                              key={ingest.id}
                              checked={ingestIds.includes(ingest.id)}
                              onChange={(on) =>
                                setIngestIds((prev) =>
                                  on
                                    ? [...prev, ingest.id]
                                    : prev.filter((id) => id !== ingest.id),
                                )
                              }
                              label={ingest.name}
                            />
                          ))
                        )}
                      </div>

                      <div className="mt-5 rounded-lg border border-dashed border-ink-500 bg-ink-900 p-4">
                        <span className="label">Credenciais que serão enviadas</span>
                        <p className="text-xs leading-relaxed text-faint">
                          O usuário vem do nome e a senha são os 4 últimos dígitos do
                          celular. A troca no primeiro acesso é obrigatória.
                        </p>
                      </div>
                    </div>

                    <div className="lg:col-span-2">
                      <Field label="Motivo da recusa (opcional)">
                        <Input
                          value={rejectNote}
                          onChange={(e) => setRejectNote(e.target.value)}
                          placeholder="Enviado por e-mail se você recusar"
                        />
                      </Field>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          className="btn-primary"
                          disabled={busy}
                          onClick={() => void approve(request)}
                        >
                          {busy ? 'Aprovando…' : 'Aprovar e enviar e-mail'}
                        </button>
                        <button
                          className="btn-danger"
                          disabled={busy}
                          onClick={() => void reject(request)}
                        >
                          Recusar
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
