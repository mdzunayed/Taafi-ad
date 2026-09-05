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
  DialogTrigger,
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
import { DisabledWhenDenied } from '@/components/rbac/can';
import { createProvider } from '@/lib/api/providers';
import { qk } from '@/lib/api/query-keys';
import { normalizeError } from '@/lib/api/errors';

export function CreateProviderDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'doctor' | 'nurse'>('doctor');

  /**
   * The server returns `temporaryPassword` exactly once and never again — it
   * is hashed on write and there is no retrieval endpoint. So it is held in
   * local state only, shown behind an explicit acknowledgement, and dropped
   * the moment the dialog closes. It is deliberately never toasted, never
   * logged, and never placed in the query cache.
   */
  const [issued, setIssued] = useState<{ password: string; name: string } | null>(
    null,
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);

  const create = useMutation({
    mutationFn: () =>
      createProvider({
        name: name.trim(),
        phone: phone.trim(),
        role,
        email: email.trim() || undefined,
      }),
    onSuccess: (result) => {
      setIssued({ password: result.temporaryPassword, name: name.trim() });
      setOpen(false);
      setName('');
      setPhone('');
      setEmail('');
      queryClient.invalidateQueries({ queryKey: qk.providers });
    },
    onError: (error) => toast.error(normalizeError(error).message),
  });

  async function copyPassword() {
    if (!issued) return;
    await navigator.clipboard.writeText(issued.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <DisabledWhenDenied
        capability="providers.manage"
        reason="Your account cannot add providers. Ask an admin."
      >
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="size-4" />
              Add provider
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a provider</DialogTitle>
              <DialogDescription>
                Creates the login and an empty provider profile. A temporary
                password is generated and shown once.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="np-name">Full name</Label>
                <Input
                  id="np-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="np-phone">Phone</Label>
                <Input
                  id="np-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="8801700000000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="np-email">Email (optional)</Label>
                <Input
                  id="np-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="np-role">Role</Label>
                <Select
                  value={role}
                  onValueChange={(v) => setRole(v as 'doctor' | 'nurse')}
                >
                  <SelectTrigger id="np-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="doctor">Doctor</SelectItem>
                    <SelectItem value="nurse">Nurse</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => create.mutate()}
                disabled={!name.trim() || !phone.trim() || create.isPending}
              >
                {create.isPending && <Loader2 className="size-4 animate-spin" />}
                Create provider
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
              Give this to the provider through a channel you trust. They will
              be forced to change it at first sign-in.
            </DialogDescription>
          </DialogHeader>

          <Alert>
            <TriangleAlert className="size-4" />
            <AlertTitle>Shown once</AlertTitle>
            <AlertDescription>
              This password is not stored anywhere in readable form. If you lose
              it, you will have to reset the account.
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
              id="ack"
              checked={acknowledged}
              onCheckedChange={(v) => setAcknowledged(v === true)}
            />
            <Label htmlFor="ack" className="font-normal">
              I have copied this password somewhere safe
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
