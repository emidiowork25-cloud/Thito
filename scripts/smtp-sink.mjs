#!/usr/bin/env node
/**
 * Throwaway SMTP server that accepts anything and writes each message to disk.
 *
 * Exists so the signup flow can be tested against a real SMTP conversation
 * rather than a mocked transport — the parts that break in practice are the
 * handshake and the encoding, and a mock exercises neither.
 *
 * Usage: node scripts/smtp-sink.mjs [port] [outDir]
 */
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const port = Number(process.argv[2] ?? 2525);
const outDir = process.argv[3] ?? './smtp-out';
mkdirSync(outDir, { recursive: true });

let received = 0;

createServer((socket) => {
  let buffer = '';
  let inData = false;
  let message = '';
  let envelope = { from: '', to: [] };

  const say = (line) => socket.write(line + '\r\n');
  say('220 sink ESMTP ready');

  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');

    for (;;) {
      const idx = buffer.indexOf('\r\n');
      if (idx < 0) break;
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      if (inData) {
        if (line === '.') {
          inData = false;
          received += 1;
          const file = join(outDir, `mail-${received}.eml`);
          writeFileSync(file, message);
          const subject = /^Subject:\s*(.+)$/m.exec(message)?.[1] ?? '(sem assunto)';
          console.log(`[sink] #${received} -> ${envelope.to.join(', ')} | ${subject.trim()}`);
          message = '';
          say('250 2.0.0 Ok: queued');
        } else {
          // Dot-stuffing: a leading '..' on the wire is a literal '.'.
          message += (line.startsWith('..') ? line.slice(1) : line) + '\n';
        }
        continue;
      }

      const upper = line.toUpperCase();
      if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
        say('250-sink greets you');
        say('250 8BITMIME');
      } else if (upper.startsWith('MAIL FROM')) {
        envelope = { from: line.slice(10), to: [] };
        say('250 2.1.0 Ok');
      } else if (upper.startsWith('RCPT TO')) {
        envelope.to.push(line.replace(/^RCPT TO:\s*/i, '').replace(/[<>]/g, ''));
        say('250 2.1.5 Ok');
      } else if (upper === 'DATA') {
        inData = true;
        say('354 End data with <CR><LF>.<CR><LF>');
      } else if (upper === 'QUIT') {
        say('221 2.0.0 Bye');
        socket.end();
      } else if (upper === 'RSET') {
        say('250 2.0.0 Ok');
      } else {
        say('250 2.0.0 Ok');
      }
    }
  });

  socket.on('error', () => socket.destroy());
}).listen(port, '127.0.0.1', () => {
  console.log(`[sink] listening on 127.0.0.1:${port}, writing to ${outDir}`);
});
