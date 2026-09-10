'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Loader2, TriangleAlert, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { createStaffAccount } from '@/lib/api/accounts';
import { normalizeError } from '@/lib/api/errors';
import {
  ROLE_OPTION_LABEL,
  STAFF_CREATABLE_ROLES,
  type StaffCreatableRole,
} from '@/types/wire/account';

/** What each role actually gets, in the words an operator picking one needs. */
const ROLE_BLURB: Record<StaffCreatableRole, string> = {
  support_member:
    'Triages bookings, looks patients up, reads the ledger and onboards providers. Cannot move money or change settings.',
  finance_admin:
    'Reads and writes the ledger — cash clearance, payouts, invoices. Cannot dispatch bookings or manage accounts.',
  admin:
    'Full back-office access except editing the permission matrix, which stays with a super admin.',
};

/**
 * "Add Support Admin" — back-office provisioning.
 *
 * SUPER ADMIN ONLY, and gated on the ROLE rather than a capability, because
 * the server guard is `requireSuperAdmin()`. No permission slug expresses it:
 * an admin holding `manage_accounts` is still refused, so rendering them an
 * enabled button would be a promise the API breaks. The caller decides
 * whether to render this at all — see `<StaffTable>`.
 *
 * Mirrors `<CreatePatientDialog>`, including the non-dismissible credential
 * dialog. The temporary password exists exactly once in readable form and
 * closing the sheet by accident loses it for good.
 *
 * `support_member` is the default selection and reads as "Support Admin" on
 * screen — the DB value is unchanged, the label is the console vocabulary.
 */
export function AddStaffDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<StaffCreatableRole>('support_member');

  const [issued, setIssued] = useState<{ name: string; password: string } | null>(
    null,
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);

  const create = useMutation({
    mutationFn: () =>
      createStaffAccount({
        full_name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        role,
      }),
    onSuccess: (result) => {
      // Deliberately NOT written into the query cache — the credential must
      // not outlive this dialog.
      setIssued({
        name: result.account.full_name,
        password: result.temporaryPassword,
      });
      // Invalidated by PREFIX, matching `<AccountActions>`. `qk.accounts`
      // keys on the query object, so the staff roster's entry is
      // `['accounts', {role: 'staff'}]` — naming one exact key would leave
      // every other accounts view showing a roster without the new admin.
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setOpen(false);
      setName('');
      setEmail('');
      setPhone('');
      setRole('support_member');
    },
    // Covers the 409s (`phone_taken`, `email_taken`) as well as the 403 an
    // admin gets if they reach this without being a super admin.
    onError: (error) => toast.error(normalizeError(error).message),
  });

  const canSubmit =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    phone.trim().length > 0 &&
    !create.isPending;

  async function copyPassword() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy — select the text and copy it manually.');
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <Button size="sm" onClick={() => setOpen(true)}>
          <UserPlus className="size-4" />
          Add Support Admin
        </Button>
        <DialogContent mobileFullscreen className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a support admin</DialogTitle>
            <DialogDescription>
              Creates a back-office login and issues a one-time password. They
              must replace it before they reach the console.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="staff-name">
                Full name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="staff-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="staff-email">
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="staff-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@taafi.app"
              />
              <p className="text-muted-foreground text-xs">
                This is what they sign in with, and where account recovery
                starts. Required for staff, unlike a patient record.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="staff-phone">
                Phone number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="staff-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01700000000"
              />
              <p className="text-muted-foreground text-xs">
                Local or international form — the server normalises it either
                way. A forgotten password is recovered by a code texted here,
                so it must be a number they can answer.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="staff-role">Role</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as StaffCreatableRole)}
              >
                <SelectTrigger id="staff-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAFF_CREATABLE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_OPTION_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">{ROLE_BLURB[role]}</p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={create.isPending}
            >
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={!canSubmit}>
              {create.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Create account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Not dismissible by Escape or an overlay click: closing this by
          accident loses the only copy of the credential. */}
      <Dialog
        open={issued !== null}
        onOpenChange={(o) => {
          if (!o && acknowledged) {
            setIssued(null);
            setAcknowledged(false);
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Temporary password for {issued?.name}</DialogTitle>
            <DialogDescription>
              Pass this on over a channel you trust. They will be forced to
              change it at first sign-in.
            </DialogDescription>
          </DialogHeader>

          <Alert>
            <TriangleAlert className="size-4" />
            <AlertTitle>Shown once</AlertTitle>
            <AlertDescription>
              This password is not stored anywhere in readable form. If you lose
              it, they will have to use “Forgot password?” on the sign-in
              screen.
            </AlertDescription>
          </Alert>

          <div className="flex items-center gap-2 rounded-md border p-3">
            <code className="flex-1 font-mono text-sm break-all">
              {issued?.password}
            </code>
            <Button size="icon" variant="ghost" onClick={copyPassword}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="staff-ack"
              checked={acknowledged}
              onCheckedChange={(v) => setAcknowledged(v === true)}
            />
            <Label htmlFor="staff-ack" className="font-normal">
              I have passed this password on
            </Label>
          </div>

          <DialogFooter>
            <Button
              disabled={!acknowledged}
              onClick={() => {
                setIssued(null);
                setAcknowledged(false);
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
