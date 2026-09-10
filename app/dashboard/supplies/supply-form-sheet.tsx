'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  createSupply,
  updateSupply,
  SUPPLY_CATEGORIES,
  type SupplyCategory,
  type SupplyWire,
} from '@/lib/api/supplies';
import { qk } from '@/lib/api/query-keys';
import { normalizeError } from '@/lib/api/errors';

const CATEGORY_LABEL: Record<SupplyCategory, string> = {
  medicine: 'Medicine',
  bandage: 'Bandage & dressing',
  equipment: 'Equipment',
  procedure: 'Procedure',
  other: 'Other',
};

/**
 * Create / edit one shelf row.
 *
 * Same shape as `service-form-sheet.tsx`: plain `useState` per field, a derived
 * `canSave`, no schema validation — `react-hook-form` and `zod` are in
 * package.json and used nowhere in this console, by decision.
 *
 * The write is JSON, not multipart: a supply has no artwork. And it is a PATCH,
 * so only what changed needs to travel — but this form sends every field it
 * owns, because it holds every field there is and a partial send would be
 * pretending otherwise.
 */
export function SupplyFormSheet({
  supply,
  open,
  onOpenChange,
}: {
  /** `null` opens a create form. */
  supply: SupplyWire | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        {/*
          The form's state lives INSIDE the sheet, and that placement is the
          whole seeding mechanism.

          Radix unmounts portal content when the sheet closes, so every open
          mounts a fresh form whose `useState` initialisers read the row being
          edited. No effect re-seeds anything, which is what the React Compiler
          lint is asking for — and it fixes the subtler bug an effect had:
          `useState` runs once per mount, so a background refetch (this list is
          invalidated by every write, and `refetchOnWindowFocus` fires on every
          tab switch) re-renders the form with new props and cannot overwrite
          what the operator is currently typing.

          The `key` handles one case unmounting does not: switching straight
          from editing one row to another while the sheet stays open.
        */}
        <SupplyForm
          key={supply?.id ?? 'new'}
          supply={supply}
          onDone={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function SupplyForm({
  supply,
  onDone,
}: {
  supply: SupplyWire | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const editing = supply !== null;

  const [name, setName] = useState(supply?.name ?? '');
  const [category, setCategory] = useState<SupplyCategory>(
    supply?.category ?? 'medicine',
  );
  const [unitPrice, setUnitPrice] = useState(
    supply ? String(supply.unitPrice) : '',
  );
  const [unit, setUnit] = useState(supply?.unit ?? 'piece');
  const [description, setDescription] = useState(supply?.description ?? '');
  const [isActive, setIsActive] = useState(supply?.isActive ?? true);

  const priceNum = Number(unitPrice);
  const priceValid = unitPrice.trim() !== '' && Number.isFinite(priceNum) && priceNum >= 0;
  const canSave = name.trim().length > 0 && priceValid;

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: name.trim(),
        category,
        unitPrice: priceNum,
        unit: unit.trim() || 'piece',
        description: description.trim(),
        isActive,
      };
      return editing ? updateSupply(supply.id, body) : createSupply(body);
    },
    onSuccess: () => {
      toast.success(editing ? 'Supply updated.' : 'Supply added.');
      void queryClient.invalidateQueries({ queryKey: qk.supplies });
      onDone();
    },
    onError: (error) => toast.error(normalizeError(error).message),
  });

  return (
    <>
        <SheetHeader>
          <SheetTitle>{editing ? 'Edit supply' : 'Add supply'}</SheetTitle>
          <SheetDescription>
            {editing
              ? 'Re-pricing this row affects future invoices only. Bills that already quoted it keep the price they were quoted at.'
              : 'Medicines, dressings and equipment the invoice editor can bill onto a visit.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4">
          <div className="space-y-2">
            <Label htmlFor="supply-name">Name</Label>
            <Input
              id="supply-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Amoxicillin 500mg"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="supply-category">Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as SupplyCategory)}
            >
              <SelectTrigger id="supply-category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPLY_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Groups the row in the invoice picker. Nothing else reads it.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="supply-price">Unit price (৳)</Label>
              <Input
                id="supply-price"
                type="number"
                min={0}
                inputMode="decimal"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supply-unit">Unit</Label>
              <Input
                id="supply-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="pack"
              />
            </div>
          </div>
          <p className="text-muted-foreground text-xs">
            Price for ONE unit. An operator billing three packs enters a quantity
            of 3 on the invoice, not a price of three packs here.
          </p>

          <div className="space-y-2">
            <Label htmlFor="supply-description">Shelf note</Label>
            <Textarea
              id="supply-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Strength, brand, pack size…"
            />
            <p className="text-muted-foreground text-xs">
              Searchable in the picker. Never shown to the patient — their bill
              carries the line item&apos;s own title.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="supply-active">Available</Label>
              <p className="text-muted-foreground text-xs">
                Off hides it from the invoice picker. Bills that already carry it
                are untouched.
              </p>
            </div>
            <Switch
              id="supply-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>
        </div>

        <SheetFooter>
          <Button
            onClick={() => save.mutate()}
            disabled={!canSave || save.isPending}
          >
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            {editing ? 'Save changes' : 'Add supply'}
          </Button>
          <Button variant="outline" onClick={onDone}>
            Cancel
          </Button>
        </SheetFooter>
    </>
  );
}

export { CATEGORY_LABEL };
