'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { DisabledWhenDenied } from '@/components/rbac/can';
import { ImageUploader } from '@/components/common/image-uploader';
import { categories, type CategoryWire } from '@/lib/api/content';
import { qk } from '@/lib/api/query-keys';
import { normalizeError } from '@/lib/api/errors';

/**
 * Create / edit a Home category pill.
 *
 * Same shape as `banner-form-dialog.tsx` — plain `useState`, a derived
 * `canSave`, no schema validation — and, since `/api/categories` grew an
 * `upload.single('icon')`, the same multipart write.
 *
 * Three constraints carried over from the banner dialog, all of which bite:
 *
 *  - Never set `Content-Type` on a `FormData` request. Doing so drops the
 *    multipart boundary and the server receives an empty body.
 *  - `PUT` is partial (and aliased onto the same handler as `PATCH`), so the
 *    `icon` key is sent ONLY when a new file was picked — otherwise saving a
 *    rename would blank the artwork.
 *  - Clearing is therefore its own signal: an explicit empty `iconUrl`, which
 *    the server reads as "set it to null".
 */

/** Mirrors SAFE_SLUG in backend/src/routes/categories.js. */
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Mirrors `slugify` — shown as a preview so the derived slug is never a surprise. */
function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function CategoryFormDialog({ category }: { category?: CategoryWire }) {
  const editing = category !== undefined;
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
            aria-label="Edit category"
          >
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            Add category
          </Button>
        )}

        {/* Radix unmounts these children on close, so each open re-seeds from
            `category` and a cancelled edit leaves nothing behind. */}
        <DialogContent
          mobileFullscreen
          className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
        >
          <CategoryForm category={category} onClose={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </DisabledWhenDenied>
  );
}

function CategoryForm({
  category,
  onClose,
}: {
  category?: CategoryWire;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const editing = category !== undefined;

  const [nameEn, setNameEn] = useState(category?.nameEn ?? '');
  const [nameBn, setNameBn] = useState(category?.nameBn ?? '');
  const [descriptionEn, setDescriptionEn] = useState(category?.descriptionEn ?? '');
  const [descriptionBn, setDescriptionBn] = useState(category?.descriptionBn ?? '');
  /**
   * `iconUrl` holds what the SERVER currently has; `file` holds a replacement
   * that has not been uploaded yet. Keeping them apart is what makes "leave the
   * icon alone" distinguishable from "remove it" — the two cases send
   * different bodies.
   */
  const [iconUrl, setIconUrl] = useState(category?.iconUrl ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [displayOrder, setDisplayOrder] = useState(
    category?.displayOrder === undefined ? '' : String(category.displayOrder),
  );
  const [isActive, setIsActive] = useState(category?.isActive ?? true);
  const [showOnHomeRail, setShowOnHomeRail] = useState(
    category?.showOnHomeRail ?? true,
  );

  // Only sent when the admin expands Advanced and edits it — see the warning
  // rendered beside the field.
  const [slug, setSlug] = useState(category?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(false);

  // Derived, not stored: an object URL is a pure function of the picked file.
  // The effect's only job is freeing the previous one.
  const derivedSlug = slugify(nameEn);
  const effectiveSlug = slugTouched && slug.trim() !== '' ? slug.trim() : derivedSlug;
  const slugInvalid = effectiveSlug !== '' && !SAFE_SLUG.test(effectiveSlug);

  const canSave = nameEn.trim() !== '' && effectiveSlug !== '' && !slugInvalid;

  const save = useMutation({
    mutationFn: () => {
      // Multipart, because the icon rides along. Every value is a string on
      // the wire; the server coerces the booleans and the number.
      const fd = new FormData();
      fd.append('nameEn', nameEn.trim());
      fd.append('nameBn', nameBn.trim());
      fd.append('descriptionEn', descriptionEn.trim());
      fd.append('descriptionBn', descriptionBn.trim());
      fd.append('isActive', String(isActive));
      fd.append('showOnHomeRail', String(showOnHomeRail));
      if (displayOrder.trim() !== '') fd.append('displayOrder', displayOrder.trim());
      // On create the server derives the slug from nameEn when none is sent.
      // On edit it is only sent when deliberately changed: re-pointing a pill
      // at a different set of services must be an explicit act.
      if (!editing || slugTouched) fd.append('slug', effectiveSlug);

      // Three-way, and the third case is why `iconUrl` and `file` are separate
      // state: a new file replaces, an emptied `iconUrl` clears, and sending
      // NEITHER key leaves the stored icon untouched through a text-only edit.
      if (file) {
        fd.append('icon', file);
      } else if (iconUrl.trim() === '' && category?.iconUrl) {
        fd.append('iconUrl', '');
      }

      return editing ? categories.update(category.id, fd) : categories.create(fd);
    },
    onSuccess: () => {
      toast.success(editing ? 'Category updated.' : 'Category created.');
      queryClient.invalidateQueries({ queryKey: qk.categories });
      // A renamed slug re-points every service assigned to this pill.
      queryClient.invalidateQueries({ queryKey: qk.services });
      onClose();
    },
    onError: (error) => toast.error(normalizeError(error).message),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? 'Edit category' : 'Add category'}</DialogTitle>
        <DialogDescription>
          A filter pill on the patient Home screen, and the group services are
          tagged into.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cat-name-en">Name</Label>
            <Input
              id="cat-name-en"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder="Doctor Consultation"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-name-bn">Bengali name</Label>
            <Input
              id="cat-name-bn"
              value={nameBn}
              onChange={(e) => setNameBn(e.target.value)}
              placeholder="ডাক্তার পরামর্শ"
            />
            <p className="text-muted-foreground text-xs">
              Optional — renders as a second line under the English name.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cat-desc-en">Description</Label>
          <Textarea
            id="cat-desc-en"
            rows={2}
            value={descriptionEn}
            onChange={(e) => setDescriptionEn(e.target.value)}
            placeholder="Licensed doctors visiting your home for consultations"
          />
          <p className="text-muted-foreground text-xs">
            Shown under the title on the category&rsquo;s own screen.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cat-desc-bn">Bengali description</Label>
          <Textarea
            id="cat-desc-bn"
            rows={2}
            value={descriptionBn}
            onChange={(e) => setDescriptionBn(e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ImageUploader
            label="Icon"
            shape="circle"
            currentUrl={iconUrl || null}
            file={file}
            onFileChange={setFile}
            // The third leg of the three-way write: this is what makes an
            // emptied `iconUrl` reach the server as an explicit clear.
            onClear={() => setIconUrl('')}
            targetAspect={1}
            hint="Optional — the pill renders its label alone without one. Square, under 100 KB."
          />

          <div className="space-y-2">
            <Label htmlFor="cat-order">Rail order</Label>
            <Input
              id="cat-order"
              type="number"
              inputMode="numeric"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(e.target.value)}
              placeholder="Appended to the end"
            />
            <p className="text-muted-foreground text-xs">
              Lowest first, left to right.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label htmlFor="cat-rail">Show on Home rail</Label>
            <p className="text-muted-foreground text-xs">
              Off keeps the category real and joinable, just without a pill.
            </p>
          </div>
          <Switch
            id="cat-rail"
            checked={showOnHomeRail}
            onCheckedChange={setShowOnHomeRail}
          />
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label htmlFor="cat-active">Active</Label>
            <p className="text-muted-foreground text-xs">
              Off hides it everywhere. Services tagged only with it drop off
              Home — there is no &ldquo;All&rdquo; pill to catch them.
            </p>
          </div>
          <Switch
            id="cat-active"
            checked={isActive}
            onCheckedChange={setIsActive}
          />
        </div>

        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="px-0">
              Advanced
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2">
            <Label htmlFor="cat-slug">Slug</Label>
            <Input
              id="cat-slug"
              value={slugTouched ? slug : derivedSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              placeholder={derivedSlug}
            />
            {slugInvalid ? (
              <p className="text-destructive text-xs">
                Lowercase letters, digits and single hyphens only.
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                Derived from the name unless you change it.
              </p>
            )}
            {editing && slugTouched && effectiveSlug !== category.slug && (
              <Alert variant="destructive">
                <AlertDescription>
                  The slug is the join key, not a label. Changing it re-points
                  this pill at a different set of services — renaming a category
                  does not need it.
                </AlertDescription>
              </Alert>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          {editing ? 'Save category' : 'Create category'}
        </Button>
      </DialogFooter>
    </>
  );
}
