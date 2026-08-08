// Monta o retrato dos seus dados que vai junto de cada pergunta ao JARBAS.
// Compacto de propósito: o que cabe em poucos milhares de tokens e responde
// 95% das perguntas do dia a dia. O resto o JARBAS busca com ferramentas.

import * as store from '../core/store.js';
import * as settings from '../core/settings.js';
import {
  today, addDays, monthKey, money, fmtDate, fmtTime, relDay, truncate, sum,
} from '../core/util.js';

const MAX_LINES = 12;

function section(title, lines) {
  if (!lines?.length) return '';
  const shown = lines.slice(0, MAX_LINES);
  const extra = lines.length > shown.length ? `\n  … e mais ${lines.length - shown.length}` : '';
  return `\n## ${title}\n${shown.map((l) => `- ${l}`).join('\n')}${extra}\n`;
}

export function build() {
  const nowDt = new Date();
  const t = today();
  const parts = [];

  /* --- cabeçalho --- */
  const name = settings.get('name');
  parts.push(
    `# Contexto de ${name || 'do usuário'} — gerado em ${nowDt.toLocaleString('pt-BR')}`,
    `Hoje é ${fmtDate(t, { weekday: true, year: true })}.`,
  );

  /* --- agenda --- */
  const hoje = store.eventsOn(t);
  parts.push(section('Agenda de hoje', hoje.map((e) =>
    `${e.time ? fmtTime(e.time) : 'sem hora'} — ${e.title}${e.category ? ` [${e.category}]` : ''}${e.notes ? ` (${truncate(e.notes, 80)})` : ''}`)));

  const proximos = store.eventsBetween(addDays(t, 1), addDays(t, 7));
  parts.push(section('Próximos 7 dias', proximos.map((e) =>
    `${fmtDate(e.occurrence, { weekday: true })} ${e.time ? fmtTime(e.time) : ''} — ${e.title}`)));

  /* --- tarefas --- */
  const abertas = store.openTasks();
  const atrasadas = abertas.filter((x) => x.due && x.due < t);
  parts.push(section('Tarefas abertas', abertas.map((x) =>
    `${x.title}${x.due ? ` — prazo ${fmtDate(x.due)} (${relDay(x.due)})` : ''}${x.priority === 'alta' ? ' [ALTA]' : ''}${x.due && x.due < t ? ' ⚠ ATRASADA' : ''}`)));

  /* --- financeiro --- */
  const mk = monthKey(t);
  const resumo = store.monthSummary(mk);
  const saldo = store.totalBalance();
  const finLinhas = [
    `Saldo somado das contas: ${money(saldo)}`,
    `Mês ${mk}: entradas ${money(resumo.income)}, saídas ${money(resumo.expense)}, resultado ${money(resumo.net)} (${resumo.count} lançamentos)`,
  ];
  const topCats = Object.entries(resumo.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (topCats.length) finLinhas.push(`Maiores gastos do mês: ${topCats.map(([c, v]) => `${c} ${money(v)}`).join(', ')}`);
  for (const b of store.budgetStatus(mk)) {
    finLinhas.push(`Orçamento ${b.category}: ${money(b.spent)} de ${money(b.limit)} (${Math.round(b.pct * 100)}%)`);
  }
  for (const a of store.list('accounts')) {
    finLinhas.push(`Conta "${a.name}": ${money(store.accountBalance(a.id))}`);
  }
  parts.push(section('Financeiro', finLinhas));

  const ultimas = store.monthTransactions(mk).slice(0, 8);
  parts.push(section('Últimos lançamentos', ultimas.map((x) =>
    `${fmtDate(x.date)} ${x.type === 'out' ? '−' : '+'}${money(x.amount)} ${x.desc} [${x.category || 'outro'}]`)));

  /* --- compras --- */
  const listas = store.activeLists().map((l) => {
    const tot = store.listTotal(l.id);
    return `${l.name}: ${tot.pending} pendente(s) de ${tot.count}, estimativa ${money(tot.estimate)}`;
  });
  parts.push(section('Listas de compras', listas));

  const pendentes = store.activeLists().flatMap((l) =>
    store.listItems(l.id).filter((i) => !i.done).map((i) => `${l.name}: ${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}${i.price ? ` (~${money(i.price)})` : ''}`));
  parts.push(section('Itens a comprar', pendentes));

  /* --- reuniões --- */
  parts.push(section('Reuniões recentes', store.recentMeetings(6).map((m) =>
    `${fmtDate(m.date)} — ${m.title}${m.participants?.length ? ` com ${(Array.isArray(m.participants) ? m.participants : [m.participants]).join(', ')}` : ''}${m.decisions ? ` | decisões: ${truncate(m.decisions, 90)}` : ''}`)));

  parts.push(section('Encaminhamentos abertos (de reuniões)', store.openActionItems().map((a) =>
    `${a.text}${a.owner ? ` — responsável ${a.owner}` : ''}${a.due ? ` — prazo ${fmtDate(a.due)}` : ''} (reunião: ${a.meetingTitle})`)));

  /* --- estudos e apresentações --- */
  parts.push(section('Mind maps', store.list('mindmaps').map((m) =>
    `${m.title} — ${(m.nodes?.length ?? 0)} nós, atualizado em ${(m.updatedAt || '').slice(0, 10)}`)));

  parts.push(section('Apresentações', store.list('decks').map((d) =>
    `${d.title} — ${(d.slides?.length ?? 0)} slides${d.topic ? ` (tema: ${truncate(d.topic, 60)})` : ''}`)));

  /* --- memória de longo prazo --- */
  const memoria = store.list('notes', (n) => n.kind === 'memory')
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  parts.push(section('Memória (fatos que você me pediu para lembrar)', memoria.map((n) =>
    `${n.body}${n.createdAt ? ` — anotado em ${n.createdAt.slice(0, 10)}` : ''}`)));

  /* --- histórico de conversas --- */
  const conversas = store.list('chats')
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    .slice(1, 7); // pula a conversa em andamento
  parts.push(section('Assuntos de conversas anteriores', conversas.map((c) =>
    `${(c.updatedAt || '').slice(0, 10)}: ${truncate(c.title || '(sem título)', 80)}`)));

  /* --- sinais automáticos --- */
  parts.push(section('Sinais detectados agora', store.insights().map((i) => `[${i.level}] ${i.text}`)));

  return parts.filter(Boolean).join('\n').trim();
}

/** Versão curta usada na saudação falada ao abrir o app. */
export function briefing() {
  const t = today();
  const ev = store.eventsOn(t);
  const proximo = ev.find((e) => !e.time || e.time >= new Date().toTimeString().slice(0, 5));
  const tarefas = store.openTasks();
  const atrasadas = tarefas.filter((x) => x.due && x.due < t);
  const resumo = store.monthSummary();
  const compras = sum(store.activeLists(), (l) => store.listTotal(l.id).pending);

  const bits = [];
  bits.push(ev.length
    ? `Você tem ${ev.length} compromisso${ev.length > 1 ? 's' : ''} hoje${proximo ? `, o próximo é ${proximo.title}${proximo.time ? ` às ${fmtTime(proximo.time)}` : ''}` : ''}.`
    : 'Sua agenda de hoje está livre.');
  if (atrasadas.length) bits.push(`${atrasadas.length} tarefa${atrasadas.length > 1 ? 's estão atrasadas' : ' está atrasada'}.`);
  else if (tarefas.length) bits.push(`${tarefas.length} tarefa${tarefas.length > 1 ? 's' : ''} em aberto.`);
  if (resumo.net < 0) bits.push(`No mês você está negativo em ${money(Math.abs(resumo.net))}.`);
  if (compras) bits.push(`${compras} item${compras > 1 ? 'ns' : ''} nas listas de compras.`);

  return bits.join(' ');
}

/** Saudação conforme a hora do dia. */
export function greeting() {
  const h = new Date().getHours();
  const nome = settings.get('name');
  const parte = h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  return nome ? `${parte}, ${nome}.` : `${parte}.`;
}
