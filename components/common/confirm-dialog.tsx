'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Confirmation for a destructive or outward-facing action.
 *
 * Pass `typeToConfirm` for the ones that reach patients — putting the platform
 * into maintenance mode takes the whole patient app down, and that deserves
 * more friction than a switch you can brush with a trackpad.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  destructive = false,
  typeToConfirm,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  typeToConfirm?: string;
  onConfirm: () => Promise<void> | void;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const blocked = typeToConfirm ? typed.trim() !== typeToConfirm : false;

  async function run() {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
      setTyped('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {typeToConfirm && (
          <div className="space-y-2">
            <Label htmlFor="confirm-phrase">
              Type <span className="font-mono font-semibold">{typeToConfirm}</span> to
              continue
            </Label>
            <Input
              id="confirm-phrase"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void run();
            }}
            disabled={busy || blocked}
            className={
              destructive
                ? 'bg-destructive text-white hover:bg-destructive/90'
                : undefined
            }
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
