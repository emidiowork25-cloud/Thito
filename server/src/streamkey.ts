import { randomInt } from 'node:crypto';

/**
 * Stream keys, in the sense a broadcast operator already understands from
 * YouTube or Twitch: one secret you hand to whoever is sending, reusable for as
 * long as you want it, and revocable by generating a new one.
 *
 * The key is carried as the SRT **passphrase**, not as streamid. That choice is
 * not cosmetic — it was measured. ffmpeg's SRT listener does not validate
 * streamid at all: a sender with the wrong streamid, or none, connects anyway.
 * The passphrase is the only option that actually rejects a stranger, because
 * it keys the encryption rather than merely labelling the session.
 *
 * So streamid stays what it honestly is — a human-readable label — and the key
 * is what secures the port.
 */

/**
 * Ambiguous glyphs are omitted. These get read off a screen and typed into a
 * hardware encoder's front panel, where 0/O and 1/l/I cost real minutes.
 */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const GROUPS = 5;
const GROUP_SIZE = 4;

/**
 * Generates a key shaped like `a7bc-K2mn-4Pqr-9stu-vWx3`.
 *
 * Twenty characters from a 57-symbol alphabet is about 116 bits — far past
 * anything worth brute forcing, and SRT accepts 10 to 79 characters, so the
 * dashes are free.
 */
export function generateStreamKey(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g += 1) {
    let group = '';
    for (let i = 0; i < GROUP_SIZE; i += 1) {
      group += ALPHABET[randomInt(ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join('-');
}

/** SRT rejects anything outside this range at connection time. */
export function isValidStreamKey(value: string): boolean {
  return value.length >= 10 && value.length <= 79;
}

/**
 * Masks a key for display, keeping enough to recognise which one it is without
 * putting a live credential on a screen someone may be sharing.
 */
export function maskStreamKey(value: string): string {
  if (value.length <= 8) return '•'.repeat(value.length);
  return `${value.slice(0, 4)}${'•'.repeat(Math.min(16, value.length - 8))}${value.slice(-4)}`;
}
