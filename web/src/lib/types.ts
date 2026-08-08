export type SrtMode = 'listener' | 'caller';
export type OutputProtocol = 'srt' | 'udp' | 'rtp' | 'rtmp' | 'omt';

export type RunState =
  | 'stopped'
  | 'starting'
  | 'connecting'
  | 'running'
  | 'retrying'
  | 'error';

export type Permission =
  | 'ingest.create'
  | 'ingest.configure'
  | 'ingest.monitor'
  | 'output.manage'
  | 'output.omt'
  | 'ingest.viewAll';

/** Labels shown wherever permissions are granted or explained. */
export const PERMISSION_LABELS: Record<Permission, string> = {
  'ingest.create': 'Criar uma nova recepção',
  'ingest.configure': 'Configurar uma recepção',
  'ingest.monitor': 'Monitorar uma recepção',
  'output.manage': 'Retransmitir com novos parâmetros',
  'output.omt': 'Transmitir por OMT',
  'ingest.viewAll': 'Ver todo o tráfego (multiview)',
};

export const PERMISSION_ORDER: Permission[] = [
  'ingest.create',
  'ingest.configure',
  'ingest.monitor',
  'output.manage',
  'output.omt',
  'ingest.viewAll',
];

export interface Me {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'operator';
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  permissions: Permission[];
}

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

/**
 * Sender-facing credentials, split the way encoders ask for them. The key is
 * the SRT passphrase — the only field that actually authenticates, since
 * ffmpeg's listener ignores streamid.
 */
export interface ConnectDetails {
  host: string;
  port: number;
  streamId: string | null;
  /** Masked for viewers who may not issue credentials. */
  streamKey: string | null;
  hasKey: boolean;
  latencyMs: number;
  /** Safe to show on a shared screen — carries no secret. */
  serverUrl: string;
  /** Everything in one string; null when the viewer may not read the key. */
  fullUrl: string | null;
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
  connect: ConnectDetails | null;
}

export interface Capabilities {
  ffmpegPath: string;
  ffmpegVersion: string | null;
  srt: boolean;
  omtMuxer: string | null;
  omtDemuxer: string | null;
  rtmp: boolean;
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

export interface User extends Me {
  enabled: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  ingestIds: string[];
}

export interface SignupRequest {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  phone: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectNote: string | null;
  createdUserId: string | null;
  createdAt: string;
}

export interface MailStatus {
  configured: boolean;
  from: string | null;
  error: string | null;
}

export interface MailMessage {
  id: string;
  to: string;
  subject: string;
  kind: string;
  status: 'queued' | 'sent' | 'failed';
  error: string | null;
  attempts: number;
  createdAt: string;
  sentAt: string | null;
}

export interface Preset {
  id: string;
  name: string;
  protocol: OutputProtocol;
  host: string;
  port: number | null;
  mode: SrtMode;
  passphrase: string | null;
  hasPassphrase?: boolean;
  streamId: string | null;
  latencyUs: number;
  locked: boolean;
  createdAt: string;
}

export interface PlatformSettings {
  siteName: string;
  publicHost: string | null;
  defaultLatencyMs: number;
  requirePassphrase: boolean;
}

export type Bucket = 'hour' | 'day' | 'week' | 'month';

export interface TrafficPoint {
  ts: number;
  label: string;
  bytesIn: number;
  bytesOut: number;
}

export interface TrafficSummary {
  bucket: Bucket;
  points: TrafficPoint[];
  totalIn: number;
  totalOut: number;
  avgBpsIn: number;
  avgBpsOut: number;
  peakBpsIn: number;
  perIngest: { ingestId: string; name: string; bytesIn: number; bytesOut: number }[];
}
