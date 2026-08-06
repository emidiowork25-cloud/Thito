import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { SrtMode, SystemInfo } from '../lib/types';

export function IngestForm({
  system,
  onCreated,
  onCancel,
}: {
  system: SystemInfo;
  onCreated: () => void;
  onCancel: () => void;
}): JSX.Element {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<SrtMode>('listener');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [streamId, setStreamId] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [latencyMs, setLatencyMs] = useState('120');
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createIngest({
        name,
        mode,
        host: mode === 'caller' ? host : null,
        port: port ? Number(port) : undefined,
        streamId: streamId || null,
        passphrase: passphrase || null,
        latencyUs: Number(latencyMs) * 1000,
        previewEnabled,
        enabled: true,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao criar o ingest');
    } finally {
      setBusy(false);
    }
  };

  const [portMin, portMax] = system.srtPortRange;

  return (
    <form onSubmit={(e) => void submit(e)} className="card space-y-4 p-5">
      <h3 className="text-sm font-semibold text-white">Novo ingest SRT</h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="ingest-name">
            Nome
          </label>
          <input
            id="ingest-name"
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Câmera 1 — Estádio"
            required
          />
        </div>

        <div>
          <span className="label">Modo</span>
          <div className="flex gap-2">
            {(['listener', 'caller'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                className={
                  mode === option
                    ? 'btn bg-sky-600 text-white'
                    : 'btn border border-ink-500 text-slate-400 hover:text-white'
                }
              >
                {option === 'listener' ? 'Recebe (listener)' : 'Busca (caller)'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-slate-500">
        {mode === 'listener'
          ? `O hub abre uma porta e espera o encoder se conectar. A porta é escolhida automaticamente na faixa ${portMin}–${portMax} se você deixar em branco.`
          : 'O hub se conecta a um listener remoto. Informe host e porta de destino.'}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {mode === 'caller' && (
          <div>
            <label className="label" htmlFor="ingest-host">
              Host remoto
            </label>
            <input
              id="ingest-host"
              className="field"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="200.100.50.10"
              required
            />
          </div>
        )}

        <div>
          <label className="label" htmlFor="ingest-port">
            Porta {mode === 'listener' && <span className="normal-case">(opcional)</span>}
          </label>
          <input
            id="ingest-port"
            className="field"
            type="number"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder={mode === 'listener' ? 'automática' : '9001'}
            required={mode === 'caller'}
          />
        </div>

        <div>
          <label className="label" htmlFor="ingest-latency">
            Latência SRT (ms)
          </label>
          <input
            id="ingest-latency"
            className="field"
            type="number"
            min={20}
            max={8000}
            value={latencyMs}
            onChange={(e) => setLatencyMs(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="ingest-streamid">
            Stream ID (opcional)
          </label>
          <input
            id="ingest-streamid"
            className="field"
            value={streamId}
            onChange={(e) => setStreamId(e.target.value)}
            placeholder="camera1"
          />
        </div>

        <div>
          <label className="label" htmlFor="ingest-pass">
            Passphrase (opcional)
          </label>
          <input
            id="ingest-pass"
            className="field"
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="mínimo 10 caracteres"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={previewEnabled}
          onChange={(e) => setPreviewEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-ink-500 bg-ink-900"
        />
        Gerar preview no navegador
        <span className="text-xs text-slate-500">(consome CPU: transcodifica)</span>
      </label>

      {error && (
        <p className="rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Criando…' : 'Criar ingest'}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
