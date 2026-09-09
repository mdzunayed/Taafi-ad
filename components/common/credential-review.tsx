'use client';

import { type ReactNode, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Loader2, Mail, PenLine, Phone } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { ApiErrorState } from '@/components/rbac/api-error-state';
import { DisabledWhenDenied } from '@/components/rbac/can';
import { DocumentPreview } from '@/components/common/document-preview';
import { EmptyState, TableSkeleton } from '@/components/data/states';
import { useCan } from '@/hooks/use-permission';
import { getQualifications, reviewQualification } from '@/lib/api/providers';
import { qk } from '@/lib/api/query-keys';
import { normalizeError } from '@/lib/api/errors';
import { dateTime, humanize } from '@/lib/format';
import { VerificationDecision } from '@/app/dashboard/providers/verification-decision';
import type {
  PresentAddressWire,
  ProviderWire,
  QualificationDocumentWire,
} from '@/types/wire/provider';

const REVIEW_TONE = {
  approved: 'default',
  rejected: 'destructive',
  pending: 'secondary',
} as const;

/**
 * Document-type labels, because `humanize()` gets one of them wrong.
 *
 * It lowercases everything after the first letter, which turns `nid` into
 * "Nid" — a reviewer scanning a row of badges for the national ID card should
 * not have to work out that "Nid" is it. The rest are listed so the map is
 * total and the fallback below is genuinely unreachable for a known type.
 */
const DOC_TYPE_LABEL: Record<QualificationDocumentWire['doc_type'], string> = {
  degree: 'Degree',
  license: 'Licence',
  training: 'Training',
  experience: 'Experience',
  nid: 'NID',
  other: 'Other',
};

/** Any part filled in at all. House and road are optional server-side, so a
 *  present address can legitimately be just an area and a city. */
function hasAddress(address?: PresentAddressWire): boolean {
  if (!address) return false;
  return [address.house, address.road, address.area, address.city].some(
    (part) => Boolean(part && part.trim()),
  );
}

/** One line, skipping the parts that were left blank — so a missing house
 *  number does not print as a stray comma in front of the area. */
function formatAddress(address?: PresentAddressWire): string | undefined {
  if (!hasAddress(address)) return undefined;
  return [address!.house, address!.road, address!.area, address!.city]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
}

/**
 * The document, the claim it supports, and the decision — in one frame.
 *
 * The registration number and the certificate deliberately sit side by side:
 * the reviewer's actual job is checking that the number typed into the profile
 * is the number printed on the card, and a layout that makes them scroll
 * between the two invites approving on the strength of the typed one alone.
 *
 * ## Why this lives in components/common rather than beside either caller
 *
 * There used to be TWO review surfaces. The verification queue opened a dialog
 * carrying the profile, the registration claim and the contact launchers; the
 * provider roster opened a sheet carrying the per-document approve/reject
 * controls — and neither carried the other's half. Which one a reviewer got
 * depended on which link they had clicked, and the roster's version showed the
 * certificate next to an "Approve & notify" button WITHOUT ever showing the
 * registration number that button is a judgement about.
 *
 * One component, rendered by both entry points, is what stops that reopening.
 * The decision controls are the shared <VerificationDecision>, not a copy — it
 * is the component that enforces the mandatory reason, and a second
 * implementation would be a second place for that rule to not hold.
 *
 * Both the qualification documents and the signature are served from PUBLIC
 * absolute URLs on unguessable paths, so they render with no bearer token —
 * which is why the preview is a plain <img>/<iframe> switched on the
 * server-sniffed MIME rather than anything that tries to authenticate.
 */
export function CredentialReview({ provider }: { provider: ProviderWire }) {
  const queryClient = useQueryClient();

  // Which document is on screen. Held as an id rather than an index so a
  // refetch that reorders or drops a document cannot silently swap the pane to
  // a different file than the one the reviewer was reading.
  const [active, setActive] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  /**
   * The credential scans are gated on APPROVE_PROVIDERS server-side, matching
   * the review PATCH — they are a doctor's identity documents, and reading them
   * is as privileged as ruling on them. `support_member` reaches this dialog
   * (it holds `providers.read`, deliberately loose so support can dispatch) but
   * not this query, so it is disabled rather than fired to collect a 403.
   */
  const canReadDocuments = useCan('providers.reviewQualification');

  const query = useQuery({
    queryKey: qk.qualifications(provider.id),
    queryFn: () => getQualifications(provider.id),
    enabled: canReadDocuments,
  });

  const review = useMutation({
    mutationFn: (input: {
      docId: string;
      review_status: 'approved' | 'rejected';
    }) =>
      reviewQualification(provider.id, input.docId, {
        review_status: input.review_status,
        review_note: notes[input.docId]?.slice(0, 500),
      }),
    onSuccess: (_docs, input) => {
      toast.success(`Document ${input.review_status}.`);
      queryClient.invalidateQueries({
        queryKey: qk.qualifications(provider.id),
      });
      queryClient.invalidateQueries({ queryKey: qk.providers });
    },
    onError: (error) => toast.error(normalizeError(error).message),
  });

  const documents: QualificationDocumentWire[] = query.data?.documents ?? [];

  // Land on the LICENCE document rather than whatever happens to sort first.
  // The BMDC certificate is the thing this whole queue exists to look at, and
  // a self-registered doctor's is always `doc_type: 'license'` — opening on a
  // training certificate instead costs the reviewer a click on every single
  // application. Falls back to the first document for older providers who
  // uploaded everything as `other`.
  //
  // Derived instead of stored: `active` is only ever the reviewer's explicit
  // pick, so a provider opening in the same dialog — or a document list that
  // arrives after the first paint — falls back here without an effect to
  // resynchronise.
  const primaryId =
    documents.find((d) => d.doc_type === 'license')?._id ??
    documents[0]?._id ??
    null;
  const selectedId =
    active && documents.some((d) => d._id === active) ? active : primaryId;

  const isNurse = provider.role === 'nurse';
  const licence = isNurse ? provider.nursing_license : provider.bmdc_license;
  const licenceLabel = isNurse
    ? 'Nursing council registration'
    : 'BMDC registration';
  const current = documents.find((d) => d._id === selectedId) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      {/* ── The claim ─────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <section className="space-y-3 rounded-lg border p-4">
          <h3 className="text-sm font-medium">Profile</h3>
          <dl className="space-y-2.5 text-sm">
            <Row label="Full name" value={provider.full_name} />
            <Row label="Role" value={humanize(provider.role)} />
            <Row
              label={licenceLabel}
              value={licence}
              mono
              missing={`No ${isNurse ? 'council' : 'BMDC'} number submitted`}
            />
            <Row
              label="Specialisation"
              value={provider.specialization || provider.specialty}
            />
            <Row label="Degrees" value={provider.degrees} />
            <Row
              label="Institution / affiliation"
              value={provider.hospital_affiliation}
            />
            <Row
              label="Experience"
              value={
                provider.years_experience
                  ? `${provider.years_experience} years`
                  : undefined
              }
            />
          </dl>
        </section>

        {/*
          Contact, with the launchers next to the values.

          A reviewer who needs to query a blurry certificate or a registration
          number that does not match the card is one tap from asking the
          applicant, rather than copying a number out of a modal by hand.
          Hidden entirely when there is nothing to reach them on — an
          admin-provisioned row may carry neither.
        */}
        {(provider.phone || provider.email) && (
          <section className="space-y-3 rounded-lg border p-4">
            <h3 className="text-sm font-medium">Contact</h3>
            <dl className="space-y-2.5 text-sm">
              <ContactRow
                label="Phone"
                value={provider.phone}
                href={
                  provider.phone
                    ? `tel:${provider.phone.replace(/[^+\d]/g, '')}`
                    : undefined
                }
                icon={<Phone className="size-3.5" />}
                action="Call"
              />
              <ContactRow
                label="Email"
                value={provider.email}
                href={provider.email ? `mailto:${provider.email}` : undefined}
                icon={<Mail className="size-3.5" />}
                action="Email"
              />
            </dl>
          </section>
        )}

        {/*
          The self-registration claim.

          Rendered as its own section rather than folded into Profile because
          it is what a self-registered applicant typed about themselves with
          nobody checking, and the reviewer's job is to disbelieve it until the
          certificate agrees. Admin-provisioned providers have none of it, so
          the whole section is hidden rather than shown as four "Not provided"
          rows — an empty block reads as a missing submission when it only
          means this doctor was onboarded a different way.
        */}
        {(provider.medical_college ||
          provider.graduation_year ||
          hasAddress(provider.present_address)) && (
          <section className="space-y-3 rounded-lg border p-4">
            <h3 className="text-sm font-medium">Registration claim</h3>
            <dl className="space-y-2.5 text-sm">
              <Row label="Medical college" value={provider.medical_college} />
              <Row
                label="Passing year"
                value={
                  provider.graduation_year
                    ? String(provider.graduation_year)
                    : undefined
                }
              />
              <Row
                label="Present address"
                value={formatAddress(provider.present_address)}
              />
            </dl>
          </section>
        )}

        {provider.verification_reason && (
          <section className="space-y-1.5 rounded-lg border p-4">
            <h3 className="text-sm font-medium">Last decision</h3>
            <p className="text-muted-foreground text-sm italic">
              “{provider.verification_reason}”
            </p>
            {provider.verification_decided_at && (
              <p className="text-muted-foreground text-xs">
                {dateTime(provider.verification_decided_at)}
              </p>
            )}
          </section>
        )}

        <VerificationDecision provider={provider} documents={documents} />
      </div>

      {/* ── The evidence ──────────────────────────────────────────────── */}
      <div className="space-y-3">
        {!canReadDocuments ? (
          // The left column still renders: name, licence number, medical
          // college and the last decision are all things support staff
          // legitimately need while handling a provider's call. Only the
          // scans themselves are withheld.
          <EmptyState
            title="Credential scans are restricted"
            description="Viewing uploaded identity documents requires provider-approval access. The profile details are on the left."
          />
        ) : query.isError ? (
          <ApiErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : query.isLoading ? (
          <TableSkeleton rows={3} cols={2} />
        ) : documents.length === 0 ? (
          <EmptyState
            title="No documents uploaded"
            description="This provider has not submitted any credential scans yet. Ask for a re-upload to open the slot in their app."
          />
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {documents.map((doc) => (
                <Button
                  key={doc._id}
                  type="button"
                  size="sm"
                  variant={doc._id === selectedId ? 'default' : 'outline'}
                  onClick={() => setActive(doc._id)}
                >
                  <FileText className="size-3.5" />
                  <span className="max-w-[16ch] truncate">{doc.name}</span>
                  <Badge variant="secondary" className="ml-1">
                    {DOC_TYPE_LABEL[doc.doc_type] ?? humanize(doc.doc_type)}
                  </Badge>
                </Button>
              ))}
            </div>

            {current && (
              <>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{current.name}</span>
                  <Badge variant={REVIEW_TONE[current.review_status]}>
                    {humanize(current.review_status)}
                  </Badge>
                  {current.uploaded_at && (
                    <span className="text-muted-foreground text-xs">
                      uploaded {dateTime(current.uploaded_at)}
                    </span>
                  )}
                </div>
                <DocumentPreview
                  url={current.url}
                  mime={current.mime}
                  name={current.name}
                  className="h-[58vh]"
                />

                {/*
                  Per-document review, acting on the document that is actually
                  on screen. The roster's old sheet repeated these controls
                  under every document down a long scroll, which is how a note
                  written for one card gets submitted against another.

                  This is a separate record from the verification decision on
                  the left: approving a document is bookkeeping about one file,
                  approving the PROVIDER is what lets them take visits.
                */}
                <DocumentReview
                  key={current._id}
                  doc={current}
                  note={notes[current._id] ?? ''}
                  onNoteChange={(value) =>
                    setNotes((n) => ({ ...n, [current._id]: value }))
                  }
                  pending={
                    review.isPending && review.variables?.docId === current._id
                  }
                  onDecide={(review_status) =>
                    review.mutate({ docId: current._id, review_status })
                  }
                />
              </>
            )}

            <Separator />
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <PenLine className="size-4" />
                Signature on file
              </p>
              {query.data?.signature_url ? (
                <DocumentPreview
                  url={query.data.signature_url}
                  mime="image/png"
                  name="Signature"
                  // Signatures are background-removed PNGs, so they need a
                  // light ground of their own or they vanish on a dark theme.
                  className="h-28 bg-white"
                  zoomable={false}
                />
              ) : (
                <p className="text-muted-foreground text-sm">
                  No signature captured yet. This provider cannot issue a signed
                  prescription until they upload a photo of their signature in
                  the app.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Approve / reject one uploaded file, with an optional note. */
function DocumentReview({
  doc,
  note,
  onNoteChange,
  pending,
  onDecide,
}: {
  doc: QualificationDocumentWire;
  note: string;
  onNoteChange: (value: string) => void;
  pending: boolean;
  onDecide: (status: 'approved' | 'rejected') => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      {doc.review_note && (
        <p className="text-muted-foreground text-sm">
          Previous note: {doc.review_note}
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor={`note-${doc._id}`}>
          Review note for this document (optional, max 500 characters)
        </Label>
        <Textarea
          id={`note-${doc._id}`}
          rows={2}
          maxLength={500}
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
        />
      </div>

      <div className="flex gap-2">
        <DisabledWhenDenied
          capability="providers.reviewQualification"
          reason="Only an admin can approve credentials."
        >
          <Button
            size="sm"
            disabled={pending}
            onClick={() => onDecide('approved')}
          >
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            Approve document
          </Button>
        </DisabledWhenDenied>
        <DisabledWhenDenied
          capability="providers.reviewQualification"
          reason="Only an admin can reject credentials."
        >
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => onDecide('rejected')}
          >
            Reject document
          </Button>
        </DisabledWhenDenied>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono = false,
  missing = 'Not provided',
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  missing?: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,11ch)_minmax(0,1fr)] gap-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={
          value ? (mono ? 'font-mono text-xs' : '') : 'text-destructive text-xs'
        }
      >
        {value || missing}
      </dd>
    </div>
  );
}

/**
 * A {@link Row} that can be acted on.
 *
 * `tel:` and `mailto:` are handed straight to the OS handler — no
 * `target="_blank"`, which on these schemes leaves an orphaned blank tab
 * behind in most browsers instead of opening anything.
 */
function ContactRow({
  label,
  value,
  href,
  icon,
  action,
}: {
  label: string;
  value?: string | null;
  href?: string;
  icon: ReactNode;
  action: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,11ch)_minmax(0,1fr)_auto] items-center gap-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={value ? 'truncate' : 'text-destructive text-xs'}>
        {value || 'Not provided'}
      </dd>
      {href ? (
        <Button variant="outline" size="sm" asChild>
          <a href={href}>
            {icon}
            {action}
          </a>
        </Button>
      ) : null}
    </div>
  );
}
