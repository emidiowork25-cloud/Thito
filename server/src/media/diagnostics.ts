/**
 * Turns the noise a media pipeline produces into things an operator can act on.
 *
 * Every rule here fires on a signal that was observed in practice, not one that
 * seemed plausible. Under real packet loss ffmpeg emits three distinct things,
 * and only the first carries a number worth acting on:
 *
 *   SRT.br: RCV-DROPPED 1 packet(s). Packet seqno %... delayed for 9.551 ms
 *   [mpegts] Packet corrupt (stream = 0, dts = 126000)
 *   [h264] error while decoding MB 10 2
 *
 * The SRT line says how late the packet was. That converts directly into the
 * latency setting that would have saved it, which is the difference between
 * "you have packet loss" and "raise latency to 260 ms".
 */

export type DiagnosticSeverity = 'critical' | 'warning' | 'info';

export interface Diagnostic {
  /** Stable key so the UI can dedupe and the operator can look it up. */
  code: string;
  severity: DiagnosticSeverity;
  /** What is happening, in one sentence, with the numbers in it. */
  title: string;
  /** What to do about it. Empty only when there is genuinely nothing to do. */
  advice: string;
}

/** How far back the counters look. Long enough to be stable, short enough to clear. */
const WINDOW_MS = 60_000;

/** Below this many late packets a minute, the link is doing its job. */
const LATE_PACKET_FLOOR = 3;

interface LateEvent {
  at: number;
  packets: number;
  delayMs: number;
}

interface CorruptEvent {
  at: number;
}

export class PipelineDiagnostics {
  private late: LateEvent[] = [];
  private corrupt: CorruptEvent[] = [];
  private decodeErrors: CorruptEvent[] = [];

  /**
   * Feeds one stderr line in. Unrecognised lines are ignored rather than
   * guessed at — a wrong diagnosis costs more than a missing one.
   */
  observe(line: string): void {
    const now = Date.now();

    // "RCV-DROPPED 3 packet(s). Packet seqno %123 delayed for 9.551 ms"
    const dropped = /RCV-DROPPED\s+(\d+)\s+packet/i.exec(line);
    if (dropped) {
      const delay = /delayed for ([\d.]+)\s*ms/i.exec(line);
      this.late.push({
        at: now,
        packets: Number.parseInt(dropped[1] ?? '1', 10),
        delayMs: delay ? Number.parseFloat(delay[1] ?? '0') : 0,
      });
      return;
    }

    if (/Packet corrupt/i.test(line)) {
      this.corrupt.push({ at: now });
      return;
    }

    if (/error while decoding|out of range intra|no frame|missing picture/i.test(line)) {
      this.decodeErrors.push({ at: now });
    }
  }

  private prune(now: number): void {
    const cutoff = now - WINDOW_MS;
    this.late = this.late.filter((e) => e.at >= cutoff);
    this.corrupt = this.corrupt.filter((e) => e.at >= cutoff);
    this.decodeErrors = this.decodeErrors.filter((e) => e.at >= cutoff);
  }

  /** Counters over the trailing window, for the analyser to reason about. */
  snapshot(): {
    latePackets: number;
    lateEvents: number;
    worstDelayMs: number;
    medianDelayMs: number;
    corruptPackets: number;
    decodeErrors: number;
  } {
    const now = Date.now();
    this.prune(now);

    const delays = this.late.map((e) => e.delayMs).sort((a, b) => a - b);
    const median = delays.length ? (delays[Math.floor(delays.length / 2)] ?? 0) : 0;

    return {
      latePackets: this.late.reduce((sum, e) => sum + e.packets, 0),
      lateEvents: this.late.length,
      // The worst case is what the latency buffer has to cover, not the average.
      worstDelayMs: delays.length ? (delays[delays.length - 1] ?? 0) : 0,
      medianDelayMs: median,
      corruptPackets: this.corrupt.length,
      decodeErrors: this.decodeErrors.length,
    };
  }

  reset(): void {
    this.late = [];
    this.corrupt = [];
    this.decodeErrors = [];
  }
}

const mbps = (kbps: number): string =>
  `${(kbps / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mb/s`;

export interface AnalysisInput {
  state: string;
  /** Wire-measured input rate right now. */
  bitrateKbps: number | null;
  /** Highest rate sustained during this session — the link's demonstrated ceiling. */
  sustainedKbps: number | null;
  /** What the operator says the encoder is set to, when they told us. */
  nominalKbps: number | null;
  /** Spread between the recent low and high readings, as a share of the mean. */
  volatility: number | null;
  latencyMs: number;
  restarts: number;
  diagnostics: PipelineDiagnostics;
  /** Names of output legs that are not currently running. */
  failingOutputs: string[];
  hasKey: boolean;
}

/**
 * Produces the balloons.
 *
 * Ordered by severity, and deliberately few: three findings an operator reads,
 * ten they dismiss.
 */
export function analyse(input: AnalysisInput): Diagnostic[] {
  const found: Diagnostic[] = [];
  const stats = input.diagnostics.snapshot();

  // ---------------------------------------------------------- packet loss
  if (stats.latePackets >= LATE_PACKET_FLOOR) {
    // A packet that arrived N ms late would have been recovered by a buffer
    // N ms deeper. Round up generously — the cost of extra latency is delay,
    // the cost of too little is a hole in the picture.
    const needed = Math.ceil((input.latencyMs + stats.worstDelayMs * 1.5 + 40) / 20) * 20;
    const worth = needed > input.latencyMs;

    found.push({
      code: 'srt.late-packets',
      severity: stats.latePackets > 60 ? 'critical' : 'warning',
      title:
        `${stats.latePackets} pacote(s) chegaram tarde demais no último minuto e foram ` +
        `descartados. O atraso máximo foi de ${stats.worstDelayMs.toFixed(0)} ms além do que ` +
        `o buffer de ${input.latencyMs} ms consegue segurar.`,
      advice: worth
        ? `Aumente a latência SRT desta recepção de ${input.latencyMs} ms para ${needed} ms — ` +
          `isso daria tempo de o SRT retransmitir o que se perdeu. O preço é ${needed - input.latencyMs} ms ` +
          `a mais de atraso no sinal.`
        : 'A latência já está alta o suficiente; a perda vem da rede, não do buffer. ' +
          'Verifique o link da origem.',
    });
  }

  // Corruption without late packets means the loss happened somewhere SRT is
  // not protecting — upstream of the encoder, or after the hub.
  if (stats.corruptPackets >= 5 && stats.latePackets < LATE_PACKET_FLOOR) {
    found.push({
      code: 'ts.corrupt',
      severity: 'warning',
      title:
        `${stats.corruptPackets} quebras no fluxo de transporte no último minuto, sem ` +
        `pacotes atrasados no SRT.`,
      advice:
        'O SRT está entregando tudo, então a falha é anterior a ele: cabo, captura ou ' +
        'o próprio encoder. Verifique a origem antes de mexer na rede.',
    });
  }

  // ------------------------------------------------------ upload shortfall
  const current = input.bitrateKbps;
  const expected = input.nominalKbps ?? input.sustainedKbps;

  if (current !== null && expected !== null && expected > 500) {
    const ratio = current / expected;
    if (ratio < 0.85 && input.state === 'running') {
      // Recommend 80% of what the link has actually been delivering. The
      // remaining fifth is the headroom SRT needs to retransmit.
      const stable = Math.max(200, Math.round((current * 0.8) / 100) * 100);
      found.push({
        code: 'link.insufficient',
        severity: ratio < 0.6 ? 'critical' : 'warning',
        title:
          `Chegando ${mbps(current)}, abaixo dos ${mbps(expected)} ${
            input.nominalKbps ? 'configurados' : 'que esta recepção já sustentou'
          }. A subida da origem não está dando conta.`,
        advice:
          `Reduza o bitrate no encoder para cerca de ${mbps(stable)}. É 80% do que o link ` +
          `vem entregando — o resto precisa ficar livre para o SRT retransmitir o que se perder.`,
      });
    }
  }

  // -------------------------------------------------------- unstable link
  if (
    input.volatility !== null &&
    input.volatility > 0.35 &&
    input.state === 'running' &&
    !found.some((d) => d.code === 'link.insufficient')
  ) {
    found.push({
      code: 'link.unstable',
      severity: 'warning',
      title:
        `O bitrate está oscilando mais de ${Math.round(input.volatility * 100)}% de um ` +
        `segundo para o outro.`,
      advice:
        'Oscilação assim costuma ser wi-fi, link compartilhado ou 4G. Cabo resolve na maioria ' +
        'dos casos; se não houver como, baixe o bitrate até a oscilação sumir.',
    });
  }

  // --------------------------------------------------------- reconnections
  if (input.restarts >= 3) {
    found.push({
      code: 'ingest.reconnecting',
      severity: input.restarts >= 10 ? 'critical' : 'warning',
      title: `A recepção reconectou ${input.restarts} vezes desde que foi iniciada.`,
      advice:
        'Queda repetida costuma ser a origem desligando, IP mudando, ou o link caindo por ' +
        'completo. Confira se o encoder está estável antes de suspeitar da plataforma.',
    });
  }

  // ------------------------------------------------------------- no signal
  if (input.state === 'connecting' && input.restarts === 0) {
    found.push({
      code: 'ingest.waiting',
      severity: 'info',
      title: 'A porta está aberta e nenhum sinal chegou ainda.',
      advice:
        'Confira se quem envia recebeu o endereço e a chave corretos, e se a porta UDP ' +
        'está liberada no firewall entre a origem e este servidor.',
    });
  }

  // ------------------------------------------------------- failing outputs
  if (input.failingOutputs.length > 0) {
    const names = input.failingOutputs.slice(0, 3).join(', ');
    const extra = input.failingOutputs.length > 3 ? ` e mais ${input.failingOutputs.length - 3}` : '';
    found.push({
      code: 'output.failing',
      severity: 'warning',
      title: `A entrega não está acontecendo em: ${names}${extra}.`,
      advice:
        'A recepção continua no ar — só estas saídas estão falhando. Verifique se o destino ' +
        'está aceitando conexão e se a porta dele está liberada.',
    });
  }

  // ------------------------------------------------------------- open port
  if (!input.hasKey) {
    found.push({
      code: 'ingest.unprotected',
      severity: 'warning',
      title: 'Esta recepção está sem chave de transmissão.',
      advice:
        'Qualquer pessoa que descubra a porta consegue enviar sinal para ela. Gere uma chave ' +
        'na seção acima para fechar a porta.',
    });
  }

  const rank: Record<DiagnosticSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return found.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
