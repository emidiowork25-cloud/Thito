import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { IngestForm } from '../components/IngestForm';
import { Alert, Empty, SectionHead, StateBadge, StatCell, StatStrip } from '../components/ui';
import { api } from '../lib/api';
import { bitrate, uptime } from '../lib/format';
import { errorMessage, useSession } from '../lib/session';
import type { Ingest, SystemInfo } from '../lib/types';
import { useLive } from '../lib/useLive';

export function Ingests(): JSX.Element {
  const { can } = useSession();
  const { statuses, connected } = useLive();

  const [ingests, setIngests] = useState<Ingest[]>([]);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setIngests(await api.listIngests());
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void api.system().then(setSystem).catch(() => undefined);
  }, [refresh]);

  // Names, output counts and enabled flags can change from another operator's
  // session; the websocket only carries telemetry, so the list is re-fetched.
  useEffect(() => {
    const timer = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const live = ingests.filter((i) => (statuses[i.id] ?? i.status)?.state === 'running');
  const totalIn = live.reduce((sum, i) => sum + ((statuses[i.id] ?? i.status)?.bitrateKbps ?? 0), 0);
  const totalOutputs = ingests.reduce((sum, i) => sum + i.outputs.filter((o) => o.enabled).length, 0);
  const restarts = ingests.reduce((sum, i) => sum + ((statuses[i.id] ?? i.status)?.restarts ?? 0), 0);

  return (
    <div>
      <SectionHead
        eyebrow="Recepções"
        title={
          <>
            {ingests.length} {ingests.length === 1 ? 'sinal' : 'sinais'} ·{' '}
            <span className="text-signal-live">{live.length} no ar</span>
          </>
        }
        action={
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-faint">
              <span
                className={`h-2 w-2 rounded-full ${connected ? 'bg-signal-live' : 'bg-faint/50'}`}
              />
              {connected ? 'telemetria ao vivo' : 'reconectando'}
            </span>
            {can('ingest.create') && (
              <button className="btn-primary" onClick={() => setShowForm(true)}>
                + Nova recepção
              </button>
            )}
          </div>
        }
      />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {system && !system.capabilities.srt && (
        <div className="mb-4">
          <Alert tone="warn">
            O ffmpeg detectado não tem suporte a SRT. As recepções não vão conectar — use a
            imagem Docker do projeto ou recompile com <code>--enable-libsrt</code>.
          </Alert>
        </div>
      )}

      <div className="mb-6">
        <StatStrip>
          <StatCell label="Entrada total" value={bitrate(totalIn)} tone="accent" />
          <StatCell label="Recepções no ar" value={live.length} />
          <StatCell label="Saídas ativas" value={totalOutputs} />
          <StatCell label="Reconexões" value={restarts} />
          <StatCell
            label="Limite por sinal"
            value={system ? `${system.maxOutputsPerIngest} saídas` : '—'}
          />
        </StatStrip>
      </div>

      {showForm && system && (
        <div className="mb-6">
          <IngestForm
            system={system}
            onCancel={() => setShowForm(false)}
            onCreated={() => {
              setShowForm(false);
              void refresh();
            }}
          />
        </div>
      )}

      {loading ? (
        <Empty>Carregando…</Empty>
      ) : ingests.length === 0 ? (
        <Empty>
          {can('ingest.create')
            ? 'Nenhuma recepção ainda. Crie a primeira para gerar um link SRT.'
            : 'Nenhuma recepção liberada para você ainda. Fale com o administrador.'}
        </Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ingests.map((ingest) => {
            const status = statuses[ingest.id] ?? ingest.status;
            const state = status?.state ?? 'stopped';
            return (
              <li key={ingest.id}>
                <Link
                  to={`/app/recepcao/${ingest.id}`}
                  className={`card block border-l-2 p-4 transition-colors hover:border-ink-500 ${
                    state === 'running' ? 'border-l-signal-live' : 'border-l-ink-500'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="min-w-0 truncate text-lg">{ingest.name}</h3>
                    <StateBadge state={state} />
                  </div>

                  <div className="mt-2 flex justify-between font-mono text-xs text-faint">
                    <span>
                      {ingest.mode === 'listener'
                        ? `:${ingest.port} · listener`
                        : `${ingest.host}:${ingest.port} · caller`}
                    </span>
                    <span className="text-sky">{bitrate(status?.bitrateKbps)}</span>
                  </div>

                  <div className="mt-1 flex justify-between font-mono text-xs text-faint">
                    <span>
                      {ingest.outputs.length}{' '}
                      {ingest.outputs.length === 1 ? 'saída' : 'saídas'}
                    </span>
                    <span>{uptime(status?.uptimeSec)}</span>
                  </div>

                  {status?.lastError && state !== 'running' && (
                    <p className="mt-2 truncate text-xs text-signal-fault" title={status.lastError}>
                      {status.lastError}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
