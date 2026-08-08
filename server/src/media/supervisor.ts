import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { Readable } from 'node:stream';
import { config } from '../config.js';
import type { RunState, Telemetry } from '../types.js';
import { PipelineDiagnostics } from './diagnostics.js';

const LOG_LINES = 200;

/** ffmpeg is spawned with stdin closed and both output streams piped. */
type MediaProcess = ChildProcessByStdio<null, Readable, Readable>;

export interface SupervisorOptions {
  id: string;
  args: () => string[];
  /**
   * Lines matching this are treated as "the transport is up" rather than noise.
   * ffmpeg does not announce SRT connection separately, so first media output
   * is the signal we have.
   */
  onLine?: (line: string) => void;
}

/**
 * Runs one ffmpeg process and keeps it alive.
 *
 * ffmpeg exits when an SRT peer disconnects, which for a live hub is normal
 * rather than fatal — a contribution feed drops and comes back. So a clean exit
 * and a crash are handled the same way: back off and retry until told to stop.
 */
export class Supervisor extends EventEmitter {
  readonly id: string;

  private proc: MediaProcess | null = null;
  private options: SupervisorOptions;
  private stopping = false;
  private retryTimer: NodeJS.Timeout | null = null;
  private attempt = 0;
  private startedAt = 0;
  private stdoutBuf = '';
  private stderrBuf = '';
  private logs: string[] = [];
  private pendingTotalSize: number | null = null;
  private lastTotalSize: number | null = null;
  private lastSizeAt = 0;
  /** Collects the signals ffmpeg emits about link trouble. */
  readonly diagnostics = new PipelineDiagnostics();

  private telemetry: Telemetry = {
    state: 'stopped',
    bitrateKbps: null,
    fps: null,
    droppedFrames: null,
    positionSec: null,
    uptimeSec: null,
    restarts: 0,
    lastError: null,
    updatedAt: Date.now(),
  };

  constructor(options: SupervisorOptions) {
    super();
    this.id = options.id;
    this.options = options;
  }

  get status(): Telemetry {
    const uptimeSec =
      this.startedAt > 0 && this.telemetry.state === 'running'
        ? Math.floor((Date.now() - this.startedAt) / 1000)
        : this.telemetry.uptimeSec;
    return { ...this.telemetry, uptimeSec };
  }

  get recentLogs(): string[] {
    return [...this.logs];
  }

  /**
   * Bytes this process has written, as last reported. Resets to null when the
   * process restarts — the traffic recorder treats that as a fresh run rather
   * than a negative delta.
   */
  get writtenBytes(): number | null {
    return this.lastTotalSize;
  }

  get isRunning(): boolean {
    return this.proc !== null;
  }

  start(): void {
    this.stopping = false;
    if (this.proc || this.retryTimer) return;
    this.spawnOnce();
  }

  stop(): void {
    this.stopping = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    const proc = this.proc;
    this.proc = null;
    if (proc) {
      proc.kill('SIGTERM');
      // ffmpeg occasionally hangs flushing a dead network output.
      const pid = proc.pid;
      setTimeout(() => {
        try {
          if (pid) process.kill(pid, 0);
          proc.kill('SIGKILL');
        } catch {
          /* already gone */
        }
      }, 4_000).unref();
    }
    this.patch({ state: 'stopped', bitrateKbps: null, fps: null, uptimeSec: null });
  }

  /** Restart with freshly computed arguments. */
  restart(): void {
    const wasStopping = this.stopping;
    this.stop();
    if (!wasStopping) {
      this.attempt = 0;
      setTimeout(() => this.start(), 250).unref();
    }
  }

  private spawnOnce(): void {
    let args: string[];
    try {
      args = this.options.args();
    } catch (err) {
      this.patch({ state: 'error', lastError: (err as Error).message });
      return;
    }

    this.appendLog(`$ ${config.ffmpegPath} ${args.join(' ')}`);
    this.startedAt = Date.now();
    this.pendingTotalSize = null;
    this.lastTotalSize = null;
    this.lastSizeAt = 0;
    this.diagnostics.reset();
    this.patch({ state: 'connecting', lastError: null });

    const proc: MediaProcess = spawn(config.ffmpegPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.proc = proc;

    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk: string) => {
      this.stdoutBuf += chunk;
      const lines = this.stdoutBuf.split('\n');
      this.stdoutBuf = lines.pop() ?? '';
      for (const line of lines) this.handleProgress(line.trim());
    });

    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (chunk: string) => {
      this.stderrBuf += chunk;
      const lines = this.stderrBuf.split(/[\r\n]/);
      this.stderrBuf = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        this.appendLog(trimmed);
        this.diagnostics.observe(trimmed);
        this.options.onLine?.(trimmed);
        if (/error|failed|no route|refused|timeout|invalid/i.test(trimmed)) {
          this.patch({ lastError: trimmed });
        }
      }
    });

    proc.on('error', (err) => {
      this.appendLog(`spawn error: ${err.message}`);
      this.patch({ state: 'error', lastError: err.message });
    });

    proc.on('exit', (code, signal) => {
      if (this.proc !== proc) return; // superseded by stop()/restart()
      this.proc = null;
      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      this.appendLog(`process ended (${reason})`);
      if (this.stopping) {
        this.patch({ state: 'stopped', bitrateKbps: null, fps: null });
        return;
      }
      this.scheduleRetry(reason);
    });
  }

  private scheduleRetry(reason: string): void {
    this.attempt += 1;
    const delay = Math.min(
      config.restartMinDelayMs * 2 ** Math.min(this.attempt - 1, 6),
      config.restartMaxDelayMs,
    );
    this.patch({
      state: 'retrying',
      bitrateKbps: null,
      fps: null,
      restarts: this.telemetry.restarts + 1,
      lastError: this.telemetry.lastError ?? reason,
    });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.stopping) this.spawnOnce();
    }, delay);
    this.retryTimer.unref();
  }

  /** Parses the key=value stream produced by `-progress pipe:1`. */
  private handleProgress(line: string): void {
    const eq = line.indexOf('=');
    if (eq < 0) return;
    const key = line.slice(0, eq);
    const value = line.slice(eq + 1);
    if (value === 'N/A') return;

    switch (key) {
      case 'total_size': {
        // ffmpeg's own `bitrate` field is a cumulative average since start,
        // which on a live feed lags reality by minutes. Derive the
        // instantaneous rate from byte deltas instead.
        const n = Number.parseInt(value, 10);
        if (!Number.isNaN(n)) this.pendingTotalSize = n;
        break;
      }
      case 'fps': {
        const n = Number.parseFloat(value);
        // Stream copy reports 0 — there is no decode loop to measure.
        if (!Number.isNaN(n) && n > 0) this.patch({ fps: Math.round(n * 10) / 10 });
        break;
      }
      case 'drop_frames': {
        const n = Number.parseInt(value, 10);
        if (!Number.isNaN(n)) this.patch({ droppedFrames: n });
        break;
      }
      case 'out_time_us': {
        const n = Number.parseInt(value, 10);
        if (!Number.isNaN(n)) this.patch({ positionSec: Math.floor(n / 1_000_000) });
        break;
      }
      case 'progress': {
        this.commitBitrate();
        // A progress block only lands once media is actually flowing, which is
        // the closest thing ffmpeg gives us to "the SRT session is live".
        if (this.telemetry.state !== 'running') {
          this.attempt = 0;
          this.patch({ state: 'running' });
        }
        break;
      }
    }
  }

  /**
   * Turns the byte counter into an instantaneous rate at the end of each
   * progress block. Muxers that do not report `total_size` — `tee`, most
   * notably — simply never reach here, and the engine measures those on the
   * wire instead.
   */
  private commitBitrate(): void {
    const total = this.pendingTotalSize;
    this.pendingTotalSize = null;
    if (total === null) return;

    const now = Date.now();
    const prev = this.lastTotalSize;
    const elapsed = now - this.lastSizeAt;
    this.lastTotalSize = total;
    this.lastSizeAt = now;

    // A shrinking counter means the process restarted underneath us.
    if (prev === null || elapsed <= 0 || total < prev) return;
    this.patch({ bitrateKbps: Math.round(((total - prev) * 8) / elapsed) });
  }

  private patch(partial: Partial<Telemetry>): void {
    const prevState = this.telemetry.state;
    this.telemetry = { ...this.telemetry, ...partial, updatedAt: Date.now() };
    if (partial.state && partial.state !== prevState) {
      this.emit('state', this.telemetry.state satisfies RunState);
    }
    this.emit('telemetry', this.status);
  }

  private appendLog(line: string): void {
    this.logs.push(`${new Date().toISOString()} ${line}`);
    if (this.logs.length > LOG_LINES) this.logs.splice(0, this.logs.length - LOG_LINES);
    this.emit('log', line);
  }
}
