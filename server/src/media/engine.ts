import { EventEmitter } from 'node:events';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { ingestRepo, outputRepo } from '../db.js';
import type { Ingest, IngestStatus, Output, Telemetry } from '../types.js';
import { trafficRecorder } from '../traffic.js';
import { cachedCapabilities } from './capabilities.js';
import { analyse } from './diagnostics.js';
import { BitrateMeter } from './meter.js';
import { Supervisor } from './supervisor.js';
import { busUrl, ingestConnectUrl, ingestInputUrl, outputUrl } from './uri.js';

/** Slot 0 of every bus block feeds the HLS preview. */
const PREVIEW_SLOT = 0;
/** Slot 1 is tapped by the bitrate meter, since `tee` reports no byte counts. */
const METER_SLOT = 1;

interface OutputRuntime {
  output: Output;
  slot: number;
  supervisor: Supervisor;
}

interface IngestRuntime {
  ingest: Ingest;
  /** Index into the loopback bus port space. Stable for the ingest's lifetime. */
  blockIndex: number;
  relay: Supervisor;
  preview: Supervisor | null;
  meter: BitrateMeter;
  outputs: Map<string, OutputRuntime>;
}

const IDLE_TELEMETRY: Telemetry = {
  state: 'stopped',
  bitrateKbps: null,
  fps: null,
  droppedFrames: null,
  positionSec: null,
  uptimeSec: null,
  restarts: 0,
  lastError: null,
  updatedAt: 0,
};

export class Engine extends EventEmitter {
  private runtimes = new Map<string, IngestRuntime>();
  private usedBlocks = new Set<number>();

  // ---------------------------------------------------------------- lifecycle

  private sampler: NodeJS.Timeout | null = null;

  /** Brings up every ingest marked enabled. Called once at boot. */
  bootstrap(): void {
    for (const ingest of ingestRepo.list()) {
      if (ingest.enabled) this.startIngest(ingest.id);
    }

    // Feed byte counters to the traffic recorder faster than it flushes, so a
    // pipeline that stops between flushes still contributes what it carried.
    trafficRecorder.start();
    this.sampler = setInterval(() => this.sampleTraffic(), 10_000);
    this.sampler.unref();
  }

  shutdown(): void {
    if (this.sampler) clearInterval(this.sampler);
    this.sampler = null;
    this.sampleTraffic();
    trafficRecorder.stop();
    for (const id of [...this.runtimes.keys()]) this.stopIngest(id);
  }

  private sampleTraffic(): void {
    for (const [ingestId, runtime] of this.runtimes) {
      trafficRecorder.observeIngest(ingestId, runtime.meter.totalBytes);
      for (const [outputId, entry] of runtime.outputs) {
        const written = entry.supervisor.writtenBytes;
        if (written !== null) trafficRecorder.observeOutput(ingestId, outputId, written);
      }
    }
  }

  // ------------------------------------------------------------------ ingests

  startIngest(ingestId: string): void {
    const ingest = ingestRepo.get(ingestId);
    if (!ingest) throw new Error(`Unknown ingest ${ingestId}`);

    // Restarting an already-running ingest must not leak its bus block.
    this.stopIngest(ingestId);

    const blockIndex = this.claimBlock();
    const relay = new Supervisor({
      id: `ingest:${ingestId}`,
      args: () => this.relayArgs(ingest, blockIndex),
    });

    const meter = new BitrateMeter(this.busPort(blockIndex, METER_SLOT));
    const runtime: IngestRuntime = {
      ingest,
      blockIndex,
      relay,
      preview: null,
      meter,
      outputs: new Map(),
    };
    this.runtimes.set(ingestId, runtime);
    this.wire(relay, ingestId);
    // Bind the meter before ffmpeg starts sending, or the first second is lost.
    meter.start();
    relay.start();

    if (ingest.previewEnabled) this.startPreview(runtime);

    for (const output of outputRepo.listByIngest(ingestId)) {
      if (output.enabled) this.startOutput(output);
    }
  }

  stopIngest(ingestId: string): void {
    const runtime = this.runtimes.get(ingestId);
    if (!runtime) return;
    // Bank whatever this pipeline carried before its counters go away.
    this.sampleTraffic();
    trafficRecorder.forget(ingestId);
    for (const out of runtime.outputs.values()) out.supervisor.stop();
    runtime.preview?.stop();
    runtime.relay.stop();
    runtime.meter.stop();
    this.usedBlocks.delete(runtime.blockIndex);
    this.runtimes.delete(ingestId);
    rmSync(this.previewDir(ingestId), { recursive: true, force: true });
    this.emit('change', ingestId);
  }

  /** Applies an edited ingest config by cycling the pipeline. */
  reloadIngest(ingestId: string): void {
    const ingest = ingestRepo.get(ingestId);
    const wasRunning = this.runtimes.has(ingestId);
    if (wasRunning) this.stopIngest(ingestId);
    if (ingest?.enabled) this.startIngest(ingestId);
  }

  // ------------------------------------------------------------------ outputs

  /**
   * Attaches an output to its ingest's bus. The ingest keeps running, so
   * sibling outputs are untouched — that is the whole point of the bus.
   */
  startOutput(output: Output): void {
    const runtime = this.runtimes.get(output.ingestId);
    if (!runtime) return; // ingest is stopped; output starts with it later

    this.stopOutput(output.id);

    const slot = this.claimSlot(runtime);
    if (slot === null) {
      this.emit('error', {
        outputId: output.id,
        message:
          `No free fan-out slot on this ingest (limit ${maxOutputsPerIngest()}). ` +
          `Raise THITO_BUS_SLOTS and restart the hub.`,
      });
      return;
    }

    const supervisor = new Supervisor({
      id: `output:${output.id}`,
      args: () => this.outputArgs(output, this.busPort(runtime.blockIndex, slot)),
    });
    runtime.outputs.set(output.id, { output, slot, supervisor });
    this.wire(supervisor, output.ingestId);
    supervisor.start();
  }

  stopOutput(outputId: string): void {
    for (const runtime of this.runtimes.values()) {
      const entry = runtime.outputs.get(outputId);
      if (!entry) continue;
      entry.supervisor.stop();
      runtime.outputs.delete(outputId);
      this.emit('change', runtime.ingest.id);
      return;
    }
  }

  reloadOutput(outputId: string): void {
    const output = outputRepo.get(outputId);
    this.stopOutput(outputId);
    if (output?.enabled) this.startOutput(output);
  }

  // ------------------------------------------------------------------- status

  status(ingestId: string, publicHost: string): IngestStatus | null {
    const ingest = ingestRepo.get(ingestId);
    if (!ingest) return null;
    const runtime = this.runtimes.get(ingestId);

    const outputs: Record<string, Telemetry> = {};
    for (const output of outputRepo.listByIngest(ingestId)) {
      outputs[output.id] =
        runtime?.outputs.get(output.id)?.supervisor.status ?? IDLE_TELEMETRY;
    }

    const base = runtime?.relay.status ?? IDLE_TELEMETRY;
    const meterError = runtime?.meter.error ?? null;

    // Only legs the operator asked to be running count as failing. One they
    // stopped on purpose is not a problem to report back at them.
    const failingOutputs = runtime
      ? [...runtime.outputs.values()]
          .filter((o) => o.output.enabled && o.supervisor.status.state !== 'running')
          .map((o) => o.output.name)
      : [];

    const diagnostics = runtime
      ? analyse({
          state: base.state,
          bitrateKbps: runtime.meter.bitrateKbps,
          sustainedKbps: runtime.meter.sustainedKbps,
          nominalKbps: ingest.nominalKbps,
          volatility: runtime.meter.volatility,
          latencyMs: ingest.latencyUs / 1000,
          restarts: base.restarts,
          diagnostics: runtime.relay.diagnostics,
          failingOutputs,
          hasKey: ingest.passphrase !== null,
        })
      : [];
    return {
      ...base,
      // The relay runs through `tee`, which reports no byte counts, so the
      // ingest rate comes from the wire meter rather than from ffmpeg.
      bitrateKbps: runtime?.meter.bitrateKbps ?? null,
      // A meter that could not bind means another process owns the loopback
      // bus port. Say so — a silent blank reads as "the feed is down".
      lastError: meterError
        ? `Medidor de bitrate indisponível (${meterError}). ` +
          'Outra instância pode estar usando a mesma faixa de portas — veja THITO_BUS_PORT_BASE.'
        : base.lastError,
      ingestId,
      connectUrl: ingestConnectUrl(ingest, publicHost),
      diagnostics,
      outputs,
    };
  }

  allStatuses(publicHost: string): IngestStatus[] {
    return ingestRepo
      .list()
      .map((i) => this.status(i.id, publicHost))
      .filter((s): s is IngestStatus => s !== null);
  }

  logs(ingestId: string): { relay: string[]; outputs: Record<string, string[]> } {
    const runtime = this.runtimes.get(ingestId);
    if (!runtime) return { relay: [], outputs: {} };
    const outputs: Record<string, string[]> = {};
    for (const [id, entry] of runtime.outputs) outputs[id] = entry.supervisor.recentLogs;
    return { relay: runtime.relay.recentLogs, outputs };
  }

  previewReady(ingestId: string): boolean {
    return this.runtimes.get(ingestId)?.preview?.isRunning ?? false;
  }

  previewDir(ingestId: string): string {
    return join(config.previewDir, ingestId);
  }

  // ------------------------------------------------------------------ private

  private wire(supervisor: Supervisor, ingestId: string): void {
    supervisor.on('telemetry', () => this.emit('telemetry', ingestId));
    supervisor.on('state', () => this.emit('change', ingestId));
  }

  private claimBlock(): number {
    for (let i = 0; ; i += 1) {
      if (!this.usedBlocks.has(i)) {
        this.usedBlocks.add(i);
        return i;
      }
    }
  }

  private claimSlot(runtime: IngestRuntime): number | null {
    const taken = new Set([
      PREVIEW_SLOT,
      METER_SLOT,
      ...[...runtime.outputs.values()].map((o) => o.slot),
    ]);
    for (let slot = 0; slot < config.busSlots; slot += 1) {
      if (!taken.has(slot)) return slot;
    }
    return null;
  }

  private busPort(blockIndex: number, slot: number): number {
    return config.busPortBase + blockIndex * config.busSlots + slot;
  }

  private startPreview(runtime: IngestRuntime): void {
    const dir = this.previewDir(runtime.ingest.id);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });

    const port = this.busPort(runtime.blockIndex, PREVIEW_SLOT);
    const preview = new Supervisor({
      id: `preview:${runtime.ingest.id}`,
      args: () => this.previewArgs(port, dir),
    });
    runtime.preview = preview;
    preview.start();
  }

  // --------------------------------------------------------- argument builders

  /**
   * Ingest relay: pull the SRT feed once, copy it untouched onto every bus slot.
   * `onfail=ignore` keeps a wedged slot from taking the whole relay down.
   */
  private relayArgs(ingest: Ingest, blockIndex: number): string[] {
    const legs: string[] = [];
    for (let slot = 0; slot < config.busSlots; slot += 1) {
      legs.push(`[f=mpegts:onfail=ignore]${busUrl(this.busPort(blockIndex, slot), false)}`);
    }

    return [
      '-hide_banner',
      '-nostdin',
      '-loglevel', 'warning',
      '-fflags', '+nobuffer+genpts',
      '-flags', 'low_delay',
      '-i', ingestInputUrl(ingest),
      '-map', '0',
      '-c', 'copy',
      '-f', 'tee',
      legs.join('|'),
      '-progress', 'pipe:1',
      '-stats_period', '1',
    ];
  }

  private outputArgs(output: Output, busPort: number): string[] {
    const base = [
      '-hide_banner',
      '-nostdin',
      '-loglevel', 'warning',
      '-fflags', '+nobuffer+genpts',
      '-i', busUrl(busPort, true),
    ];

    const tail = ['-progress', 'pipe:1', '-stats_period', '1'];

    switch (output.protocol) {
      case 'srt':
      case 'udp':
        return [...base, '-map', '0', '-c', 'copy', '-f', 'mpegts', outputUrl(output), ...tail];

      case 'rtp':
        // rtp_mpegts carries the whole transport stream in one RTP session,
        // which avoids needing an out-of-band SDP for multi-stream feeds.
        return [...base, '-map', '0', '-c', 'copy', '-f', 'rtp_mpegts', outputUrl(output), ...tail];

      case 'rtmp':
        // FLV cannot carry arbitrary codecs; remux only works for H.264 + AAC.
        return [
          ...base,
          '-map', '0:v:0',
          '-map', '0:a:0?',
          '-c', 'copy',
          '-f', 'flv',
          outputUrl(output),
          ...tail,
        ];

      case 'omt': {
        const muxer = cachedCapabilities()?.omtMuxer;
        if (!muxer) {
          throw new Error(
            'This ffmpeg build has no Open Media Transport muxer. ' +
              'Rebuild with OMT support (see docker/Dockerfile) to use OMT outputs.',
          );
        }
        // OMT carries VMX-coded video, so this leg genuinely re-encodes —
        // unlike every other output above, it is not a passthrough.
        return [
          ...base,
          '-map', '0:v:0',
          '-map', '0:a:0?',
          '-f', muxer,
          outputUrl(output),
          ...tail,
        ];
      }
    }
  }

  private previewArgs(busPort: number, dir: string): string[] {
    return [
      '-hide_banner',
      '-nostdin',
      '-loglevel', 'warning',
      '-fflags', '+nobuffer+genpts',
      '-i', busUrl(busPort, true),
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-vf', 'scale=-2:360',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-profile:v', 'baseline',
      '-g', '50',
      '-b:v', '900k',
      '-maxrate', '900k',
      '-bufsize', '450k',
      '-c:a', 'aac',
      '-b:a', '96k',
      '-ac', '2',
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '6',
      '-hls_flags', 'delete_segments+append_list+omit_endlist+independent_segments',
      '-hls_segment_filename', join(dir, 'seg_%05d.ts'),
      join(dir, 'index.m3u8'),
    ];
  }
}

export const engine = new Engine();

/** Slots 0 and 1 are reserved for the preview and the meter. */
export function maxOutputsPerIngest(): number {
  return Math.max(0, config.busSlots - 2);
}

/** Lowest free port in the configured SRT range. */
export function allocateListenerPort(): number {
  const used = new Set(ingestRepo.usedListenerPorts());
  for (let p = config.srtPortMin; p <= config.srtPortMax; p += 1) {
    if (!used.has(p)) return p;
  }
  throw new Error(
    `No free SRT port between ${config.srtPortMin} and ${config.srtPortMax}. ` +
      'Widen THITO_SRT_PORT_MIN/MAX or delete an unused ingest.',
  );
}
