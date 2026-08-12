// COPYWRITER — escrita para redes, roteiros, campanhas e leitura de métricas.

import * as store from '../core/store.js';
import * as jarbas from '../assistant/jarbas.js';
import * as modelo from '../core/modelo.js';
import * as redator from '../core/redator.js';
import { on, emit } from '../core/bus.js';
import {
  el, today, uid, truncate, norm, num, money, fmtDate, download, pickFile, sum,
} from '../core/util.js';
import { sectionCard, emptyState, formModal, modal, confirmDialog, toast, statTile, meter } from '../ui/components.js';

/* Limites reais de cada superfície — o contador usa isso para avisar antes de cortar. */
export const PLATAFORMAS = {
  instagram: { nome: 'Instagram', limite: 2200, ideal: 150 },
  reels: { nome: 'Reels / TikTok', limite: 2200, ideal: 120 },
  threads: { nome: 'Threads', limite: 500, ideal: 200 },
  x: { nome: 'X / Twitter', limite: 280, ideal: 200 },
  linkedin: { nome: 'LinkedIn', limite: 3000, ideal: 900 },
  facebook: { nome: 'Facebook', limite: 5000, ideal: 400 },
  youtube: { nome: 'YouTube (descrição)', limite: 5000, ideal: 700 },
  email: { nome: 'E-mail', limite: 0, ideal: 900 },
  anuncio: { nome: 'Anúncio (Meta Ads)', limite: 125, ideal: 90 },
  site: { nome: 'Site / landing', limite: 0, ideal: 600 },
};

export const TIPOS = [
  'post', 'carrossel', 'roteiro de reels', 'roteiro de vídeo',
  'anúncio', 'e-mail', 'thread', 'legenda', 'headline', 'outro',
];

const STATUS = [
  ['rascunho', 'rascunho'],
  ['revisar', 'para revisar'],
  ['aprovado', 'aprovado'],
  ['publicado', 'publicado'],
];

let aba = 'pecas';
let pecaAtiva = null;
let filtroStatus = '';

/* ============================ tela ============================ */

export function render(root, params = {}) {
  if (params.id) {
    if (store.get('copies', params.id)) { aba = 'pecas'; pecaAtiva = params.id; }
    else if (store.get('campaigns', params.id)) aba = 'campanhas';
  }

  root.append(el('div', { class: 'tabs' },
    ...[['pecas', 'Peças'], ['campanhas', 'Campanhas'], ['insights', 'Insights'], ['marca', 'Marca']]
      .map(([id, rotulo]) => el('button', {
        class: `tab ${aba === id ? 'on' : ''}`,
        onclick: () => { aba = id; emit('nav:refresh'); },
        text: rotulo,
      }))));

  if (aba === 'pecas') abaPecas(root);
  else if (aba === 'campanhas') abaCampanhas(root);
  else if (aba === 'insights') abaInsights(root);
  else abaMarca(root);
}

/* ============================ peças ============================ */

function abaPecas(root) {
  let pecas = store.list('copies').sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  if (filtroStatus) pecas = pecas.filter((p) => (p.status || 'rascunho') === filtroStatus);
  if (!pecas.some((p) => p.id === pecaAtiva)) pecaAtiva = pecas[0]?.id ?? null;

  root.append(el('div', { class: 'toolbar' },
    el('button', { class: 'btn primary sm', text: '✦ De um link para post', onclick: () => deLink() }),
    el('button', { class: 'btn sm', text: '✦ Escrever com JARBAS', onclick: escreverComJarbas }),
    el('button', { class: 'btn sm', text: '+ peça em branco', onclick: () => novaPeca() }),
    el('div', { class: 'spacer' }),
    el('select', {
      style: 'max-width:180px',
      onchange: (e) => { filtroStatus = e.target.value; emit('nav:refresh'); },
    },
    el('option', { value: '', selected: !filtroStatus }, 'todos os status'),
    ...STATUS.map(([v, t]) => el('option', { value: v, selected: filtroStatus === v }, t))),
  ));

  if (!pecas.length) {
    root.append(el('div', { class: 'card' },
      emptyState('Nenhuma peça ainda. Cole um link — notícia, vídeo, post — e ele vira carrossel, reels, card e legenda de uma vez.',
        '✦ De um link para post', () => deLink())));
    return;
  }

  root.append(el('div', { class: 'grid cw-grid' },
    listaPecas(pecas),
    pecaAtiva ? editorPeca(store.get('copies', pecaAtiva)) : el('div', { class: 'card' }, emptyState('Selecione uma peça.'))));
}

function listaPecas(pecas) {
  const body = el('div', { class: 'list-plain' });
  for (const p of pecas) {
    body.append(el('div', {
      class: `lp-row clickable ${p.id === pecaAtiva ? 'sel' : ''}`,
      onclick: () => { pecaAtiva = p.id; emit('nav:refresh'); },
    },
    el('div', { class: 'lp-main' },
      el('div', { text: truncate(p.title || '(sem título)', 34) }),
      el('div', { class: 'tiny dim', text: [p.kind, PLATAFORMAS[p.platform]?.nome].filter(Boolean).join(' · ') })),
    el('span', { class: `pill ${p.status === 'aprovado' || p.status === 'publicado' ? 'ok' : p.status === 'revisar' ? 'warn' : ''}`, text: p.status || 'rascunho' })));
  }
  return sectionCard(`Peças · ${pecas.length}`, null, body);
}

function editorPeca(p) {
  if (!p) return el('div', { class: 'card' }, emptyState('Peça não encontrada.'));
  const body = el('div');

  /* metadados */
  body.append(el('div', { class: 'row' },
    campo('Tipo', seletor(TIPOS, p.kind ?? 'post', (v) => salvar(p.id, { kind: v }))),
    campo('Plataforma', seletor(
      Object.entries(PLATAFORMAS).map(([k, v]) => [k, v.nome]),
      p.platform ?? 'instagram',
      (v) => { salvar(p.id, { platform: v }); emit('nav:refresh'); },
    )),
    campo('Status', seletor(STATUS, p.status ?? 'rascunho', (v) => { salvar(p.id, { status: v }); emit('nav:refresh'); })),
  ));

  /* briefing */
  const brief = el('textarea', {
    rows: 2, placeholder: 'Para quem é, o que precisa acontecer depois de ler, o que não pode faltar.',
    onchange: (e) => salvar(p.id, { brief: e.target.value }),
  });
  brief.value = p.brief ?? '';
  body.append(campo('Briefing', brief));

  /* corpo */
  const corpo = el('textarea', { class: 'cw-body', rows: 14, placeholder: 'O texto da peça.' });
  corpo.value = p.body ?? '';
  const contador = el('div', { class: 'cw-counter' });
  const atualizar = () => contador.replaceChildren(...medidor(corpo.value, p.platform));
  corpo.addEventListener('input', () => { atualizar(); agendarSalvar(p.id, { body: corpo.value }); });
  atualizar();
  body.append(campo('Texto', corpo));
  body.append(contador);

  /* hashtags */
  const tags = el('input', {
    type: 'text', placeholder: '#marketing #copy — separadas por espaço',
    onchange: (e) => salvar(p.id, { hashtags: e.target.value }),
  });
  tags.value = p.hashtags ?? '';
  body.append(campo('Hashtags', tags));

  /* variações */
  if ((p.variants ?? []).length) {
    body.append(el('div', { class: 'tiny dim', style: 'margin:16px 0 8px;text-transform:uppercase;letter-spacing:.1em', text: `Variações (${p.variants.length})` }));
    for (const [i, v] of p.variants.entries()) {
      body.append(el('div', { class: 'cw-variant' },
        el('div', { class: 'cw-variant-head' },
          el('span', { class: 'tiny dim', text: `Versão ${String.fromCharCode(66 + i)}` }),
          el('div', { style: 'display:flex;gap:6px' },
            el('button', {
              class: 'btn sm', text: 'Usar esta',
              onclick: async () => {
                const antiga = corpo.value;
                const variants = p.variants.map((x, k) => (k === i ? antiga : x));
                await store.save('copies', { id: p.id, body: v, variants });
                toast('Versão promovida — a anterior virou variação.', 'ok');
                emit('nav:refresh');
              },
            }),
            el('button', {
              class: 'icon-btn sm', text: '✕',
              onclick: async () => {
                await store.save('copies', { id: p.id, variants: p.variants.filter((_, k) => k !== i) });
                emit('nav:refresh');
              },
            }))),
        el('div', { class: 'cw-variant-body', text: v })));
    }
  }

  const acoes = [
    el('button', { class: 'btn sm', text: 'Renomear', onclick: () => renomearPeca(p) }),
    el('button', { class: 'btn sm', text: 'Copiar', onclick: () => copiarTexto(corpo.value, p.hashtags) }),
    el('button', { class: 'btn sm danger', text: 'Excluir', onclick: () => excluirPeca(p) }),
  ];

  /* botões do assistente */
  const ia = el('div', { class: 'cw-ai' },
    el('button', { class: 'btn sm', text: '✦ Gerar variações', onclick: () => pedir(p, 'variacoes') }),
    el('button', { class: 'btn sm', text: '✦ Encurtar', onclick: () => pedir(p, 'encurtar') }),
    el('button', { class: 'btn sm', text: '✦ Mais forte', onclick: () => pedir(p, 'forte') }),
    el('button', { class: 'btn sm', text: '✦ Virar roteiro', onclick: () => pedir(p, 'roteiro') }),
    el('button', { class: 'btn sm', text: '✦ Revisar', onclick: () => pedir(p, 'revisar') }),
    el('button', { class: 'btn sm', text: '📅 Agendar publicação', onclick: () => agendar(p) }),
  );
  body.append(ia);

  return sectionCard(p.title || '(sem título)', acoes, body);
}

/** Contador com a régua da plataforma escolhida. */
function medidor(texto, plataforma) {
  const cfg = PLATAFORMAS[plataforma] ?? PLATAFORMAS.instagram;
  const chars = texto.length;
  const palavras = texto.split(/\s+/).filter(Boolean).length;
  const leitura = Math.max(1, Math.round(palavras / 2.5)); // ~150 palavras/min falado

  const partes = [
    el('span', { class: 'mono tiny', text: `${num(chars)} caracteres` }),
    el('span', { class: 'mono tiny dim', text: `${num(palavras)} palavras` }),
    el('span', { class: 'mono tiny dim', text: `~${leitura}s de leitura em voz alta` }),
  ];

  if (cfg.limite) {
    const pct = chars / cfg.limite;
    partes.push(el('span', {
      class: `pill ${pct > 1 ? 'bad' : pct > 0.9 ? 'warn' : 'ok'}`,
      text: `${num(chars)}/${num(cfg.limite)} no ${cfg.nome}`,
    }));
  }
  if (cfg.ideal && chars > cfg.ideal * 2) {
    partes.push(el('span', { class: 'pill warn', text: `bem acima do ideal (~${num(cfg.ideal)})` }));
  }
  return partes;
}

/* ============================ campanhas ============================ */

function abaCampanhas(root) {
  const campanhas = store.list('campaigns').sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  root.append(el('div', { class: 'toolbar' },
    el('button', { class: 'btn primary sm', text: '+ Campanha', onclick: () => editarCampanha() }),
    el('button', { class: 'btn sm', text: '✦ Planejar com JARBAS', onclick: planejarCampanha }),
  ));

  if (!campanhas.length) {
    root.append(el('div', { class: 'card' },
      emptyState('Nenhuma campanha. Uma campanha agrupa peças em torno de um objetivo e um período.',
        '+ Campanha', () => editarCampanha())));
    return;
  }

  const grade = el('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fill,minmax(320px,1fr))' });
  for (const c of campanhas) {
    const pecas = store.list('copies', (p) => p.campaignId === c.id);
    const prontas = pecas.filter((p) => p.status === 'aprovado' || p.status === 'publicado').length;

    grade.append(el('div', { class: 'card' },
      el('div', { class: 'card-head' },
        el('h3', { text: c.name }),
        el('button', { class: 'btn sm', text: 'Editar', onclick: () => editarCampanha(c) })),
      c.goal ? el('p', { class: 'tiny muted', style: 'margin:0 0 10px', text: c.goal }) : null,
      el('div', { class: 'tiny dim', text: [c.from && c.to ? `${fmtDate(c.from)} → ${fmtDate(c.to)}` : '', c.budget ? `verba ${money(c.budget)}` : ''].filter(Boolean).join(' · ') }),
      el('div', { style: 'margin:12px 0 4px;display:flex;justify-content:space-between' },
        el('span', { class: 'tiny', text: `${prontas} de ${pecas.length} peça(s) prontas` })),
      meter(pecas.length ? prontas / pecas.length : 0, 'ok'),
      el('div', { style: 'display:flex;gap:6px;margin-top:12px;flex-wrap:wrap' },
        el('button', { class: 'btn sm', text: '+ peça nesta campanha', onclick: () => novaPeca({ campaignId: c.id }) }),
        el('button', {
          class: 'btn sm', text: '✦ Sugerir pauta',
          onclick: () => jarbas.askFrom(
            `Olhe a campanha "${c.name}" (objetivo: ${c.goal || 'não informado'}). `
            + 'Sugira 5 peças que ainda faltam para ela funcionar, dizendo o formato, o ângulo e por que cada uma importa. '
            + 'Me mostre a lista antes de criar qualquer coisa.',
          ),
        }))));
  }
  root.append(grade);
}

async function editarCampanha(c = {}) {
  const novo = !c.id;
  const v = await formModal({
    title: novo ? 'Nova campanha' : 'Editar campanha',
    values: {
      nome: c.name ?? '', objetivo: c.goal ?? '', de: c.from ?? today(),
      ate: c.to ?? '', verba: c.budget ?? '', notas: c.notes ?? '',
    },
    fields: [
      { name: 'nome', label: 'Nome', required: true, placeholder: 'Lançamento do curso — turma de março' },
      { name: 'objetivo', label: 'Objetivo', placeholder: 'O que precisa acontecer: vendas, inscrições, alcance…' },
      { name: 'de', label: 'Início', type: 'date', inline: true },
      { name: 'ate', label: 'Fim', type: 'date', inline: true },
      { name: 'verba', label: 'Verba (R$)', type: 'number', step: '0.01', inline: true },
      { name: 'notas', label: 'Notas', type: 'textarea', rows: 3 },
    ],
    extraButtons: novo ? null : (close) => [
      el('button', {
        class: 'btn danger', text: 'Excluir',
        onclick: async () => {
          close();
          if (await confirmDialog(`Excluir a campanha "${c.name}"? As peças continuam, só ficam sem campanha.`, { danger: true, okLabel: 'Excluir' })) {
            await store.remove('campaigns', c.id);
            emit('nav:refresh');
          }
        },
      }),
    ],
  });
  if (!v?.nome?.trim()) return;
  await store.save('campaigns', {
    id: c.id, name: v.nome.trim(), goal: v.objetivo, from: v.de, to: v.ate,
    budget: Number(v.verba) || 0, notes: v.notas,
  });
  emit('nav:refresh');
}

/* ============================ insights ============================ */

function abaInsights(root) {
  const conjuntos = store.list('metrics').sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  root.append(el('div', { class: 'toolbar' },
    el('button', { class: 'btn primary sm', text: '+ Colar dados do Meta Business', onclick: () => colarMetricas() }),
    el('button', { class: 'btn sm', text: 'Importar CSV', onclick: () => importarCsv() }),
    el('div', { class: 'spacer' }),
    conjuntos.length ? el('button', { class: 'btn sm', text: '✦ Analisar tudo', onclick: analisarTudo }) : null,
  ));

  if (!conjuntos.length) {
    root.append(el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h2', { text: 'Como trazer seus números' })),
      el('ol', { class: 'muted', style: 'line-height:1.9;padding-left:20px' },
        el('li', { text: 'No Meta Business Suite, abra Insights e escolha o período.' }),
        el('li', { text: 'Clique em Exportar dados (ou selecione a tabela e copie).' }),
        el('li', { text: 'Volte aqui e use "Colar dados" ou "Importar CSV".' })),
      el('p', { class: 'tiny dim' }, 'Funciona com qualquer tabela separada por vírgula, ponto e vírgula ou tabulação — '
        + 'não só do Meta. Google Analytics, YouTube Studio e planilhas suas também servem.')));
    return;
  }

  for (const c of conjuntos) root.append(cartaoMetricas(c));
}

function cartaoMetricas(conjunto) {
  const { colunas, linhas } = conjunto;
  const numericas = colunas.filter((col) => linhas.some((l) => typeof l[col] === 'number'));

  // Casas decimais por coluna, não por célula: se um valor da coluna tem centavos,
  // a coluna inteira mostra centavos — senão "1.250,90" e "410" ficam lado a lado.
  const casas = {};
  for (const col of numericas) {
    const valores = linhas.map((l) => l[col]).filter((v) => typeof v === 'number');
    casas[col] = valores.some((v) => !Number.isInteger(v)) ? 2 : 0;
  }

  const totais = el('div', { class: 'grid dash-stats', style: 'margin-bottom:14px' });
  for (const col of numericas.slice(0, 5)) {
    const valores = linhas.map((l) => l[col]).filter((v) => typeof v === 'number');
    const total = sum(valores);
    const media = valores.length ? total / valores.length : 0;
    // taxas e custos fazem sentido como média; volumes, como soma
    const ehTaxa = /(taxa|ctr|cpc|cpm|cpa|custo|%|média|medio|médio)/i.test(col);
    totais.append(statTile({
      label: truncate(col, 26),
      value: ehTaxa ? num(media, 2) : num(total, casas[col]),
      sub: ehTaxa ? `média de ${valores.length} linhas` : `média ${num(media, Math.max(casas[col], 1))}`,
    }));
  }

  const tabela = el('div', { class: 'cw-table' });
  const cabecalho = el('div', { class: 'cw-tr cw-th' }, ...colunas.slice(0, 6).map((c) => el('span', { text: truncate(c, 22) })));
  tabela.append(cabecalho);
  for (const l of linhas.slice(0, 12)) {
    tabela.append(el('div', { class: 'cw-tr' },
      ...colunas.slice(0, 6).map((c) => el('span', {
        text: typeof l[c] === 'number' ? num(l[c], casas[c] ?? 0) : truncate(String(l[c] ?? ''), 28),
      }))));
  }
  if (linhas.length > 12) tabela.append(el('div', { class: 'tiny dim', style: 'padding:8px 4px', text: `… e mais ${linhas.length - 12} linhas` }));

  return sectionCard(conjunto.title, [
    el('button', {
      class: 'btn sm', text: '✦ Analisar',
      onclick: () => jarbas.askFrom(
        `Analise o conjunto de métricas "${conjunto.title}" que está no meu contexto. `
        + 'Diga o que funcionou, o que não funcionou e por quê. Aponte a peça de melhor e a de pior desempenho, '
        + 'e termine com duas ações concretas para a próxima semana. Use os números reais.',
      ),
    }),
    el('button', {
      class: 'btn sm danger', text: 'Excluir',
      onclick: async () => {
        if (!await confirmDialog(`Excluir "${conjunto.title}"?`, { danger: true, okLabel: 'Excluir' })) return;
        await store.remove('metrics', conjunto.id);
        emit('nav:refresh');
      },
    }),
  ], el('div', { class: 'tiny dim', style: 'margin-bottom:12px', text: `${linhas.length} linhas · ${colunas.length} colunas · importado em ${fmtDate(conjunto.date)}` }),
  totais, tabela);
}

async function colarMetricas() {
  const v = await formModal({
    title: 'Colar dados',
    wide: true,
    okLabel: 'Importar',
    values: { titulo: `Insights ${fmtDate(today())}`, dados: '' },
    fields: [
      { name: 'titulo', label: 'Nome do conjunto', required: true },
      {
        name: 'dados', label: 'Cole a tabela aqui', type: 'textarea', rows: 12,
        placeholder: 'Cole direto do Meta Business, de uma planilha ou de um CSV.\nA primeira linha precisa ser o cabeçalho das colunas.',
      },
    ],
  });
  if (!v?.dados?.trim()) return;
  await guardar(v.titulo, v.dados);
}

async function importarCsv() {
  const file = await pickFile('.csv,.tsv,.txt');
  if (!file) return;
  await guardar(file.name.replace(/\.[^.]+$/, ''), await file.text());
}

async function guardar(titulo, texto) {
  try {
    const { colunas, linhas } = parseTabela(texto);
    if (!colunas.length || !linhas.length) throw new Error('não encontrei colunas e linhas');
    await store.save('metrics', { title: titulo.trim(), date: today(), colunas, linhas });
    toast(`${linhas.length} linhas importadas.`, 'ok');
    emit('nav:refresh');
  } catch (err) {
    toast(`Não consegui ler: ${err.message}`, 'err', 6000);
  }
}

/**
 * Lê CSV/TSV/colado-da-planilha. Detecta o separador, respeita aspas e
 * converte números no formato brasileiro e no americano.
 */
export function parseTabela(texto) {
  const limpo = String(texto).replace(/\r\n?/g, '\n').trim();
  const primeiraLinha = limpo.split('\n')[0] ?? '';
  // o separador é o candidato que mais aparece no cabeçalho
  const separador = ['\t', ';', ','].reduce((melhor, sep) => {
    const n = primeiraLinha.split(sep).length;
    return n > melhor.n ? { sep, n } : melhor;
  }, { sep: ',', n: 0 }).sep;

  const linhasBrutas = dividirRespeitandoAspas(limpo, separador);
  const cabecalho = linhasBrutas.shift() ?? [];
  const colunas = cabecalho.map((c, i) => (c.trim() || `coluna ${i + 1}`));

  const linhas = linhasBrutas
    .filter((celulas) => celulas.some((c) => c.trim()))
    .map((celulas) => {
      const obj = {};
      colunas.forEach((col, i) => { obj[col] = converter(celulas[i]); });
      return obj;
    });

  return { colunas, linhas };
}

function dividirRespeitandoAspas(texto, sep) {
  const linhas = [];
  let atual = [];
  let campo = '';
  let dentroAspas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentroAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else dentroAspas = false;
      } else campo += c;
    } else if (c === '"') dentroAspas = true;
    else if (c === sep) { atual.push(campo); campo = ''; }
    else if (c === '\n') { atual.push(campo); linhas.push(atual); atual = []; campo = ''; }
    else campo += c;
  }
  atual.push(campo);
  if (atual.length) linhas.push(atual);
  return linhas;
}

/**
 * "1.234,56", "1,234.56", "12.480", "2,28" ou "12%" → número; o resto continua texto.
 *
 * O app é brasileiro, então a vírgula é decimal por padrão. O ponto só vira
 * separador de milhar quando o número tem a forma exata de agrupamento
 * (1 a 3 dígitos, depois grupos de exatamente 3) — assim "12.480" lê 12480,
 * mas "12.48" continua sendo doze vírgula quarenta e oito.
 */
function converter(valor) {
  const s = String(valor ?? '').trim();
  if (!s) return '';
  const limpo = s.replace(/[R$\s%]/g, '');
  if (!/^-?[\d.,]+$/.test(limpo)) return s;

  const temVirgula = limpo.includes(',');
  const temPonto = limpo.includes('.');
  let normalizado = limpo;

  if (temVirgula && temPonto) {
    // com os dois, o último a aparecer é o decimal
    normalizado = limpo.lastIndexOf(',') > limpo.lastIndexOf('.')
      ? limpo.replace(/\./g, '').replace(',', '.')
      : limpo.replace(/,/g, '');
  } else if (temVirgula) {
    normalizado = limpo.replace(',', '.');
  } else if (temPonto && /^-?\d{1,3}(\.\d{3})+$/.test(limpo)) {
    normalizado = limpo.replace(/\./g, '');
  }

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : s;
}

function analisarTudo() {
  jarbas.askFrom(
    'Olhe todos os conjuntos de métricas no meu contexto e compare os períodos. '
    + 'O que melhorou, o que piorou, e qual padrão se repete entre os melhores resultados? '
    + 'Termine com o que eu deveria fazer diferente na próxima leva de conteúdo.',
  );
}

/* ============================ marca ============================ */

function abaMarca(root) {
  const marcas = store.list('brands');

  root.append(el('div', { class: 'toolbar' },
    el('button', { class: 'btn primary sm', text: '+ Voz de marca', onclick: () => editarMarca() }),
  ));

  root.append(el('div', { class: 'card' },
    el('p', { class: 'tiny dim', style: 'margin-top:0' },
      'A voz de marca entra no contexto do JARBAS toda vez que ele escreve. '
      + 'Quanto mais específica, menos genérico sai o texto — e menos você precisa reescrever.')));

  if (!marcas.length) {
    root.append(el('div', { class: 'card' },
      emptyState('Nenhuma voz cadastrada. Descreva como você fala e o JARBAS para de escrever igual a todo mundo.',
        '+ Voz de marca', () => editarMarca())));
    return;
  }

  const grade = el('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fill,minmax(320px,1fr))' });
  for (const m of marcas) {
    grade.append(el('div', { class: 'card' },
      el('div', { class: 'card-head' },
        el('h3', { text: m.name }),
        el('div', { style: 'display:flex;gap:6px' },
          m.padrao ? el('span', { class: 'pill cy', text: 'padrão' }) : null,
          el('button', { class: 'btn sm', text: 'Editar', onclick: () => editarMarca(m) }))),
      linhaMarca('Tom', m.voice),
      linhaMarca('Público', m.audience),
      linhaMarca('Evitar', m.avoid),
      linhaMarca('Exemplo', m.example)));
  }
  root.append(grade);
}

function linhaMarca(rotulo, valor) {
  if (!valor) return null;
  return el('div', { style: 'margin-bottom:9px' },
    el('div', { class: 'tiny dim', style: 'text-transform:uppercase;letter-spacing:.1em', text: rotulo }),
    el('div', { class: 'tiny', text: truncate(valor, 180) }));
}

async function editarMarca(m = {}) {
  const novo = !m.id;
  const v = await formModal({
    title: novo ? 'Nova voz de marca' : 'Editar voz',
    wide: true,
    values: {
      nome: m.name ?? '', tom: m.voice ?? '', publico: m.audience ?? '',
      evitar: m.avoid ?? '', exemplo: m.example ?? '', padrao: !!m.padrao,
    },
    fields: [
      { name: 'nome', label: 'Nome', required: true, placeholder: 'Minha marca pessoal, Empresa X…' },
      {
        name: 'tom', label: 'Tom de voz', type: 'textarea', rows: 3,
        placeholder: 'Direto e sem enrolação. Usa "você". Faz analogias do dia a dia. Zero jargão corporativo.',
      },
      {
        name: 'publico', label: 'Para quem você fala', type: 'textarea', rows: 2,
        placeholder: 'Quem é, o que já sabe, o que essa pessoa teme ou quer.',
      },
      {
        name: 'evitar', label: 'O que nunca usar', type: 'textarea', rows: 2,
        placeholder: 'Emojis em excesso, "revolucionário", promessa de resultado, exclamações.',
      },
      {
        name: 'exemplo', label: 'Um texto seu que representa bem a voz', type: 'textarea', rows: 5,
        placeholder: 'Cole aqui algo que você escreveu e gostou. É o que mais melhora o resultado.',
      },
      { name: 'padrao', label: 'Usar como voz padrão', type: 'checkbox' },
    ],
    extraButtons: novo ? null : (close) => [
      el('button', {
        class: 'btn danger', text: 'Excluir',
        onclick: async () => { close(); await store.remove('brands', m.id); emit('nav:refresh'); },
      }),
    ],
  });
  if (!v?.nome?.trim()) return;

  // só uma voz pode ser a padrão
  if (v.padrao) {
    for (const outra of store.list('brands', (b) => b.padrao && b.id !== m.id)) {
      await store.save('brands', { id: outra.id, padrao: false }, { silent: true });
    }
  }
  await store.save('brands', {
    id: m.id, name: v.nome.trim(), voice: v.tom, audience: v.publico,
    avoid: v.evitar, example: v.exemplo, padrao: v.padrao,
  });
  emit('nav:refresh');
}

/* ============================ auxiliares de formulário ============================ */

function campo(rotulo, controle, dica) {
  const node = el('div', { class: 'field' }, el('label', { text: rotulo }), controle);
  if (dica) node.append(el('div', { class: 'hint', text: dica }));
  return node;
}

function seletor(opcoes, valor, onChange) {
  return el('select', { onchange: (e) => onChange(e.target.value) },
    ...opcoes.map((o) => {
      const [v, t] = Array.isArray(o) ? o : [o, o];
      return el('option', { value: v, selected: String(v) === String(valor) }, t);
    }));
}

/* ============================ operações ============================ */

const salvar = (id, patch) => store.save('copies', { id, ...patch });

let salvarTimer = null;
function agendarSalvar(id, patch) {
  clearTimeout(salvarTimer);
  salvarTimer = setTimeout(() => salvar(id, patch), 700);
}

async function novaPeca(base = {}) {
  const v = await formModal({
    title: 'Nova peça',
    values: { titulo: '', tipo: 'post', plataforma: 'instagram' },
    fields: [
      { name: 'titulo', label: 'Título interno', required: true, placeholder: 'Post sobre bastidores do lançamento' },
      { name: 'tipo', label: 'Tipo', type: 'select', options: TIPOS, inline: true },
      {
        name: 'plataforma', label: 'Plataforma', type: 'select', inline: true,
        options: Object.entries(PLATAFORMAS).map(([k, x]) => [k, x.nome]),
      },
    ],
  });
  if (!v?.titulo?.trim()) return;
  const peca = await store.save('copies', {
    ...base,
    title: v.titulo.trim(), kind: v.tipo, platform: v.plataforma,
    body: '', brief: '', hashtags: '', status: 'rascunho', variants: [],
  });
  pecaAtiva = peca.id;
  aba = 'pecas';
  emit('nav:refresh');
}

async function renomearPeca(p) {
  const v = await formModal({
    title: 'Renomear peça',
    values: { titulo: p.title },
    fields: [{ name: 'titulo', label: 'Título interno', required: true }],
  });
  if (!v?.titulo?.trim()) return;
  await salvar(p.id, { title: v.titulo.trim() });
  emit('nav:refresh');
}

async function excluirPeca(p) {
  if (!await confirmDialog(`Excluir "${p.title}"?`, { danger: true, okLabel: 'Excluir' })) return;
  await store.remove('copies', p.id);
  pecaAtiva = null;
  emit('nav:refresh');
}

async function copiarTexto(corpo, hashtags) {
  const texto = [corpo, hashtags].filter(Boolean).join('\n\n');
  try { await navigator.clipboard.writeText(texto); toast('Texto copiado.', 'ok'); }
  catch { toast('O navegador bloqueou a cópia. Selecione o texto e use Ctrl+C.', 'err'); }
}

async function agendar(p) {
  const v = await formModal({
    title: 'Agendar publicação',
    values: { data: today(), hora: '09:00' },
    fields: [
      { name: 'data', label: 'Data', type: 'date', inline: true },
      { name: 'hora', label: 'Hora', type: 'time', inline: true },
    ],
  });
  if (!v?.data) return;
  await store.save('events', {
    title: `Publicar: ${p.title}`,
    date: v.data,
    time: v.hora,
    category: 'trabalho',
    notes: `${PLATAFORMAS[p.platform]?.nome ?? ''} · ${p.kind ?? ''}`.trim(),
  });
  await salvar(p.id, { scheduledFor: v.data });
  toast('Publicação marcada na agenda.', 'ok');
  emit('nav:refresh');
}

/* ============================ JARBAS ============================ */

const PEDIDOS = {
  variacoes: 'Gere 3 variações desta peça com ângulos diferentes entre si — não é para reescrever com sinônimos, é para mudar a abordagem. Use a ferramenta criar_copy com o mesmo título e as variações preenchidas.',
  encurtar: 'Corte esta peça pela metade sem perder o argumento central. Devolva só o texto novo.',
  forte: 'Reescreva com uma abertura que segure a atenção nos primeiros 5 segundos e um fechamento que peça uma ação clara. Mantenha a minha voz.',
  roteiro: 'Transforme esta peça num roteiro falado de até 60 segundos: marcações de cena entre colchetes e as falas em linhas curtas.',
  revisar: 'Revise esta peça: aponte o que está vago, o que soa genérico, promessas que eu não posso cumprir e erros de português. Liste os problemas antes de sugerir a correção.',
};

function pedir(p, tipo) {
  const cfg = PLATAFORMAS[p.platform] ?? PLATAFORMAS.instagram;
  jarbas.askFrom(
    `Peça: "${p.title}" (${p.kind}, para ${cfg.nome}${cfg.limite ? `, limite de ${cfg.limite} caracteres` : ''}).\n`
    + `Briefing: ${p.brief || 'não informado'}\n\n`
    + `Texto atual:\n${p.body || '(vazio)'}\n\n`
    + PEDIDOS[tipo],
  );
}

function escreverComJarbas() {
  jarbas.askFrom(
    'Quero escrever uma peça nova. Pergunte o assunto, a plataforma e o que precisa acontecer depois que a pessoa ler. '
    + 'Considere a minha voz de marca que está no contexto. Depois use a ferramenta criar_copy.',
  );
}

function planejarCampanha() {
  jarbas.askFrom(
    'Quero planejar uma campanha. Pergunte o objetivo, o período e o público. '
    + 'Depois use a ferramenta criar_campanha e proponha as peças que ela precisa — '
    + 'me mostre a lista antes de criar as peças uma a uma.',
  );
}

on('action:new-copy', () => { aba = 'pecas'; novaPeca(); });
on('action:new-campaign', () => { aba = 'campanhas'; editarCampanha(); });

/* ============================ de um link para post ============================ */

/**
 * O formulário do pedido.
 *
 * O campo de texto colado não é acessório: Instagram exige login e quase nunca
 * abre para um leitor automático. Deixá-lo escondido faria a pessoa tentar o
 * link três vezes antes de descobrir o caminho que funciona.
 */
async function deLink() {
  const marcas = store.list('brands');
  const escolhidos = new Set(['carrossel', 'reels', 'estatico', 'legenda']);

  const url = el('input', { type: 'url', placeholder: 'https://…  (notícia, YouTube, post)' });
  const colado = el('textarea', { rows: 4, placeholder: 'Opcional — e obrigatório quando o link não abre. Cole aqui a matéria, a legenda ou a transcrição.' });
  const objetivo = el('select', {}, ...Object.entries(redator.OBJETIVOS).map(([k, v]) => el('option', { value: k }, v)));
  const publico = el('input', { type: 'text', placeholder: 'quem vai ler — ex.: pais de crianças autistas, alunos da Universidade' });
  const extra = el('input', { type: 'text', placeholder: 'algo específico? ex.: puxar para a inscrição do seminário' });
  const marca = el('select', {},
    el('option', { value: '' }, 'sem voz de marca'),
    ...marcas.map((m) => el('option', { value: m.id, selected: !!m.padrao }, m.name)));

  const caixas = el('div', { class: 'cw-formatos' });
  for (const [chave, f] of Object.entries(redator.FORMATOS)) {
    const c = el('input', { type: 'checkbox' });
    c.checked = escolhidos.has(chave);
    c.addEventListener('change', () => (c.checked ? escolhidos.add(chave) : escolhidos.delete(chave)));
    caixas.append(el('label', { class: 'cw-formato' }, c, el('span', { text: f.rotulo })));
  }

  const corpo = el('div', {},
    el('div', { class: 'field' }, el('label', { text: 'Link' }), url),
    el('div', { class: 'field' }, el('label', { text: 'Ou o texto, colado' }), colado,
      el('div', { class: 'hint', text: 'Post do Instagram quase sempre exige login e não abre sozinho. Nesse caso, cole a legenda aqui — sem material de verdade, nada é escrito.' })),
    el('div', { class: 'field' }, el('label', { text: 'Formatos' }), caixas),
    el('div', { class: 'row' },
      el('div', { class: 'field' }, el('label', { text: 'Objetivo' }), objetivo),
      el('div', { class: 'field' }, el('label', { text: 'Voz de marca' }), marca)),
    el('div', { class: 'field' }, el('label', { text: 'Público' }), publico),
    el('div', { class: 'field' }, el('label', { text: 'Instrução extra' }), extra));

  const pedido = await new Promise((resolve) => {
    let respondido = false;
    const fim = (v) => { if (!respondido) { respondido = true; resolve(v); } };
    modal({
      title: 'De um link para post',
      wide: true,
      onClose: () => fim(null),
      render: () => corpo,
      footer: (close) => [
        el('button', { class: 'btn', text: 'Cancelar', onclick: () => { fim(null); close(); } }),
        el('button', {
          class: 'btn primary', text: 'Escrever',
          onclick: () => {
            if (!url.value.trim() && !colado.value.trim()) { toast('Cole um link ou o texto — um dos dois.', 'err'); return; }
            if (!escolhidos.size) { toast('Escolha ao menos um formato.', 'err'); return; }
            fim({
              url: url.value.trim(),
              colado: colado.value.trim(),
              formatos: [...escolhidos],
              objetivo: objetivo.value,
              publico: publico.value.trim(),
              extra: extra.value.trim(),
              marcaId: marca.value,
            });
            close();
          },
        }),
      ],
    });
  });
  if (!pedido) return;

  const m = store.get('brands', pedido.marcaId);
  const vozDaMarca = m
    ? [`Nome: ${m.name}`, m.voice && `Tom: ${m.voice}`, m.audience && `Público: ${m.audience}`,
      m.avoid && `Evitar: ${m.avoid}`, m.examples && `Exemplos do jeito certo:\n${m.examples}`]
      .filter(Boolean).join('\n')
    : '';

  const estado = el('div', { class: 'tiny dim' },
    el('div', { text: pedido.url ? 'Abrindo o link e lendo o conteúdo…' : 'Lendo o material…' }),
    el('div', { style: 'margin-top:6px', text: `${pedido.formatos.length} formato(s) de uma vez. Demora um pouco.` }));
  const espera = modal({ title: 'Escrevendo', render: () => el('div', {}, estado) });

  let saida;
  try {
    saida = await redator.gerar({ ...pedido, marca: vozDaMarca });
  } catch (err) {
    estado.className = 'aviso';
    estado.textContent = modelo.explicarFalha(err);
    return;
  }

  if (saida.texto) {
    estado.className = 'aviso';
    estado.textContent = saida.texto;
    return;
  }

  // O modelo diz que não conseguiu ler — e não devolveu nada de útil. Isto é
  // resposta, não falha: melhor voltar de mãos vazias do que publicar um post
  // afirmando coisas sobre uma matéria que ninguém leu.
  const variacoes = (saida.dados.variacoes ?? []).filter((v) => v?.corpo || v?.cards?.length);
  if (!saida.dados.fonte_lida && !pedido.colado) {
    estado.className = 'aviso';
    estado.replaceChildren(
      el('div', { style: 'margin-bottom:6px', text: 'Não consegui ler esse link — provavelmente exige login (é o caso do Instagram) ou bloqueia leitura automática.' }),
      el('div', { text: 'Abra a página, copie o texto e cole no campo "Ou o texto, colado". Aí eu escrevo.' }));
    return;
  }
  if (!variacoes.length) {
    estado.className = 'aviso';
    estado.textContent = 'Li a fonte, mas não consegui montar nenhuma variação a partir dela.';
    return;
  }

  espera.close();
  await escolherVariacoes(saida.dados, variacoes, pedido);
}

/** A vitrine: cada formato num cartão, com o texto inteiro à vista. */
async function escolherVariacoes(dados, variacoes, pedido) {
  const marcados = variacoes.map(() => true);
  const corpo = el('div');

  const cabecalho = el('div', { class: 'cw-fonte' });
  if (dados.fonte_titulo) cabecalho.append(el('div', { class: 'cw-fonte-tit', text: dados.fonte_titulo }));
  if (dados.fonte_resumo) cabecalho.append(el('div', { class: 'tiny dim', text: dados.fonte_resumo }));
  if (dados.angulo) cabecalho.append(el('div', { class: 'cw-angulo', text: `Ângulo: ${dados.angulo}` }));
  if (dados.palavras_chave?.length) {
    cabecalho.append(el('div', { class: 'cw-chaves' },
      ...dados.palavras_chave.map((k) => el('span', { class: 'pill', text: k }))));
  }
  if (!dados.fonte_lida) {
    cabecalho.append(el('div', { class: 'aviso', style: 'margin-top:10px' },
      'O link não abriu — isto foi escrito a partir do texto que você colou.'));
  }
  corpo.append(cabecalho);

  const lista = el('div', { class: 'cw-variacoes' });
  variacoes.forEach((v, i) => {
    const f = redator.FORMATOS[v.formato] ?? { rotulo: v.formato, tipo: 'post' };
    const caixa = el('input', { type: 'checkbox' });
    caixa.checked = true;
    caixa.addEventListener('change', () => { marcados[i] = caixa.checked; });

    const texto = redator.montarCorpo(v);
    lista.append(el('div', { class: 'cw-var' },
      el('div', { class: 'cw-var-topo' },
        el('label', { class: 'cw-formato' }, caixa, el('span', { text: f.rotulo })),
        el('button', {
          class: 'btn sm', text: 'Copiar',
          onclick: async () => {
            const completo = [texto, v.hashtags].filter(Boolean).join('\n\n');
            try { await navigator.clipboard.writeText(completo); toast('Copiado.', 'ok'); }
            catch { toast('O navegador não deixou copiar.', 'err'); }
          },
        })),
      el('div', { class: 'cw-var-gancho', text: v.gancho ?? '' }),
      el('pre', { class: 'previa', text: texto }),
      v.hashtags ? el('div', { class: 'tiny dim', style: 'margin-top:6px', text: v.hashtags }) : null,
      v.visual ? el('div', { class: 'tiny dim', style: 'margin-top:4px', text: `Visual: ${v.visual}` }) : null));
  });
  corpo.append(lista);

  const confirmado = await new Promise((resolve) => {
    let respondido = false;
    const fim = (v) => { if (!respondido) { respondido = true; resolve(v); } };
    modal({
      title: `${variacoes.length} variação(ões) prontas`,
      wide: true,
      onClose: () => fim(false),
      render: () => corpo,
      footer: (close) => [
        el('button', { class: 'btn', text: 'Descartar', onclick: () => { fim(false); close(); } }),
        el('button', { class: 'btn primary', text: 'Guardar as marcadas', onclick: () => { fim(true); close(); } }),
      ],
    });
  });
  if (!confirmado) return;

  const brief = [
    dados.fonte_titulo && `Fonte: ${dados.fonte_titulo}`,
    pedido.url && pedido.url,
    dados.angulo && `Ângulo: ${dados.angulo}`,
    dados.palavras_chave?.length && `Palavras-chave: ${dados.palavras_chave.join(', ')}`,
  ].filter(Boolean).join('\n');

  let ultima = null;
  for (const [i, v] of variacoes.entries()) {
    if (!marcados[i]) continue;
    const f = redator.FORMATOS[v.formato] ?? { tipo: 'post' };
    ultima = await store.save('copies', {
      title: v.titulo_interno || `${f.rotulo ?? v.formato} — ${dados.fonte_titulo ?? 'sem título'}`,
      kind: f.tipo,
      platform: v.formato === 'youtube' ? 'youtube' : v.formato === 'thread' ? 'threads' : v.formato === 'reels' ? 'reels' : 'instagram',
      body: redator.montarCorpo(v),
      hashtags: v.hashtags ?? '',
      brief,
      status: 'rascunho',
      variants: [],
    });
  }

  if (!ultima) { toast('Nenhuma variação marcada.'); return; }
  pecaAtiva = ultima.id;
  aba = 'pecas';
  toast(`${marcados.filter(Boolean).length} peça(s) guardadas.`, 'ok');
  emit('nav:refresh');
}
