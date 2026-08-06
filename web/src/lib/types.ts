export type SrtMode = 'listener' | 'caller';
export type OutputProtocol = 'srt' | 'udp' | 'rtp' | 'rtmp' | 'omt';
export type RunState =
  | 'stopped'
  | 'starting'
  | 'connecting'
  | 'running'
  | 'retrying'
  | 'error';

export interface Telemetry {
  state: RunState;
  bitrateKbps: number | null;
  fps: number | null;
  droppedFrames: number | null;
  positionSec: number | null;
  uptimeSec: number | null;
  restarts: number;
  lastError: string | null;
  updatedAt: number;
}

export interface IngestStatus extends Telemetry {
  ingestId: string;
  connectUrl: string | null;
  outputs: Record<string, Telemetry>;
}

export interface Output {
  id: string;
  ingestId: string;
  name: string;
  protocol: OutputProtocol;
  host: string;
  port: number | null;
  mode: SrtMode;
  streamId: string | null;
  passphrase: string | null;
  latencyUs: number;
  enabled: boolean;
  createdAt: string;
}

export interface Ingest {
  id: string;
  name: string;
  mode: SrtMode;
  port: number;
  host: string | null;
  streamId: string | null;
  passphrase: string | null;
  latencyUs: number;
  previewEnabled: boolean;
  enabled: boolean;
  createdAt: string;
  outputs: Output[];
  status: IngestStatus | null;
}

export interface Capabilities {
  ffmpegPath: string;
  ffmpegVersion: string | null;
  srt: boolean;
  omtMuxer: string | null;
  omtDemuxer: string | null;
  rtmp: boolean;
}

export type Permission =
  | 'ingest.create'
  | 'ingest.configure'
  | 'ingest.monitor'
  | 'output.manage'
  | 'output.omt'
  | 'ingest.viewAll';

export interface Me {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'operator';
  permissions: Permission[];
}

export interface SystemInfo {
  capabilities: Capabilities;
  publicHost: string;
  srtPortRange: [number, number];
  maxOutputsPerIngest: number;
  siteName: string;
  defaultLatencyMs: number;
  requirePassphrase: boolean;
  me: Me;
}
