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
import { DisabledWhenDenied } from '@/components/rbac/can';
import { createPatient } from '@/lib/api/accounts';
import { normalizeError } from '@/lib/api/errors';

/**
 * Manual patient provisioning for the walk-in / phone-in case.
 *
 * Mirrors `<CreateProviderDialog>` deliberately, including the non-dismissible
 * credential dialog: the temporary password exists exactly once in readable
 * form and closing the sheet by accident loses it for good.
 *
 * The account is created phone-verified. An admin typing this in has the
 * patient on the line, which is the same proof the OTP stands in for — and
 * booking is gated on that latch, so leaving it false would create an account
 * that cannot do the thing it was created for.
 */
export function CreatePatientDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  const [issued, setIssued] = useState<{ name: string; password: string } | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);

  const create = useMutation({
    mutationFn: () =>
      createPatient({
        full_name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        address: address.trim() || undefined,
      }),
    onSuccess: (result) => {
      // Deliberately not put into the query cache — the password must not
      // outlive this dialog.
      setIssued({ name: result.account.full_name, password: result.temporaryPassword });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      setOpen(false);
      setName('');
      setPhone('');
      setEmail('');
      setAddress('');
    },
    onError: (error) => toast.error(normalizeError(error).message),
  });

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
      <DisabledWhenDenied
        capability="accounts.manage"
        reason="Only an admin can create a patient account."
      >
        <Dialog open={open} onOpenChange={setOpen}>
          <Button size="sm" onClick={() => setOpen(true)}>
            <UserPlus className="size-4" />
            Add patient
          </Button>
          <DialogContent mobileFullscreen className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add a patient</DialogTitle>
              <DialogDescription>
                Creates the account and issues a one-time password. The patient is
                marked phone-verified, so they can book immediately.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="patient-name">
                  Full name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="patient-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="patient-phone">
                  Phone <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="patient-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="01700000000"
                />
                <p className="text-muted-foreground text-xs">
                  Local or international form — the server normalises it either way.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="patient-email">Email</Label>
                <Input
                  id="patient-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="patient-address">Address</Label>
                <Input
                  id="patient-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
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
              <Button
                onClick={() => create.mutate()}
                disabled={!name.trim() || !phone.trim() || create.isPending}
              >
                {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Create patient
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DisabledWhenDenied>

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
              Read this to the patient on the call. They will be forced to change it
              at first sign-in.
            </DialogDescription>
          </DialogHeader>

          <Alert>
            <TriangleAlert className="size-4" />
            <AlertTitle>Shown once</AlertTitle>
            <AlertDescription>
              This password is not stored anywhere in readable form. If you lose it,
              you will have to reset the account.
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
              id="patient-ack"
              checked={acknowledged}
              onCheckedChange={(v) => setAcknowledged(v === true)}
            />
            <Label htmlFor="patient-ack" className="font-normal">
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
