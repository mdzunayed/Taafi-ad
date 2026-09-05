'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiErrorState } from '@/components/rbac/api-error-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { useCan } from '@/hooks/use-permission';
import { getSettings, updateSettings } from '@/lib/api/system';
import { qk } from '@/lib/api/query-keys';
import { normalizeError } from '@/lib/api/errors';
import { SETTINGS_BOUNDS, type SettingsWire } from '@/types/wire/misc';

/**
 * Loads the settings, then hands them to the form as its initial state.
 *
 * The split exists so the editable draft can be seeded from props rather than
 * synced in an effect: `useState(initial)` in a child that only mounts once
 * the data has arrived is both simpler and free of the cascading re-render
 * that `setState` inside `useEffect` causes.
 */
export function SettingsForm() {
  const query = useQuery({ queryKey: qk.settings, queryFn: getSettings });

  if (query.isError) {
    return <ApiErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  if (query.isLoading || !query.data) {
    return <Skeleton className="h-96" />;
  }
  return <SettingsFields initial={query.data} />;
}

function SettingsFields({ initial }: { initial: SettingsWire }) {
  const queryClient = useQueryClient();
  const canWrite = useCan('settings.write');
  const [draft, setDraft] = useState<Partial<SettingsWire>>(initial);
  const [maintenanceConfirm, setMaintenanceConfirm] = useState(false);

  const save = useMutation({
    mutationFn: (patch: Partial<SettingsWire>) => updateSettings(patch),
    onSuccess: () => {
      toast.success('Settings saved.');
      queryClient.invalidateQueries({ queryKey: qk.settings });
    },
    // The server surfaces Mongoose ValidationError text as a 400. It names the
    // offending field, so showing it verbatim is more useful than a generic
    // "invalid" — the bounds are mirrored below to catch most of it first.
    onError: (error) => toast.error(normalizeError(error).message),
  });

  function set<K extends keyof SettingsWire>(key: K, value: SettingsWire[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const commission = Number(draft.platform_commission_percent ?? 0);
  const deposit = Number(draft.booking_deposit_amount ?? 0);
  const cashLimit = Number(draft.cash_in_hand_limit ?? 0);

  const commissionBad =
    commission < SETTINGS_BOUNDS.platform_commission_percent.min ||
    commission > SETTINGS_BOUNDS.platform_commission_percent.max;
  const depositBad =
    deposit < SETTINGS_BOUNDS.booking_deposit_amount.min ||
    deposit > SETTINGS_BOUNDS.booking_deposit_amount.max;
  const cashBad = cashLimit < SETTINGS_BOUNDS.cash_in_hand_limit.min;

  const invalid = commissionBad || depositBad || cashBad;

  return (
    <div className="max-w-3xl space-y-6">
      {!canWrite && (
        <Alert>
          <Info className="size-4" />
          <AlertDescription>
            You can view these settings, but only an admin can change them.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Dispatch</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="auto-assign">Allow automatic assignment</Label>
              <p className="text-muted-foreground text-sm">
                Let the platform pick a provider without an operator.
              </p>
            </div>
            <Switch
              id="auto-assign"
              checked={Boolean(draft.allow_auto_assignment)}
              onCheckedChange={(v) => set('allow_auto_assignment', v)}
              disabled={!canWrite}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="verified-only">Require verified providers</Label>
              <p className="text-muted-foreground text-sm">
                Only dispatch clinicians whose licence has been checked.
              </p>
            </div>
            <Switch
              id="verified-only"
              checked={Boolean(draft.require_verified_doctors)}
              onCheckedChange={(v) => set('require_verified_doctors', v)}
              disabled={!canWrite}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Money</CardTitle>
          <CardDescription>
            These values change what patients are charged. The server enforces
            the same bounds shown here.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="commission">Platform commission (%)</Label>
            <Input
              id="commission"
              type="number"
              min={0}
              max={100}
              value={draft.platform_commission_percent ?? ''}
              onChange={(e) =>
                set('platform_commission_percent', Number(e.target.value))
              }
              disabled={!canWrite}
              aria-invalid={commissionBad}
            />
            {commissionBad && (
              <p className="text-destructive text-xs">Must be between 0 and 100.</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="deposit">Default booking deposit (৳)</Label>
            <Input
              id="deposit"
              type="number"
              min={1}
              max={100000}
              value={draft.booking_deposit_amount ?? ''}
              onChange={(e) =>
                set('booking_deposit_amount', Number(e.target.value))
              }
              disabled={!canWrite}
              aria-invalid={depositBad}
            />
            {depositBad && (
              <p className="text-destructive text-xs">
                Must be between 1 and 100,000.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="cash-limit">Cash-in-hand limit (৳)</Label>
            <Input
              id="cash-limit"
              type="number"
              min={0}
              value={draft.cash_in_hand_limit ?? ''}
              onChange={(e) => set('cash_in_hand_limit', Number(e.target.value))}
              disabled={!canWrite}
              aria-invalid={cashBad}
            />
            {cashBad && (
              <p className="text-destructive text-xs">Cannot be negative.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Patient app</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="notice">System notification</Label>
            <Textarea
              id="notice"
              rows={2}
              value={draft.system_notification ?? ''}
              onChange={(e) => set('system_notification', e.target.value)}
              disabled={!canWrite}
              placeholder="Shown as a banner to every patient. Leave blank for none."
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="beta-charts">Beta charts</Label>
              <p className="text-muted-foreground text-sm">
                Enable in-progress analytics surfaces.
              </p>
            </div>
            <Switch
              id="beta-charts"
              checked={Boolean(draft.beta_charts)}
              onCheckedChange={(v) => set('beta_charts', v)}
              disabled={!canWrite}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Maintenance mode</CardTitle>
          <CardDescription>
            Turning this on takes the patient app down. Nobody can book while it
            is enabled.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <Label htmlFor="maintenance">Maintenance mode</Label>
          <Switch
            id="maintenance"
            checked={Boolean(draft.maintenance_mode)}
            onCheckedChange={(v) => {
              // Enabling needs a typed confirmation; turning it back off does
              // not — restoring service should never be the slow path.
              if (v) setMaintenanceConfirm(true);
              else set('maintenance_mode', false);
            }}
            disabled={!canWrite}
          />
        </CardContent>
      </Card>

      {canWrite && (
        <div className="flex items-center gap-3">
          <Button
            onClick={() => save.mutate(draft)}
            disabled={save.isPending || invalid}
          >
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            Save settings
          </Button>
          <Button
            variant="ghost"
            onClick={() => setDraft(initial)}
            disabled={save.isPending}
          >
            Reset
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={maintenanceConfirm}
        onOpenChange={setMaintenanceConfirm}
        title="Take the patient app offline?"
        description={
          <p>
            Every patient will see a maintenance screen and no new bookings can
            be made until you turn this off. Visits already in progress are not
            interrupted.
          </p>
        }
        confirmLabel="Enable maintenance mode"
        destructive
        typeToConfirm="MAINTENANCE"
        onConfirm={() => {
          set('maintenance_mode', true);
        }}
      />
    </div>
  );
}
