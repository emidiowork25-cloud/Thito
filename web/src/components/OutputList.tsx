import { api } from '../lib/api';
import type { IngestStatus, Output } from '../lib/types';
import { StateBadge } from './StateBadge';

function describe(output: Output): string {
  switch (output.protocol) {
    case 'omt':
      return `OMT · ${output.host}`;
    case 'rtmp':
      return output.host;
    case 'srt':
      return `srt://${output.mode === 'listener' ? '0.0.0.0' : output.host}:${output.port} (${output.mode})`;
    default:
      return `${output.protocol}://${output.host}:${output.port}`;
  }
}

export function OutputList({
  outputs,
  status,
  onChanged,
}: {
  outputs: Output[];
  status: IngestStatus | null;
  onChanged: () => void;
}): JSX.Element {
  if (outputs.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-ink-500 px-4 py-6 text-center text-sm text-slate-500">
        Nenhuma saída configurada. Adicione um destino para retransmitir este sinal.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {outputs.map((output) => {
        const telemetry = status?.outputs[output.id];
        return (
          <li
            key={output.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-ink-600 bg-ink-900/60 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-white">{output.name}</span>
                <span className="rounded bg-ink-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {output.protocol}
                </span>
              </div>
              <code className="mt-0.5 block truncate font-mono text-xs text-slate-500">
                {describe(output)}
              </code>
              {telemetry?.lastError && telemetry.state !== 'running' && (
                <p className="mt-1 truncate text-xs text-rose-400/80" title={telemetry.lastError}>
                  {telemetry.lastError}
                </p>
              )}
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-400">
              <StateBadge state={telemetry?.state ?? 'stopped'} />
              <span className="w-24 tabular-nums">
                {telemetry?.bitrateKbps != null
                  ? `${(telemetry.bitrateKbps / 1000).toFixed(2)} Mb/s`
                  : '—'}
              </span>
              {telemetry != null && telemetry.restarts > 0 && (
                <span title="Reconexões desde o início">↻ {telemetry.restarts}</span>
              )}
            </div>

            <div className="flex gap-2">
              {output.enabled ? (
                <button
                  className="btn-ghost"
                  onClick={() => void api.stopOutput(output.id).then(onChanged)}
                >
                  Parar
                </button>
              ) : (
                <button
                  className="btn-ghost"
                  onClick={() => void api.startOutput(output.id).then(onChanged)}
                >
                  Iniciar
                </button>
              )}
              <button
                className="btn-danger"
                onClick={() => {
                  if (!confirm(`Remover a saída "${output.name}"?`)) return;
                  void api.deleteOutput(output.id).then(onChanged);
                }}
              >
                Remover
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
