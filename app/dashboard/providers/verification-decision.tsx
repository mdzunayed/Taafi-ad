'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageSquareWarning, ShieldCheck, ShieldX } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DisabledWhenDenied } from '@/components/rbac/can';
import { decideVerification } from '@/lib/api/providers';
import { qk } from '@/lib/api/query-keys';
import { normalizeError } from '@/lib/api/errors';
import { dateTime } from '@/lib/format';
import {
  VERIFICATION_LABEL,
  type ProviderWire,
  type QualificationDocumentWire,
  type VerificationDecision,
} from '@/types/wire/provider';

/**
 * The credentialing decision, taken next to the documents it is about.
 *
 * This replaces a one-click Verify/Unverify button that sat in the roster
 * table. That button called a TOGGLE — it set the status to whatever it was
 * not — so a stray double-click un-verified a doctor who was already taking
 * visits, and there was no way to record why anything happened.
 *
 * Everything here is deliberately slower than that button: pick an outcome,
 * write the reason, then confirm. The reason is not paperwork — it is sent to
 * the provider by SMS verbatim, and is the only thing telling them what to fix.
 */
export function VerificationDecision({
  provider,
  documents,
}: {
  provider: ProviderWire;
  documents: QualificationDocumentWire[];
}) {
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<VerificationDecision | null>(null);
  const [reason, setReason] = useState('');
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);

  const reasonRequired = decision === 'reject' || decision === 'request_reupload';
  const blocked = !decision || (reasonRequired && reason.trim().length === 0);

  const decide = useMutation({
    mutationFn: () =>
      decideVerification(provider.id, {
        decision: decision!,
        reason: reason.trim() || undefined,
        // Only meaningful for a re-upload request. Empty means "reset them
        // all", which the server treats as start-over.
        document_ids:
          decision === 'request_reupload' && selectedDocs.length
            ? selectedDocs
            : undefined,
      }),
    onSuccess: (updated) => {
      toast.success(SUCCESS_COPY[decision!], {
        description: `${updated.full_name} has been notified by SMS.`,
      });
      queryClient.invalidateQueries({ queryKey: qk.providers });
      queryClient.invalidateQueries({ queryKey: qk.qualifications(provider.id) });
      setDecision(null);
      setReason('');
      setSelectedDocs([]);
    },
    onError: (error) => toast.error(normalizeError(error).message),
  });

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Verification decision</h3>
        <Badge
          variant={
            provider.verification_status === 'verified'
              ? 'default'
              : provider.verification_status === 'rejected'
                ? 'destructive'
                : 'secondary'
          }
        >
          {VERIFICATION_LABEL[provider.verification_status] ??
            provider.verification_status}
        </Badge>
      </div>

      {provider.verification_reason ? (
        <p className="text-muted-foreground text-xs">
          Last decision{' '}
          {provider.verification_decided_at
            ? dateTime(provider.verification_decided_at)
            : ''}
          : {provider.verification_reason}
        </p>
      ) : null}

      <ToggleGroup
        type="single"
        variant="outline"
        value={decision ?? ''}
        onValueChange={(v) => {
          setDecision((v || null) as VerificationDecision | null);
          setSelectedDocs([]);
        }}
        className="flex-wrap justify-start"
      >
        <ToggleGroupItem value="approve">
          <ShieldCheck className="size-4" />
          Approve
        </ToggleGroupItem>
        <ToggleGroupItem value="reject">
          <ShieldX className="size-4" />
          Reject
        </ToggleGroupItem>
        <ToggleGroupItem value="request_reupload">
          <MessageSquareWarning className="size-4" />
          Request re-upload
        </ToggleGroupItem>
      </ToggleGroup>

      {decision === 'approve' &&
      documents.some((d) => d.review_status !== 'approved') ? (
        <Alert>
          <AlertDescription>
            Some documents are still unapproved. Verifying anyway is allowed —
            the per-document review below is a separate record — but the
            approval is what lets this provider take visits.
          </AlertDescription>
        </Alert>
      ) : null}

      {decision === 'request_reupload' ? (
        <div className="space-y-2">
          <Label>Documents to request again</Label>
          {documents.length ? (
            <div className="space-y-1.5">
              {documents.map((doc) => (
                <div key={doc._id} className="flex items-center gap-2">
                  <Checkbox
                    id={`reupload-${doc._id}`}
                    checked={selectedDocs.includes(doc._id)}
                    onCheckedChange={(v) =>
                      setSelectedDocs((s) =>
                        v === true ? [...s, doc._id] : s.filter((x) => x !== doc._id),
                      )
                    }
                  />
                  <Label htmlFor={`reupload-${doc._id}`} className="font-normal">
                    {doc.name}
                    <span className="text-muted-foreground ml-1 text-xs">
                      ({doc.review_status})
                    </span>
                  </Label>
                </div>
              ))}
              <p className="text-muted-foreground text-xs">
                Select none to reset every document — the right choice when the
                whole submission was unusable.
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Nothing uploaded yet, so there is nothing to reset. The reason still
              reaches them by SMS.
            </p>
          )}
        </div>
      ) : null}

      {decision ? (
        <div className="space-y-2">
          <Label htmlFor="verification-reason">
            Reason{' '}
            {reasonRequired ? (
              <span className="text-destructive">*</span>
            ) : (
              <span className="text-muted-foreground text-xs">(optional)</span>
            )}
          </Label>
          <Textarea
            id="verification-reason"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={REASON_PLACEHOLDER[decision]}
          />
          {reasonRequired ? (
            <p className="text-muted-foreground text-xs">
              Sent to {provider.phone || 'the provider'} by SMS word for word.
              Write it for them, not for the audit log.
            </p>
          ) : null}
        </div>
      ) : null}

      <DisabledWhenDenied
        capability="providers.verify"
        reason="Only an admin can decide a provider's verification."
      >
        <Button
          onClick={() => decide.mutate()}
          disabled={blocked || decide.isPending}
          variant={decision === 'reject' ? 'destructive' : 'default'}
        >
          {decide.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          {decision ? CONFIRM_LABEL[decision] : 'Choose an outcome'}
        </Button>
      </DisabledWhenDenied>
    </section>
  );
}

const CONFIRM_LABEL: Record<VerificationDecision, string> = {
  approve: 'Approve & notify',
  reject: 'Reject & notify',
  request_reupload: 'Request re-upload & notify',
};

const SUCCESS_COPY: Record<VerificationDecision, string> = {
  approve: 'Provider verified.',
  reject: 'Verification rejected.',
  request_reupload: 'Re-upload requested.',
};

const REASON_PLACEHOLDER: Record<VerificationDecision, string> = {
  approve: 'Anything worth recording about this approval.',
  reject: 'e.g. The BMDC number does not match the council register.',
  request_reupload: 'e.g. The licence photo is too blurry to read the number.',
};
