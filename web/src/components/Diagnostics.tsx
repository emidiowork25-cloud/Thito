import type { Diagnostic } from '../lib/types';

const TONE = {
  critical: {
    box: 'border-signal-fault/45 bg-signal-fault/10',
    mark: 'bg-signal-fault text-ink-950',
    title: 'text-signal-fault',
    glyph: '!',
    label: 'Crítico',
  },
  warning: {
    box: 'border-signal-warn/45 bg-signal-warn/10',
    mark: 'bg-signal-warn text-ink-950',
    title: 'text-signal-warn',
    glyph: '!',
    label: 'Atenção',
  },
  info: {
    box: 'border-sky/35 bg-sky/10',
    mark: 'bg-sky text-ink-950',
    title: 'text-sky',
    glyph: 'i',
    label: 'Informação',
  },
} as const;

/**
 * Problem balloons for whoever is watching the feed.
 *
 * Each one states what is happening with the measured numbers in it, then what
 * to do about it. A diagnosis without an action is just an alarm, and an
 * operator mid-event has no time to translate "packet loss" into "raise the
 * latency to 260 ms" on their own.
 */
export function Diagnostics({ items }: { items: Diagnostic[] }): JSX.Element | null {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-2.5" role="status" aria-live="polite">
      {items.map((item) => {
        const tone = TONE[item.severity];
        return (
          <div
            key={item.code}
            className={`flex gap-3 rounded-xl border px-4 py-3.5 ${tone.box}`}
          >
            <span
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full font-display text-xs font-bold ${tone.mark}`}
              aria-label={tone.label}
            >
              {tone.glyph}
            </span>
            <div className="min-w-0">
              <p className={`text-sm font-semibold leading-snug ${tone.title}`}>
                {item.title}
              </p>
              {item.advice && (
                <p className="mt-1.5 text-sm leading-relaxed text-mist">{item.advice}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Compact count for list and grid views, where the full text will not fit. */
export function DiagnosticsBadge({ items }: { items: Diagnostic[] }): JSX.Element | null {
  if (items.length === 0) return null;

  const critical = items.filter((d) => d.severity === 'critical').length;
  const warnings = items.filter((d) => d.severity === 'warning').length;
  if (critical === 0 && warnings === 0) return null;

  const tone = critical > 0 ? TONE.critical : TONE.warning;
  const count = critical > 0 ? critical : warnings;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-display text-xs font-bold uppercase ${tone.box} ${tone.title}`}
      title={items.map((d) => d.title).join('\n')}
    >
      <span aria-hidden>!</span>
      {count}
    </span>
  );
}
