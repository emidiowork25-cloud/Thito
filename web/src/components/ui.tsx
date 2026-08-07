import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import type { RunState } from '../lib/types';

/* ------------------------------------------------------------------ layout */

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return <div className={`card p-5 ${className}`}>{children}</div>;
}

export function SectionHead({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: ReactNode;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && (
          <span className="font-display text-sm font-bold uppercase tracking-[.18em] text-sky">
            {eyebrow}
          </span>
        )}
        <h2 className="mt-1 text-2xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }): JSX.Element {
  return (
    <p className="rounded-xl border border-dashed border-ink-500 px-4 py-10 text-center text-sm text-faint">
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ status */

const STATE_STYLE: Record<RunState, { label: string; dot: string; text: string }> = {
  running: { label: 'No ar', dot: 'bg-signal-live shadow-[0_0_8px_theme(colors.signal.live)]', text: 'text-signal-live' },
  connecting: { label: 'Conectando', dot: 'bg-signal-warn animate-pulse', text: 'text-signal-warn' },
  starting: { label: 'Iniciando', dot: 'bg-signal-warn animate-pulse', text: 'text-signal-warn' },
  retrying: { label: 'Reconectando', dot: 'bg-signal-warn animate-pulse', text: 'text-signal-warn' },
  error: { label: 'Erro', dot: 'bg-signal-fault', text: 'text-signal-fault' },
  stopped: { label: 'Parado', dot: 'bg-faint/60', text: 'text-faint' },
};

export function StateBadge({
  state,
  compact = false,
}: {
  state: RunState;
  compact?: boolean;
}): JSX.Element {
  const style = STATE_STYLE[state];
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-display text-sm font-bold uppercase tracking-wide ${style.text}`}
      title={style.label}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
      {!compact && style.label}
    </span>
  );
}

/* -------------------------------------------------------------- data cells */

export function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  tone?: 'default' | 'accent';
}): JSX.Element {
  return (
    <div>
      <div className="label mb-0.5">{label}</div>
      <div className={`readout ${tone === 'accent' ? 'text-sky' : 'text-paper'}`}>{value}</div>
    </div>
  );
}

export function StatStrip({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-ink-600 bg-ink-600 sm:grid-cols-5">
      {children}
    </div>
  );
}

export function StatCell({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  tone?: 'default' | 'accent';
}): JSX.Element {
  return (
    <div className="bg-ink-800 px-4 py-3">
      <Stat label={label} value={value} tone={tone} />
    </div>
  );
}

/* ------------------------------------------------------------------- forms */

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}): JSX.Element {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-faint">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-signal-fault">{error}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  return <input {...props} className={`field ${props.className ?? ''}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>): JSX.Element {
  return <select {...props} className={`field ${props.className ?? ''}`} />;
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  hint?: string;
  disabled?: boolean;
}): JSX.Element {
  return (
    <label
      className={`flex items-center justify-between gap-4 ${
        disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'
      }`}
    >
      <span>
        <span className="block text-sm text-paper">{label}</span>
        {hint && <span className="block text-xs text-faint">{hint}</span>}
      </span>
      <span className="relative shrink-0">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          className="block h-5 w-9 rounded-full bg-ink-500 transition-colors
                     peer-checked:bg-teal/60 peer-focus-visible:ring-2
                     peer-focus-visible:ring-sky peer-focus-visible:ring-offset-2
                     peer-focus-visible:ring-offset-ink-900"
        />
        <span
          className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full
                     bg-mist transition-transform peer-checked:translate-x-4 peer-checked:bg-sky"
        />
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------ alerts */

export function Alert({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'warn' | 'info' | 'ok';
  children: ReactNode;
}): JSX.Element {
  const tones = {
    error: 'border-signal-fault/40 bg-signal-fault/10 text-signal-fault',
    warn: 'border-signal-warn/40 bg-signal-warn/10 text-signal-warn',
    info: 'border-sky/35 bg-sky/10 text-sky',
    ok: 'border-signal-live/40 bg-signal-live/10 text-signal-live',
  } as const;
  return (
    <p className={`rounded-lg border px-3.5 py-2.5 text-sm ${tones[tone]}`} role="alert">
      {children}
    </p>
  );
}

export function ProtocolTag({ protocol }: { protocol: string }): JSX.Element {
  const tones: Record<string, string> = {
    srt: 'bg-sky/15 text-sky',
    udp: 'bg-teal/30 text-[#6FC4DC]',
    rtp: 'bg-teal/30 text-[#6FC4DC]',
    omt: 'bg-signal-live/15 text-signal-live',
    rtmp: 'bg-signal-warn/15 text-signal-warn',
  };
  return (
    <span
      className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest ${
        tones[protocol] ?? 'bg-ink-600 text-mist'
      }`}
    >
      {protocol}
    </span>
  );
}
