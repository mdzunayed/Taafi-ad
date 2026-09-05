'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
  categories,
  services,
  type CategoryWire,
  type ServiceWire,
} from '@/lib/api/content';
import { qk } from '@/lib/api/query-keys';
import { normalizeError } from '@/lib/api/errors';
import { money } from '@/lib/format';

/**
 * Create / edit a catalog service.
 *
 * Follows `banner-form-dialog.tsx`: plain `useState` per field, a derived
 * `canSave` boolean, and no schema validation — `react-hook-form` and `zod`
 * are in package.json and used nowhere in this console, by decision.
 *
 * Three API constraints worth knowing before editing this file:
 *
 *  - The write is **multipart** (the image rides along) and `Content-Type`
 *    must never be set by hand — doing so drops the boundary and the server
 *    receives an empty body.
 *  - `POST /api/services` **requires an image**; `PUT` does not, and is
 *    partial, so the image key is only sent when a new file was picked —
 *    otherwise saving a text edit would blank the artwork.
 *  - `categoryIds` is always sent, including empty. The server reads an absent
 *    key as "leave the assignments alone" and `[]` as "clear them", so
 *    unticking the last pill only works if the empty array is transmitted.
 *
 * PRICING IS OPTIONAL, AND THERE IS ONLY ONE FIELD FOR IT. This form used to
 * ask for a required "Catalog price" AND an optional "Default base fee", two
 * numbers that meant the same thing. `defaultBaseFee` absorbed both; the
 * server mirrors it into the legacy `price` column on write, so nothing here
 * sends `price`. Blank is a real answer — it means the cost is assessed on the
 * review call, and it reaches the operator's fee dialog as an empty box rather
 * than a figure nobody agreed.
 */

// Mirrors PROVIDER_TYPES in backend/src/utils/providerTypes.js. An untagged
// service is not "nurse" — the read boundary infers a role from the title so a
// legacy row still yields correct patient copy, which is what `null` preserves.
const PROVIDER_TYPES = ['DOCTOR', 'NURSE', 'PHYSIOTHERAPIST', 'LAB_TECH'] as const;
const PROVIDER_LABEL: Record<string, string> = {
  DOCTOR: 'Doctor',
  NURSE: 'Nurse',
  PHYSIOTHERAPIST: 'Physiotherapist',
  LAB_TECH: 'Lab technician',
};

/** Radix forbids an empty `SelectItem` value, so "untagged" needs a sentinel. */
const UNTAGGED = '__untagged__';

/** A stored number becomes a form string; `undefined`/`null` becomes blank. */
function toInput(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * The trigger and the sheet shell. Deliberately holds nothing but `open`.
 *
 * Every field lives in [ServiceForm], which Radix mounts on open and unmounts
 * on close — so each open re-seeds from `service` and a cancelled edit leaves
 * nothing behind, without an effect to perform the reset.
 *
 * A slide-over rather than a dialog: this form is long (pricing, provider type,
 * artwork, and a checkbox per category pill), and a panel that keeps the
 * catalog visible beside it is easier to work down than a modal that covers it.
 */
export function ServiceFormSheet({ service }: { service?: ServiceWire }) {
  const editing = service !== undefined;
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
            aria-label="Edit service"
          >
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            Add service
          </Button>
        )}

        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <ServiceForm service={service} onClose={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </DisabledWhenDenied>
  );
}

function ServiceForm({
  service,
  onClose,
}: {
  service?: ServiceWire;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const editing = service !== undefined;

  const [title, setTitle] = useState(service?.title ?? service?.titleEn ?? '');
  const [description, setDescription] = useState(service?.description ?? '');
  const [duration, setDuration] = useState(service?.duration ?? '');

  // The default operator quote. Both halves optional — a service priced on the
  // review call is a normal thing to have in the catalog.
  const [baseFee, setBaseFee] = useState(toInput(service?.defaultBaseFee));
  const [deposit, setDeposit] = useState(toInput(service?.defaultAdvanceDeposit));

  const [providerType, setProviderType] = useState(
    service?.provider_type ?? UNTAGGED,
  );
  const [urgent, setUrgent] = useState(service?.isUrgentAvailable ?? false);
  const [isActive, setIsActive] = useState(service?.isActive ?? true);
  const [pillIds, setPillIds] = useState<string[]>(service?.categoryIds ?? []);

  const [file, setFile] = useState<File | null>(null);

  // The pills an admin can tick. Shares the cache with the categories table.
  const pills = useQuery({
    queryKey: qk.categories,
    queryFn: categories.list,
    staleTime: 300_000,
  });

  const baseFeeNum = baseFee.trim() === '' ? null : Number(baseFee);
  const depositNum = deposit.trim() === '' ? null : Number(deposit);

  // Mirrors the server rule in routes/services.js. A catalog row holding this
  // pair would auto-fill a combination `set-deposit` rejects outright, so it
  // is blocked here too — while the operator is typing, not after saving.
  // Blank on either side is not a conflict: there is nothing to compare.
  const unpayablePair =
    baseFeeNum !== null && depositNum !== null && depositNum > baseFeeNum;

  // NOTE: no pricing term here. A service with both money fields blank is
  // valid and savable — that is the point of this screen.
  const canSave =
    title.trim() !== '' &&
    (baseFeeNum === null || baseFeeNum >= 0) &&
    (depositNum === null || depositNum >= 0) &&
    !unpayablePair &&
    // POST requires an image; PUT keeps the existing one.
    (editing || file !== null);

  const save = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('title', title.trim());
      fd.append('description', description.trim());
      fd.append('duration', duration.trim());
      // No `price` key. The server mirrors `defaultBaseFee` into that legacy
      // column itself — see `resolvePriceMirror` in routes/services.js.
      //
      // Blank means "unpin": the server reads '' as null and stores null,
      // rather than the ৳0 that `Number('')` would produce. Nothing derives a
      // replacement any more, so a blank fee genuinely reaches the operator's
      // dialog as an empty box.
      fd.append('defaultBaseFee', baseFee.trim());
      fd.append('defaultAdvanceDeposit', deposit.trim());
      fd.append('isUrgentAvailable', String(urgent));
      fd.append('status', isActive ? 'active' : 'inactive');
      fd.append('provider_type', providerType === UNTAGGED ? '' : providerType);
      // Always sent, empty included — see the file header.
      fd.append('categoryIds', JSON.stringify(pillIds));
      if (file) fd.append('image', file);
      return editing ? services.update(service.id, fd) : services.create(fd);
    },
    onSuccess: () => {
      toast.success(editing ? 'Service updated.' : 'Service created.');
      queryClient.invalidateQueries({ queryKey: qk.services });
      onClose();
    },
    onError: (error) => toast.error(normalizeError(error).message),
  });

  function togglePill(id: string, on: boolean) {
    setPillIds((ids) =>
      on ? [...new Set([...ids, id])] : ids.filter((x) => x !== id),
    );
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{editing ? 'Edit service' : 'Add service'}</SheetTitle>
        <SheetDescription>
          What patients can book, and what the booking fee dialog suggests when
          an operator quotes it.
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-4 px-4 pb-4">
        <div className="space-y-2">
          <Label htmlFor="svc-title">Service name</Label>
          <Input
            id="svc-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="BMDC Registered Doctor Visit"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="svc-description">Description</Label>
          <Textarea
            id="svc-description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What the visit covers…"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="svc-duration">Duration</Label>
          <Input
            id="svc-duration"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="45 mins"
          />
        </div>

        <Separator />

        <div>
          <h3 className="text-sm font-medium">Default Operator Quote (Optional)</h3>
          <p className="text-muted-foreground text-xs">
            What the &ldquo;Set fee and advance deposit&rdquo; dialog pre-fills
            when an operator picks this service. They can always override it.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="svc-base-fee">Estimated Base Fee (Optional)</Label>
            <Input
              id="svc-base-fee"
              type="number"
              min={0}
              inputMode="decimal"
              value={baseFee}
              onChange={(e) => setBaseFee(e.target.value)}
              placeholder="Variable"
            />
            <p className="text-muted-foreground text-xs">
              Internal reference for operators during call consultations. Leave
              blank if pricing is fully variable.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="svc-deposit">Default Advance Deposit (Optional)</Label>
            <Input
              id="svc-deposit"
              type="number"
              min={0}
              inputMode="decimal"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Suggested deposit amount. Leave blank to apply platform defaults.
            </p>
          </div>
        </div>

        {unpayablePair && (
          <Alert variant="destructive">
            <AlertDescription>
              The deposit is more than the {money(baseFeeNum)} base fee. A
              booking quoted from this service would be rejected.
            </AlertDescription>
          </Alert>
        )}

        <Separator />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="svc-provider">Who attends</Label>
            <Select value={providerType} onValueChange={setProviderType}>
              <SelectTrigger id="svc-provider" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNTAGGED}>Untagged — infer it</SelectItem>
                {PROVIDER_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {PROVIDER_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {providerType === UNTAGGED && service?.provider_type && (
              <p className="text-muted-foreground text-xs">
                Currently inferred as {PROVIDER_LABEL[service.provider_type] ??
                  service.provider_type}
                . This wording reaches the patient&rsquo;s tracker.
              </p>
            )}
          </div>

          <ImageUploader
            label="Image"
            required={!editing}
            currentUrl={service?.imageUrl ?? null}
            file={file}
            onFileChange={setFile}
            hint={
              editing
                ? 'Optional — leave it alone and the current image is kept.'
                : 'Required. The server refuses a new service without one.'
            }
          />
        </div>

        <div className="space-y-2">
          <Label>Home categories</Label>
          <p className="text-muted-foreground text-xs">
            Which pills this service appears under. A service tagged with none
            is catalog-only — there is no &ldquo;All&rdquo; pill for it to fall
            back to.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(pills.data ?? []).map((c: CategoryWire) => (
              <label
                key={c.id}
                className="flex items-center gap-2 text-sm"
                htmlFor={`pill-${c.id}`}
              >
                <Checkbox
                  id={`pill-${c.id}`}
                  checked={pillIds.includes(c.id)}
                  onCheckedChange={(on) => togglePill(c.id, on === true)}
                />
                <span>{c.nameEn ?? c.slug}</span>
                {c.isActive === false && (
                  <span className="text-muted-foreground text-xs">(hidden)</span>
                )}
              </label>
            ))}
            {pills.data?.length === 0 && (
              <p className="text-muted-foreground text-xs">
                No categories yet — create one first.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label htmlFor="svc-urgent">Urgent available</Label>
            <p className="text-muted-foreground text-xs">
              Can be dispatched as a same-day visit.
            </p>
          </div>
          <Switch id="svc-urgent" checked={urgent} onCheckedChange={setUrgent} />
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label htmlFor="svc-active">Live</Label>
            <p className="text-muted-foreground text-xs">
              Off hides it from the app catalog and the booking pickers
              immediately.
            </p>
          </div>
          <Switch
            id="svc-active"
            checked={isActive}
            onCheckedChange={setIsActive}
          />
        </div>
      </div>

      <SheetFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          {editing ? 'Save service' : 'Create service'}
        </Button>
      </SheetFooter>
    </>
  );
}
