import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { errorMessage, useSession } from '../lib/session';
import type { OutputProtocol, Preset, SrtMode, SystemInfo } from '../lib/types';
import { Alert, Card, Field, Input, Select } from './ui';

const PROTOCOLS: { value: OutputProtocol; label: string; hint: string }[] = [
  { value: 'srt', label: 'SRT', hint: 'Passthrough. Ideal para contribuição pela internet.' },
  { value: 'udp', label: 'UDP', hint: 'Passthrough. Rede local ou link dedicado.' },
  { value: 'rtp', label: 'RTP', hint: 'Passthrough em rtp_mpegts.' },
  { value: 'rtmp', label: 'RTMP', hint: 'Remux para FLV. Exige origem H.264 + AAC.' },
  { value: 'omt', label: 'OMT', hint: 'Re-encoda em VMX. Só funciona na rede local.' },
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
  const { can, isAdmin } = useSession();

  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetId, setPresetId] = useState('');
  const [name, setName] = useState('');
  const [protocol, setProtocol] = useState<OutputProtocol>('srt');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [mode, setMode] = useState<SrtMode>('caller');
  const [streamId, setStreamId] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [latencyMs, setLatencyMs] = useState(String(system.defaultLatencyMs));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.presets().then(setPresets).catch(() => undefined);
  }, []);

  const omtAvailable = system.capabilities.omtMuxer !== null;
  const usingPreset = presetId !== '';
  const selectedPreset = presets.find((p) => p.id === presetId) ?? null;
  const needsPort = protocol !== 'omt' && protocol !== 'rtmp';

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // With a preset the server substitutes the whole destination, so the
      // fields below are not sent at all — an operator cannot smuggle a host
      // past a vetted endpoint.
      await api.createOutput(ingestId, {
        name: name.trim(),
        presetId: presetId || null,
        protocol: usingPreset ? (selectedPreset?.protocol ?? protocol) : protocol,
        host: usingPreset ? (selectedPreset?.host ?? '') : host.trim(),
        port: usingPreset ? selectedPreset?.port ?? null : needsPort ? Number(port) : null,
        mode,
        streamId: streamId.trim() || null,
        passphrase: passphrase || null,
        latencyUs: Number(latencyMs) * 1000,
        enabled: true,
      });
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const selected = PROTOCOLS.find((p) => p.value === protocol);

  return (
    <Card>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        <h3 className="text-xl">Nova saída</h3>

        {error && <Alert>{error}</Alert>}

        <Field label="Nome">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Master Control"
            autoFocus
            required
          />
        </Field>

        {presets.length > 0 && (
          <Field
            label="Destino pré-configurado"
            hint="Escolhido pelo administrador. Você não precisa saber o endereço nem a senha."
          >
            <Select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
              <option value="">Configurar manualmente</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name} · {preset.protocol.toUpperCase()}
                  {preset.hasPassphrase ? ' · criptografado' : ''}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {!usingPreset && (
          <>
            <div>
              <span className="label">Protocolo</span>
              <div className="flex flex-wrap gap-2">
                {PROTOCOLS.map((option) => {
                  const blocked =
                    option.value === 'omt' && (!omtAvailable || !can('output.omt'));
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={blocked}
                      title={
                        blocked
                          ? !omtAvailable
                            ? 'Este build do ffmpeg não tem suporte a OMT'
                            : 'Você não tem permissão para transmitir por OMT'
                          : option.hint
                      }
                      onClick={() => setProtocol(option.value)}
                      className={protocol === option.value ? 'btn-primary' : 'btn-ghost'}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              {selected && <p className="mt-2 text-xs text-faint">{selected.hint}</p>}
              {!omtAvailable && (
                <p className="mt-1 text-xs text-signal-warn">
                  OMT indisponível neste build do ffmpeg.
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={
                  protocol === 'omt'
                    ? 'Nome do sender OMT'
                    : protocol === 'rtmp'
                      ? 'URL RTMP completa'
                      : 'Host de destino'
                }
              >
                <Input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder={
                    protocol === 'omt'
                      ? 'SRT HUB EASY (Programa)'
                      : protocol === 'rtmp'
                        ? 'rtmp://servidor/app/chave'
                        : '200.100.50.10'
                  }
                  required
                />
              </Field>

              {needsPort && (
                <Field label="Porta">
                  <Input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    placeholder="9010"
                    min={1}
                    max={65535}
                    required
                  />
                </Field>
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
                          className={mode === option ? 'btn-primary' : 'btn-ghost'}
                        >
                          {option === 'caller' ? 'Envia' : 'Espera'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Field label="Latência SRT (ms)">
                    <Input
                      type="number"
                      value={latencyMs}
                      onChange={(e) => setLatencyMs(e.target.value)}
                      min={20}
                      max={8000}
                    />
                  </Field>

                  <Field label="Stream ID (opcional)">
                    <Input value={streamId} onChange={(e) => setStreamId(e.target.value)} />
                  </Field>

                  <Field label="Passphrase (opcional)" hint="Mínimo de 10 caracteres.">
                    <Input
                      type="password"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      minLength={10}
                    />
                  </Field>
                </>
              )}
            </div>
          </>
        )}

        {usingPreset && selectedPreset && (
          <div className="rounded-lg border border-dashed border-ink-500 bg-ink-900 p-4 text-sm">
            <span className="label">Destino</span>
            <code className="block font-mono text-xs text-sky">
              {selectedPreset.protocol === 'omt'
                ? selectedPreset.host
                : isAdmin
                  ? `${selectedPreset.protocol}://${selectedPreset.host}${
                      selectedPreset.port ? `:${selectedPreset.port}` : ''
                    }`
                  : 'destino oculto'}
            </code>
          </div>
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
    </Card>
  );
}
