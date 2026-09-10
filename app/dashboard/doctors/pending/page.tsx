import { redirect } from 'next/navigation';

/**
 * `/dashboard/doctors/pending` → the credentialing queue.
 *
 * "Pending doctors" is what the queue is called everywhere except in its own
 * URL, so this is the address people try, link to, and bookmark. It redirects
 * rather than rendering, because a second page over the same data is a second
 * page to keep in step — and the one that is not linked from the sidebar is
 * always the one that falls behind.
 *
 * The queue itself filters to "awaiting decision" by default, which is what
 * this path promises.
 */
export default function PendingDoctorsPage() {
  redirect('/dashboard/doctors/verification');
}
