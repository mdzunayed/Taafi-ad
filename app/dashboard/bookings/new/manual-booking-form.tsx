'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Loader2,
  Paperclip,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  createManualBooking,
  type ManualBookingBody,
  type ManualBookingResult,
} from '@/lib/api/bookings';
import { searchPatients, type PatientSearchHit } from '@/lib/api/patients';
import { listApprovedDoctors } from '@/lib/api/providers';
import { normalizeError } from '@/lib/api/errors';
import { qk } from '@/lib/api/query-keys';
import { fileSize, money } from '@/lib/format';
import { BookingCreatedDialog } from './booking-created-dialog';
import {
  InvoiceBuilder,
  computeTotals,
  lineValid,
  type DraftLine,
} from './invoice-builder';

/**
 * The phone-in booking form — the whole conversation an operator has while the
 * patient is on the line, on one page.
 *
 * Four sections, in the order the call actually goes: who is this, what do they
 * need and what does it cost, when and what have they sent us, and finally who
 * is going and how did they pay. They are laid out as cards rather than as a
 * stepper on purpose — an operator taking a call jumps backwards constantly
 * ("sorry, one more thing — she also needs a dressing pack") and a wizard that
 * hides the invoice behind a Back button costs more than the guidance it gives.
 *
 * Plain useState with a derived `invalid`, matching every other form in the
 * console — react-hook-form and zod are in package.json but used nowhere, and
 * one form adopting them would be the odd one out rather than the start of a
 * migration.
 *
 * Money is held as strings and coerced at read, the way the invoice editor does
 * it: a number-typed state would turn a half-typed "1" into a committed value
 * and fight the operator's keystrokes.
 */

const GENDERS = ['Female', 'Male', 'Other'];

/** The uploader's ceiling, mirroring `documentUpload` in the backend. */
const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = '.pdf,.jpg,.jpeg,.png,.webp';

export function ManualBookingForm() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // ── Step 1: who ────────────────────────────────────────────────────────
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<PatientSearchHit | null>(null);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newAge, setNewAge] = useState('');
  const [newGender, setNewGender] = useState('');

  // ── Step 2: the invoice ────────────────────────────────────────────────
  /**
   * What the visit is FOR, in the free text every list, alert and Telegram
   * ping renders.
   *
   * Only asked for when the invoice carries no SERVICE line, because that line
   * already answers it — the server takes the catalog's own title from it, and
   * a second box would be a second place for one fact to be wrong. It is
   * required in the two cases where nothing else can answer: an unpriced
   * booking, and one billed entirely in supplies and medicines.
   */
  const [careType, setCareType] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [discountMode, setDiscountMode] = useState<'percent' | 'flat'>('percent');
  const [discountPercent, setDiscountPercent] = useState('0');
  const [discountFlat, setDiscountFlat] = useState('0');
  const [deposit, setDeposit] = useState('');

  // ── Step 3: care details ───────────────────────────────────────────────
  const [asap, setAsap] = useState(true);
  const [scheduledAt, setScheduledAt] = useState('');
  const [house, setHouse] = useState('');
  const [road, setRoad] = useState('');
  const [area, setArea] = useState('');
  const [city, setCity] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [callNotes, setCallNotes] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  // ── Step 4: dispatch and payment ───────────────────────────────────────
  const [cashCollected, setCashCollected] = useState(false);
  const [doctorId, setDoctorId] = useState('');

  const [created, setCreated] = useState<ManualBookingResult | null>(null);

  /*
    Type-ahead. Keyed per term so backspacing repaints from cache rather than
    flashing empty, and held back until two characters because the server
    answers anything shorter with an empty list anyway — firing those requests
    would be a round-trip per keystroke for a guaranteed empty result.
  */
  const term = search.trim();
  const results = useQuery({
    queryKey: qk.patientSearch(term),
    queryFn: () => searchPatients(term),
    enabled: mode === 'existing' && term.length >= 2,
    staleTime: 30_000,
  });

  /*
    The dispatch roster. Only fetched once the operator has said the money is
    in — before that the picker is disabled and its contents would be a list
    nobody can act on.
  */
  const doctors = useQuery({
    queryKey: qk.approvedDoctors,
    queryFn: listApprovedDoctors,
    enabled: cashCollected,
    staleTime: 5 * 60_000,
  });

  const patientOptions = useMemo<ComboboxOption[]>(
    () =>
      (results.data ?? []).map((p) => ({
        value: p.id,
        label: p.fullName || p.phone,
        hint: [p.phone, p.address].filter(Boolean).join(' · '),
        keywords: p.phone,
        badge:
          p.status && p.status !== 'active' ? (
            <Badge variant="secondary" className="font-normal">
              {p.status}
            </Badge>
          ) : undefined,
      })),
    [results.data],
  );

  const doctorOptions = useMemo<ComboboxOption[]>(
    () =>
      (doctors.data ?? []).map((d) => ({
        value: d.id,
        label: d.fullName,
        hint: [d.specialization, d.rating > 0 ? `★ ${d.rating.toFixed(1)}` : '']
          .filter(Boolean)
          .join(' · '),
        keywords: d.specialization,
      })),
    [doctors.data],
  );

  const totals = computeTotals(
    lines,
    discountMode,
    discountPercent,
    discountFlat,
    deposit,
  );

  // An empty invoice is legal — it creates the booking unpriced, to be quoted
  // later from the invoice editor. Once there IS a line, everything the server
  // checks is checked here first so the operator is not told no after typing.
  const itemized = lines.length > 0;
  const depositNum = Number(deposit) || 0;
  // A service line names the booking on the server's behalf; without one the
  // operator has to.
  const hasServiceLine = lines.some((l) => l.itemType === 'service');
  const needsCareType = !hasServiceLine;
  const invoiceInvalid =
    itemized &&
    (!lines.every(lineValid) ||
      totals.finalTotal <= 0 ||
      depositNum <= 0 ||
      depositNum > totals.finalTotal);

  const patientReady =
    mode === 'existing'
      ? picked !== null
      : newName.trim().length > 0 && newPhone.trim().length >= 10;

  // Cash cannot be claimed on a booking nobody priced — there is no amount to
  // have collected — and a doctor cannot go anywhere until it is.
  const cashWithoutPrice = cashCollected && !itemized;

  const invalid =
    !patientReady ||
    (needsCareType && !careType.trim()) ||
    !area.trim() ||
    !city.trim() ||
    (!asap && !scheduledAt) ||
    invoiceInvalid ||
    cashWithoutPrice;

  const patientName = mode === 'existing' ? (picked?.fullName ?? '') : newName.trim();
  const patientPhone = mode === 'existing' ? (picked?.phone ?? '') : newPhone.trim();
  const doctorName =
    doctors.data?.find((d) => d.id === doctorId)?.fullName ?? null;

  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    const next: File[] = [];
    for (const file of Array.from(incoming)) {
      // Refused here as well as at the server, because a rejection after a
      // 40-second upload of nine other files is a worse way to learn it.
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(`"${file.name}" is over the 8 MB limit.`);
        continue;
      }
      next.push(file);
    }
    setFiles((prev) => {
      const merged = [...prev, ...next];
      if (merged.length > MAX_ATTACHMENTS) {
        toast.error(`Only ${MAX_ATTACHMENTS} attachments can ride on one booking.`);
      }
      return merged.slice(0, MAX_ATTACHMENTS);
    });
  }

  const create = useMutation({
    mutationFn: () => {
      const body: ManualBookingBody = {
        house: house.trim(),
        road: road.trim(),
        area: area.trim(),
        city: city.trim(),
        // `null` is meaningful — it is what makes the booking ASAP, which the
        // server triages as high urgency.
        preferred_time: asap ? null : new Date(scheduledAt).toISOString(),
        condition_note: symptoms.trim(),
        call_summary_notes: callNotes.trim(),
        admin_note: adminNote.trim(),
      };

      // Sent only when the operator typed it. Omitted otherwise so the server
      // resolves the name off the service line it already has, rather than
      // being handed a stale copy of it.
      if (careType.trim()) body.care_type = careType.trim();

      if (mode === 'existing' && picked) {
        body.patientId = picked.id;
      } else {
        body.newPatient = {
          name: newName.trim(),
          phone: newPhone.trim(),
          address: newAddress.trim(),
          // Omitted rather than sent as 0 / '' when the operator did not ask:
          // an absent age is "we do not know", and a zero would be a claim.
          ...(newAge.trim() ? { age: Number(newAge) } : {}),
          ...(newGender ? { gender: newGender } : {}),
        };
      }

      if (itemized) {
        // LINES ONLY. Every total above is a preview of the server's answer;
        // none of them travel.
        body.line_items = lines.map((l) => ({
          item_type: l.itemType,
          item_id: l.itemId,
          title: l.title.trim(),
          quantity: Number(l.quantity),
          unit_price: Number(l.unitPrice),
        }));
        // Exactly one discount form travels — the server rejects both together
        // rather than picking one, so the mode toggle is the single source of
        // truth for which it is.
        if (discountMode === 'percent') {
          body.discount_percentage = Number(discountPercent) || 0;
        } else {
          body.adjusted_discount = Number(discountFlat) || 0;
        }
        body.required_deposit = depositNum;
        body.depositCollectedInCash = cashCollected;
        if (cashCollected && doctorId) body.assignedDoctorId = doctorId;
      }

      return createManualBooking(body, files);
    },
    onSuccess: (booking) => {
      void queryClient.invalidateQueries({ queryKey: qk.bookings });
      void queryClient.invalidateQueries({ queryKey: qk.patients });
      toast.success('Booking created.');
      // Held here rather than navigated away from: the success dialog carries
      // the WhatsApp hand-off and, when this call minted an account, the only
      // copy of the temporary password.
      setCreated(booking);
    },
    onError: (error) => {
      const err = normalizeError(error);
      const raw = err.raw as
        | { active_request_id?: string; error_code?: string; conflictingRequestId?: string }
        | undefined;
      if (raw?.active_request_id) {
        // A bare "conflict" toast leaves the operator with nothing to say to
        // the patient still on the line. Name the booking in the way.
        toast.error(err.message, {
          action: {
            label: 'Open it',
            onClick: () => router.push(`/dashboard/bookings/${raw.active_request_id}`),
          },
        });
        return;
      }
      if (raw?.conflictingRequestId) {
        toast.error(err.message, {
          action: {
            label: 'See the visit',
            onClick: () =>
              router.push(`/dashboard/bookings/${raw.conflictingRequestId}`),
          },
        });
        return;
      }
      toast.error(err.message);
    },
  });

  function resetForAnother() {
    setCreated(null);
    setPicked(null);
    setSearch('');
    setNewName('');
    setNewPhone('');
    setNewAddress('');
    setNewAge('');
    setNewGender('');
    setCareType('');
    setLines([]);
    setDiscountPercent('0');
    setDiscountFlat('0');
    setDeposit('');
    setSymptoms('');
    setCallNotes('');
    setAdminNote('');
    setFiles([]);
    setCashCollected(false);
    setDoctorId('');
  }

  return (
    <>
      <div className="grid max-w-3xl gap-4">
        {/* ── 1. Patient ───────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>1 · Patient</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as 'existing' | 'new')}
              className="flex flex-wrap gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="existing" id="mb-mode-existing" />
                <Label htmlFor="mb-mode-existing" className="font-normal">
                  <Search className="size-3.5" />
                  Find an existing patient
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="new" id="mb-mode-new" />
                <Label htmlFor="mb-mode-new" className="font-normal">
                  <UserPlus className="size-3.5" />
                  Create a new patient
                </Label>
              </div>
            </RadioGroup>

            {mode === 'existing' ? (
              <div className="space-y-1.5">
                <Label htmlFor="mb-patient">
                  Search by phone or name{' '}
                  <span className="text-destructive">*</span>
                </Label>
                <Combobox
                  id="mb-patient"
                  options={patientOptions}
                  value={picked?.id ?? null}
                  onChange={(id) =>
                    setPicked(results.data?.find((p) => p.id === id) ?? null)
                  }
                  placeholder={picked ? picked.fullName : 'Search patients…'}
                  searchPlaceholder="Type a number or a name…"
                  emptyText={
                    term.length < 2
                      ? 'Type at least two characters.'
                      : results.isFetching
                        ? 'Searching…'
                        : 'No patient matches. Create a new one instead.'
                  }
                />
                {/*
                  The Combobox filters what it has been given; this is what
                  fetches. Kept as its own input rather than wired into the
                  popover's search box so the query the SERVER runs is visible
                  and editable, which matters when an operator is reading a
                  number back off a call.
                */}
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="01700000000"
                  aria-label="Patient search term"
                />
                {picked && (
                  <p className="text-muted-foreground text-xs">
                    Booking for <strong>{picked.fullName}</strong> · {picked.phone}
                    {picked.address ? ` · ${picked.address}` : ''}
                  </p>
                )}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="mb-name">
                    Full name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="mb-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mb-phone">
                    Phone number <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="mb-phone"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="01700000000"
                  />
                  <p className="text-muted-foreground text-xs">
                    This is the identity. If the number already has an account,
                    that one is used — no duplicate is created.
                  </p>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="mb-primary-address">Primary address</Label>
                  <Input
                    id="mb-primary-address"
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    placeholder="House 9, Road 3, Uttara, Dhaka"
                  />
                  <p className="text-muted-foreground text-xs">
                    Saved to their profile. The visit address is set below and
                    can differ.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mb-age">Age</Label>
                  <Input
                    id="mb-age"
                    type="number"
                    min={0}
                    max={129}
                    inputMode="numeric"
                    value={newAge}
                    onChange={(e) => setNewAge(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mb-gender">Gender</Label>
                  <Select value={newGender} onValueChange={setNewGender}>
                    <SelectTrigger id="mb-gender" className="w-full">
                      <SelectValue placeholder="Not recorded" />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDERS.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-muted-foreground text-xs">
                    Age and gender reach the attending clinician on the visit
                    card.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── 2. Services and pricing ──────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>2 · Services &amp; pricing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {needsCareType && (
              <div className="space-y-1.5">
                <Label htmlFor="mb-care-type">
                  What is this visit for?{' '}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="mb-care-type"
                  value={careType}
                  onChange={(e) => setCareType(e.target.value)}
                  placeholder="Post-surgery wound dressing"
                />
                <p className="text-muted-foreground text-xs">
                  {itemized
                    ? 'This invoice has no service on it, so name the visit here — it is what every list and alert shows.'
                    : 'Needed to create the booking. Adding a service below fills it in for you.'}
                </p>
              </div>
            )}

            <InvoiceBuilder
              lines={lines}
              setLines={setLines}
              discountMode={discountMode}
              setDiscountMode={setDiscountMode}
              discountPercent={discountPercent}
              setDiscountPercent={setDiscountPercent}
              discountFlat={discountFlat}
              setDiscountFlat={setDiscountFlat}
              deposit={deposit}
              setDeposit={setDeposit}
              totals={totals}
            />
          </CardContent>
        </Card>

        {/* ── 3. Care details and attachments ──────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>3 · Visit details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
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

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="mb-symptoms">Symptoms / triage notes</Label>
              <Textarea
                id="mb-symptoms"
                rows={3}
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                placeholder="What the patient described on the call."
              />
              <p className="text-muted-foreground text-xs">
                Goes to the attending clinician with the booking.
              </p>
            </div>

            {/* ── Attachments ─────────────────────────────────────────── */}
            <div className="space-y-2 sm:col-span-2">
              <Label>Attachments</Label>
              <div
                className="hover:bg-muted/40 rounded-lg border border-dashed p-6 text-center transition-colors"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  addFiles(e.dataTransfer.files);
                }}
              >
                <Paperclip className="text-muted-foreground mx-auto size-5" />
                <p className="text-muted-foreground mt-2 text-sm">
                  Drop discharge summaries, lab reports or prescriptions here
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => fileInput.current?.click()}
                >
                  Choose files
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  accept={ACCEPTED_TYPES}
                  className="hidden"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    // Cleared so re-picking the same file fires `change` again.
                    e.target.value = '';
                  }}
                />
                <p className="text-muted-foreground mt-2 text-xs">
                  PDF, JPEG, PNG or WEBP · up to 8 MB each ·{' '}
                  {MAX_ATTACHMENTS} maximum
                </p>
              </div>

              {files.length > 0 && (
                <ul className="space-y-1.5">
                  {files.map((file, index) => (
                    <li
                      key={`${file.name}-${file.lastModified}-${index}`}
                      className="flex items-center gap-2 rounded-md border p-2 text-sm"
                    >
                      <FileText className="text-muted-foreground size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {fileSize(file.size)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() =>
                          setFiles((prev) => prev.filter((_, i) => i !== index))
                        }
                        aria-label={`Remove ${file.name}`}
                      >
                        <X className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="mb-call-notes">Summary for the patient</Label>
              <Textarea
                id="mb-call-notes"
                rows={2}
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                Patient-visible — this renders as &ldquo;Note from
                Operations&rdquo; in their app.
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
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

        {/* ── 4. Payment and dispatch ──────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>4 · Payment &amp; dispatch</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {!itemized && (
              <Alert>
                <AlertDescription>
                  This booking has no charges on it, so it will be created
                  unpriced and go to the review queue. Add a service above to
                  take a deposit or dispatch a doctor now.
                </AlertDescription>
              </Alert>
            )}

            <RadioGroup
              value={cashCollected ? 'cash' : 'online'}
              onValueChange={(v) => {
                const cash = v === 'cash';
                setCashCollected(cash);
                // A doctor picked and then un-paid would be sent to the server
                // as a dispatch the deposit no longer covers, which is a 409.
                if (!cash) setDoctorId('');
              }}
              className="gap-3"
              disabled={!itemized}
            >
              <div className="flex items-start gap-2">
                <RadioGroupItem value="cash" id="mb-pay-cash" className="mt-1" />
                <Label htmlFor="mb-pay-cash" className="font-normal">
                  <span className="block">
                    Deposit collected in cash / manual transfer
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    Confirms the booking immediately. Use only when the money is
                    already in hand.
                  </span>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="online" id="mb-pay-online" className="mt-1" />
                <Label htmlFor="mb-pay-online" className="font-normal">
                  <span className="block">Request online payment from patient</span>
                  <span className="text-muted-foreground block text-xs">
                    The invoice appears in their app with a payment button.
                  </span>
                </Label>
              </div>
            </RadioGroup>

            <div className="space-y-1.5">
              <Label htmlFor="mb-doctor">Assign a doctor</Label>
              <Combobox
                id="mb-doctor"
                options={doctorOptions}
                value={doctorId || null}
                onChange={setDoctorId}
                placeholder={
                  !cashCollected
                    ? 'Available once the deposit is collected'
                    : doctors.isPending
                      ? 'Loading doctors…'
                      : 'Search verified doctors…'
                }
                searchPlaceholder="Search by name or specialisation…"
                emptyText="No verified doctor matches."
                disabled={!cashCollected || doctors.isPending}
              />
              <p className="text-muted-foreground text-xs">
                {cashCollected
                  ? 'Optional. Only verified doctors who are not already on a visit can be dispatched.'
                  : 'A doctor is dispatched only once the deposit is in — otherwise a clinician is sent to a visit the patient has not confirmed. Assign from the booking after the patient pays.'}
              </p>
              {doctorId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDoctorId('')}
                  className="text-muted-foreground h-7 px-2"
                >
                  Clear
                </Button>
              )}
            </div>

            {itemized && (
              <div className="bg-muted/40 rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total fee</span>
                  <span className="tabular-nums">{money(totals.finalTotal)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {cashCollected ? 'Deposit collected' : 'Deposit due from patient'}
                  </span>
                  <span className="tabular-nums">{money(depositNum)}</span>
                </div>
              </div>
            )}
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
            Create booking &amp; notify patient
          </Button>
        </div>
      </div>

      <BookingCreatedDialog
        booking={created}
        patientName={patientName}
        patientPhone={patientPhone}
        doctorName={doctorName}
        onClose={resetForAnother}
      />
    </>
  );
}
