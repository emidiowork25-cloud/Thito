import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { useSession } from '../lib/session';

interface Step {
  tag: string;
  title: string;
  body: string;
  shot: string;
  alt: string;
  bullets: string[];
}

const STEPS: Step[] = [
  {
    tag: 'Passo 1',
    title: 'Crie a recepção',
    body:
      'Você recebe um link SRT pronto. Entregue ao encoder, à unidade móvel ou ao ' +
      'parceiro do outro lado do país — e o sinal começa a chegar.',
    shot: '/shots/painel.png',
    alt: 'Tela de recepções com o link SRT pronto para copiar',
    bullets: ['Porta escolhida automaticamente', 'Criptografia opcional', 'Reconecta sozinho se cair'],
  },
  {
    tag: 'Passo 2',
    title: 'Monitore ao vivo',
    body:
      'Preview no próprio navegador e bitrate medido no fio, não estimado. ' +
      'Você vê o sinal e vê o número — os dois em tempo real.',
    shot: '/shots/monitor.png',
    alt: 'Monitor com preview do sinal e gráfico de bitrate',
    bullets: ['Preview sem instalar nada', 'Bitrate instantâneo', 'Histórico dos últimos 60 s'],
  },
  {
    tag: 'Passo 3',
    title: 'Retransmita para onde quiser',
    body:
      'Um sinal entra, vários saem. SRT, UDP, RTP, RTMP ou OMT — sem reencodar, ' +
      'e sem que uma saída derrube as outras.',
    shot: '/shots/saidas.png',
    alt: 'Lista de saídas ativas com o bitrate de cada destino',
    bullets: ['Vários destinos por sinal', 'Qualidade idêntica à origem', 'Saída offline não afeta o resto'],
  },
  {
    tag: 'Passo 4',
    title: 'Acompanhe o consumo',
    body:
      'Quanta banda passou pela plataforma, por hora, dia, semana ou mês — ' +
      'no total e recepção por recepção.',
    shot: '/shots/dashboard.png',
    alt: 'Dashboard de banda trafegada com gráfico por período',
    bullets: ['Por hora, dia, semana e mês', 'Consumo por recepção', 'Pico e média de tráfego'],
  },
];

function Shot({ src, alt }: { src: string; alt: string }): JSX.Element {
  return (
    <figure className="m-0 min-w-0 overflow-hidden rounded-t-xl border border-b-0 border-ink-600">
      {/*
        The shot is cropped at the fold, and a hard edge there reads as a
        broken image — so the bottom dissolves into the page instead.
      */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="block h-auto w-full [mask-image:linear-gradient(180deg,#000_72%,transparent_100%)]"
      />
    </figure>
  );
}

export function Landing(): JSX.Element {
  const { siteName } = useSession();

  return (
    <div className="mx-auto max-w-6xl px-4 pb-0 sm:px-6">
      {/* ------------------------------------------------------------ hero */}
      <section className="flex flex-col items-center py-16 text-center sm:py-24">
        <Logo size="lg" siteName={siteName} className="mb-6" />
        <h1 className="max-w-[16ch] text-5xl sm:text-6xl">
          Receba, monitore e <span className="text-sky">retransmita</span> ao vivo
        </h1>
        <p className="mt-5 max-w-[56ch] text-base leading-relaxed text-mist">
          Um ponto único para receber SRT de qualquer origem, acompanhar o sinal em tempo
          real e reenviar para quantos destinos precisar — sem reencodar.
        </p>
        <p className="mt-5 font-mono text-xs tracking-widest text-faint">
          SRT <span className="text-sky">▸</span> HUB <span className="text-sky">▸</span> SRT
          · UDP · RTP · RTMP · OMT
        </p>
      </section>

      {/* ----------------------------------------------------------- doors */}
      <section className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
        <Link
          to="/entrar"
          className="card flex flex-col gap-2 p-6 transition-colors hover:border-ink-500"
        >
          <span className="mb-1 grid h-9 w-9 place-items-center rounded-lg bg-ink-600 text-sky">
            ▸
          </span>
          <h3 className="text-xl">Entrar</h3>
          <p className="flex-1 text-sm text-mist">Já tenho usuário e senha na plataforma.</p>
          <span className="mt-1 font-display text-sm font-bold uppercase tracking-wide text-sky">
            Fazer login
          </span>
        </Link>

        <Link
          to="/criar-conta"
          className="card flex flex-col gap-2 p-6 transition-colors hover:border-ink-500"
        >
          <span className="mb-1 grid h-9 w-9 place-items-center rounded-lg bg-ink-600 text-sky">
            +
          </span>
          <h3 className="text-xl">Criar conta</h3>
          <p className="flex-1 text-sm text-mist">
            Solicite acesso. Um administrador analisa e libera por e-mail.
          </p>
          <span className="mt-1 font-display text-sm font-bold uppercase tracking-wide text-sky">
            Solicitar acesso
          </span>
        </Link>
      </section>

      {/* ----------------------------------------------------------- pitch */}
      <section className="mt-24 flex flex-col gap-16">
        <div>
          <span className="font-display text-sm font-bold uppercase tracking-[.18em] text-sky">
            Como funciona
          </span>
          <h2 className="mt-2 max-w-[18ch] text-3xl">Do encoder ao ar em quatro passos</h2>
        </div>

        {STEPS.map((step, i) => (
          <div
            key={step.tag}
            className="grid items-center gap-10 lg:grid-cols-[0.85fr_1.15fr]"
          >
            <div className={i % 2 ? 'lg:order-2' : ''}>
              <span className="font-display text-sm font-bold uppercase tracking-[.12em] text-sky">
                {step.tag}
              </span>
              <h3 className="mt-2 text-2xl">{step.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-mist">{step.body}</p>
              <ul className="mt-5 flex flex-col gap-2">
                {step.bullets.map((b) => (
                  <li key={b} className="relative pl-5 text-sm text-mist">
                    <span className="absolute left-0 top-[.55em] h-1.5 w-1.5 rounded-full bg-sky" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
            <Shot src={step.shot} alt={step.alt} />
          </div>
        ))}

        <div className="grid gap-7 border-t border-ink-600 pt-10 sm:grid-cols-3">
          <div>
            <strong className="mb-2 block font-display text-xl uppercase">Sem reencodar</strong>
            <p className="text-sm leading-relaxed text-mist">
              O sinal que sai é bit a bit o que entrou. Nada de perda de qualidade a cada
              salto, nada de latência somada.
            </p>
          </div>
          <div>
            <strong className="mb-2 block font-display text-xl uppercase">Não cai junto</strong>
            <p className="text-sm leading-relaxed text-mist">
              Cada saída roda isolada. Se um destino cair, ele reconecta sozinho enquanto o
              resto continua no ar.
            </p>
          </div>
          <div>
            <strong className="mb-2 block font-display text-xl uppercase">
              Cada um vê o seu
            </strong>
            <p className="text-sm leading-relaxed text-mist">
              O operador enxerga só os sinais que o administrador liberou — inclusive no
              preview e nos números.
            </p>
          </div>
        </div>

        <div className="pt-4 text-center">
          <h2 className="text-3xl">Comece agora</h2>
          <p className="mx-auto mt-3 max-w-[44ch] text-sm text-mist">
            Crie sua conta e um administrador libera seu acesso.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/criar-conta" className="btn-primary">
              Criar conta
            </Link>
            <Link to="/entrar" className="btn-ghost">
              Já tenho acesso
            </Link>
          </div>
        </div>
      </section>

      {/* The page dissolves rather than stopping dead at the last element. */}
      <div className="-mx-4 mt-14 h-40 bg-gradient-to-b from-transparent via-ink-950/85 to-[#041216] sm:-mx-6" />
    </div>
  );
}
