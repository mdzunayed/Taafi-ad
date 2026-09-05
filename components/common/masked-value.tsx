'use client';

import { useState } from 'react';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { maskAccount } from '@/lib/format';

/**
 * Click-to-reveal for sensitive strings — bank account numbers on the payout
 * queue, principally.
 *
 * Masked by default because these rows get screen-shared during standups and
 * scrolled past on shared laptops. Revealing is a deliberate act, per value.
 */
export function MaskedValue({
  value,
  label = 'value',
}: {
  value: string | null | undefined;
  label?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!value) return <span className="text-muted-foreground">—</span>;

  async function copy() {
    await navigator.clipboard.writeText(String(value));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-sm tabular-nums">
        {revealed ? value : maskAccount(value)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        onClick={() => setRevealed((v) => !v)}
        aria-label={revealed ? `Hide ${label}` : `Reveal ${label}`}
      >
        {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </Button>
      {revealed && (
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={copy}
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
      )}
    </span>
  );
}
