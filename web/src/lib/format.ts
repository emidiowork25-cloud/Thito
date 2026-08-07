/** Portuguese number formatting, with the comma decimal separator. */
const nf = (digits: number): Intl.NumberFormat =>
  new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

/** Bitrate in kbit/s, rendered at the unit an operator would actually say. */
export function bitrate(kbps: number | null | undefined): string {
  if (kbps == null) return '—';
  if (kbps >= 1000) return `${nf(2).format(kbps / 1000)} Mb/s`;
  return `${nf(0).format(kbps)} kb/s`;
}

/** Same, from bits per second. */
export function bps(value: number): string {
  if (value >= 1e9) return `${nf(2).format(value / 1e9)} Gb/s`;
  if (value >= 1e6) return `${nf(2).format(value / 1e6)} Mb/s`;
  if (value >= 1e3) return `${nf(0).format(value / 1e3)} kb/s`;
  return `${nf(0).format(value)} b/s`;
}

/**
 * Volume of data. Uses decimal units because that is what network operators
 * and bandwidth invoices use — binary units here would understate the bill.
 */
export function bytes(value: number): string {
  if (value >= 1e12) return `${nf(2).format(value / 1e12)} TB`;
  if (value >= 1e9) return `${nf(2).format(value / 1e9)} GB`;
  if (value >= 1e6) return `${nf(1).format(value / 1e6)} MB`;
  if (value >= 1e3) return `${nf(0).format(value / 1e3)} kB`;
  return `${nf(0).format(value)} B`;
}

export function uptime(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export function dateTime(iso: string | null): string {
  if (!iso) return '—';
  // SQLite datetime() returns "YYYY-MM-DD HH:MM:SS" with no zone marker; it is
  // UTC, and without the Z the browser would read it as local time.
  const normalised = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(iso)
    ? `${iso.replace(' ', 'T')}Z`
    : iso;
  const d = new Date(normalised);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const normalised = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(iso)
    ? `${iso.replace(' ', 'T')}Z`
    : iso;
  const then = new Date(normalised).getTime();
  if (Number.isNaN(then)) return iso;

  const diff = Math.max(0, Date.now() - then);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'agora há pouco';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days} d`;
  return dateTime(iso);
}

/** Formats a Brazilian mobile as (11) 98765-4321 while it is being typed. */
export function maskPhone(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export const digitsOnly = (value: string): string => value.replace(/\D/g, '');
