'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ImageUp, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * The upload rules, mirrored from the server so a doomed file is refused here
 * rather than as a 415/413 from multer.
 *
 * The backend checks MIME *and* extension (`src/middleware/upload.js`), so both
 * are checked here too — a `.gif` renamed to `.png` passes the type sniff in
 * some browsers and would still be rejected on arrival.
 */
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const HARD_SIZE_LIMIT = 8 * 1024 * 1024;
const SOFT_SIZE_LIMIT = 300 * 1024;

export interface ImageUploaderProps {
  /** Field label. */
  label: string;
  /**
   * The stored image, if the row already has one. Kept separate from the picked
   * file: together they are what make the three-way write below expressible.
   */
  currentUrl?: string | null;
  /** The picked file, owned by the parent so its save handler can send it. */
  file: File | null;
  onFileChange: (file: File | null) => void;
  /**
   * Called when the operator clears the existing image. Distinct from
   * `onFileChange(null)`, which only cancels a pick.
   *
   * THE THREE-WAY WRITE. A content form has three outcomes and the API tells
   * them apart by which keys arrive:
   *   • a new file      → send the file part
   *   • an explicit clear → send `imageUrl: ''`
   *   • neither          → send no image key at all, leaving the stored one
   * Collapsing the last two wipes artwork on every text-only edit, so a form
   * that supports clearing must pass this and track it.
   */
  onClear?: () => void;
  /** Shown under the control. */
  hint?: string;
  /**
   * Width / height the artwork is expected to be. When set, a pick that misses
   * it by more than 25% raises a WARNING, never a rejection — the operator may
   * genuinely want the letterboxed result.
   */
  targetAspect?: number;
  /** Round preview for icons, rectangular for artwork. */
  shape?: 'circle' | 'rect';
  /**
   * Painted behind the preview. The banner form passes its gradient, which is
   * what the app actually shows around artwork that does not fill the card —
   * so the preview shows the real result rather than the picture on grey.
   */
  previewBackground?: string;
  /** Overrides the preview box size, e.g. a banner's wide strip. */
  previewClassName?: string;
  disabled?: boolean;
  /** Marks the field required in the label. Validation stays with the parent. */
  required?: boolean;
}

/**
 * Pick an image by dropping it, clicking, or tabbing to the button.
 *
 * Every CMS form hand-rolled this before, three slightly different ways, and
 * none of them accepted a drop. The parts worth having in one place are the
 * validation pair above, the object-URL lifecycle, and the clear-vs-cancel
 * distinction the API depends on.
 *
 * The drop zone is a plain div, not a label wrapping the input: a label would
 * make the whole zone a click target for the button inside it, so Remove would
 * re-open the file picker.
 */
export function ImageUploader({
  label,
  currentUrl,
  file,
  onFileChange,
  onClear,
  hint,
  targetAspect,
  shape = 'rect',
  previewBackground,
  previewClassName,
  disabled = false,
  required = false,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  /*
   * Derived, not stored: an object URL is a pure function of the picked file.
   * The effect is left with one job — freeing the previous URL once nothing
   * points at it.
   */
  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const shown = previewUrl ?? (currentUrl || null);

  function reject(message: string) {
    toast.error(message);
    // Clearing the input matters: without it, re-picking the SAME file fires no
    // change event and the operator sees nothing happen.
    if (inputRef.current) inputRef.current.value = '';
  }

  function accept(picked: File | null) {
    if (!picked) {
      onFileChange(null);
      setWarning(null);
      return;
    }

    const ext = picked.name.slice(picked.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_TYPES.includes(picked.type)) {
      reject('Only JPEG, PNG and WEBP images are allowed.');
      return;
    }
    if (!ALLOWED_EXT.includes(ext)) {
      reject(`The server rejects a ${ext || 'missing'} extension. Use .jpg, .png or .webp.`);
      return;
    }
    if (picked.size > HARD_SIZE_LIMIT) {
      reject('That image is over the 8 MB upload limit.');
      return;
    }

    onFileChange(picked);

    const warnings: string[] = [];
    if (picked.size > SOFT_SIZE_LIMIT) {
      warnings.push(
        `It is ${Math.round(picked.size / 1024)} KB — over the 300 KB we recommend, so it will be slow on a weak connection.`,
      );
    }
    setWarning(warnings.length ? warnings.join(' ') : null);

    if (!targetAspect) return;

    // Dimensions need the image decoded, so this warning lands a moment after
    // the file does.
    const probe = new Image();
    const probeUrl = URL.createObjectURL(picked);
    probe.onload = () => {
      URL.revokeObjectURL(probeUrl);
      const ratio = probe.width / probe.height;
      if (Math.abs(ratio - targetAspect) / targetAspect > 0.25) {
        warnings.push(
          ratio > targetAspect
            ? `It is ${probe.width}×${probe.height}, wider than the ${targetAspect.toFixed(2)}:1 slot. It will be shown whole with space above and below rather than filling it.`
            : `It is ${probe.width}×${probe.height}, narrower than the ${targetAspect.toFixed(2)}:1 slot. The parts that do not fit will be trimmed — check nothing important sits near the edges.`,
        );
      }
      setWarning(warnings.length ? warnings.join(' ') : null);
    };
    probe.onerror = () => URL.revokeObjectURL(probeUrl);
    probe.src = probeUrl;
  }

  function clear() {
    onFileChange(null);
    setWarning(null);
    if (inputRef.current) inputRef.current.value = '';
    onClear?.();
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>
        {label}
        {required ? <span className="text-destructive ml-0.5">*</span> : null}
      </Label>

      <div
        onDragOver={(e) => {
          if (disabled) return;
          // Both are required for a drop to fire at all — the default action is
          // to navigate the window to the dropped file.
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files?.[0] ?? null);
        }}
        className={cn(
          'flex items-center gap-3 rounded-lg border border-dashed p-3 transition-colors',
          dragging ? 'border-primary bg-primary/5' : 'border-input',
          disabled && 'opacity-60',
        )}
      >
        {shown ? (
          // Remote, operator-uploaded image on the API origin (or a local
          // object URL). A plain <img> avoids configuring next/image
          // remotePatterns for a host that changes per environment.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shown}
            alt=""
            style={previewBackground ? { background: previewBackground } : undefined}
            className={cn(
              'shrink-0 border object-cover',
              shape === 'circle' ? 'size-12 rounded-full' : 'h-12 w-20 rounded',
              previewClassName,
            )}
          />
        ) : (
          <div
            style={previewBackground ? { background: previewBackground } : undefined}
            className={cn(
              'text-muted-foreground flex shrink-0 items-center justify-center border',
              previewBackground ? '' : 'bg-muted',
              shape === 'circle' ? 'size-12 rounded-full' : 'h-12 w-20 rounded',
              previewClassName,
            )}
          >
            <ImageUp className="size-5" />
          </div>
        )}

        <div className="flex min-w-0 flex-col gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="size-4" />
            {shown ? 'Replace' : 'Upload'}
          </Button>
          {/*
            Two different actions, and conflating them would lie to the
            operator. A pending pick can always be CANCELLED. The stored image
            can only be REMOVED when the parent passed `onClear` — a form
            without one has no way to send the explicit clear the API needs, so
            offering the button would appear to work and change nothing.
          */}
          {file ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              className="text-muted-foreground h-7"
              onClick={clear}
            >
              <X className="size-3.5" />
              Cancel
            </Button>
          ) : currentUrl && onClear ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              className="text-muted-foreground h-7"
              onClick={clear}
            >
              <X className="size-3.5" />
              Remove
            </Button>
          ) : (
            <span className="text-muted-foreground text-xs">
              Drop an image here, or click Upload.
            </span>
          )}
        </div>
      </div>

      {/* Visually hidden rather than `display:none`: the label points at it, so
          it stays reachable by keyboard and announced by a screen reader. */}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => accept(e.target.files?.[0] ?? null)}
      />

      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}

      {warning ? (
        <Alert>
          <AlertDescription className="text-xs">{warning}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
