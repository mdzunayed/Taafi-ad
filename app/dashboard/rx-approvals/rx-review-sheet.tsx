'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Loader2,
  MessageSquareWarning,
  PencilLine,
  ShieldX,
} from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DocumentPreview } from '@/components/common/document-preview';
import { DisabledWhenDenied } from '@/components/rbac/can';
import { decidePrescription, type RxDecision } from '@/lib/api/system';
import { normalizeError } from '@/lib/api/errors';
import { dateOnly, dateTime } from '@/lib/format';
import type { PrescriptionItemWire, PrescriptionWire } from '@/types/wire/misc';

import { RxEditForm } from './rx-edit-form';
import { RxApprovalBadge, RxReleaseBadge } from './rx-status-badge';

const CONFIRM_LABEL: Record<RxDecision, string> = {
  approve: 'Approve & lock',
  request_revision: 'Send back to doctor',
  reject: 'Reject',
};

const SUCCESS_COPY: Record<RxDecision, string> = {
  approve: 'Prescription approved and locked.',
  request_revision: 'Sent back to the doctor with your note.',
  reject: 'Prescription rejected.',
};

const REASON_LABEL: Record<RxDecision, string> = {
  approve: 'Internal note (optional)',
  request_revision: 'What should the doctor change?',
  reject: 'Why is this being rejected?',
};

const REASON_PLACEHOLDER: Record<RxDecision, string> = {
  approve: 'Anything worth recording for the audit trail.',
  request_revision:
    'e.g. "Napa 500mg is prescribed 3x daily for 14 days — confirm the duration."',
  reject: 'e.g. "Issued against the wrong patient record."',
};

const OUTCOME_HELP: Record<RxDecision, string> = {
  approve:
    'The doctor can no longer edit this script. It releases to the patient once their visit balance is settled.',
  request_revision:
    'The doctor sees your note on their pad and can edit and resubmit. The patient is not told.',
  reject:
    'Terminal. The script is never released, and settling the balance will not resurrect it.',
};

/** "Morning · Night", or an em dash when the doctor selected no slot. */
function frequencyLabel(item: PrescriptionItemWire) {
  const freq = item.frequency ?? {};
  const slots = [
    freq.morning ? 'Morning' : null,
    freq.afternoon ? 'Afternoon' : null,
    freq.night ? 'Night' : null,
  ].filter(Boolean);
  return slots.length ? slots.join(' · ') : '—';
}

/**
 * The clinical sign-off, taken next to the script it is about.
 *
 * A Sheet rather than the old Dialog because the decision needs the whole
 * script visible while it is made: the medication rows, and any scanned paper
 * script the doctor photographed instead of retyping. Approving a list of drugs
 * you cannot see is not review.
 */
/**
 * The outcome picker. Its own component, mounted with `key={rx.id}`, so moving
 * to a different script REMOUNTS it and the chosen outcome and typed reason
 * reset for free — carrying either across rows is how the wrong reason ends up
 * attached to the wrong prescription.
 */
function RxDecisionForm({
  rx,
  onDone,
}: {
  rx: PrescriptionWire;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<RxDecision | null>(null);
  const [reason, setReason] = useState('');

  const reasonRequired = decision === 'reject' || decision === 'request_revision';
  const blocked = !decision || (reasonRequired && reason.trim().length === 0);

  const decide = useMutation({
    mutationFn: () =>
      decidePrescription(rx.id, {
        action: decision!,
        reason: reason.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success(SUCCESS_COPY[decision!]);
      queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
      onDone();
    },
    onError: (error) => toast.error(normalizeError(error).message),
  });

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">Your decision</h3>
      <ToggleGroup
        type="single"
        variant="outline"
        value={decision ?? ''}
        onValueChange={(v) => setDecision((v || null) as RxDecision | null)}
        className="flex-wrap justify-start"
      >
        <ToggleGroupItem value="approve">
          <CheckCircle2 className="size-4" />
          Approve
        </ToggleGroupItem>
        <ToggleGroupItem value="request_revision">
          <MessageSquareWarning className="size-4" />
          Request revision
        </ToggleGroupItem>
        <ToggleGroupItem value="reject">
          <ShieldX className="size-4" />
          Reject
        </ToggleGroupItem>
      </ToggleGroup>

      {decision ? (
        <>
          <p className="text-muted-foreground text-xs">{OUTCOME_HELP[decision]}</p>
          <div className="space-y-2">
            <Label htmlFor="rx-reason">{REASON_LABEL[decision]}</Label>
            <Textarea
              id="rx-reason"
              rows={3}
              value={reason}
              placeholder={REASON_PLACEHOLDER[decision]}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <DisabledWhenDenied
          capability="prescriptions.approve"
          reason="Signing off a prescription needs the approve_providers permission."
        >
          <Button
            onClick={() => decide.mutate()}
            disabled={blocked || decide.isPending}
            variant={decision === 'reject' ? 'destructive' : 'default'}
          >
            {decide.isPending && <Loader2 className="size-4 animate-spin" />}
            {decision ? CONFIRM_LABEL[decision] : 'Choose an outcome'}
          </Button>
        </DisabledWhenDenied>
      </div>
    </section>
  );
}

/**
 * The amendment editor, behind a disclosure.
 *
 * Mounted with `key={`amend-${rx.id}`}` by the caller for the same reason the
 * decision form is: moving to another script must not carry a half-typed drug
 * name onto it.
 */
function RxAmendSection({ rx }: { rx: PrescriptionWire }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <PencilLine className="size-4" />
        Amend this draft
      </Button>
    );
  }
  return (
    // Closing on save is what re-seeds the form: it unmounts, and reopening
    // builds fresh state from the refetched script rather than the values it
    // was initialised with before the write.
    <RxEditForm rx={rx} onSaved={() => setOpen(false)} />
  );
}

export function RxReviewSheet({
  rx,
  onOpenChange,
}: {
  rx: PrescriptionWire | null;
  onOpenChange: (open: boolean) => void;
}) {
  const decided =
    rx?.admin_approval_status === 'APPROVED' ||
    rx?.admin_approval_status === 'REJECTED';

  return (
    <Sheet open={rx !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="px-6">
          <SheetTitle>Prescription review</SheetTitle>
          <SheetDescription>
            {rx?.patient?.name ?? rx?.patient_snapshot?.name ?? 'Patient'} ·
            issued by {rx?.doctor?.full_name ?? rx?.doctor_name ?? 'a doctor'}
            {rx?.issued_at ? ` · ${dateTime(rx.issued_at)}` : ''}
          </SheetDescription>
        </SheetHeader>

        {rx ? (
          <ScrollArea className="h-[calc(100vh-8rem)]">
            <div className="space-y-5 px-6 pb-8">
              <div className="flex flex-wrap items-center gap-2">
                <RxApprovalBadge status={rx.admin_approval_status} />
                <RxReleaseBadge rx={rx} />
              </div>

              {rx.revision_note ? (
                <Alert>
                  <MessageSquareWarning className="size-4" />
                  <AlertDescription>
                    Previously sent back: {rx.revision_note}
                  </AlertDescription>
                </Alert>
              ) : null}

              <section className="space-y-1">
                <h3 className="text-sm font-medium">Diagnosis</h3>
                <p className="text-muted-foreground text-sm">
                  {rx.diagnosis || 'Not recorded'}
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-medium">
                  Medications{' '}
                  <span className="text-muted-foreground font-normal">
                    ({rx.items?.length ?? 0})
                  </span>
                </h3>
                {rx.items?.length ? (
                  <div className="divide-y rounded-lg border">
                    {rx.items.map((item, i) => (
                      <div key={item._id ?? i} className="space-y-1 p-3">
                        <p className="text-sm font-medium">
                          {[item.form, item.drug_name].filter(Boolean).join('. ')}
                          {item.dosage ? ` — ${item.dosage}` : ''}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {frequencyLabel(item)} · {item.meal_context ?? 'either'} meal ·{' '}
                          {item.duration_days ?? '—'} days
                        </p>
                        {item.notes ? (
                          <p className="text-muted-foreground text-xs italic">
                            {item.notes}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm">
                    No structured medications — this is a scanned script. Read the
                    attachment below.
                  </p>
                )}
              </section>

              {rx.attachments?.length ? (
                <section className="space-y-2">
                  <h3 className="text-sm font-medium">
                    Scanned prescription ({rx.attachments.length})
                  </h3>
                  {rx.attachments.map((doc, i) => (
                    <div key={doc._id ?? i} className="space-y-1">
                      <p className="text-muted-foreground text-xs">{doc.name}</p>
                      <DocumentPreview
                        url={doc.url ?? ''}
                        mime={doc.mime}
                        name={doc.name}
                        className="h-96"
                      />
                    </div>
                  ))}
                </section>
              ) : null}

              {rx.advice || rx.follow_up_date ? (
                <section className="space-y-1">
                  <h3 className="text-sm font-medium">Advice</h3>
                  {rx.advice ? (
                    <p className="text-muted-foreground text-sm">{rx.advice}</p>
                  ) : null}
                  {rx.follow_up_date ? (
                    <p className="text-muted-foreground text-sm">
                      Follow-up: {dateOnly(rx.follow_up_date)}
                    </p>
                  ) : null}
                </section>
              ) : null}

              <Separator />

              {decided ? (
                <Alert>
                  <CheckCircle2 className="size-4" />
                  <AlertDescription>
                    This prescription was already{' '}
                    {rx.admin_approval_status === 'APPROVED' ? 'approved' : 'rejected'}
                    {rx.locked_at ? ` on ${dateTime(rx.locked_at)}` : ''}. Decisions
                    are final.
                    {rx.rejection_reason ? ` Reason: ${rx.rejection_reason}` : ''}
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  {/*
                    Amendment sits ABOVE the decision, in the order the work
                    actually happens: you correct a script and then sign it
                    off. Putting it below would invite approving first, and
                    approval locks the document against the very edit the
                    reviewer was about to make.

                    Collapsed by default. Most scripts need reading and a
                    decision, not rewriting — an editor open on every row
                    turns a review screen into a data-entry form and makes an
                    accidental edit to someone else's clinical judgement a
                    stray keystroke away.
                  */}
                  <RxAmendSection key={`amend-${rx.id}`} rx={rx} />
                  <RxDecisionForm
                    key={rx.id}
                    rx={rx}
                    onDone={() => onOpenChange(false)}
                  />
                </>
              )}
            </div>
          </ScrollArea>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
