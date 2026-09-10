'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { DisabledWhenDenied } from '@/components/rbac/can';
import {
  BANNER_CATEGORY_LABEL,
  BANNER_CATEGORY_TAGS,
  announcements,
  type BannerCategoryTag,
  type PromoBannerWire,
} from '@/lib/api/content';
import { qk } from '@/lib/api/query-keys';
import { normalizeError } from '@/lib/api/errors';

/** `2026-06-15T00:00:00.000Z` → `2026-06-15`, which is what a date input wants. */
function dateInputValue(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/**
 * The trigger and the dialog shell, holding nothing but `open`.
 *
 * Fields live in [AnnouncementForm], which Radix mounts on open and unmounts on
 * close — so every open initialises its `useState` from the row afresh and a
 * cancelled edit leaves nothing behind. Same arrangement as the banner dialog.
 */
export function AnnouncementFormDialog({
  announcement,
}: {
  announcement?: PromoBannerWire;
}) {
  const editing = announcement !== undefined;
  const [open, setOpen] = useState(false);

  return (
    <DisabledWhenDenied
      capability="content.write"
      reason="Only an admin can change what patients see."
    >
      <Dialog open={open} onOpenChange={setOpen}>
        {editing ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(true)}
            aria-label="Edit announcement"
          >
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            Write announcement
          </Button>
        )}

        <DialogContent
          mobileFullscreen
          className="max-h-[90vh] overflow-y-auto sm:max-w-xl"
        >
          <AnnouncementForm
            announcement={announcement}
            onClose={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </DisabledWhenDenied>
  );
}

function AnnouncementForm({
  announcement,
  onClose,
}: {
  announcement?: PromoBannerWire;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const editing = announcement !== undefined;

  const [categoryTag, setCategoryTag] = useState<BannerCategoryTag>(
    announcement?.categoryTag ?? 'ANNOUNCEMENT',
  );
  const [tagText, setTagText] = useState(announcement?.tagText ?? '');
  const [title, setTitle] = useState(announcement?.title ?? '');
  const [detailContent, setDetailContent] = useState(
    announcement?.detailContent ?? '',
  );
  const [startDate, setStartDate] = useState(
    dateInputValue(announcement?.startDate),
  );
  const [endDate, setEndDate] = useState(dateInputValue(announcement?.endDate));
  const [isActive, setIsActive] = useState(announcement?.isActive ?? true);

  const save = useMutation({
    mutationFn: async () => {
      /*
       * FormData, not JSON — this is the promo-banner router, whose write
       * handlers sit behind `upload.single('image')`. It parses either, and
       * sending the same shape the banner form does keeps one contract.
       *
       * No `Content-Type` header: axios derives the multipart boundary from the
       * FormData, and setting it by hand drops the boundary and empties the body.
       */
      const fd = new FormData();
      fd.append('categoryTag', categoryTag);
      fd.append('tagText', tagText.trim());
      fd.append('title', title.trim());
      fd.append('detailContent', detailContent);
      fd.append('isActive', String(isActive));
      // Always sent: a blank string is how the API is told to clear a bound.
      // Midnight UTC, matching what the date input means.
      fd.append('startDate', startDate ? `${startDate}T00:00:00.000Z` : '');
      fd.append('endDate', endDate ? `${endDate}T00:00:00.000Z` : '');

      /*
       * Artwork, carousel order and the tap action are NOT sent. The router's
       * field pickers only apply keys that are actually present, so a bulletin
       * edited here keeps whatever the Banners tab set — this form narrows what
       * you can change, it does not reset the rest to blank.
       */
      return editing
        ? announcements.update(announcement.id, fd)
        : announcements.create(fd);
    },
    onSuccess: () => {
      toast.success(editing ? 'Announcement updated.' : 'Announcement published.');
      queryClient.invalidateQueries({ queryKey: qk.announcements });
      // Same rows, so the carousel list is stale now too.
      queryClient.invalidateQueries({ queryKey: qk.banners });
      onClose();
    },
    onError: (error) => toast.error(normalizeError(error).message),
  });

  /*
   * A body is what makes this row an announcement rather than a plain carousel
   * slide — it is the field the Announcements list filters on and the field the
   * server picks `announcement` by. Saving without one would file the row away
   * in the Banners tab and it would vanish from here.
   *
   * A headline is required for the same practical reason: the reader sheet
   * opens on it.
   */
  const canSave =
    Boolean(title.trim()) && Boolean(detailContent.trim()) && !save.isPending;

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {editing ? 'Edit announcement' : 'Write an announcement'}
        </DialogTitle>
        <DialogDescription>
          Announcements ride the home carousel and open as a readable sheet.
          They are promo banners with a body — so this one also appears in the{' '}
          <strong>Banners</strong> tab, where its artwork, carousel position and
          tap action are set.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="an-category">Pill</Label>
            <Select
              value={categoryTag}
              onValueChange={(v) => setCategoryTag(v as BannerCategoryTag)}
            >
              <SelectTrigger id="an-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BANNER_CATEGORY_TAGS.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {BANNER_CATEGORY_LABEL[tag]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              The badge patients see on the card and in the reader.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="an-tagtext">Pill text</Label>
            <Input
              id="an-tagtext"
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
              placeholder="CLINIC NOTICE"
            />
            <p className="text-muted-foreground text-xs">
              Optional. Overrides the pill label above when set.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="an-title">
            Headline<span className="text-destructive ml-0.5">*</span>
          </Label>
          <Input
            id="an-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Clinic hours are changing from Sunday"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="an-body">
            Body<span className="text-destructive ml-0.5">*</span>
          </Label>
          <Textarea
            id="an-body"
            rows={7}
            value={detailContent}
            onChange={(e) => setDetailContent(e.target.value)}
            placeholder={'We now open at 8am on weekdays.\n\nEvening slots are unchanged.'}
          />
          <p className="text-muted-foreground text-xs">
            Leave a blank line between paragraphs — the app splits on it. Plain
            text only; formatting is not rendered.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="an-start">Starts</Label>
            <Input
              id="an-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="an-end">Ends</Label>
            <Input
              id="an-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
        <p className="text-muted-foreground -mt-2 text-xs">
          Leave both empty to run indefinitely. Outside its window an
          announcement is hidden from patients even while it is live here.
        </p>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="an-active">Live</Label>
            <p className="text-muted-foreground text-xs">
              Visible in the patient app straight away.
            </p>
          </div>
          <Switch id="an-active" checked={isActive} onCheckedChange={setIsActive} />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        <Button onClick={() => save.mutate()} disabled={!canSave}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          {editing ? 'Save changes' : 'Publish'}
        </Button>
      </DialogFooter>
    </>
  );
}
