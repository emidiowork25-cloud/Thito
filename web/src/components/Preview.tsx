import Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';

/**
 * Browsers cannot play SRT, so the hub transcodes a low-bitrate HLS rendition
 * for monitoring. Expect a couple of seconds of delay — this is a confidence
 * monitor, not the program feed.
 */
export function Preview({
  ingestId,
  enabled,
}: {
  ingestId: string;
  enabled: boolean;
}): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !enabled) return;

    const src = `/preview/${ingestId}/index.m3u8`;
    setError(null);

    // Safari plays HLS natively and does it better than hls.js on iOS.
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      return () => {
        video.removeAttribute('src');
        video.load();
      };
    }

    if (!Hls.isSupported()) {
      setError('Este navegador não suporta HLS.');
      return;
    }

    const hls = new Hls({
      lowLatencyMode: true,
      liveSyncDurationCount: 2,
      manifestLoadingMaxRetry: 20,
      manifestLoadingRetryDelay: 1000,
    });
    hls.loadSource(src);
    hls.attachMedia(video);

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      // The playlist only appears once the first segment is written, so a 404
      // right after start is expected rather than an error worth surfacing.
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        hls.startLoad();
        return;
      }
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError();
        return;
      }
      setError('Falha ao carregar o preview.');
    });

    return () => hls.destroy();
  }, [ingestId, enabled]);

  if (!enabled) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-ink-500 bg-ink-900 text-sm text-slate-500">
        Preview desativado neste ingest
      </div>
    );
  }

  return (
    <div className="relative">
      <video
        ref={videoRef}
        className="aspect-video w-full rounded-lg bg-black"
        autoPlay
        muted
        playsInline
        controls
      />
      {error && (
        <div className="absolute inset-x-0 bottom-0 rounded-b-lg bg-rose-950/90 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      )}
    </div>
  );
}
