/** Shared domain types. Kept dependency-free so the web app can import them. */

/** How the hub establishes the SRT connection for an ingest. */
export type SrtMode = 'listener' | 'caller';

/** Transport used by an output leg. */
export type OutputProtocol = 'srt' | 'udp' | 'rtp' | 'rtmp' | 'omt';

export type RunState =
  | 'stopped'
  | 'starting'
  | 'connecting'
  | 'running'
  | 'retrying'
  | 'error';

export interface Ingest {
  id: string;
  name: string;
  /** listener: senders push to us. caller: we pull from a remote listener. */
  mode: SrtMode;
  /** Port we listen on (listener) or connect to (caller). */
  port: number;
  /** Remote host, caller mode only. */
  host: string | null;
  /** SRT streamid, used by senders to select this ingest on a shared port. */
  streamId: string | null;
  passphrase: string | null;
  /** SRT receiver buffer in microseconds. 120000 (120 ms) is a sane default. */
  latencyUs: number;
  /**
   * What the encoder is configured to send, when the operator told us. Lets a
   * shortfall be measured against intent rather than against past behaviour.
   */
  nominalKbps: number | null;
  /** Generate a browser-playable HLS preview. Costs a transcode. */
  previewEnabled: boolean;
  /** Auto-start with the server and auto-restart on failure. */
  enabled: boolean;
  createdAt: string;
}

export interface Output {
  id: string;
  ingestId: string;
  name: string;
  protocol: OutputProtocol;
  /** Destination host, or OMT sender name when protocol is 'omt'. */
  host: string;
  /** Destination port. Ignored for 'omt'. */
  port: number | null;
  /** SRT-only. */
  mode: SrtMode;
  streamId: string | null;
  passphrase: string | null;
  latencyUs: number;
  enabled: boolean;
  createdAt: string;
}

/** Live counters for one running process, refreshed roughly once per second. */
export interface Telemetry {
  state: RunState;
  /** Current bitrate in kbit/s as reported by ffmpeg. */
  bitrateKbps: number | null;
  fps: number | null;
  /** Frames ffmpeg reported as dropped since start. */
  droppedFrames: number | null;
  /** Media timestamp reached, in seconds. */
  positionSec: number | null;
  /** Wall-clock seconds since the current process attempt started. */
  uptimeSec: number | null;
  restarts: number;
  lastError: string | null;
  updatedAt: number;
}

export interface Diagnostic {
  code: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  advice: string;
}

export interface IngestStatus extends Telemetry {
  ingestId: string;
  /** Ready-to-paste URL for whoever is sending to this ingest. */
  connectUrl: string | null;
  /** Problems worth telling the operator about, worst first. */
  diagnostics: Diagnostic[];
  outputs: Record<string, Telemetry>;
}

/** What the detected ffmpeg build can actually do. */
export interface Capabilities {
  ffmpegPath: string;
  ffmpegVersion: string | null;
  srt: boolean;
  /** Muxer name for OMT output, or null when this build has no OMT support. */
  omtMuxer: string | null;
  omtDemuxer: string | null;
  rtmp: boolean;
}
