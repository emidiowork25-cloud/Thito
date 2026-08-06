import type { RunState } from '../lib/types';

const STYLES: Record<RunState, { label: string; dot: string; text: string }> = {
  running: { label: 'No ar', dot: 'bg-emerald-400', text: 'text-emerald-300' },
  connecting: { label: 'Conectando', dot: 'bg-amber-400 animate-pulse', text: 'text-amber-300' },
  starting: { label: 'Iniciando', dot: 'bg-amber-400 animate-pulse', text: 'text-amber-300' },
  retrying: { label: 'Reconectando', dot: 'bg-orange-400 animate-pulse', text: 'text-orange-300' },
  error: { label: 'Erro', dot: 'bg-rose-500', text: 'text-rose-300' },
  stopped: { label: 'Parado', dot: 'bg-slate-600', text: 'text-slate-400' },
};

export function StateBadge({ state }: { state: RunState }): JSX.Element {
  const style = STYLES[state];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${style.text}`}>
      <span className={`h-2 w-2 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}
