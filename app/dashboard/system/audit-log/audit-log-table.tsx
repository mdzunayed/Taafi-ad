'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
import { listAuditActions, listAuditLogs } from '@/lib/api/system';
import { qk } from '@/lib/api/query-keys';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { dateTime, humanize } from '@/lib/format';
import { AuditDiff, AuditDiffFull } from './audit-diff';
import type { AuditLogWire } from '@/types/wire/misc';

/** The server clamps `limit` to 200; the UI must not offer more. */
const PAGE_SIZE = 50;

const ROLE_TONE: Record<string, 'default' | 'secondary' | 'outline'> = {
  super_admin: 'default',
  admin: 'secondary',
  support_member: 'outline',
};

export function AuditLogTable() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('all');
  const [status, setStatus] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [inspecting, setInspecting] = useState<AuditLogWire | null>(null);

  const params = {
    page,
    limit: PAGE_SIZE,
    ...(action !== 'all' ? { action } : {}),
    ...(status !== 'all' ? { status: status as 'success' | 'failure' } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };

  const logs = useQuery({
    queryKey: qk.auditLogs(params),
    queryFn: () => listAuditLogs(params),
  });

  const actions = useQuery({
    queryKey: qk.auditActions,
    queryFn: listAuditActions,
    staleTime: 60_000,
  });

  if (logs.isError) {
    return (
      <ApiErrorState
        error={logs.error}
        permission={PERMISSIONS.VIEW_AUDIT_LOG}
        onRetry={() => logs.refetch()}
      />
    );
  }

  const totalPages = Math.max(1, Math.ceil((logs.data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="f-action">Action</Label>
          <Select
            value={action}
            onValueChange={(v) => {
              setAction(v);
              setPage(1);
            }}
          >
            <SelectTrigger id="f-action" className="w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {(actions.data ?? []).map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="f-status">Outcome</Label>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger id="f-status" className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failure">Failure</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="f-from">From</Label>
          <Input
            id="f-from"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-to">To</Label>
          <Input
            id="f-to"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </div>

        {(action !== 'all' || status !== 'all' || from || to) && (
          <Button
            variant="ghost"
            onClick={() => {
              setAction('all');
              setStatus('all');
              setFrom('');
              setTo('');
              setPage(1);
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {logs.isLoading ? (
        <TableSkeleton cols={6} />
      ) : !logs.data?.items.length ? (
        <EmptyState
          title="No entries match"
          description="Widen the date range or clear the action filter."
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Changes</TableHead>
                  <TableHead className="w-32">IP</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.data.items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {dateTime(row.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{row.actor_name || '—'}</div>
                      {/* Role is a snapshot from write time, not the actor's
                          role today — a later demotion never rewrites history. */}
                      <Badge
                        variant={ROLE_TONE[row.actor_role] ?? 'outline'}
                        className="mt-0.5 font-normal"
                      >
                        {humanize(row.actor_role)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{row.action}</span>
                      {row.status === 'failure' && (
                        <Badge variant="destructive" className="ml-2">
                          failed
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-sm">
                      {row.target_label || row.target_type || '—'}
                    </TableCell>
                    <TableCell>
                      <AuditDiff before={row.before} after={row.after} />
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {row.ip || '—'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setInspecting(row)}
                      >
                        Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-sm">
              Page {logs.data.page} of {totalPages} · {logs.data.total} entries
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="size-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={!logs.data.hasMore}
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      <Sheet
        open={inspecting !== null}
        onOpenChange={(o) => !o && setInspecting(null)}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="font-mono text-base">
              {inspecting?.action}
            </SheetTitle>
            <SheetDescription>
              {inspecting?.actor_name} · {dateTime(inspecting?.created_at)}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 px-4 pb-8">
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Actor</h3>
              <dl className="text-sm">
                <div className="flex justify-between py-1">
                  <dt className="text-muted-foreground">Role at the time</dt>
                  <dd>{humanize(inspecting?.actor_role)}</dd>
                </div>
                <div className="flex justify-between py-1">
                  <dt className="text-muted-foreground">Account id</dt>
                  <dd className="font-mono text-xs">
                    {inspecting?.actor_account_id}
                  </dd>
                </div>
                <div className="flex justify-between py-1">
                  <dt className="text-muted-foreground">IP</dt>
                  <dd className="font-mono text-xs">{inspecting?.ip || '—'}</dd>
                </div>
                <div className="flex justify-between gap-4 py-1">
                  <dt className="text-muted-foreground shrink-0">User agent</dt>
                  <dd className="truncate text-xs">
                    {inspecting?.user_agent || '—'}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-medium">Target</h3>
              <dl className="text-sm">
                <div className="flex justify-between py-1">
                  <dt className="text-muted-foreground">Type</dt>
                  <dd>{inspecting?.target_type || '—'}</dd>
                </div>
                <div className="flex justify-between py-1">
                  <dt className="text-muted-foreground">Id</dt>
                  <dd className="font-mono text-xs">
                    {inspecting?.target_id || '—'}
                  </dd>
                </div>
                <div className="flex justify-between py-1">
                  <dt className="text-muted-foreground">Label</dt>
                  <dd>{inspecting?.target_label || '—'}</dd>
                </div>
              </dl>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-medium">Changes</h3>
              <AuditDiffFull
                before={inspecting?.before ?? null}
                after={inspecting?.after ?? null}
              />
            </section>

            {inspecting?.metadata && (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">Metadata</h3>
                <pre className="bg-muted max-h-64 overflow-auto rounded-md p-3 text-xs">
                  {JSON.stringify(inspecting.metadata, null, 2)}
                </pre>
              </section>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
