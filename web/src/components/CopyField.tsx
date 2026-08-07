import { useState } from 'react';

/**
 * The connect URL is the thing an operator actually needs out of this screen,
 * so it gets a dedicated affordance rather than being buried in a details list.
 */
export function CopyField({ label, value }: { label: string; value: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setFailed(false);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // The clipboard API needs a secure context. Over plain HTTP on a LAN it
      // simply is not there, so say so instead of failing silently — the text
      // stays selectable either way.
      setFailed(true);
    }
  };

  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-ink-500 bg-ink-900 px-3 py-2.5 font-mono text-xs text-sky">
          {value}
        </code>
        <button type="button" className="btn-ghost shrink-0" onClick={() => void copy()}>
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      {failed && (
        <span className="mt-1 block text-xs text-signal-warn">
          O navegador bloqueou a cópia automática — selecione o texto e copie manualmente.
        </span>
      )}
    </div>
  );
}
