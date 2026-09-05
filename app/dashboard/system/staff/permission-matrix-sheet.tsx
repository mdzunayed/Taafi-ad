'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { setAccountPermissions } from '@/lib/api/accounts';
import { normalizeError } from '@/lib/api/errors';
import { ALL_PERMISSIONS, type Permission } from '@/lib/rbac/permissions';
import { DENIAL_COPY } from '@/lib/rbac/copy';
import type { AdminAccountWire } from '@/types/wire/account';

/**
 * Three states per capability, not a checkbox.
 *
 *   inherit — take whatever the role gives (the default, and the common case)
 *   grant   — hold it even though the role does not give it
 *   revoke  — do NOT hold it even though the role does
 *
 * A two-state checkbox cannot express this. Un-ticking a box that the role
 * baseline turns on would have to mean "revoke", but ticking one that the role
 * already provides would have to mean "inherit" — so the same visual state
 * would carry two different stored meanings depending on the role. Making the
 * three states explicit is the only way the screen tells the truth about what
 * is stored, which matters because the stored arrays are what the server
 * replays on every request.
 */
type Mode = 'inherit' | 'grant' | 'revoke';

const LABEL: Record<Permission, string> = {
  manage_bookings: 'Manage bookings',
  approve_providers: 'Approve providers',
  manage_providers: 'Manage providers',
  view_patients: 'View patients',
  finance_read: 'Read finance',
  finance_write: 'Move money',
  manage_content: 'Edit app content',
  manage_settings: 'Change settings',
  manage_admins: 'Manage staff accounts',
  view_audit_log: 'View audit log',
  manage_accounts: 'Manage user accounts',
};

function modeFor(account: AdminAccountWire, permission: Permission): Mode {
  if (account.permissions_denied?.includes(permission)) return 'revoke';
  if (account.permissions?.includes(permission)) return 'grant';
  return 'inherit';
}

export function PermissionMatrixSheet({
  account,
  onOpenChange,
}: {
  account: AdminAccountWire | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={account !== null} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-xl">
        {/*
          Keyed on the account id so switching rows REMOUNTS the form, which
          re-runs the useState initialisers against the new account. The
          alternative — reseeding from an effect — is a cascading render and
          leaves a window where the previous account's draft is live against
          this one. Same fetch-then-seed split `settings-form.tsx` uses.
        */}
        {account ? (
          <MatrixForm
            key={account.id}
            account={account}
            onOpenChange={onOpenChange}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function MatrixForm({
  account,
  onOpenChange,
}: {
  account: AdminAccountWire;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [modes, setModes] = useState<Record<string, Mode>>(() => {
    const seed: Record<string, Mode> = {};
    for (const p of ALL_PERMISSIONS) seed[p] = modeFor(account, p);
    return seed;
  });
  const [reason, setReason] = useState('');

  const baseline = useMemo(
    () => new Set(account.role_baseline_permissions ?? []),
    [account],
  );

  // What the server will compute once this is saved, derived with the same
  // arithmetic the backend uses: (baseline ∪ grants) − denials.
  const effective = useMemo(() => {
    const held = new Set<Permission>(baseline);
    for (const p of ALL_PERMISSIONS) {
      if (modes[p] === 'grant') held.add(p);
      if (modes[p] === 'revoke') held.delete(p);
    }
    return held;
  }, [baseline, modes]);

  const dirty = useMemo(
    () => ALL_PERMISSIONS.some((p) => modes[p] !== modeFor(account, p)),
    [account, modes],
  );

  const save = useMutation({
    mutationFn: () =>
      setAccountPermissions(account.id, {
        granted: ALL_PERMISSIONS.filter((p) => modes[p] === 'grant'),
        denied: ALL_PERMISSIONS.filter((p) => modes[p] === 'revoke'),
        reason: reason.trim(),
      }),
    onSuccess: () => {
      toast.success('Permissions updated.');
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      onOpenChange(false);
    },
    onError: (error) => toast.error(normalizeError(error).message),
  });

  const blocked = !dirty || reason.trim().length === 0 || save.isPending;

  return (
    <>
      <SheetHeader>
        <SheetTitle>Permissions — {account.full_name}</SheetTitle>
        <SheetDescription>
          {`Role “${account.role}” provides ${baseline.size} of ${ALL_PERMISSIONS.length} ` +
            'capabilities. Grants and revocations layer on top of that.'}
        </SheetDescription>
      </SheetHeader>

      <Alert>
        <AlertDescription>
          The server recomputes this on every request, so a change takes effect
          immediately — including on sessions that are already signed in.
        </AlertDescription>
      </Alert>

      <ScrollArea className="-mx-2 flex-1 px-2">
        <div className="space-y-3">
          {ALL_PERMISSIONS.map((permission) => {
            const inBaseline = baseline.has(permission);
            const mode = modes[permission] ?? 'inherit';
            const held = effective.has(permission);
            return (
              <div
                key={permission}
                className="flex flex-col gap-2 rounded-lg border p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {LABEL[permission]}
                      </span>
                      <Badge
                        variant={held ? 'secondary' : 'outline'}
                        className="shrink-0"
                      >
                        {held ? 'Held' : 'Not held'}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      <code className="text-[11px]">{permission}</code>
                      {' — '}
                      {DENIAL_COPY[permission]}
                    </p>
                  </div>
                </div>

                <ToggleGroup
                  type="single"
                  size="sm"
                  variant="outline"
                  value={mode}
                  onValueChange={(v) =>
                    v && setModes((m) => ({ ...m, [permission]: v as Mode }))
                  }
                  className="justify-start"
                >
                  <ToggleGroupItem value="inherit">
                    Inherit{inBaseline ? ' (on)' : ' (off)'}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="grant" disabled={inBaseline}>
                    Grant
                  </ToggleGroupItem>
                  <ToggleGroupItem value="revoke" disabled={!inBaseline}>
                    Revoke
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <div className="space-y-2 border-t pt-4">
        <Label htmlFor="permission-reason">
          Reason <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="permission-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="Why is this access changing? Recorded on the audit trail."
        />
      </div>

      <SheetFooter className="flex-row justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={save.isPending}
        >
          Cancel
        </Button>
        <Button onClick={() => save.mutate()} disabled={blocked}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Save permissions
        </Button>
      </SheetFooter>
    </>
  );
}
