'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Loader2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Textarea } from '@/components/ui/textarea';
import { createManualBooking } from '@/lib/api/bookings';
import { services } from '@/lib/api/content';
import { normalizeError } from '@/lib/api/errors';
import { qk } from '@/lib/api/query-keys';
import { money } from '@/lib/format';

/**
 * The phone-in booking form.
 *
 * Plain useState + a derived `invalid`, matching every other form in the
 * console — react-hook-form and zod are in package.json but used nowhere, and
 * one form adopting them would be the odd one out rather than the start of a
 * migration.
 *
 * Money is held as strings and coerced at read, the way InvoiceDialog does it:
 * a number-typed state would turn a half-typed "1" into a committed value and
 * fight the operator's keystrokes.
 */
export function ManualBookingForm() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Patient
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  // Service + schedule
  const [serviceId, setServiceId] = useState('');
  const [asap, setAsap] = useState(true);
  const [scheduledAt, setScheduledAt] = useState('');

  // Address
  const [house, setHouse] = useState('');
  const [road, setRoad] = useState('');
  const [area, setArea] = useState('');
  const [city, setCity] = useState('');

  // Money
  const [fee, setFee] = useState('');
  const [deposit, setDeposit] = useState('');

  // Notes
  const [callNotes, setCallNotes] = useState('');
  const [adminNote, setAdminNote] = useState('');

  // The one-shot credential, when this call also created the account.
  const [issued, setIssued] = useState<{ name: string; password: string } | null>(
    null,
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);

  /**
   * The catalog, gated on `bookings.read` rather than `content.read`: a
   * support member holds the former and not the latter, and there is no
   * server-side reason they should lose the service picker — `GET
   * /api/services` is public.
   */
  const catalog = useQuery({
    queryKey: qk.services,
    queryFn: services.list,
    staleTime: 300_000,
  });
  const active = (catalog.data ?? []).filter((s) => s.isActive !== false);
  const selected = active.find((s) => s.id === serviceId);

  const feeNum = Number(fee || 0);
  const depositNum = Number(deposit || 0);
  // Fee and deposit are optional together — leaving both blank creates the
  // booking unpriced (`submitted`), to be priced later from the invoice
  // dialog. Filling exactly one is the error the server also rejects.
  const priced = fee.trim() !== '' || deposit.trim() !== '';
  const moneyInvalid =
    priced && (feeNum <= 0 || depositNum <= 0 || depositNum > feeNum);
  const balance = feeNum - depositNum;

  const invalid =
    !name.trim() ||
    !phone.trim() ||
    !serviceId ||
    !area.trim() ||
    !city.trim() ||
    (!asap && !scheduledAt) ||
    moneyInvalid;

  const create = useMutation({
    mutationFn: () =>
      createManualBooking({
        patient_name: name.trim(),
        patient_phone: phone.trim(),
        // Both are sent: `care_type` is the free text every list and alert
        // renders, `service_id` is what lets the server read the catalog row
        // and infer whether a doctor or a nurse attends.
        care_type: selected?.title ?? '',
        service_id: serviceId,
        house: house.trim(),
        road: road.trim(),
        area: area.trim(),
        city: city.trim(),
        // `null` is meaningful — it is what makes the booking ASAP, which the
        // server triages as high urgency.
        preferred_time: asap ? null : new Date(scheduledAt).toISOString(),
        ...(priced
          ? { total_service_fee: feeNum, required_deposit: depositNum }
          : {}),
        call_summary_notes: callNotes.trim(),
        admin_note: adminNote.trim(),
      }),
    onSuccess: (booking) => {
      queryClient.invalidateQueries({ queryKey: qk.bookings });
      toast.success('Booking created.');
      setBookingId(booking.id);
      if (booking.temporaryPassword) {
        // Hold the operator here — navigating away would lose the only copy
        // of the credential they have to read back.
        setIssued({ name: name.trim(), password: booking.temporaryPassword });
        return;
      }
      router.push(`/dashboard/bookings/${booking.id}`);
    },
    onError: (error) => {
      const err = normalizeError(error);
      if (err.status === 409) {
        const raw = err.raw as { active_request_id?: string } | undefined;
        // A bare "conflict" toast leaves the operator with nothing to say to
        // the patient still on the line. Name the booking in the way.
        toast.error(err.message, {
          action: raw?.active_request_id
            ? {
                label: 'Open it',
                onClick: () =>
                  router.push(`/dashboard/bookings/${raw.active_request_id}`),
              }
            : undefined,
        });
        return;
      }
      toast.error(err.message);
    },
  });

  async function copyPassword() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy — read it from the screen instead.');
    }
  }

  return (
    <>
      <div className="grid max-w-3xl gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Patient</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mb-name">
                Full name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="mb-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mb-phone">
                Contact phone <span className="text-destructive">*</span>
              </Label>
              <Input
                id="mb-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01700000000"
              />
              <p className="text-muted-foreground text-xs">
                This is the identity. An existing account is matched on it; if
                there is none, one is created.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Service &amp; schedule</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="mb-service">
                Service <span className="text-destructive">*</span>
              </Label>
              <Select value={serviceId} onValueChange={setServiceId}>
                <SelectTrigger id="mb-service" className="w-full">
                  <SelectValue
                    placeholder={
                      catalog.isPending ? 'Loading catalog…' : 'Choose a service'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {active.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {catalog.isError && (
                <p className="text-destructive text-xs">
                  Could not load the catalog. Reload the page to try again.
                </p>
              )}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="mb-asap"
                  checked={asap}
                  onCheckedChange={(v) => setAsap(v === true)}
                />
                <Label htmlFor="mb-asap" className="font-normal">
                  As soon as possible
                </Label>
              </div>
              {!asap && (
                <Input
                  id="mb-scheduled"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full sm:w-[280px]"
                />
              )}
              <p className="text-muted-foreground text-xs">
                Leave as ASAP unless a slot was agreed on the call — an untimed
                booking is triaged as urgent.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Address</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mb-house">House / flat</Label>
              <Input
                id="mb-house"
                value={house}
                onChange={(e) => setHouse(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mb-road">Road</Label>
              <Input
                id="mb-road"
                value={road}
                onChange={(e) => setRoad(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mb-area">
                Area <span className="text-destructive">*</span>
              </Label>
              <Input
                id="mb-area"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="Banani"
              />
              <p className="text-muted-foreground text-xs">
                Drives provider matching — worth getting right.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mb-city">
                City <span className="text-destructive">*</span>
              </Label>
              <Input
                id="mb-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Dhaka"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pricing</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <p className="text-muted-foreground text-sm">
                Optional, and only as a pair. Fill both to send the patient
                straight to the deposit screen; leave both blank to price the
                booking later from the invoice dialog.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mb-fee">Total service fee</Label>
              <Input
                id="mb-fee"
                type="number"
                min={0}
                inputMode="decimal"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mb-deposit">Required deposit</Label>
              <Input
                id="mb-deposit"
                type="number"
                min={0}
                inputMode="decimal"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
              />
            </div>
            {priced && (
              <div className="text-muted-foreground sm:col-span-2 text-sm">
                {moneyInvalid ? (
                  <span className="text-destructive">
                    {feeNum <= 0
                      ? 'Enter a service fee greater than 0.'
                      : depositNum <= 0
                        ? 'Enter a deposit greater than 0.'
                        : 'The deposit cannot exceed the total service fee.'}
                  </span>
                ) : (
                  <>
                    Balance due after the visit:{' '}
                    <span className="text-foreground tabular-nums">
                      {money(balance)}
                    </span>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Call notes</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="mb-call-notes">Summary for the patient</Label>
              <Textarea
                id="mb-call-notes"
                rows={3}
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                Patient-visible — this renders as &ldquo;Note from
                Operations&rdquo; in their app.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mb-admin-note">Internal note</Label>
              <Textarea
                id="mb-admin-note"
                rows={2}
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                Ops only. Never shown to the patient.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/bookings">Cancel</Link>
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={invalid || create.isPending}
          >
            {create.isPending && <Loader2 className="size-4 animate-spin" />}
            Create booking
          </Button>
        </div>
      </div>

      {/* Not dismissible by Escape or an overlay click: closing this by
          accident loses the only copy of the credential. */}
      <Dialog open={issued !== null} onOpenChange={() => {}}>
        <DialogContent
          showCloseButton={false}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Temporary password for {issued?.name}</DialogTitle>
            <DialogDescription>
              This number had no account, so one was created. Read the password
              to the patient before hanging up — they will be forced to change
              it at first sign-in.
            </DialogDescription>
          </DialogHeader>

          <Alert>
            <TriangleAlert className="size-4" />
            <AlertTitle>Shown once</AlertTitle>
            <AlertDescription>
              This password is not stored anywhere in readable form. If you lose
              it, you will have to reset the account.
            </AlertDescription>
          </Alert>

          <div className="flex items-center gap-2 rounded-md border p-3">
            <code className="flex-1 font-mono text-sm break-all">
              {issued?.password}
            </code>
            <Button size="icon" variant="ghost" onClick={copyPassword}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="mb-ack"
              checked={acknowledged}
              onCheckedChange={(v) => setAcknowledged(v === true)}
            />
            <Label htmlFor="mb-ack" className="font-normal">
              I have passed this password on
            </Label>
          </div>

          <DialogFooter>
            <Button
              disabled={!acknowledged}
              onClick={() => {
                setIssued(null);
                setAcknowledged(false);
                if (bookingId) router.push(`/dashboard/bookings/${bookingId}`);
              }}
            >
              Open the booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
