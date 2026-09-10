'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DisabledWhenDenied } from '@/components/rbac/can';
import { useSession } from '@/components/providers/session-provider';
import {
  setAccountRole,
  setAccountStatus,
  updateAccount,
  verifyAccountPhone,
} from '@/lib/api/accounts';
import { normalizeError } from '@/lib/api/errors';
import {
  ACCOUNT_STATUSES,
  ACCOUNT_STATUS_LABEL,
  ASSIGNABLE_ROLES,
  ROLE_OPTION_LABEL,
  type AccountStatus,
  type AdminAccountWire,
  type AssignableRole,
} from '@/types/wire/account';

type Action = 'profile' | 'role' | 'status' | 'verify-phone';

/**
 * The per-account override menu, shared by the staff roster and the patient
 * detail page.
 *
 * Every action here maps to an endpoint that demands a written reason, so the
 * dialog blocks submission until one is typed rather than letting the server
 * bounce it. The exception is a profile edit, which records a field-level diff
 * that speaks for itself.
 */
export function AccountActions({ account }: { account: AdminAccountWire }) {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const [action, setAction] = useState<Action | null>(null);

  // Mirrors the server's `self_edit_forbidden` guard. An operator changing
  // their own role or status can lock themselves out with nobody able to undo
  // it, so the control is not offered rather than being offered and refused.
  const isSelf = account.id === user.id;

  const [reason, setReason] = useState('');
  const [role, setRole] = useState<AssignableRole>(
    (ASSIGNABLE_ROLES as readonly string[]).includes(account.role)
      ? (account.role as AssignableRole)
      : 'user',
  );
  const [status, setStatus] = useState<AccountStatus>(account.status);
  const [profile, setProfile] = useState({
    full_name: account.full_name ?? '',
    email: account.email ?? '',
    phone: account.phone ?? '',
    address: account.address ?? '',
  });

  function close() {
    setAction(null);
    setReason('');
  }

  const mutation = useMutation({
    mutationFn: async () => {
      switch (action) {
        case 'profile':
          return updateAccount(account.id, profile);
        case 'role':
          return setAccountRole(account.id, { role, reason: reason.trim() });
        case 'status':
          return setAccountStatus(account.id, { status, reason: reason.trim() });
        case 'verify-phone':
          return verifyAccountPhone(account.id, { reason: reason.trim() });
        default:
          throw new Error('No action selected');
      }
    },
    onSuccess: () => {
      toast.success(SUCCESS_COPY[action ?? 'profile']);
      // Both shapes: the roster keys on a query object, the detail page on id.
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      close();
    },
    onError: (error) => toast.error(normalizeError(error).message),
  });

  // A reason is mandatory everywhere the server demands one. Restoring an
  // account to `active` is the documented exception — a restore explains
  // itself in a way a freeze does not.
  const reasonRequired =
    action === 'role' ||
    action === 'verify-phone' ||
    (action === 'status' && status !== 'active');
  const blocked = reasonRequired && reason.trim().length === 0;

  return (
    <>
      <div className="flex items-center gap-2">
        <DisabledWhenDenied
          capability="accounts.manage"
          reason="Only an admin can edit account details."
        >
          <Button size="sm" variant="ghost" onClick={() => setAction('profile')}>
            Edit
          </Button>
        </DisabledWhenDenied>

        {isSelf ? null : (
          <DisabledWhenDenied
            capability="accounts.manage"
            reason="Only an admin can change a role or freeze an account."
          >
            <Select
              value=""
              onValueChange={(v) => {
                setAction(v as Action);
              }}
            >
              <SelectTrigger size="sm" className="w-[130px]">
                <SelectValue placeholder="More…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="role">Change role</SelectItem>
                <SelectItem value="status">Freeze / restore</SelectItem>
                <SelectItem value="verify-phone" disabled={account.phone_verified}>
                  {account.phone_verified ? 'Phone verified' : 'Verify phone'}
                </SelectItem>
              </SelectContent>
            </Select>
          </DisabledWhenDenied>
        )}
      </div>

      <Dialog open={action !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent mobileFullscreen className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{TITLE[action ?? 'profile']}</DialogTitle>
            <DialogDescription>
              {DESCRIPTION[action ?? 'profile'](account)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {action === 'profile' ? (
              <div className="grid gap-3">
                <Field
                  label="Full name"
                  value={profile.full_name}
                  onChange={(v) => setProfile((p) => ({ ...p, full_name: v }))}
                />
                <Field
                  label="Phone"
                  value={profile.phone}
                  onChange={(v) => setProfile((p) => ({ ...p, phone: v }))}
                  hint={
                    profile.phone !== (account.phone ?? '') && account.phone_verified
                      ? 'Changing the number clears its verified status — the OTP proved the old one.'
                      : undefined
                  }
                />
                <Field
                  label="Email"
                  value={profile.email}
                  onChange={(v) => setProfile((p) => ({ ...p, email: v }))}
                />
                <Field
                  label="Address"
                  value={profile.address}
                  onChange={(v) => setProfile((p) => ({ ...p, address: v }))}
                />
              </div>
            ) : null}

            {action === 'role' ? (
              <div className="space-y-2">
                <Label>New role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as AssignableRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSIGNABLE_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_OPTION_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  Super admin is not assignable here — it is the role that edits the
                  permission matrix.
                </p>
              </div>
            ) : null}

            {action === 'status' ? (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as AccountStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {ACCOUNT_STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {status !== 'active' ? (
                  <p className="text-muted-foreground text-xs">
                    Takes effect on their next request — they are signed out of every
                    device the moment they touch the API.
                  </p>
                ) : null}
              </div>
            ) : null}

            {reasonRequired ? (
              <div className="space-y-2">
                <Label htmlFor="account-action-reason">
                  Reason <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="account-action-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Recorded on the audit trail against your name."
                />
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={blocked || mutation.isPending}
            >
              {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {CONFIRM_LABEL[action ?? 'profile']}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

const TITLE: Record<Action, string> = {
  profile: 'Edit account details',
  role: 'Change role',
  status: 'Freeze or restore account',
  'verify-phone': 'Manually verify phone number',
};

const DESCRIPTION: Record<Action, (a: AdminAccountWire) => string> = {
  profile: (a) => `Update contact details for ${a.full_name}.`,
  role: (a) => `${a.full_name} currently holds the ${a.role} role.`,
  status: (a) =>
    `${a.full_name} is currently ${a.status}. A frozen account cannot sign in or book.`,
  'verify-phone': (a) =>
    `Marks ${a.phone || 'this number'} as proven without an OTP. Booking is gated on ` +
    'this, so use it when the SMS never arrived and you have confirmed the number ' +
    'on a call.',
};

const CONFIRM_LABEL: Record<Action, string> = {
  profile: 'Save changes',
  role: 'Change role',
  status: 'Apply',
  'verify-phone': 'Mark verified',
};

const SUCCESS_COPY: Record<Action, string> = {
  profile: 'Account details updated.',
  role: 'Role changed.',
  status: 'Account status updated.',
  'verify-phone': 'Phone number marked verified.',
};
