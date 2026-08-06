import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { OutputProtocol, SrtMode, SystemInfo } from '../lib/types';

const PROTOCOLS: { value: OutputProtocol; label: string; hint: string }[] = [
  { value: 'srt', label: 'SRT', hint: 'Passthrough. Ideal para contribuição via internet.' },
  { value: 'udp', label: 'UDP/TS', hint: 'Passthrough. Rede local ou link dedicado.' },
  { value: 'rtp', label: 'RTP/TS', hint: 'Passthrough em rtp_mpegts.' },
  { value: 'rtmp', label: 'RTMP', hint: 'Remux para FLV. Exige origem H.264 + AAC.' },
  { value: 'omt', label: 'OMT', hint: 'Open Media Transport. Re-encoda em VMX; use só na LAN.' },
];

export function OutputForm({
  ingestId,
  system,
  onCreated,
  onCancel,
}: {
  ingestId: string;
  system: SystemInfo;
  onCreated: () => void;
  onCancel: () => void;
}): JSX.Element {
  const [name, setName] = useState('');
  const [protocol, setProtocol] = useState<OutputProtocol>('srt');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [mode, setMode] = useState<SrtMode>('caller');
  const [streamId, setStreamId] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [latencyMs, setLatencyMs] = useState('120');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const omtAvailable = system.capabilities.omtMuxer !== null;
  const isOmt = protocol === 'omt';
  const needsPort = protocol !== 'omt' && protocol !== 'rtmp';

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createOutput(ingestId, {
        name,
        protocol,
        host,
        port: needsPort ? Number(port) : port ? Number(port) : null,
        mode,
        streamId: streamId || null,
        passphrase: passphrase || null,
        latencyUs: Number(latencyMs) * 1000,
        enabled: true,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao criar a saída');
    } finally {
      setBusy(false);
    }
  };

  const selected = PROTOCOLS.find((p) => p.value === protocol);

  return (
    <form onSubmit={(e) => void submit(e)} className="card space-y-4 p-5">
      <h3 className="text-sm font-semibold text-white">Nova saída</h3>

      <div>
        <span className="label">Protocolo</span>
        <div className="flex flex-wrap gap-2">
          {PROTOCOLS.map((option) => {
            const disabled = option.value === 'omt' && !omtAvailable;
            return (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                title={disabled ? 'Este build do ffmpeg não tem suporte a OMT' : option.hint}
                onClick={() => setProtocol(option.value)}
                className={
                  protocol === option.value
                    ? 'btn bg-sky-600 text-white'
                    : 'btn border border-ink-500 text-slate-400 hover:text-white disabled:opacity-30'
                }
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {selected && <p className="mt-2 text-xs text-slate-500">{selected.hint}</p>}
        {!omtAvailable && (
          <p className="mt-1 text-xs text-amber-500/80">
            OMT indisponível neste build do ffmpeg — veja docker/Dockerfile para habilitar.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="out-name">
            Nome
          </label>
          <input
            id="out-name"
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Master control"
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="out-host">
            {isOmt ? 'Nome do sender OMT' : protocol === 'rtmp' ? 'URL RTMP completa' : 'Host de destino'}
          </label>
          <input
            id="out-host"
            className="field"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder={
              isOmt
                ? 'THITO (Programa)'
                : protocol === 'rtmp'
                  ? 'rtmp://servidor/app/chave'
                  : '200.100.50.10'
            }
            required
          />
        </div>

        {needsPort && (
          <div>
            <label className="label" htmlFor="out-port">
              Porta
            </label>
            <input
              id="out-port"
              className="field"
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="9010"
              required
            />
          </div>
        )}

        {protocol === 'srt' && (
          <>
            <div>
              <span className="label">Modo SRT</span>
              <div className="flex gap-2">
                {(['caller', 'listener'] as const).map((option) => (
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
                    {option === 'caller' ? 'Envia (caller)' : 'Espera (listener)'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label" htmlFor="out-latency">
                Latência SRT (ms)
              </label>
              <input
                id="out-latency"
                className="field"
                type="number"
                min={20}
                max={8000}
                value={latencyMs}
                onChange={(e) => setLatencyMs(e.target.value)}
              />
            </div>

            <div>
              <label className="label" htmlFor="out-streamid">
                Stream ID (opcional)
              </label>
              <input
                id="out-streamid"
                className="field"
                value={streamId}
                onChange={(e) => setStreamId(e.target.value)}
              />
            </div>

            <div>
              <label className="label" htmlFor="out-pass">
                Passphrase (opcional)
              </label>
              <input
                id="out-pass"
                className="field"
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="mínimo 10 caracteres"
              />
            </div>
          </>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Criando…' : 'Adicionar saída'}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
