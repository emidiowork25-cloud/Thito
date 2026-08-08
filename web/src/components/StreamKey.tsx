import { useState } from 'react';
import type { ConnectDetails } from '../lib/types';
import { Alert } from './ui';

function CopyRow({
  label,
  value,
  mono = true,
  secret = false,
  hint,
}: {
  label: string;
  value: string;
  mono?: boolean;
  secret?: boolean;
  hint?: string;
}): JSX.Element {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [failed, setFailed] = useState(false);

  const shown = secret && !revealed ? '•'.repeat(Math.min(28, value.length)) : value;

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setFailed(false);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // The clipboard API needs a secure context; over plain HTTP on a LAN it
      // is simply absent. Reveal the value so it can be selected by hand.
      setRevealed(true);
      setFailed(true);
    }
  };

  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex gap-2">
        <code
          className={`min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-ink-500 bg-ink-900 px-3 py-2.5 text-xs text-sky ${
            mono ? 'font-mono' : ''
          }`}
        >
          {shown}
        </code>
        {secret && (
          <button
            type="button"
            className="btn-ghost shrink-0"
            onClick={() => setRevealed((v) => !v)}
          >
            {revealed ? 'Ocultar' : 'Revelar'}
          </button>
        )}
        <button type="button" className="btn-ghost shrink-0" onClick={() => void copy()}>
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      {hint && !failed && <span className="mt-1 block text-xs text-faint">{hint}</span>}
      {failed && (
        <span className="mt-1 block text-xs text-signal-warn">
          O navegador bloqueou a cópia — selecione o texto e copie manualmente.
        </span>
      )}
    </div>
  );
}

/**
 * Sender-facing credentials, laid out the way a broadcast operator already
 * expects: a server address they can show on any screen, and a key they cannot.
 *
 * The key is the SRT passphrase. That is not a naming shortcut — ffmpeg's SRT
 * listener does not validate streamid, so the passphrase is the only field that
 * actually turns away a sender who does not have it.
 */
export function StreamKeyPanel({
  connect,
  canConfigure,
  onRotate,
  onClear,
  busy = false,
}: {
  connect: ConnectDetails;
  canConfigure: boolean;
  onRotate: () => void;
  onClear: () => void;
  busy?: boolean;
}): JSX.Element {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {!connect.hasKey && (
        <Alert tone="warn">
          Esta recepção está <strong>sem chave</strong>. Qualquer pessoa que descubra a
          porta {connect.port} consegue enviar sinal para ela.
          {canConfigure && ' Gere uma chave para fechar a porta.'}
        </Alert>
      )}

      <CopyRow
        label="Endereço do servidor"
        value={connect.serverUrl}
        hint="Pode ser exibido em tela compartilhada — não contém a chave."
      />

      {connect.streamKey && (
        <CopyRow
          label="Chave de transmissão"
          value={connect.streamKey}
          secret
          hint="No encoder, este valor vai no campo de passphrase ou senha do SRT."
        />
      )}

      {connect.fullUrl && (
        <CopyRow
          label="URL completa"
          value={connect.fullUrl}
          secret
          hint="Para encoders que aceitam tudo num campo só. Contém a chave — não exiba em tela compartilhada."
        />
      )}

      {canConfigure && (
        <div className="border-t border-ink-600 pt-4">
          {confirming ? (
            <div className="flex flex-col gap-3">
              <Alert tone="warn">
                Gerar uma chave nova <strong>derruba quem estiver transmitindo agora</strong> e
                invalida a chave antiga imediatamente. Quem envia precisará da nova.
              </Alert>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn-primary"
                  disabled={busy}
                  onClick={() => {
                    setConfirming(false);
                    onRotate();
                  }}
                >
                  {busy ? 'Gerando…' : 'Gerar nova chave'}
                </button>
                <button className="btn-ghost" onClick={() => setConfirming(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-ghost" disabled={busy} onClick={() => setConfirming(true)}>
                {connect.hasKey ? 'Gerar nova chave' : 'Gerar chave'}
              </button>
              {connect.hasKey && (
                <button
                  className="btn-danger"
                  disabled={busy}
                  onClick={() => {
                    if (
                      !confirm(
                        'Remover a chave deixa a porta aberta para qualquer um que a descubra. Continuar?',
                      )
                    ) {
                      return;
                    }
                    onClear();
                  }}
                >
                  Remover proteção
                </button>
              )}
              <span className="text-xs text-faint">
                A chave é reutilizável — só troque se ela vazar ou ao encerrar um contrato.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
