import Image from 'next/image';

import logo from '@/public/logo.png';
import mark from '@/public/mark.png';
import { cn } from '@/lib/utils';

/**
 * The Taafi brand lockup, in the two forms the console needs.
 *
 * `full` is the wordmark plus stethoscope (aspect ~3.3:1) and already spells
 * "Taafi", so nothing should pair it with a text label. `mark` is the
 * stethoscope alone, for slots too narrow for the lockup — the collapsed
 * sidebar rail is 48px wide.
 *
 * Both are local static imports, so `next/image` infers the intrinsic size and
 * no `next.config.ts` remote-pattern entry is needed. (The plain-`<img>`
 * convention elsewhere in this app is specifically for *remote* URLs.)
 *
 * Height is set by the caller through `className`; width follows from the
 * aspect ratio.
 */
export function BrandLogo({
  variant = 'full',
  className,
  priority = false,
}: {
  variant?: 'full' | 'mark';
  className?: string;
  priority?: boolean;
}) {
  const isMark = variant === 'mark';
  return (
    <Image
      src={isMark ? mark : logo}
      alt="Taafi Home Care"
      priority={priority}
      className={cn('w-auto object-contain', className)}
    />
  );
}
