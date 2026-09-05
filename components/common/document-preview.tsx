'use client';

import { useRef, useState } from 'react';
import {
  ExternalLink,
  FileText,
  ImageOff,
  Maximize2,
  Minus,
  Plus,
  RotateCw,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Renders an uploaded document, switching on the MIME the SERVER sniffed from
 * the leading bytes — never on the file extension or the client-declared
 * content type, both of which are attacker-controlled and, in this codebase,
 * frequently wrong (every upload lands on disk named `.jpg` regardless of what
 * it actually is).
 *
 * Deliberately a plain <img>/<iframe> rather than next/image: these are
 * remote, user-supplied files, and Next's optimizer has no business fetching
 * and re-encoding an unvalidated PDF. It would also resample the image, and
 * the whole job here is reading a registration number off a phone photo of a
 * council card — the original pixels are the evidence.
 *
 * Images get zoom / pan / rotate (`zoomable`, on by default). A BMDC card
 * photographed at arm's length is unreadable fitted to a review pane, and an
 * admin who cannot read the number either approves blind or opens the raw file
 * in a browser tab, losing the decision UI next to it. Rotate is here because
 * phone photos of a document on a desk arrive sideways more often than not.
 *
 * PDFs are left to the browser's built-in viewer, which already has zoom and
 * paging of its own — wrapping it in a second set of controls that cannot see
 * into the iframe would produce two disagreeing zoom levels.
 */
export function DocumentPreview({
  url,
  mime,
  name,
  className = 'h-[60vh]',
  zoomable = true,
}: {
  url: string;
  mime: string | undefined;
  name?: string;
  className?: string;
  zoomable?: boolean;
}) {
  // View state is keyed by `url` so a new file in the same pane starts fresh —
  // otherwise the previous document's zoom and pan carry over and the next one
  // opens off-screen, looking blank. Reset happens during render (the
  // documented alternative to an effect that only mirrors a prop), so the
  // fitted view is what paints first rather than a zoomed frame corrected a
  // tick later.
  const [view, setView] = useState(() => freshView(url));
  if (view.url !== url) setView(freshView(url));
  const { failed, scale, rotation, offset } = view;

  const setFailed = (v: boolean) => setView((s) => ({ ...s, failed: v }));
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  // Mirrors `drag.current` for the one thing render needs to know: whether to
  // animate the transform. Reading the ref itself during render is not allowed
  // and would not re-render on change anyway.
  const [dragging, setDragging] = useState(false);

  if (!url) {
    return (
      <div className="text-muted-foreground flex h-40 items-center justify-center rounded-md border border-dashed text-sm">
        No file attached
      </div>
    );
  }

  if (failed) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-md border border-dashed">
        <ImageOff className="text-muted-foreground size-6" />
        <p className="text-muted-foreground text-sm">
          This file could not be displayed.
        </p>
        <Button variant="outline" size="sm" asChild>
          <a href={url} target="_blank" rel="noreferrer noopener">
            <ExternalLink className="size-3.5" />
            Open in a new tab
          </a>
        </Button>
      </div>
    );
  }

  if (mime === 'application/pdf') {
    return (
      <div className="space-y-2">
        <iframe
          src={url}
          title={name ?? 'Document preview'}
          className={`w-full rounded-md border ${className}`}
        />
        <OpenRaw url={url} label="Open full size" />
      </div>
    );
  }

  if (mime?.startsWith('image/')) {
    if (!zoomable) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={name ?? 'Document preview'}
          onError={() => setFailed(true)}
          className={`w-full rounded-md border object-contain ${className}`}
        />
      );
    }

    const clamp = (n: number) => Math.min(6, Math.max(1, Number(n.toFixed(2))));
    const zoomTo = (next: number) => {
      const s = clamp(next);
      setView((v) => ({
        ...v,
        scale: s,
        // Back at fit, recentre — a pan left over from a zoomed view would
        // otherwise leave the fitted image sitting off to one side.
        offset: s === 1 ? { x: 0, y: 0 } : v.offset,
      }));
    };

    return (
      <div className="space-y-2">
        <div
          className={`bg-muted/40 relative w-full overflow-hidden rounded-md border ${className}`}
          onWheel={(e) => {
            if (!e.ctrlKey && !e.metaKey) return; // let the page scroll normally
            e.preventDefault();
            zoomTo(scale - e.deltaY * 0.003);
          }}
          onDoubleClick={() => zoomTo(scale > 1 ? 1 : 2.5)}
          onPointerDown={(e) => {
            if (scale === 1) return;
            drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
            setDragging(true);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const d = drag.current;
            setView((v) => ({
              ...v,
              offset: {
                x: d.ox + (e.clientX - d.x),
                y: d.oy + (e.clientY - d.y),
              },
            }));
          }}
          onPointerUp={() => {
            drag.current = null;
            setDragging(false);
          }}
          style={{ cursor: scale > 1 ? 'grab' : 'zoom-in' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={name ?? 'Document preview'}
            onError={() => setFailed(true)}
            draggable={false}
            className="h-full w-full object-contain select-none"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotate(${rotation}deg)`,
              transformOrigin: 'center center',
              transition: dragging ? 'none' : 'transform 120ms ease-out',
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => zoomTo(scale - 0.5)}
            disabled={scale <= 1}
            aria-label="Zoom out"
          >
            <Minus className="size-3.5" />
          </Button>
          <span className="text-muted-foreground w-12 text-center text-xs tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => zoomTo(scale + 0.5)}
            disabled={scale >= 6}
            aria-label="Zoom in"
          >
            <Plus className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setView((v) => ({ ...v, rotation: (v.rotation + 90) % 360 }))
            }
            aria-label="Rotate 90 degrees"
          >
            <RotateCw className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setView(freshView(url))}
            disabled={scale === 1 && rotation === 0}
            aria-label="Reset view"
          >
            <Maximize2 className="size-3.5" />
            Fit
          </Button>
          <OpenRaw url={url} label="Full size" />
        </div>
        <p className="text-muted-foreground text-[11px]">
          Double-click to zoom, drag to pan, ⌘/Ctrl + scroll to zoom smoothly.
        </p>
      </div>
    );
  }

  // Unknown or empty MIME — the sniffer did not recognise the bytes.
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-md border border-dashed">
      <FileText className="text-muted-foreground size-6" />
      <p className="text-muted-foreground text-sm">
        Preview is not available for this file type.
      </p>
      <Button variant="outline" size="sm" asChild>
        <a href={url} target="_blank" rel="noreferrer noopener">
          <ExternalLink className="size-3.5" />
          Open in a new tab
        </a>
      </Button>
    </div>
  );
}

/** The fitted, unrotated, un-panned starting view for a given file. */
function freshView(url: string) {
  return { url, failed: false, scale: 1, rotation: 0, offset: { x: 0, y: 0 } };
}

/** Escape hatch to the untouched original, at whatever resolution it was uploaded. */
function OpenRaw({ url, label }: { url: string; label: string }) {
  return (
    <Button variant="ghost" size="sm" asChild>
      <a href={url} target="_blank" rel="noreferrer noopener">
        <ExternalLink className="size-3.5" />
        {label}
      </a>
    </Button>
  );
}
