import { useCallback, useEffect, useState } from 'react';
import { CopyField } from './components/CopyField';
import { IngestForm } from './components/IngestForm';
import { OutputForm } from './components/OutputForm';
import { OutputList } from './components/OutputList';
import { Preview } from './components/Preview';
import { StateBadge } from './components/StateBadge';
import { api, ApiError, setToken } from './lib/api';
import { useLive } from './lib/useLive';
import type { Ingest, SystemInfo } from './lib/types';

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-mono text-sm tabular-nums text-slate-200">{value}</div>
    </div>
  );
}

function formatUptime(seconds: number | null): string {
  if (seconds == null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}h ${String(m).padStart(2, '0')}m`
    : `${m}m ${String(s).padStart(2, '0')}s`;
}

export default function App(): JSX.Element {
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [ingests, setIngests] = useState<Ingest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showIngestForm, setShowIngestForm] = useState(false);
  const [showOutputForm, setShowOutputForm] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const { statuses, connected } = useLive();

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const list = await api.listIngests();
      setIngests(list);
      setLoadError(null);
      setAuthError(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setAuthError(true);
      else setLoadError(err instanceof Error ? err.message : 'Erro ao carregar');
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setSystem(await api.system());
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setAuthError(true);
          return;
        }
        setLoadError(err instanceof Error ? err.message : 'Erro ao carregar');
      }
      await refresh();
    })();
  }, [refresh]);

  // Config changes arrive over the websocket; re-fetch so names, outputs and
  // enabled flags stay in sync with what another operator may have changed.
  useEffect(() => {
    const timer = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(timer);
  }, [refresh]);

  if (authError) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <form
          className="card w-full max-w-sm space-y-4 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            const value = new FormData(event.currentTarget).get('token');
            setToken(typeof value === 'string' && value ? value : null);
            location.reload();
          }}
        >
          <h1 className="text-lg font-semibold text-white">SRT HUB FREE</h1>
          <p className="text-sm text-slate-400">
            Este hub exige um token de acesso.
          </p>
          <input
            name="token"
            type="password"
            className="field"
            placeholder="THITO_ADMIN_TOKEN"
            autoFocus
          />
          <button type="submit" className="btn-primary w-full justify-center">
            Entrar
          </button>
        </form>
      </div>
    );
  }

  const selected = ingests.find((i) => i.id === selectedId) ?? null;
  const selectedStatus = selected ? (statuses[selected.id] ?? selected.status) : null;

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.16)]" />
          <h1 className="text-lg font-bold tracking-tight text-white">
            {system?.siteName ?? 'SRT HUB'}
          </h1>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-slate-600'}`}
            />
            {connected ? 'telemetria ao vivo' : 'desconectado'}
          </span>
          {system && (
            <span title={system.capabilities.ffmpegVersion ?? ''}>
              SRT {system.capabilities.srt ? '✓' : '✗'} · OMT{' '}
              {system.capabilities.omtMuxer ? '✓' : '✗'}
            </span>
          )}
        </div>
      </header>

      {loadError && (
        <p className="mb-4 rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
          {loadError}
        </p>
      )}

      {system && !system.capabilities.srt && (
        <p className="mb-4 rounded-lg border border-amber-900/60 bg-amber-950/40 px-3 py-2 text-sm text-amber-300">
          O ffmpeg detectado não tem suporte a SRT. Os ingests não vão conectar — use a
          imagem Docker do projeto ou recompile o ffmpeg com <code>--enable-libsrt</code>.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* -------------------------------------------------------- sidebar */}
        <aside className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300">
              Ingests ({ingests.length})
            </h2>
            <button className="btn-primary" onClick={() => setShowIngestForm(true)}>
              + Novo
            </button>
          </div>

          {ingests.length === 0 && !showIngestForm && (
            <p className="rounded-lg border border-dashed border-ink-500 px-4 py-8 text-center text-sm text-slate-500">
              Nenhum ingest ainda. Crie o primeiro para gerar um link SRT.
            </p>
          )}

          <ul className="space-y-2">
            {ingests.map((ingest) => {
              const status = statuses[ingest.id] ?? ingest.status;
              const active = ingest.id === selectedId;
              return (
                <li key={ingest.id}>
                  <button
                    onClick={() => {
                      setSelectedId(ingest.id);
                      setShowOutputForm(false);
                    }}
                    className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                      active
                        ? 'border-sky-600 bg-ink-700'
                        : 'border-ink-600 bg-ink-800 hover:border-ink-500'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-white">
                        {ingest.name}
                      </span>
                      <StateBadge state={status?.state ?? 'stopped'} />
                    </div>
                    <div className="mt-1 flex justify-between font-mono text-xs text-slate-500">
                      <span>
                        {ingest.mode === 'listener' ? `:${ingest.port}` : `${ingest.host}:${ingest.port}`}
                      </span>
                      <span>
                        {status?.bitrateKbps != null
                          ? `${(status.bitrateKbps / 1000).toFixed(1)} Mb/s`
                          : '—'}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      {ingest.outputs.length} saída{ingest.outputs.length === 1 ? '' : 's'}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* --------------------------------------------------------- detail */}
        <main className="space-y-5">
          {showIngestForm && system && (
            <IngestForm
              system={system}
              onCancel={() => setShowIngestForm(false)}
              onCreated={() => {
                setShowIngestForm(false);
                void refresh();
              }}
            />
          )}

          {!selected && !showIngestForm && (
            <div className="card flex h-64 items-center justify-center text-sm text-slate-500">
              Selecione um ingest para monitorar e configurar saídas.
            </div>
          )}

          {selected && (
            <>
              <section className="card space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-white">{selected.name}</h2>
                    <p className="text-xs text-slate-500">
                      SRT {selected.mode} · latência {selected.latencyUs / 1000} ms
                      {selected.streamId && ` · streamid ${selected.streamId}`}
                      {selected.passphrase && ' · criptografado'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {selected.enabled ? (
                      <button
                        className="btn-ghost"
                        onClick={() => void api.stopIngest(selected.id).then(refresh)}
                      >
                        Parar
                      </button>
                    ) : (
                      <button
                        className="btn-primary"
                        onClick={() => void api.startIngest(selected.id).then(refresh)}
                      >
                        Iniciar
                      </button>
                    )}
                    <button
                      className="btn-danger"
                      onClick={() => {
                        if (!confirm(`Remover o ingest "${selected.name}" e suas saídas?`)) return;
                        void api.deleteIngest(selected.id).then(() => {
                          setSelectedId(null);
                          void refresh();
                        });
                      }}
                    >
                      Remover
                    </button>
                  </div>
                </div>

                {selectedStatus?.connectUrl && (
                  <CopyField label="Link para o encoder enviar" value={selectedStatus.connectUrl} />
                )}

                <div className="grid grid-cols-2 gap-4 border-t border-ink-600 pt-4 sm:grid-cols-5">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Estado</div>
                    <StateBadge state={selectedStatus?.state ?? 'stopped'} />
                  </div>
                  <Stat
                    label="Bitrate"
                    value={
                      selectedStatus?.bitrateKbps != null
                        ? `${(selectedStatus.bitrateKbps / 1000).toFixed(2)} Mb/s`
                        : '—'
                    }
                  />
                  <Stat label="FPS" value={selectedStatus?.fps?.toFixed(1) ?? '—'} />
                  <Stat label="No ar há" value={formatUptime(selectedStatus?.uptimeSec ?? null)} />
                  <Stat label="Reconexões" value={String(selectedStatus?.restarts ?? 0)} />
                </div>

                {selectedStatus?.lastError && selectedStatus.state !== 'running' && (
                  <p className="rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 font-mono text-xs text-rose-300">
                    {selectedStatus.lastError}
                  </p>
                )}
              </section>

              <section className="card space-y-3 p-5">
                <h3 className="text-sm font-semibold text-white">Monitor</h3>
                <Preview ingestId={selected.id} enabled={selected.previewEnabled} />
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={selected.previewEnabled}
                    onChange={(e) =>
                      void api
                        .updateIngest(selected.id, { previewEnabled: e.target.checked })
                        .then(refresh)
                    }
                    className="h-4 w-4 rounded border-ink-500 bg-ink-900"
                  />
                  Preview ativo — reinicia o pipeline ao alternar
                </label>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">
                    Saídas ({selected.outputs.length}
                    {system ? ` / ${system.maxOutputsPerIngest}` : ''})
                  </h3>
                  <button
                    className="btn-primary"
                    disabled={
                      system != null && selected.outputs.length >= system.maxOutputsPerIngest
                    }
                    onClick={() => setShowOutputForm(true)}
                  >
                    + Saída
                  </button>
                </div>

                {showOutputForm && system && (
                  <OutputForm
                    ingestId={selected.id}
                    system={system}
                    onCancel={() => setShowOutputForm(false)}
                    onCreated={() => {
                      setShowOutputForm(false);
                      void refresh();
                    }}
                  />
                )}

                <OutputList
                  outputs={selected.outputs}
                  status={selectedStatus}
                  onChanged={() => void refresh()}
                />
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
