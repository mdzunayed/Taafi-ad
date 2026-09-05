'use client';

import { Badge } from '@/components/ui/badge';
import { humanize } from '@/lib/format';

/**
 * Renders the changed keys of an audit row as `key: old → new`.
 *
 * `before` and `after` contain ONLY the keys that moved — the backend's
 * `diffFields` drops everything else before writing — so every key present
 * here is worth showing. The values are free-form Mongo subdocuments whose
 * keys are themselves data, which is exactly why nothing in this portal
 * rewrites their casing: `platform_commission_percent` is what the admin
 * changed, and that is what the log must say.
 */
function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '∅';
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function AuditDiff({
  before,
  after,
  limit = 3,
}: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  limit?: number;
}) {
  const keys = Array.from(
    new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]),
  );

  if (!keys.length) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }

  const shown = keys.slice(0, limit);
  const hidden = keys.length - shown.length;

  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((key) => (
        <Badge key={key} variant="outline" className="font-mono text-xs font-normal">
          {key}: {renderValue(before?.[key])} → {renderValue(after?.[key])}
        </Badge>
      ))}
      {hidden > 0 && (
        <Badge variant="secondary" className="text-xs font-normal">
          +{hidden} more
        </Badge>
      )}
    </div>
  );
}

export function AuditDiffFull({
  before,
  after,
}: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) {
  const keys = Array.from(
    new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]),
  );
  if (!keys.length) {
    return (
      <p className="text-muted-foreground text-sm">
        This action recorded no field changes.
      </p>
    );
  }
  return (
    <dl className="space-y-3">
      {keys.map((key) => (
        <div key={key} className="space-y-1">
          <dt className="text-xs font-medium">{humanize(key)}</dt>
          <dd className="flex flex-wrap items-center gap-2 font-mono text-sm">
            <span className="text-muted-foreground line-through">
              {renderValue(before?.[key])}
            </span>
            <span aria-hidden>→</span>
            <span>{renderValue(after?.[key])}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
