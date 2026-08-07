import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Card,
  Empty,
  Field,
  Input,
  ProtocolTag,
  SectionHead,
  Select,
  Toggle,
} from '../components/ui';
import { api } from '../lib/api';
import { errorMessage } from '../lib/session';
import type { OutputProtocol, Preset, SrtMode } from '../lib/types';

const BLANK = {
  name: '',
  protocol: 'srt' as OutputProtocol,
  host: '',
  port: '',
  mode: 'caller' as SrtMode,
  streamId: '',
  passphrase: '',
  latencyMs: '120',
  locked: true,
};

export function Presets(): JSX.Element {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [draft, setDraft] = useState({ ...BLANK });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setPresets(await api.presets());
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startNew = (): void => {
    setDraft({ ...BLANK });
    setEditingId(null);
    setOpen(true);
  };

  const startEdit = (preset: Preset): void => {
    setDraft({
      name: preset.name,
      protocol: preset.protocol,
      host: preset.host,
      port: preset.port ? String(preset.port) : '',
      mode: preset.mode,
      streamId: preset.streamId ?? '',
      passphrase: preset.passphrase ?? '',
      latencyMs: String(preset.latencyUs / 1000),
      locked: preset.locked,
    });
    setEditingId(preset.id);
    setOpen(true);
  };

  const needsPort = draft.protocol !== 'omt' && draft.protocol !== 'rtmp';

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: draft.name.trim(),
        protocol: draft.protocol,
        host: draft.host.trim(),
        port: needsPort && draft.port ? Number(draft.port) : null,
        mode: draft.mode,
        streamId: draft.streamId.trim() || null,
        passphrase: draft.passphrase || null,
        latencyUs: Number(draft.latencyMs) * 1000,
        locked: draft.locked,
      };
      if (editingId) await api.updatePreset(editingId, body);
      else await api.createPreset(body);
      setOpen(false);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (preset: Preset): Promise<void> => {
    if (!confirm(`Apagar o destino "${preset.name}"?`)) return;
    try {
      await api.deletePreset(preset.id);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div>
      <SectionHead
        eyebrow="Administração"
        title="Destinos pré-configurados"
        action={
          <button className="btn-primary" onClick={startNew}>
            + Novo destino
          </button>
        }
      />

      <p className="mb-5 max-w-[64ch] text-sm text-mist">
        Um destino cadastrado aqui pode ser escolhido pelo operador na hora de retransmitir,
        sem que ele veja o endereço nem a senha. É como dar acesso a um canal de saída sem
        entregar a credencial dele.
      </p>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {open && (
        <Card className="mb-5">
          <h3 className="mb-4 text-xl">{editingId ? 'Editar destino' : 'Novo destino'}</h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome">
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Canal Oficial"
                required
              />
            </Field>

            <Field label="Protocolo">
              <Select
                value={draft.protocol}
                onChange={(e) =>
                  setDraft({ ...draft, protocol: e.target.value as OutputProtocol })
                }
              >
                <option value="srt">SRT</option>
                <option value="udp">UDP</option>
                <option value="rtp">RTP</option>
                <option value="rtmp">RTMP</option>
                <option value="omt">OMT</option>
              </Select>
            </Field>

            <Field
              label={
                draft.protocol === 'omt'
                  ? 'Nome do sender OMT'
                  : draft.protocol === 'rtmp'
                    ? 'URL RTMP completa'
                    : 'Endereço'
              }
            >
              <Input
                value={draft.host}
                onChange={(e) => setDraft({ ...draft, host: e.target.value })}
                placeholder={
                  draft.protocol === 'omt'
                    ? 'SRT HUB EASY (Programa)'
                    : draft.protocol === 'rtmp'
                      ? 'rtmp://a.rtmp.youtube.com/live2/chave'
                      : '10.20.0.5'
                }
                required
              />
            </Field>

            {needsPort && (
              <Field label="Porta">
                <Input
                  type="number"
                  value={draft.port}
                  onChange={(e) => setDraft({ ...draft, port: e.target.value })}
                  min={1}
                  max={65535}
                  required
                />
              </Field>
            )}

            {draft.protocol === 'srt' && (
              <>
                <Field label="Modo">
                  <Select
                    value={draft.mode}
                    onChange={(e) => setDraft({ ...draft, mode: e.target.value as SrtMode })}
                  >
                    <option value="caller">Envia (caller)</option>
                    <option value="listener">Espera (listener)</option>
                  </Select>
                </Field>

                <Field label="Latência (ms)">
                  <Input
                    type="number"
                    value={draft.latencyMs}
                    onChange={(e) => setDraft({ ...draft, latencyMs: e.target.value })}
                    min={20}
                    max={8000}
                  />
                </Field>

                <Field label="Stream ID (opcional)">
                  <Input
                    value={draft.streamId}
                    onChange={(e) => setDraft({ ...draft, streamId: e.target.value })}
                  />
                </Field>

                <Field label="Passphrase (opcional)" hint="Mínimo de 10 caracteres.">
                  <Input
                    type="password"
                    value={draft.passphrase}
                    onChange={(e) => setDraft({ ...draft, passphrase: e.target.value })}
                    minLength={10}
                  />
                </Field>
              </>
            )}
          </div>

          <div className="mt-5">
            <Toggle
              checked={draft.locked}
              onChange={(v) => setDraft({ ...draft, locked: v })}
              label="Travado"
              hint="O operador usa o destino mas não vê nem edita seus parâmetros."
            />
          </div>

          <div className="mt-5 flex gap-2">
            <button className="btn-primary" disabled={busy} onClick={() => void save()}>
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              Cancelar
            </button>
          </div>
        </Card>
      )}

      {presets.length === 0 ? (
        <Empty>Nenhum destino cadastrado.</Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {presets.map((preset) => (
            <li key={preset.id} className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold">{preset.name}</span>
                  <ProtocolTag protocol={preset.protocol} />
                </div>
                <code className="mt-0.5 block truncate font-mono text-xs text-faint">
                  {preset.protocol === 'omt'
                    ? `${preset.host} · descoberta na LAN`
                    : `${preset.host}${preset.port ? `:${preset.port}` : ''}`}
                  {preset.hasPassphrase && ' · criptografado'}
                </code>
              </div>

              <span
                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                  preset.locked
                    ? 'border-sky/30 bg-sky/10 text-sky'
                    : 'border-ink-500 text-faint'
                }`}
              >
                {preset.locked ? 'travado' : 'livre'}
              </span>

              <div className="flex gap-2">
                <button className="btn-ghost" onClick={() => startEdit(preset)}>
                  Editar
                </button>
                <button className="btn-danger" onClick={() => void remove(preset)}>
                  Apagar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
