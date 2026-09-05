import type { Metadata } from 'next';

import { PermissionGate } from '@/components/rbac/permission-gate';
import { BookingDetail } from './booking-detail';

export const metadata: Metadata = { title: 'Booking' };

export default async function BookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ action?: string }>;
}) {
  const { id } = await params;
  /**
   * `?action=invoice` is what the Telegram new-booking alert appends to its
   * deep link, so a coordinator tapping it lands with the pricing dialog
   * already open instead of hunting for the button.
   *
   * Read here rather than via `useSearchParams` in the client component: this
   * app has no `useSearchParams` call anywhere, the server-prop form is the
   * pattern already established by the login page, and it needs no `<Suspense>`
   * boundary to satisfy Next's prerendering rules.
   */
  const { action } = await searchParams;
  return (
    <PermissionGate capability="bookings.read">
      <BookingDetail id={id} initialAction={action} />
    </PermissionGate>
  );
}
