// Preferências do usuário (tema, voz, sync, assistente). Guardadas no IndexedDB.

import * as db from './db.js';
import { emit } from './bus.js';

const DEFAULTS = {
  theme: 'dark',                 // 'dark' | 'light'
  name: '',                      // como o JARBAS deve te chamar
  startView: 'dashboard',
  currency: 'BRL',

  // Assistente
  speakReplies: true,            // ler as respostas em voz alta
  greetOnOpen: true,             // resumo falado ao abrir o app
  autoListen: false,             // ligar a escuta contínua ao abrir
  effort: 'high',                // low | medium | high | xhigh | max

  // Voz
  voiceURI: null,
  voiceRate: 1.05,
  voicePitch: 1,
  voiceVolume: 1,
  allowBargeIn: true,            // interromper a fala falando por cima

  // Sincronização — já apontando para o projeto criado para você.
  // A chave publishable é pública por design: quem protege os dados é a política
  // RLS do banco, que só devolve as linhas do usuário autenticado.
  supabaseUrl: 'https://kikedkajnytdjncrkoxf.supabase.co',
  supabaseKey: 'sb_publishable_XbwfA-SmyYnbIW9o9gm6hQ_XTbAX22m',
  autoSync: true,
};

let cache = { ...DEFAULTS };

export async function load() {
  const stored = await db.kvGet('settings', {});
  cache = { ...DEFAULTS, ...stored };
  applyTheme();
  return cache;
}

export const all = () => ({ ...cache });
export const get = (key) => cache[key];

export async function set(patch) {
  cache = { ...cache, ...patch };
  await db.kvSet('settings', cache);
  if ('theme' in patch) applyTheme();
  emit('settings:changed', { ...cache });
  return cache;
}

export function applyTheme() {
  document.documentElement.dataset.theme = cache.theme === 'light' ? 'light' : 'dark';
}

export const isCloudConfigured = () => !!(cache.supabaseUrl && cache.supabaseKey);

export { DEFAULTS };
