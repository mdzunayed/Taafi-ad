'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { listServiceCatalog, listSupplies } from '@/lib/api/supplies';
import { qk } from '@/lib/api/query-keys';
import { money } from '@/lib/format';

/**
 * The invoice half of the manual booking form.
 *
 * Lifted out of the form itself because it is the only part with real logic:
 * two catalogs, a dynamic row builder, and arithmetic that has to match the
 * server's to the paisa.
 *
 * ## It sends lines, never totals
 *
 * The subtotal, the discount and the final total are all recomputed server-side
 * from the lines (`backend/src/utils/invoiceLineItems.js`) before anything is
 * stored, and the console's own figures never travel. The arithmetic here
 * exists so the operator watches the total move as they type — it is a preview
 * of the server's answer, not the answer. That is what makes a stale console
 * bundle a display bug rather than a mis-billed patient.
 *
 * ## Rounding
 *
 * Per-line, then summed, matching the server exactly. Rounding once at the end
 * prints a subtotal that a visible column of line totals does not add up to.
 *
 * Deliberately the same shapes and the same rules as the invoice editor on the
 * booking detail page. The two are not shared as one component because they are
 * genuinely different surfaces — that one opens on a booking that already has a
 * deposit posture to respect, this one starts from nothing — but the money is
 * identical, and it is identical because both defer to the same server.
 */

export type LineType = 'service' | 'supply' | 'custom';

export interface DraftLine {
  /** Local identity. The server has no id for a line and does not need one. */
  key: string;
  itemType: LineType;
  itemId: string | null;
  title: string;
  /** Held as strings, so a half-typed "1" is not committed as a value. */
  quantity: string;
  unitPrice: string;
  /** Snapshotted for display only — "pack", "strip". */
  unit: string | null;
}

let lineCounter = 0;
export function newLineKey() {
  lineCounter += 1;
  return `mb-line-${lineCounter}`;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function lineTotal(line: DraftLine): number {
  const qty = Number(line.quantity);
  const price = Number(line.unitPrice);
  if (!Number.isFinite(qty) || !Number.isFinite(price)) return 0;
  return round2(round2(price) * qty);
}

/** A draft is billable once it names something and prices it. */
export function lineValid(line: DraftLine): boolean {
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

export interface InvoiceTotals {
  subtotal: number;
  discountAmount: number;
  finalTotal: number;
  balanceAfterDeposit: number;
}

/**
 * The preview arithmetic, exported so the parent can gate its submit button on
 * the same numbers the operator is reading.
 */
export function computeTotals(
  lines: DraftLine[],
  discountMode: 'percent' | 'flat',
  discountPercent: string,
  discountFlat: string,
  deposit: string,
): InvoiceTotals {
  const subtotal = round2(lines.reduce((sum, l) => sum + lineTotal(l), 0));
  const discountAmount =
    discountMode === 'percent'
      ? round2((subtotal * (Number(discountPercent) || 0)) / 100)
      : round2(Number(discountFlat) || 0);
  const finalTotal = round2(Math.max(0, subtotal - discountAmount));
  return {
    subtotal,
    discountAmount,
    finalTotal,
    balanceAfterDeposit: round2(finalTotal - (Number(deposit) || 0)),
  };
}

export function InvoiceBuilder({
  lines,
  setLines,
  discountMode,
  setDiscountMode,
  discountPercent,
  setDiscountPercent,
  discountFlat,
  setDiscountFlat,
  deposit,
  setDeposit,
  totals,
}: {
  lines: DraftLine[];
  setLines: (update: (prev: DraftLine[]) => DraftLine[]) => void;
  discountMode: 'percent' | 'flat';
  setDiscountMode: (mode: 'percent' | 'flat') => void;
  discountPercent: string;
  setDiscountPercent: (value: string) => void;
  discountFlat: string;
  setDiscountFlat: (value: string) => void;
  deposit: string;
  setDeposit: (value: string) => void;
  totals: InvoiceTotals;
}) {
  /*
    The two catalogs. Fetched once and filtered in the browser — see the note in
    `lib/api/supplies.ts` for why neither is paginated. A long `staleTime`
    because a price list does not move during a phone call, and the invoice
    editor on the booking page shares these cache entries.
  */
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
          /admin/services/catalog` is the only read that returns them at all.
        */
        group: s.isAdminOnly ? 'Admin services' : 'Patient-facing services',
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
        // on the catalog page means. This only governs what can be added.
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
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addServiceLine(id: string) {
    const svc = servicesQuery.data?.find((s) => s.id === id);
    if (!svc) return;
    setLines((prev) => [
      ...prev,
      {
        key: newLineKey(),
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
        return prev.map((l) =>
          l.key === existing.key
            ? { ...l, quantity: String((Number(existing.quantity) || 0) + 1) }
            : l,
        );
      }
      return [
        ...prev,
        {
          key: newLineKey(),
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
        key: newLineKey(),
        itemType: 'custom',
        itemId: null,
        title: '',
        quantity: '1',
        unitPrice: '',
        unit: null,
      },
    ]);
  }

  const catalogsLoading = servicesQuery.isPending || suppliesQuery.isPending;
  const depositNum = Number(deposit) || 0;
  const depositTooLarge = depositNum > totals.finalTotal && totals.finalTotal > 0;

  return (
    <div className="space-y-5">
      {/* ── Pickers ─────────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="mb-service-picker">Add a service</Label>
          <Combobox
            id="mb-service-picker"
            options={serviceOptions}
            value={null}
            onChange={addServiceLine}
            placeholder={catalogsLoading ? 'Loading catalog…' : 'Search services…'}
            searchPlaceholder="Search all services…"
            emptyText="No service matches."
            disabled={catalogsLoading}
          />
          <p className="text-muted-foreground text-xs">
            Includes back-office services patients cannot book themselves.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="mb-supply-picker">Add a medicine or supply</Label>
          <Combobox
            id="mb-supply-picker"
            options={supplyOptions}
            value={null}
            onChange={addSupplyLine}
            placeholder={catalogsLoading ? 'Loading catalog…' : 'Search supplies…'}
            searchPlaceholder="Search medicines, dressings…"
            emptyText="No supply matches."
            disabled={catalogsLoading}
          />
          <p className="text-muted-foreground text-xs">
            Picking one already on the invoice bumps its quantity.
          </p>
        </div>
      </div>

      {(servicesQuery.isError || suppliesQuery.isError) && (
        <p className="text-destructive text-xs">
          A catalog could not be loaded. Reload the page, or add the charges as
          custom lines.
        </p>
      )}

      {/* ── Lines ───────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Line items</Label>
          <Button variant="outline" size="sm" onClick={addCustomLine}>
            <Plus className="size-4" />
            Custom charge
          </Button>
        </div>

        {lines.length === 0 ? (
          <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
            No charges yet. Pick a service above, or leave this empty to create
            the booking unpriced and quote it later.
          </div>
        ) : (
          <div className="space-y-2">
            {lines.map((line) => (
              <div
                key={line.key}
                className="space-y-2 rounded-lg border p-2 md:grid md:grid-cols-[1fr_4.5rem_6rem_5.5rem_2rem] md:items-center md:gap-2 md:space-y-0"
              >
                <div className="min-w-0">
                  {/*
                    Every title is editable, including one that came from the
                    catalog. "Amoxicillin 500mg (half course)" is a
                    clarification the patient benefits from, and the server
                    stores what is sent — the line still points at the catalog
                    row it was picked from.
                  */}
                  <Input
                    value={line.title}
                    onChange={(e) => patchLine(line.key, { title: e.target.value })}
                    placeholder={
                      line.itemType === 'custom' ? 'What is this charge?' : 'Title'
                    }
                    className="h-8 border-0 px-1 shadow-none focus-visible:ring-0"
                  />
                  <p className="text-muted-foreground px-1 text-xs">
                    {line.itemType === 'service'
                      ? 'Service'
                      : line.itemType === 'supply'
                        ? `Supply${line.unit ? ` · per ${line.unit}` : ''}`
                        : 'Custom charge'}
                  </p>
                </div>
                {/*
                  The same `md:contents` split the invoice editor uses: on a
                  phone the numbers are their own row reading "qty × price =
                  total", and at `md` the wrapper dissolves so all four controls
                  drop back into the five-column grid unchanged. See
                  `app/dashboard/bookings/[id]/invoice-editor.tsx` for the full
                  note; the two builders are deliberately the same shape.
                */}
                <div className="flex items-center gap-2 md:contents">
                  <Input
                    type="number"
                    min={0}
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(e) => patchLine(line.key, { quantity: e.target.value })}
                    className="h-9 w-12 shrink-0 text-right tabular-nums md:w-full md:text-left"
                    aria-label={`Quantity for ${line.title || 'this line'}`}
                  />
                  <span className="text-muted-foreground shrink-0 text-xs md:hidden">
                    ×
                  </span>
                  <Input
                    type="number"
                    min={0}
                    inputMode="decimal"
                    value={line.unitPrice}
                    onChange={(e) => patchLine(line.key, { unitPrice: e.target.value })}
                    placeholder="Unit price"
                    className="h-9 min-w-0 flex-1 text-right tabular-nums md:text-left"
                    aria-label={`Unit price for ${line.title || 'this line'}`}
                  />
                  <span className="shrink-0 text-right text-sm tabular-nums max-md:min-w-14">
                    {money(lineTotal(line))}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    onClick={() =>
                      setLines((prev) => prev.filter((l) => l.key !== line.key))
                    }
                    aria-label={`Remove ${line.title || 'this line'}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {lines.length > 0 && (
        <>
          <Separator />

          {/* ── Fee summary ───────────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{money(totals.subtotal)}</span>
            </div>

            <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-center">
              <ToggleGroup
                type="single"
                size="sm"
                variant="outline"
                value={discountMode}
                onValueChange={(v) => {
                  if (v === 'percent' || v === 'flat') setDiscountMode(v);
                }}
              >
                <ToggleGroupItem value="percent">Discount %</ToggleGroupItem>
                <ToggleGroupItem value="flat">Discount ৳</ToggleGroupItem>
              </ToggleGroup>
              {/*
                One control with a mode toggle, because the server refuses a
                percentage and a flat amount together rather than picking one.
                They are different statements: a percentage is what the patient
                app can label ("Special Discount (30%)"), a flat amount is a
                waiver an operator negotiated and renders with no label.
              */}
              {discountMode === 'percent' ? (
                <Input
                  type="number"
                  min={0}
                  max={100}
                  inputMode="decimal"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  className="h-9 sm:max-w-[10rem]"
                  aria-label="Discount percentage"
                />
              ) : (
                <Input
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={discountFlat}
                  onChange={(e) => setDiscountFlat(e.target.value)}
                  className="h-9 sm:max-w-[10rem]"
                  aria-label="Discount amount"
                />
              )}
              <span className="text-right text-sm tabular-nums">
                − {money(totals.discountAmount)}
              </span>
            </div>

            <div className="flex items-center justify-between font-medium">
              <span>Total</span>
              <span className="tabular-nums">{money(totals.finalTotal)}</span>
            </div>

            <Separator />

            <div className="grid gap-2 sm:grid-cols-[1fr_10rem] sm:items-center">
              <div>
                <Label htmlFor="mb-deposit">
                  Deposit required <span className="text-destructive">*</span>
                </Label>
                <p className="text-muted-foreground text-xs">
                  What confirms the visit. Deducted from the final bill, never
                  charged on top of it.
                </p>
              </div>
              <Input
                id="mb-deposit"
                type="number"
                min={0}
                inputMode="decimal"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
                className="h-9"
              />
            </div>

            {depositTooLarge ? (
              <p className="text-destructive text-sm">
                The deposit cannot exceed the total. Lower it, or reduce the
                discount.
              </p>
            ) : (
              <div className="text-muted-foreground flex items-center justify-between text-sm">
                <span>Balance due after the visit</span>
                <span className="tabular-nums">
                  {money(totals.balanceAfterDeposit)}
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
