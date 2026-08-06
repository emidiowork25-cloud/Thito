import { useState } from 'react';

/** Read-only URL with a copy button — the thing operators actually need. */
export function CopyField({
  label,
  value,
}: {
  label: string;
  value: string;
}): JSX.Element {
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard API needs a secure context; the text stays selectable anyway.
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex gap-2">
        <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-ink-500 bg-ink-900 px-3 py-2 font-mono text-xs text-sky-300">
          {value}
        </code>
        <button type="button" className="btn-ghost shrink-0" onClick={() => void copy()}>
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  );
}
