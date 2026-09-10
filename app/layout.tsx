import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import { QueryProvider } from '@/components/providers/query-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'Taafi Admin',
    template: '%s · Taafi Admin',
  },
  description: 'Operations console for the Taafi care platform.',
  // This portal renders patient medical records and provider bank details.
  // It has no business in a search index, ever.
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The console is driven from phones as often as from a desk, so the mobile
 * viewport is declared rather than left to a browser's 980px fallback — without
 * this every layout below renders at desktop width and is then scaled down,
 * which is what "the admin panel is unusable on my phone" actually meant.
 *
 * `maximumScale` is deliberately ABSENT. Locking zoom is the usual companion to
 * this tag and it is an accessibility failure: an operator reading a patient's
 * handwritten prescription scan needs to pinch it. Input font sizes are 16px on
 * small screens instead (see `components/ui/input.tsx`), which is what actually
 * stops iOS from zooming on focus.
 *
 * `viewportFit: 'cover'` lets the sticky bars below paint into the home-
 * indicator area; they pad themselves back out with `env(safe-area-inset-*)`.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      {/*
       * `suppressHydrationWarning` here as well as on <html>, because the
       * attribute is ONE LEVEL DEEP: it covers an element's own attributes and
       * text, not its descendants. The one on <html> therefore never applied to
       * <body>, which is why Grammarly still tripped a hydration warning.
       *
       * Browser extensions (Grammarly's `data-new-gr-c-s-check-loaded` and
       * `data-gr-ext-installed`, password managers, some translators) mutate
       * <body> before React hydrates, so the server HTML and the DOM genuinely
       * differ through no fault of ours.
       *
       * This does NOT mask our own bugs: a mismatch inside the tree below still
       * warns normally.
       */}
      <body
        className="bg-background text-foreground min-h-full overflow-x-clip"
        suppressHydrationWarning
      >
        <QueryProvider>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
          <Toaster richColors closeButton position="top-right" />
        </QueryProvider>
      </body>
    </html>
  );
}
