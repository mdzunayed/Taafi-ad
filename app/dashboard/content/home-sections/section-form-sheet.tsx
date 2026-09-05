'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { DisabledWhenDenied } from '@/components/rbac/can';
import { ImageUploader } from '@/components/common/image-uploader';
import { PhonePreview } from './phone-preview';
import {
  categories,
  homeSections,
  isServiceActive,
  newSectionItemId,
  services,
  type HomeLayoutType,
  type HomeSectionWire,
} from '@/lib/api/content';
import { normalizeError } from '@/lib/api/errors';
import { qk } from '@/lib/api/query-keys';
import { humanize } from '@/lib/format';

/** Mirrors `DynamicSection.uiTemplate`, the enum every write path validates against. */
const UI_TEMPLATES = [
  'HORIZONTAL_ROUND_AVATAR',
  'HORIZONTAL_PRODUCT_CARD',
  'GRID_2X2_TILES',
  'SINGLE_WIDE_BANNER',
] as const;

const LAYOUT_TYPES: HomeLayoutType[] = ['CAROUSEL', 'GRID_2_COL', 'LIST'];

const TARGET_TYPES = ['SERVICE', 'CUSTOM_ROUTE', 'EXTERNAL_URL', 'NONE'] as const;
type TargetType = (typeof TARGET_TYPES)[number];

/**
 * A card being edited. `imageUrl` is the SAVED url and `file` is a pick that has
 * not been uploaded yet — the two are separate because the server refuses a
 * section whose cards have no `imageUrl`, so a pending file has to become a URL
 * before the section can be saved at all (see the upload pass in `save`).
 */
interface DraftCard {
  itemId: string;
  title: string;
  subtitle: string;
  badgeText: string;
  priceTag: string;
  imageUrl: string;
  file: File | null;
  targetType: TargetType;
  serviceId: string;
  customRoute: string;
  categoryId: string;
  isActive: boolean;
}

function toDraft(raw: Record<string, unknown>): DraftCard {
  const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
  // `serviceId` and `categoryId` arrive populated on a read and bare on a write,
  // so both shapes have to collapse to an id here or an untouched card would be
  // sent back with an object where the server wants a string.
  const idOf = (v: unknown): string => {
    if (!v) return '';
    if (typeof v === 'object') return str((v as { id?: string; _id?: string }).id ?? (v as { _id?: string })._id);
    return str(v);
  };
  return {
    itemId: str(raw.itemId) || newSectionItemId(),
    title: str(raw.title),
    subtitle: str(raw.subtitle),
    badgeText: str(raw.badgeText),
    priceTag: str(raw.priceTag),
    imageUrl: str(raw.imageUrl),
    file: null,
    targetType: (TARGET_TYPES as readonly string[]).includes(str(raw.targetType))
      ? (str(raw.targetType) as TargetType)
      : 'NONE',
    serviceId: idOf(raw.serviceId),
    customRoute: str(raw.customRoute),
    categoryId: idOf(raw.categoryId),
    isActive: raw.isActive !== false,
  };
}

function emptyDraft(): DraftCard {
  return {
    itemId: newSectionItemId(),
    title: '',
    subtitle: '',
    badgeText: '',
    priceTag: '',
    imageUrl: '',
    file: null,
    targetType: 'NONE',
    serviceId: '',
    customRoute: '',
    categoryId: '',
    isActive: true,
  };
}

/**
 * Trigger + sheet shell, holding nothing but `open`.
 *
 * Radix unmounts the body on close, so [SectionForm] re-initialises from the
 * row on every open and an abandoned edit leaves no state behind — the same
 * reset trick the banner dialog uses, which matters more here because this form
 * holds a whole array of draft cards.
 */
export function SectionFormSheet({ section }: { section?: HomeSectionWire }) {
  const editing = section !== undefined;
  const [open, setOpen] = useState(false);

  return (
    <DisabledWhenDenied
      capability="content.write"
      reason="Only an admin can change what patients see."
    >
      <Sheet open={open} onOpenChange={setOpen}>
        {editing ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(true)}
            aria-label={`Edit ${section.titleEn ?? 'section'}`}
          >
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            Add section
          </Button>
        )}

        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          <SectionForm section={section} onClose={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </DisabledWhenDenied>
  );
}

function SectionForm({
  section,
  onClose,
}: {
  section?: HomeSectionWire;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const editing = section !== undefined;

  const [sectionKey, setSectionKey] = useState(section?.sectionKey ?? '');
  const [titleEn, setTitleEn] = useState(section?.titleEn ?? '');
  const [titleBn, setTitleBn] = useState(section?.titleBn ?? '');
  const [uiTemplate, setUiTemplate] = useState<string>(
    section?.uiTemplate ?? 'HORIZONTAL_PRODUCT_CARD',
  );
  const [layoutType, setLayoutType] = useState<HomeLayoutType>(
    section?.layoutType ?? 'CAROUSEL',
  );
  const [orderIndex, setOrderIndex] = useState(
    section?.orderIndex === undefined ? '' : String(section.orderIndex),
  );
  const [isActive, setIsActive] = useState(section?.isActive ?? true);
  const [titleColorLight, setTitleColorLight] = useState(
    section?.styleTokens?.titleColorLight ?? '',
  );
  const [titleColorDark, setTitleColorDark] = useState(
    section?.styleTokens?.titleColorDark ?? '',
  );
  const [sectionBackgroundColor, setSectionBackgroundColor] = useState(
    section?.styleTokens?.sectionBackgroundColor ?? '',
  );
  const [cards, setCards] = useState<DraftCard[]>(
    (section?.contentData ?? []).map(toDraft),
  );

  const serviceQuery = useQuery({ queryKey: qk.services, queryFn: services.list });
  const categoryQuery = useQuery({ queryKey: qk.categories, queryFn: categories.list });

  function patchCard(index: number, patch: Partial<DraftCard>) {
    setCards((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function moveCard(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= cards.length) return;
    setCards((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  const save = useMutation({
    mutationFn: async () => {
      /*
       * Images first. `sanitizeItems` on the server rejects any card without an
       * `imageUrl`, and the section is saved as one whole-array replace — so a
       * card holding only a File would fail the save outright. Each pending file
       * is uploaded under its card's own `itemId`, which doubles as the image's
       * storage publicId, then the returned URL takes its place.
       */
      const resolved = await Promise.all(
        cards.map(async (card) => {
          if (!card.file) return card;
          const imageUrl = await homeSections.uploadImage(card.itemId, card.file);
          return { ...card, imageUrl, file: null };
        }),
      );

      const contentData = resolved.map((card) => ({
        itemId: card.itemId,
        title: card.title.trim(),
        subtitle: card.subtitle.trim(),
        badgeText: card.badgeText.trim(),
        priceTag: card.priceTag.trim(),
        imageUrl: card.imageUrl,
        isActive: card.isActive,
        targetType: card.targetType,
        // Only the field its target type actually uses; the server derives
        // `navigationRoute` from these and 400s on a SERVICE card with no id.
        serviceId: card.targetType === 'SERVICE' ? card.serviceId : null,
        customRoute:
          card.targetType === 'CUSTOM_ROUTE' || card.targetType === 'EXTERNAL_URL'
            ? card.customRoute.trim()
            : '',
        categoryId: card.categoryId || null,
      }));

      // JSON, not FormData: these two handlers have no multer in front of them.
      const body: Record<string, unknown> = {
        titleEn: titleEn.trim(),
        titleBn: titleBn.trim(),
        uiTemplate,
        layoutType,
        isActive,
        contentData,
        styleTokens: {
          titleColorLight: titleColorLight.trim() || null,
          titleColorDark: titleColorDark.trim() || null,
          sectionBackgroundColor: sectionBackgroundColor.trim() || null,
        },
      };
      if (orderIndex.trim() !== '') body.orderIndex = Number(orderIndex.trim());
      // Immutable after create: the key is how the patient app recognises a
      // section, so renaming one silently orphans whatever keys off it.
      if (!editing) body.sectionKey = sectionKey.trim();

      return editing
        ? homeSections.update(section.id, body)
        : homeSections.create(body);
    },
    onSuccess: () => {
      toast.success(editing ? 'Section updated.' : 'Section created.');
      void queryClient.invalidateQueries({ queryKey: qk.homeSections });
      onClose();
    },
    onError: (error) => toast.error(normalizeError(error).message),
  });

  /*
   * Mirrors what the server enforces, so a save fails here rather than as a 400
   * after the images have already been uploaded:
   *   • titleEn and (on create) sectionKey are required
   *   • every card needs a title and an image — a File counts, it becomes a URL
   *   • a SERVICE card needs a service, an EXTERNAL_URL card needs a URL
   */
  const cardsValid = cards.every(
    (c) =>
      c.title.trim() &&
      (c.imageUrl || c.file) &&
      (c.targetType !== 'SERVICE' || c.serviceId) &&
      (c.targetType !== 'EXTERNAL_URL' || /^https?:\/\//i.test(c.customRoute.trim())) &&
      (c.targetType !== 'CUSTOM_ROUTE' || c.customRoute.trim()),
  );
  const canSave =
    Boolean(titleEn.trim()) &&
    (editing || Boolean(sectionKey.trim())) &&
    cardsValid &&
    !save.isPending;

  const previewCards = cards
    .filter((c) => c.isActive)
    .map((c) => ({
      id: c.itemId,
      title: c.title || 'Untitled card',
      category: c.badgeText || c.subtitle || undefined,
      imageUrl: c.file ? undefined : c.imageUrl || undefined,
    }));

  return (
    <>
      <SheetHeader>
        <SheetTitle>{editing ? 'Edit section' : 'Add a home section'}</SheetTitle>
        <SheetDescription>
          Sections render below Care Services on the patient home feed, in the
          order set on the table behind this panel.
        </SheetDescription>
      </SheetHeader>

      <div className="grid gap-5 px-4 pb-4">
        {/* ── The section itself ──────────────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sec-title-en">
              Title<span className="text-destructive ml-0.5">*</span>
            </Label>
            <Input
              id="sec-title-en"
              value={titleEn}
              onChange={(e) => setTitleEn(e.target.value)}
              placeholder="Popular right now"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sec-title-bn">Bengali title</Label>
            <Input
              id="sec-title-bn"
              value={titleBn}
              onChange={(e) => setTitleBn(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sec-key">
            Section key{!editing && <span className="text-destructive ml-0.5">*</span>}
          </Label>
          <Input
            id="sec-key"
            value={sectionKey}
            disabled={editing}
            onChange={(e) => setSectionKey(e.target.value)}
            placeholder="POPULAR_NOW"
            className="font-mono text-xs"
          />
          <p className="text-muted-foreground text-xs">
            {editing
              ? 'Fixed after creation — the app identifies the section by this, so renaming it would orphan anything keyed off it.'
              : 'A stable identifier, unique across sections. Uppercase with underscores by convention.'}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="sec-template">Card template</Label>
            <Select value={uiTemplate} onValueChange={setUiTemplate}>
              <SelectTrigger id="sec-template">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UI_TEMPLATES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {humanize(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">What a card looks like.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sec-layout">Arrangement</Label>
            <Select
              value={layoutType}
              onValueChange={(v) => setLayoutType(v as HomeLayoutType)}
            >
              <SelectTrigger id="sec-layout">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LAYOUT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {humanize(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">How they are laid out.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sec-order">Order</Label>
            <Input
              id="sec-order"
              type="number"
              value={orderIndex}
              onChange={(e) => setOrderIndex(e.target.value)}
              placeholder="0"
            />
            <p className="text-muted-foreground text-xs">
              Or drag the row on the table.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="sec-c-light">Title colour (light)</Label>
            <Input
              id="sec-c-light"
              value={titleColorLight}
              onChange={(e) => setTitleColorLight(e.target.value)}
              placeholder="#111827"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sec-c-dark">Title colour (dark)</Label>
            <Input
              id="sec-c-dark"
              value={titleColorDark}
              onChange={(e) => setTitleColorDark(e.target.value)}
              placeholder="#F9FAFB"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sec-c-bg">Background</Label>
            <Input
              id="sec-c-bg"
              value={sectionBackgroundColor}
              onChange={(e) => setSectionBackgroundColor(e.target.value)}
              placeholder="#0E0B1A"
            />
          </div>
        </div>
        <p className="text-muted-foreground -mt-3 text-xs">
          Hex colours. Leave blank to inherit the app&apos;s theme.
        </p>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="sec-active">Live</Label>
            <p className="text-muted-foreground text-xs">
              Visible on the patient home feed.
            </p>
          </div>
          <Switch id="sec-active" checked={isActive} onCheckedChange={setIsActive} />
        </div>

        <Separator />

        {/* ── Cards ───────────────────────────────────────────────── */}
        <div className="@container">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">Cards</h3>
              <p className="text-muted-foreground text-xs">
                Saved as one list — reordering here is the order patients see.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCards((prev) => [...prev, emptyDraft()])}
            >
              <Plus className="size-4" />
              Add card
            </Button>
          </div>

          <div className="mt-3 flex flex-col gap-4 @min-[900px]:flex-row">
            <div className="min-w-0 flex-1 space-y-3">
              {cards.length === 0 ? (
                <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-xs">
                  No cards yet. A section with no cards renders nothing —
                  Care&nbsp;Services is the one exception, where an empty list
                  means &ldquo;use the live catalog&rdquo;.
                </p>
              ) : null}

              {cards.map((card, index) => (
                <div key={card.itemId} className="space-y-3 rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground font-mono text-xs">
                      {card.itemId}
                    </span>
                    <div className="flex items-center gap-1">
                      <Switch
                        checked={card.isActive}
                        onCheckedChange={(v) => patchCard(index, { isActive: v })}
                        aria-label="Card visible"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        disabled={index === 0}
                        onClick={() => moveCard(index, -1)}
                        aria-label="Move card up"
                      >
                        <ChevronUp className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        disabled={index === cards.length - 1}
                        onClick={() => moveCard(index, 1)}
                        aria-label="Move card down"
                      >
                        <ChevronDown className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() =>
                          setCards((prev) => prev.filter((_, i) => i !== index))
                        }
                        aria-label="Remove card"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`card-title-${card.itemId}`}>
                        Title<span className="text-destructive ml-0.5">*</span>
                      </Label>
                      <Input
                        id={`card-title-${card.itemId}`}
                        value={card.title}
                        onChange={(e) => patchCard(index, { title: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`card-sub-${card.itemId}`}>Subtitle</Label>
                      <Input
                        id={`card-sub-${card.itemId}`}
                        value={card.subtitle}
                        onChange={(e) => patchCard(index, { subtitle: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`card-badge-${card.itemId}`}>Badge</Label>
                      <Input
                        id={`card-badge-${card.itemId}`}
                        value={card.badgeText}
                        onChange={(e) => patchCard(index, { badgeText: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`card-price-${card.itemId}`}>Price tag</Label>
                      <Input
                        id={`card-price-${card.itemId}`}
                        value={card.priceTag}
                        onChange={(e) => patchCard(index, { priceTag: e.target.value })}
                        placeholder="৳2,400"
                      />
                    </div>
                  </div>

                  <ImageUploader
                    label="Card image"
                    required
                    currentUrl={card.imageUrl || null}
                    file={card.file}
                    onFileChange={(f) => patchCard(index, { file: f })}
                    onClear={() => patchCard(index, { imageUrl: '' })}
                    hint="Required — the server refuses a card without one. Uploaded when you save."
                  />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`card-target-${card.itemId}`}>Tapping it</Label>
                      <Select
                        value={card.targetType}
                        onValueChange={(v) =>
                          patchCard(index, { targetType: v as TargetType })
                        }
                      >
                        <SelectTrigger id={`card-target-${card.itemId}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TARGET_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {humanize(t)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {card.targetType === 'SERVICE' ? (
                      <div className="space-y-2">
                        <Label htmlFor={`card-svc-${card.itemId}`}>
                          Service<span className="text-destructive ml-0.5">*</span>
                        </Label>
                        <Select
                          value={card.serviceId}
                          onValueChange={(v) => patchCard(index, { serviceId: v })}
                        >
                          <SelectTrigger id={`card-svc-${card.itemId}`}>
                            <SelectValue
                              placeholder={
                                serviceQuery.isPending ? 'Loading…' : 'Pick a service'
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {(serviceQuery.data ?? [])
                              .filter(isServiceActive)
                              .map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.title ?? s.id}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}

                    {card.targetType === 'CUSTOM_ROUTE' ||
                    card.targetType === 'EXTERNAL_URL' ? (
                      <div className="space-y-2">
                        <Label htmlFor={`card-route-${card.itemId}`}>
                          {card.targetType === 'EXTERNAL_URL' ? 'URL' : 'Route'}
                          <span className="text-destructive ml-0.5">*</span>
                        </Label>
                        <Input
                          id={`card-route-${card.itemId}`}
                          value={card.customRoute}
                          onChange={(e) =>
                            patchCard(index, { customRoute: e.target.value })
                          }
                          placeholder={
                            card.targetType === 'EXTERNAL_URL'
                              ? 'https://example.com/offer'
                              : '/booking/doctor'
                          }
                        />
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <Label htmlFor={`card-cat-${card.itemId}`}>Category pill</Label>
                      <Select
                        value={card.categoryId || 'NONE'}
                        onValueChange={(v) =>
                          patchCard(index, { categoryId: v === 'NONE' ? '' : v })
                        }
                      >
                        <SelectTrigger id={`card-cat-${card.itemId}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE">Untagged</SelectItem>
                          {(categoryQuery.data ?? []).map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.nameEn ?? c.slug ?? c.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pinned to a phone's width on purpose — see PhonePreview. */}
            <div className="shrink-0">
              <PhonePreview layoutType={layoutType} cards={previewCards} />
            </div>
          </div>
        </div>
      </div>

      <SheetFooter>
        <Button variant="outline" onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        <Button onClick={() => save.mutate()} disabled={!canSave}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          {editing ? 'Save changes' : 'Create section'}
        </Button>
      </SheetFooter>
    </>
  );
}
