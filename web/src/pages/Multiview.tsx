import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Preview } from '../components/Preview';
import { Empty, SectionHead, StateBadge } from '../components/ui';
import { api } from '../lib/api';
import { bitrate } from '../lib/format';
import type { Ingest } from '../lib/types';
import { useLive } from '../lib/useLive';

const LAYOUTS = [
  { cols: 2, label: '2×2' },
  { cols: 3, label: '3×2' },
  { cols: 4, label: '4×3' },
] as const;

export function Multiview(): JSX.Element {
  const { statuses } = useLive();
  const [ingests, setIngests] = useState<Ingest[]>([]);
  const [cols, setCols] = useState(3);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = (): void => {
      void api
        .listIngests()
        .then(setIngests)
        .catch(() => undefined)
        .finally(() => setLoading(false));
    };
    load();
    const timer = setInterval(load, 20_000);
    return () => clearInterval(timer);
  }, []);

  const gridClass =
    cols === 2
      ? 'sm:grid-cols-2'
      : cols === 3
        ? 'sm:grid-cols-2 lg:grid-cols-3'
        : 'sm:grid-cols-2 lg:grid-cols-4';

  return (
    <div>
      <SectionHead
        eyebrow="Monitor multiview"
        title="Todo o tráfego SRT"
        action={
          <div className="flex gap-2">
            {LAYOUTS.map((layout) => (
              <button
                key={layout.label}
                className={cols === layout.cols ? 'btn-primary' : 'btn-ghost'}
                onClick={() => setCols(layout.cols)}
              >
                {layout.label}
              </button>
            ))}
          </div>
        }
      />

      {loading ? (
        <Empty>Carregando…</Empty>
      ) : ingests.length === 0 ? (
        <Empty>Nenhuma recepção para exibir.</Empty>
      ) : (
        <div className={`grid gap-3 ${gridClass}`}>
          {ingests.map((ingest) => {
            const status = statuses[ingest.id] ?? ingest.status;
            const state = status?.state ?? 'stopped';
            return (
              <Link
                key={ingest.id}
                to={`/app/recepcao/${ingest.id}`}
                className={`overflow-hidden rounded-xl border bg-ink-800 transition-colors ${
                  state === 'running'
                    ? 'border-signal-live/55'
                    : state === 'error' || state === 'retrying'
                      ? 'border-signal-fault/55'
                      : 'border-ink-600'
                }`}
              >
                {ingest.previewEnabled && state === 'running' ? (
                  <Preview ingestId={ingest.id} enabled />
                ) : (
                  <div className="grid aspect-video place-items-center bg-ink-950 font-display text-xs uppercase tracking-[.2em] text-faint">
                    {state === 'running' ? 'Preview desligado' : 'Sem sinal'}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
                  <span className="truncate text-sm">{ingest.name}</span>
                  <StateBadge state={state} compact />
                </div>
                <div className="flex justify-between px-3 pb-2.5 pt-1 font-mono text-[11px] text-faint">
                  <span>
                    {ingest.mode === 'listener' ? `:${ingest.port}` : 'caller'}
                  </span>
                  <span className="text-sky">{bitrate(status?.bitrateKbps)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
