/**
 * Phone helpers live in their own file because they mirror a SERVER rule
 * rather than a display preference. Re-exported so every call site keeps
 * importing formatters from `@/lib/format`.
 */
export * from './phone';

/**
 * The patient-facing WhatsApp hand-off. Split out for the same reason as the
 * phone rules: it quotes money and a booking reference to a patient, so it is
 * worth being a pure function with its own home rather than a template string
 * inside a component.
 */
export * from './whatsapp';

/** Taafi bills in Bangladeshi taka. */
export function money(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `৳${Number(value).toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function dateOnly(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60_000);
  if (Math.abs(mins) < 1) return 'just now';
  if (Math.abs(mins) < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** `deposit_paid_admin_reviewing` → `Deposit paid admin reviewing` */
export function humanize(value: string | null | undefined): string {
  if (!value) return '—';
  const spaced = value.replace(/[_.]/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * Byte count → "412 KB" / "2.4 MB", for an uploaded file's size chip.
 *
 * Binary units (1024), which is what every OS file dialog an operator compares
 * against reports. One decimal place above KB and none below: "1.5 MB" is worth
 * knowing before clicking, "412.3 KB" is noise.
 */
export function fileSize(bytes: number | null | undefined): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 1024) return `${Math.round(n)} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** Keep the last four digits only. For bank account numbers on payout rows. */
export function maskAccount(value: string | null | undefined): string {
  if (!value) return '—';
  const s = String(value);
  if (s.length <= 4) return '••••';
  return `•••• ${s.slice(-4)}`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}
