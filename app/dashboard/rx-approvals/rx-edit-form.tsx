'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { DisabledWhenDenied } from '@/components/rbac/can';
import { amendPrescription } from '@/lib/api/system';
import { normalizeError } from '@/lib/api/errors';
import type { PrescriptionItemWire, PrescriptionWire } from '@/types/wire/misc';

/** Dosage forms the pad prints, mirroring MED_FORMS in the backend validator. */
const FORMS = ['TAB', 'CAP', 'SYR', 'INJ', 'CRM', 'DROP'] as const;
const MEALS = ['before', 'after', 'either'] as const;

const MEAL_LABEL: Record<(typeof MEALS)[number], string> = {
  before: 'Before meal',
  after: 'After meal',
  either: 'Either',
};

/** A row in the editor. Local shape — every field is a string while typing. */
interface Draft {
  form: string;
  drug_name: string;
  dosage: string;
  morning: boolean;
  afternoon: boolean;
  night: boolean;
  meal_context: string;
  duration_days: string;
  notes: string;
}

function toDraft(item: PrescriptionItemWire): Draft {
  return {
    form: item.form ?? '',
    drug_name: item.drug_name ?? '',
    dosage: item.dosage ?? '',
    morning: Boolean(item.frequency?.morning),
    afternoon: Boolean(item.frequency?.afternoon),
    night: Boolean(item.frequency?.night),
    meal_context: item.meal_context ?? 'either',
    duration_days: String(item.duration_days ?? 7),
    notes: item.notes ?? '',
  };
}

function toWire(d: Draft): PrescriptionItemWire {
  return {
    form: d.form || undefined,
    drug_name: d.drug_name.trim(),
    dosage: d.dosage.trim(),
    frequency: { morning: d.morning, afternoon: d.afternoon, night: d.night },
    meal_context: d.meal_context as PrescriptionItemWire['meal_context'],
    duration_days: Number(d.duration_days) || 7,
    notes: d.notes.trim(),
  };
}

const EMPTY: Draft = {
  form: 'TAB',
  drug_name: '',
  dosage: '',
  morning: false,
  afternoon: false,
  night: false,
  meal_context: 'either',
  duration_days: '7',
  notes: '',
};

/**
 * The first client-side refusal a row can earn, or null. Mirrors the order the
 * server's `normaliseItem` checks in, so the message an operator gets here is
 * the message they would have got from the API — finding out about a blank
 * dosage after a round trip is worse, not different.
 */
function rowProblem(d: Draft, i: number): string | null {
  if (!d.drug_name.trim()) return `Row ${i + 1}: a medicine name is required.`;
  if (!d.dosage.trim()) return `Row ${i + 1}: a dosage is required.`;
  if (!d.morning && !d.afternoon && !d.night) {
    return `Row ${i + 1}: pick at least one time of day.`;
  }
  const n = Number(d.duration_days);
  if (!Number.isFinite(n) || n < 1 || n > 365) {
    return `Row ${i + 1}: duration must be between 1 and 365 days.`;
  }
  return null;
}

/**
 * Amend a doctor's draft in place.
 *
 * WHEN TO USE THIS RATHER THAN "REQUEST REVISION". A send-back is a question
 * for the doctor — it is the right tool when the script needs a clinician to
 * re-think something, and the only tool when you are not certain what the
 * right answer is. This is for the correction that has exactly one answer and
 * would otherwise cost a day: a decimal in the wrong place, a duration typed
 * into the wrong field. The doctor has finished the visit and moved on; the
 * patient is waiting on the medication.
 *
 * WHAT IT DOES NOT DO. Amending is not approving. The script keeps whatever
 * review state it had, so a corrected draft still has to be signed off on the
 * decision form below — nothing here releases anything to the patient. And the
 * issuing doctor is notified of every amendment, because the pad carries their
 * signature and they remain accountable for what it says.
 *
 * The whole editor disappears once a script is APPROVED: `locked_at` means
 * those exact words were signed off, and the server refuses an amendment after
 * it with a 409. Correct first, then approve.
 */
export function RxEditForm({
  rx,
  onSaved,
}: {
  rx: PrescriptionWire;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<Draft[]>(() =>
    (rx.items ?? []).map(toDraft),
  );
  const [diagnosis, setDiagnosis] = useState(rx.diagnosis ?? '');
  const [advice, setAdvice] = useState(rx.advice ?? '');
  const [note, setNote] = useState('');

  // A scanned script is a valid prescription with zero structured rows, so
  // emptying the list is only a mistake when there is no scan behind it. The
  // server draws the line in the same place.
  const hasScan = Boolean(rx.attachments?.length);
  const problems = items.map(rowProblem).filter(Boolean) as string[];
  const emptied = items.length === 0 && !hasScan;

  const dirty =
    diagnosis !== (rx.diagnosis ?? '') ||
    advice !== (rx.advice ?? '') ||
    JSON.stringify(items) !==
      JSON.stringify((rx.items ?? []).map(toDraft));

  const blocked = !dirty || problems.length > 0 || emptied;

  function patch(i: number, next: Partial<Draft>) {
    setItems((prev) => prev.map((d, j) => (j === i ? { ...d, ...next } : d)));
  }

  const save = useMutation({
    mutationFn: () =>
      amendPrescription(rx.id, {
        // `items` REPLACES the list server-side, so the untouched rows travel
        // with the edited ones. Sending only what changed would delete the rest.
        items: items.map(toWire),
        diagnosis: diagnosis.trim(),
        advice: advice.trim(),
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Prescription amended.', {
        description: 'The issuing doctor has been notified. It still needs review.',
      });
      queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
      onSaved();
    },
    // A 409 here means someone approved the script in another tab while this
    // form was open. The server's message says so; show it verbatim.
    onError: (error) => toast.error(normalizeError(error).message),
  });

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">Amend this draft</h3>
        <p className="text-muted-foreground text-xs">
          For a correction with one obvious answer. Anything needing the
          doctor’s judgement should go back to them with a note instead.
          Amending does not approve — you still sign it off below.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="rx-diagnosis">Diagnosis</Label>
        <Input
          id="rx-diagnosis"
          value={diagnosis}
          maxLength={600}
          onChange={(e) => setDiagnosis(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Medications</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setItems((prev) => [...prev, { ...EMPTY }])}
          >
            <Plus className="size-3.5" />
            Add row
          </Button>
        </div>

        {items.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm">
            {hasScan
              ? 'No structured rows — the script is the scan below.'
              : 'No medications. Add a row, or reject the script if it should not stand.'}
          </p>
        ) : (
          <div className="space-y-3">
            {items.map((d, i) => (
              <div key={i} className="space-y-2 rounded-lg border p-3">
                <div className="flex gap-2">
                  <Select
                    value={d.form || 'TAB'}
                    onValueChange={(v) => patch(i, { form: v })}
                  >
                    <SelectTrigger className="w-24 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FORMS.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    aria-label={`Medicine name, row ${i + 1}`}
                    placeholder="Medicine name"
                    value={d.drug_name}
                    onChange={(e) => patch(i, { drug_name: e.target.value })}
                  />
                  <Input
                    aria-label={`Dosage, row ${i + 1}`}
                    placeholder="Dosage"
                    className="w-28 shrink-0"
                    value={d.dosage}
                    onChange={(e) => patch(i, { dosage: e.target.value })}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove row ${i + 1}`}
                    onClick={() =>
                      setItems((prev) => prev.filter((_, j) => j !== i))
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  {(['morning', 'afternoon', 'night'] as const).map((slot) => (
                    <label
                      key={slot}
                      className="flex cursor-pointer items-center gap-2 text-sm capitalize"
                    >
                      <Checkbox
                        checked={d[slot]}
                        onCheckedChange={(v) => patch(i, { [slot]: v === true })}
                      />
                      {slot}
                    </label>
                  ))}

                  <Select
                    value={d.meal_context}
                    onValueChange={(v) => patch(i, { meal_context: v })}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MEALS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {MEAL_LABEL[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex items-center gap-2">
                    <Input
                      aria-label={`Duration in days, row ${i + 1}`}
                      type="number"
                      min={1}
                      max={365}
                      className="w-20"
                      value={d.duration_days}
                      onChange={(e) => patch(i, { duration_days: e.target.value })}
                    />
                    <span className="text-muted-foreground text-xs">days</span>
                  </div>
                </div>

                <Input
                  aria-label={`Instructions, row ${i + 1}`}
                  placeholder="Instructions for the patient (optional)"
                  value={d.notes}
                  maxLength={500}
                  onChange={(e) => patch(i, { notes: e.target.value })}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="rx-advice">Advice</Label>
        <Textarea
          id="rx-advice"
          rows={2}
          value={advice}
          maxLength={1000}
          onChange={(e) => setAdvice(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="rx-amend-note">
          What did you change?{' '}
          <span className="text-muted-foreground font-normal">
            (sent to the doctor)
          </span>
        </Label>
        <Textarea
          id="rx-amend-note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Napa dosage read 5000mg — corrected to 500mg."
        />
      </div>

      {problems.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            <ul className="list-inside list-disc">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {emptied && (
        <Alert variant="destructive">
          <AlertDescription>
            A script needs at least one medication or a scanned attachment.
            Reject it instead if it should not stand.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end">
        <DisabledWhenDenied
          capability="prescriptions.amend"
          reason="Editing a prescription needs the approve_providers permission."
        >
          <Button onClick={() => save.mutate()} disabled={blocked || save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            Save amendment
          </Button>
        </DisabledWhenDenied>
      </div>
    </div>
  );
}
