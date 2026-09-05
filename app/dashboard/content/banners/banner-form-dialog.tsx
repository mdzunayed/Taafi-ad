'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { DisabledWhenDenied } from '@/components/rbac/can';
import { ImageUploader } from '@/components/common/image-uploader';
import {
  BANNER_ACTION_LABEL,
  BANNER_ACTION_TYPES,
  BANNER_ROUTE_PRESETS,
  BANNER_CATEGORY_LABEL,
  BANNER_CATEGORY_TAGS,
  banners,
  categories,
  isServiceActive,
  services,
  type BannerActionType,
  type BannerCategoryTag,
  type PromoBannerWire,
} from '@/lib/api/content';
import { qk } from '@/lib/api/query-keys';
import { normalizeError } from '@/lib/api/errors';

/**
 * Create / edit a patient-home banner.
 *
 * This is the first editor form in the content CMS — every other surface here
 * lists, toggles and deletes, and banners were previously authored by a Flutter
 * admin screen that no longer exists. It follows `create-provider-dialog.tsx`
 * (plain `useState` per field, `useMutation`, `disabled=` validation) rather
 * than the one zod/react-hook-form outlier in `bookings/new`.
 *
 * Two API constraints, both load-bearing:
 *
 *  - The write is **multipart** (the image rides along), and `Content-Type`
 *    must never be set by hand — doing so drops the boundary and the server
 *    receives an empty body. See `lib/api/content.ts`.
 *  - `PUT` is **partial**: a key that is absent is left alone. That is why the
 *    dates are always sent (blank clears them) but the image only when a new
 *    file was picked — otherwise saving a text edit would blank the artwork.
 */

/** Recommended artwork. Not enforced server-side; see the warnings below. */
/**
 * Recommended artwork: portrait 3:5.
 *
 * **It matters more than it used to.** The banner card is a fixed box now —
 * exactly 65% of the screen's height by ~90% of its width — and the artwork is
 * fitted into it rather than the box being sized to the artwork:
 *
 *   - Portrait art fills the card and is **centre-cropped** where it does not
 *     fit. A to-spec 3:5 upload loses about 6% of its height on a typical
 *     phone; the further from 3:5, the more comes off.
 *   - Art *wider* than the card is not cropped — cover would take most of a
 *     landscape image's width — so it is centred on the banner's gradient
 *     instead, with colour above and below it.
 *
 * The tolerance is deliberately loose because the card's own ratio varies
 * across devices — width is capped at 600 dp and height is not, so it runs from
 * ~0.64:1 on a tall phone to ~0.78:1 on a short one — and there is no single
 * correct number to check against, only a band worth mentioning.
 */
const RECOMMENDED_WIDTH = 1080;
const RECOMMENDED_HEIGHT = 1800;
const TARGET_RATIO = RECOMMENDED_WIDTH / RECOMMENDED_HEIGHT; // 0.6 (3:5)

// Mirrors the server's ALLOWED_MIME set. It checks the extension too, but a
// browser file picker gives us a real MIME, so this is the useful half.

const DEFAULT_GRADIENT: [string, string] = ['#4C1D95', '#8B5CF6'];

/** `2026-08-28T00:00:00.000Z` -> `2026-08-28`, for `<input type="date">`. */
function toDateInput(value: string | null | undefined): string {
  if (!value) return '';
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? '' : at.toISOString().slice(0, 10);
}

/** The populated target service comes back as an object; the form wants the id. */
function targetServiceIdOf(banner: PromoBannerWire | undefined): string {
  const raw = banner?.targetServiceId;
  if (!raw) return '';
  return typeof raw === 'string' ? raw : raw.id;
}

/*
 * Radix reserves the empty string as "no selection", so the "leave it unset"
 * choice needs a sentinel of its own. It never reaches the wire — `submit`
 * maps it back to '' before appending.
 */
const NO_TARGET = '__none__';

/**
 * A banner target, chosen from what actually exists.
 *
 * Both target fields used to be free-text boxes an operator pasted a Mongo
 * ObjectId (or a guessed slug) into, with no feedback until a patient tapped
 * the banner and landed nowhere. A wrong value here is invisible on this
 * screen and invisible in the app — the reader just opens the booking form —
 * so the fix is to make an invalid one unselectable.
 *
 * Generic over the row type because services key on id and categories key on
 * slug; `optionsOf` is where each says which.
 */
function TargetPicker<T>({
  id,
  label,
  value,
  onChange,
  queryKey,
  load,
  optionsOf,
  emptyLabel,
  help,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  queryKey: readonly unknown[];
  load: () => Promise<T[]>;
  optionsOf: (rows: T[]) => { value: string; label: string }[];
  emptyLabel: string;
  help: string;
}) {
  const query = useQuery({ queryKey, queryFn: load });
  const options = useMemo(
    () => (query.data ? optionsOf(query.data) : []),
    // `optionsOf` is redeclared every render by the caller; the rows are what
    // actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query.data],
  );

  /*
   * A banner already pointing at something since deleted (or at a value typed
   * before this picker existed) must not be silently re-pointed at "nothing"
   * just by opening the dialog. It keeps its value, shown as an orphan, until
   * someone chooses deliberately.
   */
  const orphan = value !== '' && !options.some((o) => o.value === value);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value === '' ? NO_TARGET : value}
        onValueChange={(v) => onChange(v === NO_TARGET ? '' : v)}
        disabled={query.isPending}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder={query.isPending ? 'Loading…' : emptyLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_TARGET}>{emptyLabel}</SelectItem>
          {orphan && <SelectItem value={value}>{value} (not found)</SelectItem>}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {orphan ? (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          This banner points at something that no longer exists. Patients
          tapping it land on the booking form.
        </p>
      ) : (
        <p className="text-muted-foreground text-xs">{help}</p>
      )}
    </div>
  );
}

/**
 * The trigger and the dialog shell. Deliberately holds nothing but `open`.
 *
 * Every field lives in [BannerForm], which Radix mounts when the dialog opens
 * and unmounts when it closes — so each open initialises its `useState` from
 * `banner` afresh and a cancelled edit leaves nothing behind. That is the
 * reset an effect would otherwise have to perform on every open.
 */
export function BannerFormDialog({ banner }: { banner?: PromoBannerWire }) {
  const editing = banner !== undefined;
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
            aria-label="Edit banner"
          >
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            Add banner
          </Button>
        )}

        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <BannerForm banner={banner} onClose={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </DisabledWhenDenied>
  );
}

function BannerForm({
  banner,
  onClose,
}: {
  banner?: PromoBannerWire;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const editing = banner !== undefined;

  // Content
  const [categoryTag, setCategoryTag] = useState<BannerCategoryTag>(
    banner?.categoryTag ?? 'ANNOUNCEMENT',
  );
  const [tagText, setTagText] = useState(banner?.tagText ?? '');
  const [title, setTitle] = useState(banner?.title ?? '');
  const [buttonText, setButtonText] = useState(banner?.buttonText ?? '');
  const [detailContent, setDetailContent] = useState(
    banner?.detailContent ?? '',
  );

  // Artwork
  const [file, setFile] = useState<File | null>(null);

  // Appearance
  const [gradientFrom, setGradientFrom] = useState(
    banner?.gradientColors?.[0] ?? DEFAULT_GRADIENT[0],
  );
  const [gradientTo, setGradientTo] = useState(
    banner?.gradientColors?.[1] ?? DEFAULT_GRADIENT[1],
  );

  // Scheduling
  const [startDate, setStartDate] = useState(toDateInput(banner?.startDate));
  const [endDate, setEndDate] = useState(toDateInput(banner?.endDate));
  const [priorityOrder, setPriorityOrder] = useState(
    banner?.priorityOrder === undefined ? '' : String(banner.priorityOrder),
  );
  const [isActive, setIsActive] = useState(banner?.isActive ?? true);

  // Action
  const [actionType, setActionType] = useState<BannerActionType>(
    banner?.actionType ?? 'NONE',
  );
  const [targetServiceId, setTargetServiceId] = useState(
    targetServiceIdOf(banner),
  );
  const [targetCategoryId, setTargetCategoryId] = useState(
    banner?.targetCategoryId ?? '',
  );
  const [targetUrl, setTargetUrl] = useState(banner?.targetUrl ?? '');
  const [promoCode, setPromoCode] = useState(banner?.promoCode ?? '');
  const [targetRoute, setTargetRoute] = useState(banner?.targetRoute ?? '');

  const save = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('categoryTag', categoryTag);
      fd.append('tagText', tagText.trim());
      fd.append('title', title.trim());
      fd.append('buttonText', buttonText.trim());
      fd.append('detailContent', detailContent);
      // The server's parseGradient reads a JSON string off multipart.
      fd.append('gradientColors', JSON.stringify([gradientFrom, gradientTo]));
      fd.append('isActive', String(isActive));
      fd.append('actionType', actionType);
      fd.append(
        'targetServiceId',
        actionType === 'SERVICE' ? targetServiceId.trim() : '',
      );
      fd.append(
        'targetCategoryId',
        actionType === 'CATEGORY' ? targetCategoryId.trim() : '',
      );
      fd.append(
        'targetUrl',
        actionType === 'EXTERNAL_URL' ? targetUrl.trim() : '',
      );
      fd.append(
        'promoCode',
        actionType === 'PROMO_CODE' ? promoCode.trim() : '',
      );
      // Blanked unless CUSTOM_ROUTE is the live action, like every other
      // target above — otherwise switching a banner from "Open an app screen"
      // to "Open a service" would leave a stale route on the row that the next
      // switch back would silently resurrect.
      fd.append(
        'targetRoute',
        actionType === 'CUSTOM_ROUTE' ? targetRoute.trim() : '',
      );
      // Always sent: a blank string is how the API is told to clear a bound.
      // Midnight UTC, matching what the date input means.
      fd.append('startDate', startDate ? `${startDate}T00:00:00.000Z` : '');
      fd.append('endDate', endDate ? `${endDate}T00:00:00.000Z` : '');
      if (priorityOrder.trim())
        fd.append('priorityOrder', priorityOrder.trim());
      // Only when a new one was picked — see the partial-PUT note above.
      if (file) fd.append('image', file);

      return editing ? banners.update(banner.id, fd) : banners.create(fd);
    },
    onSuccess: () => {
      toast.success(editing ? 'Banner updated.' : 'Banner created.');
      queryClient.invalidateQueries({ queryKey: qk.banners });
      onClose();
    },
    onError: (error) => toast.error(normalizeError(error).message),
  });

  // Every text field is optional — a banner can be nothing but artwork. The
  // only rule, mirroring `assertRenderable` on the API, is that it has to be
  // *something*: with neither a picture nor a headline the card renders blank.
  const hasImage = Boolean(file) || Boolean(banner?.imageUrl);
  const canSave = (hasImage || Boolean(title.trim())) && !save.isPending;

  const gradientPreview = useMemo(
    () => `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
    [gradientFrom, gradientTo],
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? 'Edit banner' : 'Add a banner'}</DialogTitle>
        <DialogDescription>
          Banners are the hero at the top of the patient home screen. Tapping
          one opens a reader with the detailed content below.{' '}
          <strong>An image on its own is enough</strong> — every text field here
          is optional, so upload a designed poster and stop, or add a headline
          and body to have the app draw the copy over it.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        {/* ── Content ─────────────────────────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="bn-category">Category tag</Label>
            <Select
              value={categoryTag}
              onValueChange={(v) => setCategoryTag(v as BannerCategoryTag)}
            >
              <SelectTrigger id="bn-category">
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
            <Label htmlFor="bn-tagtext">Tag text</Label>
            <Input
              id="bn-tagtext"
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
              placeholder="FIRST VISIT OFFER"
            />
            <p className="text-muted-foreground text-xs">
              Optional. Internal label kept for older banners; not shown on the
              card.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bn-title">Title</Label>
          <Input
            id="bn-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Home visits now book in two taps"
          />
          <p className="text-muted-foreground text-xs">
            Optional. Ellipsized after three lines on the card, shown in full in
            the reader.{' '}
            <strong>Leave it empty for a picture-only banner</strong> — the
            badge, date and headline overlay all disappear and the artwork shows
            on its own.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bn-detail">Detailed content</Label>
          <Textarea
            id="bn-detail"
            rows={8}
            value={detailContent}
            onChange={(e) => setDetailContent(e.target.value)}
            placeholder={
              'Home visits can now be booked in two taps.\n\n' +
              'Pick a service, confirm your address, and the nearest ' +
              'available provider is dispatched.'
            }
          />
          <p className="text-muted-foreground text-xs">
            Plain text — leave a blank line between paragraphs and the app
            renders them separately. Markdown is not interpreted. Leave empty to
            show the headline alone.
          </p>
        </div>

        <Separator />

        {/* ── Artwork ─────────────────────────────────────────────── */}
        <ImageUploader
          label="Artwork"
          currentUrl={banner?.imageUrl ?? null}
          file={file}
          onFileChange={setFile}
          // The gradient is what the app paints around artwork that does not
          // fill the card, so the preview sits on it rather than on grey.
          previewBackground={gradientPreview}
          previewClassName="h-16 w-28"
          targetAspect={TARGET_RATIO}
          hint={`Recommended: ${RECOMMENDED_WIDTH} × ${RECOMMENDED_HEIGHT} px (portrait 3:5), under 300 KB. The card is a fixed portrait box — 65% of the screen tall — and your image fills it edge to edge, so anything off-ratio gets trimmed. Landscape artwork is the exception: it is shown whole on the banner's gradient instead. If you are also setting a title, leave the lower third clear — that is where the badge, date and headline sit.${editing ? ' Leave it alone to keep the current image.' : ''}`}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="bn-grad-from">Gradient start</Label>
            <Input
              id="bn-grad-from"
              value={gradientFrom}
              onChange={(e) => setGradientFrom(e.target.value)}
              placeholder="#4C1D95"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bn-grad-to">Gradient end</Label>
            <Input
              id="bn-grad-to"
              value={gradientTo}
              onChange={(e) => setGradientTo(e.target.value)}
              placeholder="#8B5CF6"
            />
          </div>
        </div>
        <p className="text-muted-foreground -mt-2 text-xs">
          Shown behind the card while the image loads, and instead of it when
          there is none.
        </p>

        <Separator />

        {/* ── Scheduling ──────────────────────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="bn-start">Starts</Label>
            <Input
              id="bn-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bn-end">Ends</Label>
            <Input
              id="bn-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bn-priority">Priority</Label>
            <Input
              id="bn-priority"
              type="number"
              value={priorityOrder}
              onChange={(e) => setPriorityOrder(e.target.value)}
              placeholder="Auto"
            />
          </div>
        </div>
        <p className="text-muted-foreground -mt-2 text-xs">
          Leave both dates empty to run the banner indefinitely. The start date
          is also what the app prints as the bulletin&apos;s date. Lower
          priority shows first.
        </p>

        <div className="flex items-center gap-3">
          <Switch
            id="bn-active"
            checked={isActive}
            onCheckedChange={setIsActive}
          />
          <Label htmlFor="bn-active">Visible in the patient app</Label>
        </div>

        <Separator />

        {/* ── Action ──────────────────────────────────────────────── */}
        <div className="space-y-2">
          <Label htmlFor="bn-action">Reader button</Label>
          <Select
            value={actionType}
            onValueChange={(v) => setActionType(v as BannerActionType)}
          >
            <SelectTrigger id="bn-action">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BANNER_ACTION_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {BANNER_ACTION_LABEL[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            Where the button inside the reader sends the patient. Choose
            &ldquo;Nothing&rdquo; for a pure announcement — the reader then
            offers only Close.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bn-button">Button label</Label>
          <Input
            id="bn-button"
            value={buttonText}
            onChange={(e) => setButtonText(e.target.value)}
            placeholder="Book now"
          />
          <p className="text-muted-foreground text-xs">
            Optional. Labels the button in the reader; leave it empty and the
            reader offers only Close.
          </p>
        </div>

        {actionType === 'SERVICE' && (
          <TargetPicker
            id="bn-service"
            label="Service"
            value={targetServiceId}
            onChange={setTargetServiceId}
            queryKey={qk.services}
            load={services.list}
            optionsOf={(rows) =>
              rows
                .filter(isServiceActive)
                .map((s) => ({ value: s.id, label: s.title || s.titleEn || s.id }))
            }
            emptyLabel="Open the booking form"
            help="Which service the reader button opens. Only active services are listed."
          />
        )}
        {actionType === 'CATEGORY' && (
          <TargetPicker
            id="bn-cat"
            label="Service category"
            value={targetCategoryId}
            onChange={setTargetCategoryId}
            queryKey={qk.categories}
            load={categories.list}
            /*
             * Keyed on SLUG, not the row id. The patient app filters the
             * catalog by slug (`categorySlugFor` in service_catalog_screen),
             * so an id here silently matches nothing — which is precisely the
             * failure a free-text box made easy to ship.
             */
            optionsOf={(rows) =>
              rows
                .filter((c) => c.isActive !== false && c.slug)
                .map((c) => ({
                  value: c.slug as string,
                  label: c.nameEn || (c.slug as string),
                }))
            }
            emptyLabel="Open the booking form"
            help="Which category the reader button filters the catalog to."
          />
        )}
        {actionType === 'EXTERNAL_URL' && (
          <div className="space-y-2">
            <Label htmlFor="bn-url">Link</Label>
            <Input
              id="bn-url"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://taafi.com/updates"
            />
          </div>
        )}
        {actionType === 'CUSTOM_ROUTE' && (
          <div className="space-y-2">
            <Label htmlFor="bn-route">App screen</Label>
            {/* A datalist rather than a Select: the presets are the routes
                worth one click, but `service:<id>` and a full https:// link
                are valid too, and a route added to a newer app build has to be
                typeable before this list catches up. */}
            <Input
              id="bn-route"
              list="bn-route-presets"
              value={targetRoute}
              onChange={(e) => setTargetRoute(e.target.value)}
              placeholder="activities:history"
            />
            <datalist id="bn-route-presets">
              {BANNER_ROUTE_PRESETS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </datalist>
            <p className="text-muted-foreground text-xs">
              An in-app screen, not a web address. Pick one from the list, or
              type <code>service:&lt;id&gt;</code> to open a specific service.
              The server rejects a screen the app cannot open.
            </p>
          </div>
        )}
        {actionType === 'PROMO_CODE' && (
          <div className="space-y-2">
            <Label htmlFor="bn-promo">Promo code</Label>
            <Input
              id="bn-promo"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
              placeholder="FIRST500"
            />
          </div>
        )}
      </div>

      <DialogFooter className="sm:items-center">
        {/* Says why Save is disabled. Without it the only unmet requirement
            left on this form is invisible, since no field is marked. */}
        {!hasImage && !title.trim() ? (
          <p className="text-muted-foreground mr-auto text-xs">
            Add an image or a title to save.
          </p>
        ) : null}
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => save.mutate()} disabled={!canSave}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          {editing ? 'Save changes' : 'Create banner'}
        </Button>
      </DialogFooter>
    </>
  );
}
