import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';

import { PageHeader } from '@/components/layout/page-header';
import { PermissionGate } from '@/components/rbac/permission-gate';
import { DisabledWhenDenied } from '@/components/rbac/can';
import { Button } from '@/components/ui/button';
import { BookingsTable } from './bookings-table';

export const metadata: Metadata = { title: 'Bookings' };

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ highlight?: string }>;
}) {
  // `?highlight=<id>` marks one row and scrolls it into view — for links that
  // point at the list rather than at a single booking.
  const { highlight } = await searchParams;
  return (
    <>
      <PageHeader
        title="Bookings Ops"
        description="Every care request, newest first. Open one to price it, dispatch a provider, or cancel."
        actions={
          <DisabledWhenDenied
            capability="bookings.create"
            reason="Creating bookings needs the manage_bookings permission."
          >
            <Button asChild>
              <Link href="/dashboard/bookings/new">
                <Plus className="size-4" />
                Create Manual Booking
              </Link>
            </Button>
          </DisabledWhenDenied>
        }
      />
      <PermissionGate capability="bookings.read">
        <BookingsTable highlight={highlight} />
      </PermissionGate>
    </>
  );
}
