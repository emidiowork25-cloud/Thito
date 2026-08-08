#!/usr/bin/env node
/**
 * UDP relay that drops a share of the datagrams passing through it.
 *
 * Sits between an SRT sender and an SRT listener so loss happens on the real
 * transport: SRT sees genuine gaps, fires its own retransmission, and whatever
 * it fails to recover in time shows up downstream exactly as it would on a bad
 * link. Needs no privileges, unlike tc/netem.
 *
 * Usage: node scripts/lossy-udp.mjs <listen-port> <target-port> <loss-percent>
 */
import { createSocket } from 'node:dgram';

const listenPort = Number(process.argv[2]);
const targetPort = Number(process.argv[3]);
const lossPercent = Number(process.argv[4] ?? 0);

if (!listenPort || !targetPort) {
  console.error('uso: lossy-udp.mjs <porta-de-escuta> <porta-destino> <perda-%>');
  process.exit(1);
}

const front = createSocket('udp4'); // faces the sender
const back = createSocket('udp4'); // faces the hub

let senderAddress = null;
const stats = { forward: 0, back: 0, dropped: 0 };

const shouldDrop = () => Math.random() * 100 < lossPercent;

front.on('message', (msg, rinfo) => {
  // Remember where replies go: SRT needs ACK and NAK to reach the sender, and
  // dropping those too is what makes this a network rather than a filter.
  senderAddress = rinfo;
  if (shouldDrop()) {
    stats.dropped += 1;
    return;
  }
  stats.forward += 1;
  back.send(msg, targetPort, '127.0.0.1');
});

back.on('message', (msg) => {
  if (!senderAddress) return;
  if (shouldDrop()) {
    stats.dropped += 1;
    return;
  }
  stats.back += 1;
  front.send(msg, senderAddress.port, senderAddress.address);
});

front.bind(listenPort, '127.0.0.1', () => {
  back.bind(0, '127.0.0.1', () => {
    console.log(
      `perda de ${lossPercent}% entre 127.0.0.1:${listenPort} e 127.0.0.1:${targetPort}`,
    );
  });
});

const report = setInterval(() => {
  const total = stats.forward + stats.back + stats.dropped;
  if (total === 0) return;
  const pct = ((stats.dropped / total) * 100).toFixed(1);
  console.log(
    `  encaminhados ${stats.forward + stats.back}  descartados ${stats.dropped} (${pct}%)`,
  );
}, 5000);
report.unref();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    clearInterval(report);
    front.close();
    back.close();
    process.exit(0);
  });
}
