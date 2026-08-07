import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Alert, Field, Input } from '../components/ui';
import { api } from '../lib/api';
import { digitsOnly, maskPhone } from '../lib/format';
import { errorMessage, useSession } from '../lib/session';

export function Signup(): JSX.Element {
  const { siteName } = useSession();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Show the login name the account will get. Nobody should be surprised by
  // their own username after the fact.
  useEffect(() => {
    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      setPreview(null);
      return;
    }
    const timer = setTimeout(() => {
      void api
        .usernamePreview(firstName.trim(), lastName.trim())
        .then((r) => setPreview(r.username))
        .catch(() => setPreview(null));
    }, 350);
    return () => clearTimeout(timer);
  }, [firstName, lastName]);

  const digits = digitsOnly(phone);
  const passwordPreview = digits.length >= 4 ? digits.slice(-4) : null;

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.signup({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        jobTitle: jobTitle.trim(),
        phone: digits,
        email: email.trim(),
      });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="grid min-h-full place-items-center px-4 py-12">
        <div className="w-full max-w-md text-center">
          <Link to="/" className="mb-8 flex justify-center">
            <Logo size="lg" siteName={siteName} />
          </Link>
          <div className="card p-8">
            <h1 className="text-2xl">Solicitação enviada</h1>
            <p className="mt-3 text-sm leading-relaxed text-mist">
              Enviamos um e-mail para <strong className="text-paper">{email}</strong>{' '}
              confirmando o pedido. Assim que um administrador aprovar, você recebe outro
              e-mail com o link de acesso e suas credenciais.
            </p>
            <p className="mt-4 text-xs text-faint">Não é preciso fazer mais nada agora.</p>
            <Link to="/" className="btn-ghost mt-6">
              Voltar ao início
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Link to="/" className="mb-8 flex justify-center">
        <Logo size="lg" siteName={siteName} />
      </Link>

      <div className="mb-6 text-center">
        <span className="font-display text-sm font-bold uppercase tracking-[.18em] text-sky">
          Solicitação de acesso
        </span>
        <h1 className="mt-2 text-3xl">Criar conta</h1>
        <p className="mx-auto mt-3 max-w-[50ch] text-sm text-mist">
          Preencha seus dados. Um administrador vai analisar o pedido e você recebe o
          acesso por e-mail.
        </p>
      </div>

      <form onSubmit={(e) => void submit(e)} className="card flex flex-col gap-4 p-6">
        {error && <Alert>{error}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome">
            <Input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="José"
              autoComplete="given-name"
              required
            />
          </Field>
          <Field label="Sobrenome">
            <Input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="da Silva Santos"
              autoComplete="family-name"
              required
            />
          </Field>
        </div>

        <Field label="Função">
          <Input
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="Operador de Corte"
            autoComplete="organization-title"
            required
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Celular com DDD">
            <Input
              value={phone}
              onChange={(e) => setPhone(maskPhone(e.target.value))}
              placeholder="(11) 98765-4321"
              inputMode="tel"
              autoComplete="tel"
              required
            />
          </Field>
          <Field label="E-mail">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@empresa.com.br"
              autoComplete="email"
              required
            />
          </Field>
        </div>

        <div className="rounded-lg border border-dashed border-ink-500 bg-ink-900 p-4">
          <span className="label">Suas credenciais iniciais</span>
          <div className="flex items-center justify-between py-0.5">
            <span className="text-sm text-mist">Usuário</span>
            <code className="font-mono text-sm text-sky">{preview ?? '—'}</code>
          </div>
          <div className="flex items-center justify-between py-0.5">
            <span className="text-sm text-mist">Senha</span>
            <code className="font-mono text-sm text-sky">
              {passwordPreview ? '••••' : '—'}
            </code>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-faint">
            O usuário vem do seu nome. A senha inicial são os 4 últimos dígitos do celular
            e <strong className="text-mist">terá de ser trocada no primeiro acesso</strong>.
          </p>
        </div>

        <button type="submit" className="btn-primary w-full justify-center" disabled={busy}>
          {busy ? 'Enviando…' : 'Solicitar acesso'}
        </button>

        <p className="text-center text-xs text-faint">
          Ao enviar, você recebe um e-mail confirmando que o pedido está em análise.
        </p>
      </form>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          ['1', 'Você envia', 'E-mail de confirmação chega na hora.'],
          ['2', 'Administrador analisa', 'Define permissões e quais sinais você vê.'],
          ['3', 'Acesso liberado', 'Segundo e-mail com link, usuário e senha.'],
        ].map(([n, title, body], i) => (
          <div
            key={n}
            className={`flex gap-3 border-l-2 py-1 pl-3 ${i === 0 ? 'border-sky' : 'border-ink-600'}`}
          >
            <span
              className={`grid h-5 w-5 shrink-0 place-items-center rounded-full font-display text-xs font-bold ${
                i === 0 ? 'bg-sky text-ink-950' : 'bg-ink-600 text-mist'
              }`}
            >
              {n}
            </span>
            <span>
              <strong className="block text-sm">{title}</strong>
              <span className="text-xs text-faint">{body}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
