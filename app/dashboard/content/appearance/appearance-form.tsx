'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

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
import { Skeleton } from '@/components/ui/skeleton';
import { ApiErrorState } from '@/components/rbac/api-error-state';
import { DisabledWhenDenied } from '@/components/rbac/can';
import { normalizeError } from '@/lib/api/errors';
import { qk } from '@/lib/api/query-keys';
import {
  HOME_LAYOUT_BOUNDS,
  HOME_LAYOUT_DEFAULTS,
  homeLayout,
  type HomeLayoutWire,
} from '@/lib/api/content';
import { PhonePreview, PREVIEW_CANVAS } from '../home-sections/phone-preview';

/**
 * App Content → Appearance: the patient Home geometry.
 *
 * These three numbers were compile-time constants in the Flutter binary, which
 * made "the hero is too tall" an app-store release. They are now one row on
 * the settings document, served on the same Home payload as the content they
 * lay out.
 *
 * EVERY CONTROL IS PREVIEWED, and that is the point of the screen rather than
 * decoration: an operator asked for "0.65" has no way to know what they have
 * chosen. The previews are transcriptions of the Flutter geometry (see the
 * standing drift warning in `phone-preview.tsx`), so they are approximations of
 * proportion, not pixel-exact renders.
 *
 * Follows `settings-form.tsx`: a `useQuery` wrapper that hands loaded data to a
 * child as its initial state, so the draft is seeded from props rather than
 * synced in an effect.
 */
export function AppearanceForm() {
  const query = useQuery({ queryKey: qk.homeLayout, queryFn: homeLayout.get });

  if (query.isError) {
    return <ApiErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  if (query.isLoading || !query.data) {
    return <Skeleton className="h-96" />;
  }
  return <AppearanceFields initial={query.data} />;
}

/** The tiles the Care Services preview draws. Titles only — see PreviewTile. */
const SAMPLE_CARDS = [
  { id: '1', title: 'Post-surgery care' },
  { id: '2', title: 'Doctor at home' },
  { id: '3', title: 'Wound dressing' },
  { id: '4', title: 'Physiotherapy' },
];

function AppearanceFields({ initial }: { initial: HomeLayoutWire }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<HomeLayoutWire>(initial);

  const save = useMutation({
    mutationFn: (patch: Partial<HomeLayoutWire>) => homeLayout.update(patch),
    onSuccess: (fresh) => {
      toast.success('Home appearance saved.');
      // Seed the cache with what the server actually stored — it clamps, so
      // the value that comes back is not always the value that went out.
      queryClient.setQueryData(qk.homeLayout, fresh);
      setDraft(fresh);
    },
    onError: (error) => toast.error(normalizeError(error).message),
  });

  function set<K extends keyof HomeLayoutWire>(key: K, value: number) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  /*
   * Only the knobs that actually changed. The endpoint is partial, so sending
   * the whole object would make two admins editing different fields overwrite
   * each other's work — the last save winning on a field it never touched.
   */
  const patch: Partial<HomeLayoutWire> = {};
  for (const key of Object.keys(draft) as (keyof HomeLayoutWire)[]) {
    if (draft[key] !== initial[key]) patch[key] = draft[key];
  }
  const dirty = Object.keys(patch).length > 0;

  const outOfRange = (Object.keys(HOME_LAYOUT_BOUNDS) as (keyof HomeLayoutWire)[]).some(
    (key) => {
      const v = Number(draft[key]);
      const b = HOME_LAYOUT_BOUNDS[key];
      return !Number.isFinite(v) || v < b.min || v > b.max;
    },
  );

  const heightPercent = Math.round(draft.bannerHeightFraction * 100);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Hero banner height</CardTitle>
          <CardDescription>
            How much of the patient&apos;s screen the promo carousel fills. A
            share of the whole screen, so it looks the same on a small phone and
            a tablet.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-[1fr_auto]">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="hl-height">Height ({heightPercent}% of screen)</Label>
              <DisabledWhenDenied
                capability="content.write"
                reason="Only an admin can change what patients see."
              >
                <Input
                  id="hl-height"
                  type="range"
                  min={HOME_LAYOUT_BOUNDS.bannerHeightFraction.min}
                  max={HOME_LAYOUT_BOUNDS.bannerHeightFraction.max}
                  step={HOME_LAYOUT_BOUNDS.bannerHeightFraction.step}
                  value={draft.bannerHeightFraction}
                  onChange={(e) =>
                    set('bannerHeightFraction', Number(e.target.value))
                  }
                  className="p-0"
                />
              </DisabledWhenDenied>
              <p className="text-muted-foreground text-xs">
                Default {Math.round(HOME_LAYOUT_DEFAULTS.bannerHeightFraction * 100)}%.
                Below about 30% the headline and button start to crowd the
                artwork.
              </p>
            </div>
          </div>
          <HeroPreview fraction={draft.bannerHeightFraction} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Care Services grid</CardTitle>
          <CardDescription>
            The block of service tiles below the hero. Applies to the grid
            layouts — a section set to List ignores both.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-[1fr_auto]">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="hl-columns">Columns</Label>
              <DisabledWhenDenied
                capability="content.write"
                reason="Only an admin can change what patients see."
              >
                <Input
                  id="hl-columns"
                  type="number"
                  min={HOME_LAYOUT_BOUNDS.careGridColumns.min}
                  max={HOME_LAYOUT_BOUNDS.careGridColumns.max}
                  step={HOME_LAYOUT_BOUNDS.careGridColumns.step}
                  value={draft.careGridColumns}
                  onChange={(e) => set('careGridColumns', Number(e.target.value))}
                  className="w-28"
                />
              </DisabledWhenDenied>
              <p className="text-muted-foreground text-xs">
                {HOME_LAYOUT_BOUNDS.careGridColumns.min}–
                {HOME_LAYOUT_BOUNDS.careGridColumns.max}. Default{' '}
                {HOME_LAYOUT_DEFAULTS.careGridColumns}. Past three, a tile on a
                phone is narrower than its own thumbnail.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hl-aspect">Tile shape</Label>
              <DisabledWhenDenied
                capability="content.write"
                reason="Only an admin can change what patients see."
              >
                <Input
                  id="hl-aspect"
                  type="number"
                  min={HOME_LAYOUT_BOUNDS.careTileAspect.min}
                  max={HOME_LAYOUT_BOUNDS.careTileAspect.max}
                  step={HOME_LAYOUT_BOUNDS.careTileAspect.step}
                  value={draft.careTileAspect}
                  onChange={(e) => set('careTileAspect', Number(e.target.value))}
                  className="w-28"
                />
              </DisabledWhenDenied>
              <p className="text-muted-foreground text-xs">
                Width ÷ height. Default {HOME_LAYOUT_DEFAULTS.careTileAspect} —
                below 1 the tile is taller than it is wide, which is the shape
                the card artwork was drawn for.
              </p>
            </div>
          </div>
          <PhonePreview
            layoutType="GRID_2_COL"
            surface="care-services"
            cards={SAMPLE_CARDS}
            columns={draft.careGridColumns}
            tileAspect={draft.careTileAspect}
          />
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <DisabledWhenDenied
          capability="content.write"
          reason="Only an admin can change what patients see."
        >
          <Button
            onClick={() => save.mutate(patch)}
            disabled={!dirty || outOfRange || save.isPending}
          >
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </Button>
        </DisabledWhenDenied>
        <DisabledWhenDenied
          capability="content.write"
          reason="Only an admin can change what patients see."
        >
          <Button
            variant="ghost"
            onClick={() => setDraft(HOME_LAYOUT_DEFAULTS)}
            disabled={save.isPending}
          >
            <RotateCcw className="size-4" />
            Reset to defaults
          </Button>
        </DisabledWhenDenied>
        {outOfRange ? (
          <p className="text-destructive text-xs">
            One of these is outside the range the app accepts.
          </p>
        ) : dirty ? (
          <p className="text-muted-foreground text-xs">Unsaved changes.</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The hero as a share of a phone screen.
 *
 * A 200px-tall frame stands in for the viewport, and the block inside takes the
 * chosen fraction of it — which is exactly what `promoBannerHeight` does in
 * `promo_banner_card.dart` (`MediaQuery.sizeOf(context).height * fraction`).
 * The card is 90% of the frame's width, mirroring `promoBannerSlideWidth`.
 */
function HeroPreview({ fraction }: { fraction: number }) {
  const FRAME_HEIGHT = 200;
  const FRAME_WIDTH = 112;
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative overflow-hidden rounded-xl border"
        style={{
          width: FRAME_WIDTH,
          height: FRAME_HEIGHT,
          backgroundColor: PREVIEW_CANVAS,
        }}
      >
        {/* The status bar + glass header the hero sits under, so the fraction
            reads against the whole screen rather than the scroll body. */}
        <div className="h-3 w-full bg-white/10" />
        <div className="flex justify-center pt-1">
          <div
            className="rounded-md bg-gradient-to-b from-violet-500 to-violet-800"
            style={{
              width: FRAME_WIDTH * 0.9,
              height: FRAME_HEIGHT * fraction,
            }}
          />
        </div>
      </div>
      <span className="text-muted-foreground text-[11px]">
        {Math.round(fraction * 100)}% of screen
      </span>
    </div>
  );
}
