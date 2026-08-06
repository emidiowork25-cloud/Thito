import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config.js';
import type { Capabilities } from '../types.js';

const run = promisify(execFile);

async function ffmpeg(args: string[]): Promise<string> {
  // ffmpeg writes banners to stderr and list output to stdout; we want both.
  const { stdout, stderr } = await run(config.ffmpegPath, args, {
    maxBuffer: 8 * 1024 * 1024,
  });
  return `${stdout}\n${stderr}`;
}

/**
 * OMT lives in a fork and an unmerged upstream PR, so the muxer name is not
 * settled yet. Probe for every spelling that has appeared rather than pinning
 * one and breaking on the other build.
 */
const OMT_NAMES = ['libomt', 'omt', 'omt_output', 'libomt_output'];

function findName(listing: string, candidates: string[]): string | null {
  for (const line of listing.split('\n')) {
    // Listing rows look like: " DE libomt          Open Media Transport"
    const match = /^\s*[A-Z. ]{2,4}\s+(\S+)/.exec(line);
    if (!match) continue;
    const name = match[1];
    if (name && candidates.includes(name)) return name;
  }
  return null;
}

let cached: Capabilities | null = null;

export async function probeCapabilities(force = false): Promise<Capabilities> {
  if (cached && !force) return cached;

  let version: string | null = null;
  let protocols = '';
  let muxers = '';
  let demuxers = '';
  let devicesOut = '';
  let devicesIn = '';

  try {
    const banner = await ffmpeg(['-hide_banner', '-version']);
    version = banner.split('\n')[0]?.trim() ?? null;
  } catch (err) {
    throw new Error(
      `Could not run ffmpeg at "${config.ffmpegPath}". ` +
        `Install it or set FFMPEG_PATH. Original error: ${(err as Error).message}`,
    );
  }

  // A build missing one of these lists should not blank out the others.
  const safe = async (args: string[]): Promise<string> => {
    try {
      return await ffmpeg(args);
    } catch {
      return '';
    }
  };

  [protocols, muxers, demuxers, devicesOut, devicesIn] = await Promise.all([
    safe(['-hide_banner', '-protocols']),
    safe(['-hide_banner', '-muxers']),
    safe(['-hide_banner', '-demuxers']),
    safe(['-hide_banner', '-devices']),
    safe(['-hide_banner', '-devices']),
  ]);

  cached = {
    ffmpegPath: config.ffmpegPath,
    ffmpegVersion: version,
    srt: /^\s*srt\s*$/m.test(protocols) || protocols.includes(' srt'),
    rtmp: protocols.includes('rtmp'),
    omtMuxer:
      findName(muxers, OMT_NAMES) ?? findName(devicesOut, OMT_NAMES) ?? null,
    omtDemuxer:
      findName(demuxers, OMT_NAMES) ?? findName(devicesIn, OMT_NAMES) ?? null,
  };

  return cached;
}

export function cachedCapabilities(): Capabilities | null {
  return cached;
}
