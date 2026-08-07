import { useEffect, useState } from 'react';
import { Alert, Card, Field, Input, SectionHead, StateBadge, Toggle } from '../components/ui';
import { api } from '../lib/api';
import { dateTime } from '../lib/format';
import { errorMessage } from '../lib/session';
import type { MailMessage, MailStatus, PlatformSettings, SystemInfo } from '../lib/types';

export function Settings(): JSX.Element {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [mail, setMail] = useState<{ messages: MailMessage[]; status: MailStatus } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.settings().then(setSettings).catch((err) => setError(errorMessage(err)));
    void api.system().then(setSystem).catch(() => undefined);
    void api.mail().then(setMail).catch(() => undefined);
  }, []);

  const save = async (): Promise<void> => {
    if (!settings) return;
    setBusy(true);
    setError(null);
    try {
      setSettings(
        await api.updateSettings({
          siteName: settings.siteName,
          publicHost: settings.publicHost?.trim() || null,
          defaultLatencyMs: settings.defaultLatencyMs,
          requirePassphrase: settings.requirePassphrase,
        }),
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SectionHead eyebrow="Administração" title="Configurações" />

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <Card>
            <h3 className="mb-4 text-xl">Identidade e rede</h3>

            {error && (
              <div className="mb-4">
                <Alert>{error}</Alert>
              </div>
            )}
            {saved && (
              <div className="mb-4">
                <Alert tone="ok">Configurações salvas.</Alert>
              </div>
            )}

            {settings && (
              <div className="flex flex-col gap-4">
                <Field
                  label="Nome da plataforma"
                  hint="Aparece no cabeçalho, na aba do navegador e nos e-mails."
                >
                  <Input
                    value={settings.siteName}
                    onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
                  />
                </Field>

                <Field
                  label="Host público"
                  hint="O endereço que aparece nos links de envio. Atrás de NAT, defina explicitamente — a detecção automática usa o cabeçalho Host, que quase sempre mente nesse cenário."
                >
                  <Input
                    value={settings.publicHost ?? ''}
                    onChange={(e) => setSettings({ ...settings, publicHost: e.target.value })}
                    placeholder={system?.publicHost ?? 'hub.suaempresa.com'}
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Latência padrão (ms)">
                    <Input
                      type="number"
                      value={settings.defaultLatencyMs}
                      onChange={(e) =>
                        setSettings({ ...settings, defaultLatencyMs: Number(e.target.value) })
                      }
                      min={20}
                      max={8000}
                    />
                  </Field>

                  <Field label="Faixa de portas SRT" hint="Definida por variável de ambiente.">
                    <Input
                      value={
                        system ? `${system.srtPortRange[0]} – ${system.srtPortRange[1]}` : ''
                      }
                      disabled
                    />
                  </Field>
                </div>

                <Toggle
                  checked={settings.requirePassphrase}
                  onChange={(v) => setSettings({ ...settings, requirePassphrase: v })}
                  label="Exigir passphrase em toda recepção"
                  hint="Recepções novas não poderão ficar sem criptografia."
                />

                <div>
                  <button className="btn-primary" disabled={busy} onClick={() => void save()}>
                    {busy ? 'Salvando…' : 'Salvar'}
                  </button>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <h3 className="mb-1 text-xl">Motor de mídia</h3>
            <p className="mb-4 text-sm text-mist">Detectado automaticamente na inicialização.</p>

            {system && (
              <div className="flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono">{system.capabilities.ffmpegVersion?.split(' ').slice(0, 3).join(' ') ?? 'ffmpeg'}</span>
                  <span className="truncate font-mono text-xs text-faint">
                    {system.capabilities.ffmpegPath}
                  </span>
                </div>
                {(
                  [
                    ['SRT', system.capabilities.srt],
                    ['RTMP', system.capabilities.rtmp],
                    ['OMT', system.capabilities.omtMuxer !== null],
                  ] as const
                ).map(([label, available]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="font-mono">{label}</span>
                    <StateBadge state={available ? 'running' : 'error'} />
                  </div>
                ))}
              </div>
            )}

            {system && system.capabilities.omtMuxer === null && (
              <div className="mt-4">
                <Alert tone="warn">
                  OMT exige um build do ffmpeg com <code>libomt</code>. Sem ele, as saídas
                  OMT ficam desabilitadas na interface em vez de falhar na hora do ar.
                </Alert>
              </div>
            )}
          </Card>
        </div>

        <Card>
          <h3 className="mb-1 text-xl">Envio de e-mail</h3>
          <p className="mb-4 text-sm text-mist">
            Toda mensagem é gravada antes de ser enviada. Se o SMTP falhar, ela continua
            aqui e o envio é retentado a cada minuto.
          </p>

          {mail && !mail.status.configured && (
            <div className="mb-4">
              <Alert tone="warn">
                SMTP não configurado. Defina <code>SMTP_HOST</code> nas variáveis de
                ambiente. Sem isso a plataforma funciona normalmente, mas as credenciais
                precisam ser repassadas manualmente.
              </Alert>
            </div>
          )}

          {mail?.status.error && (
            <div className="mb-4">
              <Alert>Último erro de envio: {mail.status.error}</Alert>
            </div>
          )}

          {mail && mail.messages.length === 0 ? (
            <p className="text-sm text-faint">Nenhuma mensagem enviada ainda.</p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-ink-800">
                  <tr className="border-b border-ink-600 text-left">
                    <th className="th pb-2">Estado</th>
                    <th className="th pb-2">Destinatário</th>
                    <th className="th pb-2">Quando</th>
                  </tr>
                </thead>
                <tbody>
                  {mail?.messages.map((message) => (
                    <tr key={message.id} className="border-b border-ink-600 last:border-0">
                      <td className="py-2.5 pr-3">
                        <span
                          className={`font-display text-sm font-bold uppercase ${
                            message.status === 'sent'
                              ? 'text-signal-live'
                              : message.status === 'failed'
                                ? 'text-signal-fault'
                                : 'text-signal-warn'
                          }`}
                          title={message.error ?? undefined}
                        >
                          {message.status === 'sent'
                            ? 'enviado'
                            : message.status === 'failed'
                              ? 'falhou'
                              : 'na fila'}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="block truncate font-mono text-xs">{message.to}</span>
                        <span className="block truncate text-xs text-faint">
                          {message.subject}
                        </span>
                      </td>
                      <td className="py-2.5 font-mono text-xs text-faint">
                        {dateTime(message.sentAt ?? message.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
