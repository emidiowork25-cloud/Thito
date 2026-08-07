import Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';

/**
 * Confidence monitor.
 *
 * Browsers cannot play SRT, so the hub transcodes a small HLS rendition just
 * for this. Expect a few seconds of delay — it answers "is the picture there
 * and is it the right picture", not "is the timing correct".
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
      manifestLoadingMaxRetry: 30,
      manifestLoadingRetryDelay: 1000,
    });
    hls.loadSource(src);
    hls.attachMedia(video);

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      // The playlist only exists once the first segment is written, so a 404
      // right after start is the normal case, not a failure worth showing.
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
      <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-ink-500 bg-ink-900 font-display text-sm uppercase tracking-wider text-faint">
        Preview desativado
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
        <div className="absolute inset-x-0 bottom-0 rounded-b-lg bg-signal-fault/90 px-3 py-2 text-xs text-ink-950">
          {error}
        </div>
      )}
    </div>
  );
}
