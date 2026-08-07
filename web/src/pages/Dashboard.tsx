import { useEffect, useState } from 'react';
import { Alert, Card, Empty, SectionHead, StatCell, StatStrip } from '../components/ui';
import { api } from '../lib/api';
import { bps, bytes } from '../lib/format';
import { errorMessage } from '../lib/session';
import type { Bucket, TrafficSummary } from '../lib/types';

const BUCKETS: { value: Bucket; label: string; window: string }[] = [
  { value: 'hour', label: 'Hora', window: 'Últimas 24 horas' },
  { value: 'day', label: 'Dia', window: 'Últimos 30 dias' },
  { value: 'week', label: 'Semana', window: 'Últimas 12 semanas' },
  { value: 'month', label: 'Mês', window: 'Últimos 12 meses' },
];

/**
 * Paired bars per bucket: input beside output.
 *
 * Both series share one scale so the visual gap between them is the fan-out
 * ratio — the whole point of the platform. Normalising them separately would
 * hide exactly the thing worth seeing.
 */
function Chart({ summary }: { summary: TrafficSummary }): JSX.Element {
  const peak = Math.max(
    1,
    ...summary.points.map((p) => Math.max(p.bytesIn, p.bytesOut)),
  );
  const every = summary.points.length > 24 ? 4 : summary.points.length > 12 ? 3 : 1;

  return (
    <div className="flex h-52 items-end gap-1 overflow-x-auto">
      {summary.points.map((point, i) => (
        <div key={point.ts} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
          <div
            className="flex h-full items-end gap-0.5"
            title={`${point.label} — entrada ${bytes(point.bytesIn)}, saída ${bytes(point.bytesOut)}`}
          >
            <span
              className="flex-1 rounded-t bg-sky"
              style={{ height: `${(point.bytesIn / peak) * 100}%` }}
            />
            <span
              className="flex-1 rounded-t bg-teal"
              style={{ height: `${(point.bytesOut / peak) * 100}%` }}
            />
          </div>
          <span className="overflow-hidden whitespace-nowrap text-center font-mono text-[10px] text-faint">
            {i % every === 0 ? point.label : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Dashboard(): JSX.Element {
  const [bucket, setBucket] = useState<Bucket>('hour');
  const [summary, setSummary] = useState<TrafficSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const load = (): void => {
      void api
        .traffic(bucket)
        .then((data) => {
          setSummary(data);
          setError(null);
        })
        .catch((err) => setError(errorMessage(err)))
        .finally(() => setLoading(false));
    };
    load();
    // Traffic is written once a minute, so polling faster would show nothing new.
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [bucket]);

  const window = BUCKETS.find((b) => b.value === bucket)?.window ?? '';
  const totalTraffic = summary ? summary.totalIn + summary.totalOut : 0;

  return (
    <div>
      <SectionHead
        eyebrow="Consumo"
        title="Banda trafegada"
        action={
          <div className="flex flex-wrap gap-2">
            {BUCKETS.map((option) => (
              <button
                key={option.value}
                className={bucket === option.value ? 'btn-primary' : 'btn-ghost'}
                onClick={() => setBucket(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {summary && (
        <>
          <div className="mb-5">
            <StatStrip>
              <StatCell label="Entrada" value={bytes(summary.totalIn)} tone="accent" />
              <StatCell label="Saída" value={bytes(summary.totalOut)} tone="accent" />
              <StatCell label="Média entrada" value={bps(summary.avgBpsIn)} />
              <StatCell label="Pico entrada" value={bps(summary.peakBpsIn)} />
              <StatCell label="Recepções" value={summary.perIngest.length} />
            </StatStrip>
          </div>

          <Card className="mb-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <span className="label mb-0">{window}</span>
              <div className="flex gap-4 text-xs">
                <span className="inline-flex items-center gap-1.5 text-mist">
                  <span className="h-2.5 w-2.5 rounded-sm bg-sky" /> Entrada
                </span>
                <span className="inline-flex items-center gap-1.5 text-mist">
                  <span className="h-2.5 w-2.5 rounded-sm bg-teal" /> Saída
                </span>
              </div>
            </div>

            {totalTraffic === 0 ? (
              <Empty>
                Nenhum tráfego registrado neste período. Os dados são gravados a cada
                minuto enquanto há sinal passando.
              </Empty>
            ) : (
              <Chart summary={summary} />
            )}
          </Card>

          <Card>
            <span className="label">Consumo por recepção</span>
            {summary.perIngest.length === 0 ? (
              <Empty>Sem dados no período.</Empty>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-600 text-left">
                      <th className="th pb-2">Recepção</th>
                      <th className="th pb-2 text-right">Entrada</th>
                      <th className="th pb-2 text-right">Saída</th>
                      <th className="th pb-2 pl-4">Participação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.perIngest.map((row) => {
                      const share = summary.totalIn ? (row.bytesIn / summary.totalIn) * 100 : 0;
                      return (
                        <tr key={row.ingestId} className="border-b border-ink-600 last:border-0">
                          <td className="py-3">{row.name}</td>
                          <td className="py-3 text-right font-mono tabular-nums">
                            {bytes(row.bytesIn)}
                          </td>
                          <td className="py-3 text-right font-mono tabular-nums">
                            {bytes(row.bytesOut)}
                          </td>
                          <td className="py-3 pl-4">
                            <span className="flex items-center gap-2">
                              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-ink-600">
                                <span
                                  className="block h-full rounded-full bg-sky"
                                  style={{ width: `${share}%` }}
                                />
                              </span>
                              <span className="font-mono text-xs tabular-nums text-faint">
                                {share.toFixed(0)}%
                              </span>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {loading && !summary && <Empty>Carregando…</Empty>}
    </div>
  );
}
