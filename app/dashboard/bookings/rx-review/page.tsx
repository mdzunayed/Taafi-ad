import { redirect } from 'next/navigation';

/**
 * Prescription review moved out of Bookings Ops and up to its own section:
 * reviewing a script is clinical work, not booking work, and burying it three
 * clicks inside a bookings sub-tab is why drafts sat unreviewed.
 *
 * Kept as a redirect rather than deleted — this path is in operators'
 * bookmarks and in the `deepLink: 'admin_prescription_queue'` notifications
 * the backend has already sent.
 */
export default function RxReviewRedirect() {
  redirect('/dashboard/rx-approvals');
}
