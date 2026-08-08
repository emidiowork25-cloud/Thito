import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { StreamKeyPanel } from '../components/StreamKey';
import { OutputForm } from '../components/OutputForm';
import { Preview } from '../components/Preview';
import {
  Alert,
  Card,
  Empty,
  ProtocolTag,
  StateBadge,
  StatCell,
  StatStrip,
  Toggle,
} from '../components/ui';
import { api } from '../lib/api';
import { bitrate, uptime } from '../lib/format';
import { errorMessage, useSession } from '../lib/session';
import type { Ingest, Output, SystemInfo } from '../lib/types';
import { useLive } from '../lib/useLive';

function describe(output: Output, canSeeDetails: boolean): string {
  switch (output.protocol) {
    case 'omt':
      return `${output.host} · LAN`;
    case 'rtmp':
      return canSeeDetails ? output.host : 'destino oculto';
    case 'srt':
      return `srt://${output.mode === 'listener' ? '0.0.0.0' : output.host}:${output.port} · ${output.mode}`;
    default:
      return `${output.protocol}://${output.host}:${output.port}`;
  }
}

export function IngestDetail(): JSX.Element {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can, isAdmin } = useSession();
  const { statuses } = useLive();

  const [ingest, setIngest] = useState<Ingest | null>(null);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [logs, setLogs] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [keyBusy, setKeyBusy] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setIngest(await api.getIngest(id));
      setError(null);
    } catch (err) {
      // Out-of-scope feeds answer 404 by design, so a missing ingest and one
      // that was never granted look identical here — as intended.
      setNotFound(true);
      setError(errorMessage(err));
    }
  }, [id]);

  useEffect(() => {
    void refresh();
    void api.system().then(setSystem).catch(() => undefined);
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(timer);
  }, [refresh]);

  if (notFound) {
    return (
      <div>
        <Alert>{error ?? 'Recepção não encontrada'}</Alert>
        <Link to="/app" className="btn-ghost mt-4">
          Voltar às recepções
        </Link>
      </div>
    );
  }

  if (!ingest) return <Empty>Carregando…</Empty>;

  const status = statuses[ingest.id] ?? ingest.status;
  const state = status?.state ?? 'stopped';
  const configurable = can('ingest.configure');
  const manageOutputs = can('output.manage');
  const atLimit = system != null && ingest.outputs.length >= system.maxOutputsPerIngest;

  const act = async (fn: () => Promise<unknown>): Promise<void> => {
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const remove = async (): Promise<void> => {
    if (!confirm(`Remover a recepção "${ingest.name}" e todas as suas saídas?`)) return;
    try {
      await api.deleteIngest(ingest.id);
      navigate('/app', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Link to="/app" className="font-display text-sm uppercase tracking-wide text-faint hover:text-sky">
        ← Recepções
      </Link>

      {error && <Alert>{error}</Alert>}

      <Card>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl">{ingest.name}</h1>
            <p className="mt-1 font-mono text-xs text-faint">
              SRT {ingest.mode} · latência {ingest.latencyUs / 1000} ms
              {ingest.streamId && ` · streamid ${ingest.streamId}`}
              {ingest.passphrase && ' · criptografado'}
            </p>
          </div>

          {configurable && (
            <div className="flex gap-2">
              {ingest.enabled ? (
                <button className="btn-ghost" onClick={() => void act(() => api.stopIngest(ingest.id))}>
                  Parar
                </button>
              ) : (
                <button className="btn-primary" onClick={() => void act(() => api.startIngest(ingest.id))}>
                  Iniciar
                </button>
              )}
              <button className="btn-danger" onClick={() => void remove()}>
                Remover
              </button>
            </div>
          )}
        </div>

        {ingest.connect && (
          <StreamKeyPanel
            connect={ingest.connect}
            canConfigure={configurable}
            busy={keyBusy}
            onRotate={() =>
              void act(async () => {
                setKeyBusy(true);
                try {
                  await api.rotateKey(ingest.id);
                } finally {
                  setKeyBusy(false);
                }
              })
            }
            onClear={() =>
              void act(async () => {
                setKeyBusy(true);
                try {
                  await api.clearKey(ingest.id);
                } finally {
                  setKeyBusy(false);
                }
              })
            }
          />
        )}

        {status?.lastError && state !== 'running' && (
          <p className="mt-4 rounded-lg border border-signal-fault/40 bg-signal-fault/10 px-3 py-2 font-mono text-xs text-signal-fault">
            {status.lastError}
          </p>
        )}
      </Card>

      <StatStrip>
        <StatCell label="Estado" value={<StateBadge state={state} />} />
        <StatCell label="Bitrate" value={bitrate(status?.bitrateKbps)} tone="accent" />
        <StatCell label="FPS" value={status?.fps?.toFixed(1) ?? '—'} />
        <StatCell label="No ar há" value={uptime(status?.uptimeSec)} />
        <StatCell label="Reconexões" value={status?.restarts ?? 0} />
      </StatStrip>

      <div className="grid gap-5 lg:grid-cols-2">
        {can('ingest.monitor') && (
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg">Monitor</h3>
              <StateBadge state={state} />
            </div>
            <Preview ingestId={ingest.id} enabled={ingest.previewEnabled} />
            {configurable && (
              <div className="mt-3">
                <Toggle
                  checked={ingest.previewEnabled}
                  onChange={(next) =>
                    void act(() => api.updateIngest(ingest.id, { previewEnabled: next }))
                  }
                  label="Preview ativo"
                  hint="Alternar reinicia o pipeline desta recepção."
                />
              </div>
            )}
          </Card>
        )}

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg">
              Saídas{' '}
              <span className="font-mono text-sm text-faint">
                {ingest.outputs.length}
                {system ? ` / ${system.maxOutputsPerIngest}` : ''}
              </span>
            </h3>
            {manageOutputs && (
              <button
                className="btn-primary"
                disabled={atLimit}
                title={atLimit ? 'Limite de saídas desta recepção atingido' : undefined}
                onClick={() => setShowForm(true)}
              >
                + Retransmitir
              </button>
            )}
          </div>

          {showForm && system && (
            <OutputForm
              ingestId={ingest.id}
              system={system}
              onCancel={() => setShowForm(false)}
              onCreated={() => {
                setShowForm(false);
                void refresh();
              }}
            />
          )}

          {ingest.outputs.length === 0 ? (
            <Empty>
              Nenhuma saída configurada. Adicione um destino para retransmitir este sinal.
            </Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {ingest.outputs.map((output) => {
                const telemetry = status?.outputs[output.id];
                return (
                  <li
                    key={output.id}
                    className={`card flex flex-wrap items-center gap-x-4 gap-y-2 p-3.5 ${
                      output.enabled ? '' : 'opacity-55'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold">{output.name}</span>
                        <ProtocolTag protocol={output.protocol} />
                      </div>
                      <code className="mt-0.5 block truncate font-mono text-xs text-faint">
                        {describe(output, isAdmin)}
                      </code>
                      {telemetry?.lastError && telemetry.state !== 'running' && (
                        <p
                          className="mt-1 truncate text-xs text-signal-fault"
                          title={telemetry.lastError}
                        >
                          {telemetry.lastError}
                        </p>
                      )}
                    </div>

                    <StateBadge state={telemetry?.state ?? 'stopped'} />
                    <span className="w-24 text-right font-mono text-sm tabular-nums text-mist">
                      {bitrate(telemetry?.bitrateKbps)}
                    </span>

                    {manageOutputs && (
                      <div className="flex gap-2">
                        {output.enabled ? (
                          <button
                            className="btn-ghost"
                            onClick={() => void act(() => api.stopOutput(output.id))}
                          >
                            Parar
                          </button>
                        ) : (
                          <button
                            className="btn-ghost"
                            onClick={() => void act(() => api.startOutput(output.id))}
                          >
                            Iniciar
                          </button>
                        )}
                        <button
                          className="btn-danger"
                          onClick={() => {
                            if (!confirm(`Remover a saída "${output.name}"?`)) return;
                            void act(() => api.deleteOutput(output.id));
                          }}
                        >
                          Remover
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {can('ingest.monitor') && (
        <Card>
          <div className="flex items-center justify-between">
            <h3 className="text-lg">Registro do ffmpeg</h3>
            <button
              className="btn-ghost"
              onClick={() =>
                void api
                  .logs(ingest.id)
                  .then((r) => setLogs(r.relay))
                  .catch((err) => setError(errorMessage(err)))
              }
            >
              {logs ? 'Atualizar' : 'Carregar'}
            </button>
          </div>
          {logs && (
            <pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-ink-600 bg-ink-950 p-3 font-mono text-[11px] leading-relaxed text-mist">
              {logs.length ? logs.join('\n') : 'Sem registros — a recepção está parada.'}
            </pre>
          )}
        </Card>
      )}
    </div>
  );
}
