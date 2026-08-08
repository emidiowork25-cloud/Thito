import { useState } from 'react';
import { api } from '../lib/api';
import { errorMessage } from '../lib/session';
import type { Ingest, SrtMode, SystemInfo } from '../lib/types';
import { Alert, Card, Field, Input, Toggle } from './ui';

export function IngestForm({
  system,
  onCreated,
  onCancel,
}: {
  system: SystemInfo;
  onCreated: (ingest: Ingest) => void;
  onCancel: () => void;
}): JSX.Element {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<SrtMode>('listener');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [streamId, setStreamId] = useState('');
  const [latencyMs, setLatencyMs] = useState(String(system.defaultLatencyMs));
  const [nominalMbps, setNominalMbps] = useState('');
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [portMin, portMax] = system.srtPortRange;

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.createIngest({
        name: name.trim(),
        mode,
        host: mode === 'caller' ? host.trim() : null,
        // Listener mode leaves the port to the allocator unless one was typed.
        port: port ? Number(port) : undefined,
        streamId: streamId.trim() || null,
        // The key is issued by the server. Asking an operator to invent a
        // passphrase is how ports end up unprotected.
        passphrase: null,
        latencyUs: Number(latencyMs) * 1000,
        nominalKbps: nominalMbps ? Math.round(Number(nominalMbps) * 1000) : null,
        previewEnabled,
        enabled: true,
      });
      onCreated(created);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        <h3 className="text-xl">Nova recepção SRT</h3>

        {error && <Alert>{error}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Estádio — Câmera Principal"
              autoFocus
              required
            />
          </Field>

          <div>
            <span className="label">Modo</span>
            <div className="flex gap-2">
              {(['listener', 'caller'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  className={mode === option ? 'btn-primary' : 'btn-ghost'}
                >
                  {option === 'listener' ? 'Recebe' : 'Busca'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="-mt-1 text-xs leading-relaxed text-faint">
          {mode === 'listener'
            ? `A plataforma abre uma porta e espera o encoder se conectar. Deixe a porta em branco para escolher automaticamente na faixa ${portMin}–${portMax}.`
            : 'A plataforma se conecta a um listener remoto. Informe host e porta de destino.'}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {mode === 'caller' && (
            <Field label="Host remoto">
              <Input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="200.100.50.10"
                required
              />
            </Field>
          )}

          <Field label={mode === 'listener' ? 'Porta (opcional)' : 'Porta'}>
            <Input
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder={mode === 'listener' ? 'automática' : '9001'}
              min={1}
              max={65535}
              required={mode === 'caller'}
            />
          </Field>

          <Field label="Latência SRT (ms)" hint="120 ms cobre a maioria dos links.">
            <Input
              type="number"
              value={latencyMs}
              onChange={(e) => setLatencyMs(e.target.value)}
              min={20}
              max={8000}
              required
            />
          </Field>

          <Field label="Stream ID (opcional)">
            <Input
              value={streamId}
              onChange={(e) => setStreamId(e.target.value)}
              placeholder="camera1"
            />
          </Field>

          <Field
            label="Bitrate do encoder (Mb/s, opcional)"
            hint="Informe e a plataforma avisa quando o sinal chegar abaixo disso."
          >
            <Input
              type="number"
              step="0.5"
              min={0.1}
              value={nominalMbps}
              onChange={(e) => setNominalMbps(e.target.value)}
              placeholder="6"
            />
          </Field>

        </div>

        <p className="rounded-lg border border-dashed border-ink-500 bg-ink-900 px-4 py-3 text-xs leading-relaxed text-faint">
          Uma <strong className="text-mist">chave de transmissão</strong> será gerada
          automaticamente. Ela protege a porta e você a entrega a quem for enviar o sinal —
          reutilizável, e trocável a qualquer momento.
        </p>

        <Toggle
          checked={previewEnabled}
          onChange={setPreviewEnabled}
          label="Gerar preview no navegador"
          hint="Consome CPU — é a única parte que transcodifica."
        />

        <div className="flex gap-2">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Criando…' : 'Criar recepção'}
          </button>
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </form>
    </Card>
  );
}
