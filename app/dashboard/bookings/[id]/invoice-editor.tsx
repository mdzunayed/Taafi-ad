'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Package, Plus, Stethoscope, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
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
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { setInvoice } from '@/lib/api/bookings';
import { listServiceCatalog, listSupplies } from '@/lib/api/supplies';
import { qk } from '@/lib/api/query-keys';
import { normalizeError } from '@/lib/api/errors';
import { humanize, money } from '@/lib/format';
import { TERMINAL_STATUSES, type BookingWire } from '@/types/wire/booking';
import { ArchivedInvoice } from '@/components/bookings/archived-invoice';

/**
 * The itemized invoice editor.
 *
 * ## What it sends, and what it does not
 *
 * It sends LINES. The subtotal, the discount amount and the final total are all
 * recomputed server-side from those lines
 * (`backend/src/utils/invoiceLineItems.js`) and the console's own figures are
 * never transmitted. The arithmetic below exists so the operator watches the
 * total move as they type — it is a preview of the server's answer, not the
 * answer. That is what makes a stale console bundle a display bug rather than a
 * mis-billed patient, and it is why the two implementations are allowed to
 * exist at all.
 *
 * ## Why the deposit is here and the payment is not
 *
 * Quoting the advance is part of pricing — the server writes the fee and the
 * advance in one transaction so a booking can never sit in "deposit required"
 * with no amount. CONFIRMING that the advance arrived is a different act by a
 * different person against a bank statement, and it lives on its own button on
 * the Money card.
 *
 * ## Rounding
 *
 * Per-line, then summed — matching the server exactly. Rounding once at the end
 * would print a subtotal that a column of visible line totals does not add up
 * to.
 */

type LineType = 'service' | 'supply' | 'custom';

interface DraftLine {
  /** Local identity. The server has no id for a line and does not need one. */
  key: string;
  itemType: LineType;
  itemId: string | null;
  title: string;
  quantity: string;
  unitPrice: string;
  /** Snapshotted for display only — "pack", "strip". */
  unit: string | null;
}

let lineCounter = 0;
function newKey() {
  lineCounter += 1;
  return `line-${lineCounter}`;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function lineTotal(line: DraftLine): number {
  const qty = Number(line.quantity);
  const price = Number(line.unitPrice);
  if (!Number.isFinite(qty) || !Number.isFinite(price)) return 0;
  return round2(round2(price) * qty);
}

/** A draft is billable once it names something and prices it. */
function lineValid(line: DraftLine): boolean {
  const qty = Number(line.quantity);
  const price = Number(line.unitPrice);
  return (
    line.title.trim().length > 0 &&
    line.quantity.trim() !== '' &&
    Number.isFinite(qty) &&
    qty >= 0 &&
    line.unitPrice.trim() !== '' &&
    Number.isFinite(price) &&
    price >= 0
  );
}

export function InvoiceEditor({
  booking,
  open,
  onOpenChange,
}: {
  booking: BookingWire;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const locked = (TERMINAL_STATUSES as readonly string[]).includes(
    booking.status,
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        mobileFullscreen
        className="max-h-[92vh] overflow-y-auto sm:max-w-3xl"
      >
        {/*
          The editor's state lives INSIDE the dialog, and that placement is the
          whole seeding mechanism.

          Radix unmounts portal content on close, so every open mounts a fresh
          editor whose `useState` initialisers read the booking. Nothing
          re-seeds anything afterwards — which is what the React Compiler lint
          asks for, and what makes the important guarantee hold on its own: this
          booking is invalidated by every write on the page and refetched on
          every window focus, and a re-seeding effect would wipe a half-built
          invoice each time an operator tabbed away to check a price.
        */}
        {/*
          A CLOSED booking's invoice is a record, not a draft.

          `setBookingInvoice`'s INVOICEABLE list excludes every terminal status
          server-side, so an operator who edited here would build a whole
          invoice and eat a 409 on Save — and the patient has already been
          shown, and may already have printed, the bill this would rewrite. An
          itemized correction to a settled visit is a refund conversation, not
          an edit, so the dialog shows the frozen receipt instead and points at
          where it can be printed.
        */}
        {open &&
          (locked ? (
            <LockedInvoiceNotice booking={booking} onDone={() => onOpenChange(false)} />
          ) : (
            <InvoiceEditorBody
              booking={booking}
              onDone={() => onOpenChange(false)}
            />
          ))}
      </DialogContent>
    </Dialog>
  );
}

/**
 * What the dialog shows on a closed booking.
 *
 * Deliberately not a disabled form. Greying out twenty inputs still reads as
 * "you lack a permission" and invites an operator to go looking for one; a
 * short sentence naming the actual reason, next to the thing they can still
 * do, ends the question.
 */
function LockedInvoiceNotice({
  booking,
  onDone,
}: {
  booking: BookingWire;
  onDone: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Invoice locked</DialogTitle>
        <DialogDescription>
          This booking is {humanize(booking.status).toLowerCase()}. Its invoice
          was finalized when it closed and can no longer be edited — a
          correction to a settled visit is a refund, not an edit.
        </DialogDescription>
      </DialogHeader>

      {booking.invoice ? (
        <ArchivedInvoice
          bookingId={booking.id}
          invoice={booking.invoice}
          patientName={booking.patient_name}
        />
      ) : (
        <Alert>
          <AlertDescription>
            No payment was taken against this booking, so there is no receipt to
            show.
          </AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Close
        </Button>
        <Button asChild>
          <Link href={`/dashboard/bookings/history/${booking.id}`}>
            Open in invoice archive
          </Link>
        </Button>
      </DialogFooter>
    </>
  );
}

function InvoiceEditorBody({
  booking,
  onDone,
}: {
  booking: BookingWire;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();

  /**
   * Is the advance banked? Read from the settlement stamps rather than the
   * status, because an in-visit booking keeps its status when its deposit
   * settles. The server refuses to move a paid advance, so the field is locked
   * rather than merely validated.
   */
  const depositPaid =
    Boolean(booking.deposit_paid_at) || Number(booking.deposit_amount ?? 0) > 0;

  /**
   * The opening ledger.
   *
   * The synthesised line the server projects for a never-itemized booking seeds
   * the editor as a real, editable row — that is the point of projecting it. An
   * operator adding a bandage to a flat-priced booking starts from the service
   * they already quoted rather than re-typing it.
   */
  const [lines, setLines] = useState<DraftLine[]>(() => {
    const seeded = (booking.line_items ?? []).map<DraftLine>((li) => ({
      key: newKey(),
      itemType: li.item_type,
      itemId: li.item_id ?? null,
      title: li.title,
      quantity: String(li.quantity ?? 1),
      unitPrice: String(li.unit_price ?? 0),
      unit: li.unit ?? null,
    }));
    if (seeded.length > 0) return seeded;
    return [
      {
        key: newKey(),
        itemType: 'service',
        itemId: booking.service_id ?? null,
        title: booking.care_type ?? '',
        quantity: '1',
        unitPrice: booking.final_price ? String(booking.final_price) : '',
        unit: null,
      },
    ];
  });

  // A stored percentage means the discount WAS authored as one. A stored amount
  // with no percentage is a flat waiver, and opening it in percent mode would
  // silently convert it into one on the next save.
  const storedPercent = Number(booking.discount_percentage ?? 0);
  const storedFlat = Number(booking.adjusted_discount ?? 0);
  const [discountMode, setDiscountMode] = useState<'percent' | 'flat'>(
    storedPercent > 0 || storedFlat === 0 ? 'percent' : 'flat',
  );
  const [discountPercent, setDiscountPercent] = useState(String(storedPercent));
  const [discountFlat, setDiscountFlat] = useState(String(storedFlat));
  const [deposit, setDeposit] = useState(
    String(booking.required_deposit ?? booking.deposit_quoted_amount ?? ''),
  );
  const [adminNote, setAdminNote] = useState(booking.admin_note ?? '');
  const [callNotes, setCallNotes] = useState(booking.call_summary_notes ?? '');

  // The two catalogs. Fetched once and filtered in the browser — see the note
  // in `lib/api/supplies.ts` for why neither is paginated. No `enabled` guard
  // is needed: this component only mounts once the dialog is open, so neither
  // request is made until an operator actually opens the editor.
  const servicesQuery = useQuery({
    queryKey: qk.serviceCatalog,
    queryFn: listServiceCatalog,
    staleTime: 5 * 60_000,
  });
  const suppliesQuery = useQuery({
    queryKey: qk.supplies,
    queryFn: listSupplies,
    staleTime: 5 * 60_000,
  });

  const serviceOptions = useMemo<ComboboxOption[]>(
    () =>
      (servicesQuery.data ?? []).map((s) => ({
        value: s.id,
        label: s.title,
        hint:
          s.unitPrice === null
            ? 'Variable — enter a price'
            : `${money(s.unitPrice)}${s.category ? ` · ${s.category}` : ''}`,
        /*
          Back-office rows are grouped apart rather than mixed in: they are the
          charges no patient can book themselves (an after-hours callout, a
          biohazard disposal fee), and an operator scanning for one needs to see
          at a glance that it is not a storefront service. `GET
          /admin/services/catalog` is the only read that returns them at all —
          the public catalog filters them out unconditionally.
        */
        group: s.isAdminOnly ? 'Admin Services' : 'Patient-facing',
        keywords: `${s.category} ${s.providerType ?? ''}`,
        badge: !s.isActive ? (
          <Badge variant="secondary" className="font-normal">
            Inactive
          </Badge>
        ) : undefined,
      })),
    [servicesQuery.data],
  );

  const supplyOptions = useMemo<ComboboxOption[]>(
    () =>
      (suppliesQuery.data ?? [])
        // Deactivated supplies stay out of the picker — that is what the switch
        // on the catalog page means. A bill that already carries one keeps it;
        // this only governs what can be added next.
        .filter((s) => s.isActive)
        .map((s) => ({
          value: s.id,
          label: s.name,
          hint: `${money(s.unitPrice)} per ${s.unit}`,
          group: s.category,
          keywords: `${s.category} ${s.description ?? ''}`,
        })),
    [suppliesQuery.data],
  );

  function patchLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  }

  function addServiceLine(id: string) {
    const svc = servicesQuery.data?.find((s) => s.id === id);
    if (!svc) return;
    setLines((prev) => [
      ...prev,
      {
        key: newKey(),
        itemType: 'service',
        itemId: svc.id,
        title: svc.title,
        quantity: '1',
        // Empty rather than '0' when the catalog pins no price. "Variable"
        // means nobody has priced this, which is not the same statement as
        // free — pre-filling a zero bills a number no one agreed to.
        unitPrice: svc.unitPrice === null ? '' : String(svc.unitPrice),
        unit: null,
      },
    ]);
  }

  function addSupplyLine(id: string) {
    const supply = suppliesQuery.data?.find((s) => s.id === id);
    if (!supply) return;
    setLines((prev) => {
      // Adding the same supply twice bumps the quantity instead of stacking a
      // duplicate row. An operator adding two packs one tap at a time means
      // "two packs", and a bill listing the same dressing on two lines is one
      // the patient has to reconcile themselves.
      const existing = prev.find(
        (l) => l.itemType === 'supply' && l.itemId === supply.id,
      );
      if (existing) {
        const next = Number(existing.quantity) || 0;
        return prev.map((l) =>
          l.key === existing.key ? { ...l, quantity: String(next + 1) } : l,
        );
      }
      return [
        ...prev,
        {
          key: newKey(),
          itemType: 'supply',
          itemId: supply.id,
          title: supply.name,
          quantity: '1',
          unitPrice: String(supply.unitPrice),
          unit: supply.unit,
        },
      ];
    });
  }

  function addCustomLine() {
    setLines((prev) => [
      ...prev,
      {
        key: newKey(),
        itemType: 'custom',
        itemId: null,
        title: '',
        quantity: '1',
        unitPrice: '',
        unit: null,
      },
    ]);
  }

  // ── The preview arithmetic ───────────────────────────────────────────────
  // Mirrors utils/invoiceLineItems.js exactly, including the per-line rounding.
  const subtotal = round2(lines.reduce((sum, l) => sum + lineTotal(l), 0));
  const percentNum = Number(discountPercent) || 0;
  const flatNum = Number(discountFlat) || 0;
  const discountAmount =
    discountMode === 'percent'
      ? round2((subtotal * percentNum) / 100)
      : round2(flatNum);
  const finalTotal = round2(Math.max(0, subtotal - discountAmount));

  const depositNum = Number(deposit) || 0;
  const balanceDue = round2(finalTotal - depositNum);

  const percentOutOfRange = percentNum < 0 || percentNum > 100;
  const flatOutOfRange = flatNum < 0 || flatNum > subtotal;
  const discountInvalid =
    discountMode === 'percent' ? percentOutOfRange : flatOutOfRange;
  const everyLineValid = lines.length > 0 && lines.every(lineValid);
  const depositTooLarge = !depositPaid && depositNum > finalTotal;

  const canSave =
    everyLineValid && !discountInvalid && finalTotal > 0 && !depositTooLarge;

  const save = useMutation({
    mutationFn: async () => {
      const body: Parameters<typeof setInvoice>[1] = {
        line_items: lines.map((l) => ({
          item_type: l.itemType,
          item_id: l.itemId,
          title: l.title.trim(),
          quantity: Number(l.quantity),
          unit_price: Number(l.unitPrice),
        })),
      };
      // Exactly one discount form travels — the server rejects both together
      // rather than picking one, so the mode toggle is the single source of
      // truth for which it is.
      if (discountMode === 'percent') body.discount_percentage = percentNum;
      else body.adjusted_discount = flatNum;
      // The advance may only be quoted while it is unpaid. Sending it after
      // payment is a 409, so omit it — the edit is then a pure line correction,
      // which is exactly what it is.
      if (!depositPaid && deposit.trim() !== '') {
        body.required_deposit = depositNum;
      }
      body.admin_note = adminNote;
      body.call_summary_notes = callNotes;
      return setInvoice(booking.id, body);
    },
    onSuccess: () => {
      toast.success('Invoice saved.');
      void queryClient.invalidateQueries({ queryKey: qk.booking(booking.id) });
      void queryClient.invalidateQueries({ queryKey: qk.bookings });
      onDone();
    },
    onError: (error) => toast.error(normalizeError(error).message),
  });

  const catalogsLoading = servicesQuery.isPending || suppliesQuery.isPending;

  return (
    <>
        <DialogHeader>
          <DialogTitle>
            {depositPaid ? 'Adjust invoice' : 'Build invoice and quote advance'}
          </DialogTitle>
          {/*
            `sr-only` below `md`, not removed. This header is the sticky action
            bar on a phone, and two lines of explanation in it cost a fifth of
            the screen on every scroll — but Radix requires a description for
            the dialog's accessible name, and a screen-reader user gets no
            benefit from a sentence being dropped for want of pixels.
          */}
          <DialogDescription className="max-md:sr-only">
            {depositPaid
              ? 'The advance is paid and locked. Line items and the discount are still editable — the balance recalculates from them.'
              : 'Itemize what this visit costs, then set the advance the patient pays to confirm it.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* ── Pickers ─────────────────────────────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="service-picker">Add a service</Label>
              <Combobox
                id="service-picker"
                options={serviceOptions}
                value={null}
                onChange={addServiceLine}
                placeholder={
                  catalogsLoading ? 'Loading catalog…' : 'Search services…'
                }
                searchPlaceholder="Search all services…"
                emptyText="No service matches."
                disabled={catalogsLoading}
              />
              <p className="text-muted-foreground text-xs">
                Includes back-office services patients cannot book themselves.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="supply-picker">Add a medicine or supply</Label>
              <Combobox
                id="supply-picker"
                options={supplyOptions}
                value={null}
                onChange={addSupplyLine}
                placeholder={
                  catalogsLoading ? 'Loading catalog…' : 'Search supplies…'
                }
                searchPlaceholder="Search medicines, dressings…"
                emptyText="No supply matches."
                disabled={catalogsLoading}
              />
              <p className="text-muted-foreground text-xs">
                Picking one already on the invoice bumps its quantity.
              </p>
            </div>
          </div>

          {/* ── Lines ───────────────────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line items</Label>
              <Button variant="outline" size="sm" onClick={addCustomLine}>
                <Plus className="size-4" />
                Custom charge
              </Button>
            </div>

            <div className="space-y-2">
              {lines.map((line) => (
                <div
                  key={line.key}
                  className="space-y-2 rounded-lg border p-2 md:grid md:grid-cols-[1fr_4.5rem_6rem_5.5rem_2rem] md:items-center md:gap-2 md:space-y-0"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {line.itemType === 'supply' ? (
                      <Package className="text-muted-foreground size-4 shrink-0" />
                    ) : line.itemType === 'service' ? (
                      <Stethoscope className="text-muted-foreground size-4 shrink-0" />
                    ) : (
                      <Plus className="text-muted-foreground size-4 shrink-0" />
                    )}
                    <Input
                      value={line.title}
                      onChange={(e) =>
                        patchLine(line.key, { title: e.target.value })
                      }
                      placeholder={
                        line.itemType === 'custom'
                          ? 'e.g. Emergency transport'
                          : 'Line description'
                      }
                      aria-label="Line title"
                      className="h-8 min-w-0"
                    />
                  </div>

                  {/*
                    The arithmetic half of the line. On a phone it is its own
                    row reading "qty × price = total", because five controls
                    across a 360px screen leaves a price box about four
                    characters wide.

                    `md:contents` DISSOLVES this wrapper at the breakpoint — its
                    children become direct grid items again and drop straight
                    back into columns two through five, so the desktop table
                    that operators already know is byte-for-byte what it was.
                    The `×` separator is `md:hidden` so it does not claim a
                    sixth column and push the delete button onto a new row.
                  */}
                  <div className="flex items-center gap-2 md:contents">
                    <Input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={line.quantity}
                      onChange={(e) =>
                        patchLine(line.key, { quantity: e.target.value })
                      }
                      aria-label="Quantity"
                      className="h-8 w-12 shrink-0 text-right tabular-nums md:w-full"
                    />
                    <span className="text-muted-foreground shrink-0 text-xs md:hidden">
                      ×
                    </span>
                    <Input
                      type="number"
                      min={0}
                      inputMode="decimal"
                      value={line.unitPrice}
                      onChange={(e) =>
                        patchLine(line.key, { unitPrice: e.target.value })
                      }
                      placeholder="Price"
                      aria-label="Unit price"
                      className="h-8 min-w-0 flex-1 text-right tabular-nums"
                    />
                    <span className="shrink-0 text-right text-sm font-medium tabular-nums max-md:min-w-14">
                      {money(lineTotal(line))}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0"
                      onClick={() =>
                        setLines((prev) => prev.filter((l) => l.key !== line.key))
                      }
                      aria-label={`Remove ${line.title || 'line'}`}
                    >
                      <Trash2 className="text-destructive size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {lines.length > 0 && !everyLineValid && (
              <p className="text-destructive text-xs">
                Every line needs a title, a quantity and a price. A service with
                variable pricing arrives with an empty price box on purpose.
              </p>
            )}
            <p className="text-muted-foreground text-xs">
              Quantity and price are per unit
              {lines.some((l) => l.unit)
                ? ` — supplies show their unit in the catalog (${[
                    ...new Set(lines.filter((l) => l.unit).map((l) => l.unit)),
                  ].join(', ')})`
                : ''}
              .
            </p>
          </div>

          <Separator />

          {/* ── Discount ────────────────────────────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
            <div className="space-y-2">
              <Label>Discount</Label>
              <ToggleGroup
                type="single"
                value={discountMode}
                onValueChange={(v) => v && setDiscountMode(v as 'percent' | 'flat')}
                variant="outline"
                size="sm"
              >
                <ToggleGroupItem value="percent" aria-label="Discount by percent">
                  %
                </ToggleGroupItem>
                <ToggleGroupItem value="flat" aria-label="Discount by amount">
                  ৳
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="space-y-2">
              <Label htmlFor="discount-value">
                {discountMode === 'percent'
                  ? 'Percent off the subtotal (0–100)'
                  : 'Flat amount off the subtotal'}
              </Label>
              {discountMode === 'percent' ? (
                <Input
                  id="discount-value"
                  type="number"
                  min={0}
                  max={100}
                  inputMode="decimal"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                />
              ) : (
                <Input
                  id="discount-value"
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={discountFlat}
                  onChange={(e) => setDiscountFlat(e.target.value)}
                />
              )}
              {/* Says what the patient will actually read. A percentage is
                  labelled on their bill; a flat waiver is not, because there
                  is no percentage behind it to name. */}
              <p className="text-muted-foreground text-xs">
                {discountMode === 'percent'
                  ? `The patient sees “Special Discount (${percentNum || 0}%)”.`
                  : 'The patient sees the amount with no percentage label.'}
              </p>
              {percentOutOfRange && discountMode === 'percent' && (
                <p className="text-destructive text-xs">
                  The discount must be between 0% and 100%.
                </p>
              )}
              {flatOutOfRange && discountMode === 'flat' && (
                <p className="text-destructive text-xs">
                  The discount cannot be negative or exceed the{' '}
                  {money(subtotal)} subtotal.
                </p>
              )}
            </div>
          </div>

          {/* ── Totals ──────────────────────────────────────────────────── */}
          <div className="bg-muted/40 space-y-1.5 rounded-lg border p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{money(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Discount
                  {discountMode === 'percent' ? ` (${percentNum}%)` : ''}
                </span>
                <span className="tabular-nums">− {money(discountAmount)}</span>
              </div>
            )}
            <Separator className="my-1.5" />
            <div className="flex justify-between font-semibold">
              <span>Final total</span>
              <span className="tabular-nums">{money(finalTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {depositPaid ? 'Advance received' : 'Advance to collect'}
              </span>
              <span className="tabular-nums">− {money(depositNum)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Balance due after visit</span>
              <span
                className={`tabular-nums ${balanceDue < 0 ? 'text-destructive' : ''}`}
              >
                {money(balanceDue)}
              </span>
            </div>
          </div>

          {/* ── Advance ─────────────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label htmlFor="advance">Advance deposit required</Label>
            <Input
              id="advance"
              type="number"
              min={0}
              inputMode="decimal"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              disabled={depositPaid}
            />
            {depositPaid ? (
              <p className="text-muted-foreground text-xs">
                Locked — {money(booking.deposit_amount)} was received on this
                booking. Correcting the fee here leaves it untouched.
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                Saving with an advance set moves the booking to “deposit
                required” and prompts the patient to pay.
              </p>
            )}
            {depositTooLarge && (
              <p className="text-destructive text-xs">
                The advance cannot exceed the {money(finalTotal)} final total.
                Lower it, or reduce the discount.
              </p>
            )}
          </div>

          {finalTotal <= 0 && everyLineValid && (
            <Alert>
              <AlertDescription>
                The invoice totals ৳0. Add a priced line, or lower the discount —
                the server will not accept a zero invoice.
              </AlertDescription>
            </Alert>
          )}

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="editor-call-notes">
              Call summary / operations notes
            </Label>
            <Textarea
              id="editor-call-notes"
              rows={3}
              value={callNotes}
              onChange={(e) => setCallNotes(e.target.value)}
              placeholder="What was agreed on the call with the patient…"
            />
            {/* This distinction matters and is invisible from the field names
                alone: call_summary_notes renders in the patient's app as
                "Note from Operations". admin_note never leaves this console. */}
            <p className="text-muted-foreground text-xs">
              <strong>Visible to the patient</strong> in their booking timeline.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="editor-admin-note">Internal triage note</Label>
            <Textarea
              id="editor-admin-note"
              rows={2}
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              placeholder="Context for other operators…"
            />
            <p className="text-muted-foreground text-xs">
              Internal only — never shown to the patient.
            </p>
          </div>
        </div>

        {/*
          `flex-row` below `md` overrides the stacked default, so the sticky bar
          at the bottom of a full-screen dialog is one line rather than two
          full-width buttons eating a third of the screen. Cancel keeps its
          natural width; the primary action takes everything left over.
        */}
        <DialogFooter className="max-md:flex-row max-md:items-center">
          <Button
            variant="outline"
            onClick={onDone}
            className="max-md:flex-none"
          >
            Cancel
          </Button>
          {/*
            The total rides on the button.

            It is already printed in the summary panel above, but on a phone
            that panel is several scrolls away by the time an operator reaches
            the advance field — and this is the last moment before a figure is
            quoted to a patient. Naming it here means the number being committed
            and the button committing it are read in the same glance.

            Dropped when there is nothing to name: `৳0` on a half-built invoice
            reads as a price rather than as an empty form.
          */}
          <Button
            onClick={() => save.mutate()}
            disabled={!canSave || save.isPending}
            className="max-md:flex-1"
          >
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            Save invoice
            {finalTotal > 0 ? ` — ${money(finalTotal)}` : ''}
          </Button>
        </DialogFooter>
    </>
  );
}
