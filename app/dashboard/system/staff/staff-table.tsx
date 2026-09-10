'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiErrorState } from '@/components/rbac/api-error-state';
import { EmptyState, TableSkeleton } from '@/components/data/states';
import { StatusPill } from '@/components/common/account-status-pill';
import { AccountActions } from '@/components/accounts/account-actions';
import { PermissionMatrixSheet } from './permission-matrix-sheet';
import { AddStaffDialog } from './add-staff-dialog';
import { listAccounts } from '@/lib/api/accounts';
import { qk } from '@/lib/api/query-keys';
import { useSession } from '@/components/providers/session-provider';
import { ROLE_LABEL } from '@/lib/rbac/permissions';
import { dateTime } from '@/lib/format';
import type { AdminAccountWire } from '@/types/wire/account';

export function StaffTable() {
  const { isSuperAdmin, user } = useSession();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<AdminAccountWire | null>(null);

  const query = useMemo(() => ({ role: 'staff' as const }), []);
  const accounts = useQuery({
    queryKey: qk.accounts(query),
    queryFn: () => listAccounts(query),
    // Privilege assignments: hold them for this view only.
    gcTime: 0,
    staleTime: 0,
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const all = accounts.data ?? [];
    if (!term) return all;
    return all.filter((a) =>
      [a.full_name, a.email, a.phone].some((v) => (v ?? '').toLowerCase().includes(term)),
    );
  }, [accounts.data, search]);

  if (accounts.isError) {
    return <ApiErrorState error={accounts.error} onRetry={() => accounts.refetch()} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          placeholder="Search staff by name, email or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        {/*
          Gated on the ROLE, exactly like the Permissions button below. The
          server guard is `requireSuperAdmin()`, which no capability slug can
          express — an admin holds `manage_accounts` and is still refused, so
          showing them the button would be a promise the API breaks.
        */}
        {isSuperAdmin ? <AddStaffDialog /> : null}
      </div>

      {accounts.isLoading ? (
        <TableSkeleton cols={8} />
      ) : !rows.length ? (
        <EmptyState
          title="No staff accounts match"
          description="Back-office accounts are super admins, admins, support admins and finance admins."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Capabilities</TableHead>
                <TableHead>Last change</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((account) => {
                const isSelf = account.id === user.id;
                return (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium">
                      {account.full_name}
                    </TableCell>
                    {/*
                      Email and phone were one stacked sub-line under the name,
                      showing whichever existed. They are separate columns now
                      because both matter here and for different reasons: the
                      email is the sign-in identifier, and the phone is where
                      account recovery texts its code. "Which of these is
                      missing" is not a question a fallback can answer.
                    */}
                    <TableCell className="text-muted-foreground text-xs">
                      {account.email || '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {account.phone || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {ROLE_LABEL[account.role] ?? account.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusPill status={account.status} reason={account.status_reason} />
                    </TableCell>
                    <TableCell>
                      <CapabilitySummary account={account} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {account.status_changed_at ? dateTime(account.status_changed_at) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/*
                          Gated on the ROLE, not a capability. The server guard
                          is `requireSuperAdmin()`, which no permission slug can
                          express — an admin holds `manage_admins` and is still
                          refused. Showing them an enabled button would be a
                          promise the API breaks.
                        */}
                        {isSuperAdmin && !isSelf ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditing(account)}
                          >
                            <ShieldCheck className="size-4" />
                            Permissions
                          </Button>
                        ) : null}
                        <AccountActions account={account} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <PermissionMatrixSheet
        account={editing}
        onOpenChange={(open) => !open && setEditing(null)}
      />
    </div>
  );
}

/**
 * A one-line read of what this account actually holds.
 *
 * Deliberately counts against the role baseline rather than showing a raw
 * number: "9 of 11" says nothing, but "2 revoked" is the fact an operator
 * scanning the roster is looking for.
 */
function CapabilitySummary({ account }: { account: AdminAccountWire }) {
  const denied = account.permissions_denied?.length ?? 0;
  const extra = (account.permissions ?? []).filter(
    (p) => !account.role_baseline_permissions?.includes(p),
  ).length;

  if (account.role === 'super_admin') {
    return <span className="text-muted-foreground text-xs">All (super admin)</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      <Badge variant="secondary" className="tabular-nums">
        {account.effective_permissions?.length ?? 0} held
      </Badge>
      {extra > 0 ? (
        <Badge variant="outline" className="tabular-nums">
          +{extra} granted
        </Badge>
      ) : null}
      {denied > 0 ? (
        <Badge variant="destructive" className="tabular-nums">
          −{denied} revoked
        </Badge>
      ) : null}
    </div>
  );
}
