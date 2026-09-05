'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CredentialReview } from '@/components/common/credential-review';
import type { ProviderWire } from '@/types/wire/provider';

/**
 * The credential review, in a modal.
 *
 * A thin frame on purpose: everything the reviewer reads and decides lives in
 * <CredentialReview>, so the verification queue and the provider roster open
 * the SAME review rather than two that drift apart. The roster used to open a
 * narrower sheet that omitted the registration number entirely.
 *
 * Mounted only while a provider is selected (`provider` non-null), so the
 * qualifications query inside starts on open and the reviewer's document pick
 * resets between providers without an effect to clear it.
 */
export function CredentialReviewDialog({
  provider,
  onOpenChange,
}: {
  provider: ProviderWire | null;
  onOpenChange: (open: boolean) => void;
}) {
  if (!provider) return null;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-full overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{provider.full_name}</DialogTitle>
          <DialogDescription>
            Check that the registration number below matches the document on the
            right before deciding.
          </DialogDescription>
        </DialogHeader>

        <CredentialReview provider={provider} />
      </DialogContent>
    </Dialog>
  );
}
