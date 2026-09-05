'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutGrid, List, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { ApiErrorState } from '@/components/rbac/api-error-state';
import { DisabledWhenDenied } from '@/components/rbac/can';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CARE_SERVICES_KEY,
  homeSections,
  services,
  setCareServicesLayout,
  type HomeLayoutType,
  type HomeSectionWire,
} from '@/lib/api/content';
import { normalizeError } from '@/lib/api/errors';
import { qk } from '@/lib/api/query-keys';
import { useCan } from '@/hooks/use-permission';
import { PhonePreview, type PreviewCard } from './phone-preview';

/**
 * Layout picker for the Care Services block, with a live phone preview.
 *
 * Care Services is the ONLY section that reads `layoutType` — the others render
 * from `uiTemplate`, which is a different axis (what a card looks like, not how
 * cards are arranged). That is why this is a dedicated panel rather than a
 * column on the sections table: a per-row layout control would be a switch
 * wired to nothing on every row but this one.
 */

/**
 * Labels and descriptions are transcribed from `HomeLayoutTypeX` in
 * `frontend/lib/core/models/home_section.dart`, not invented, so the console
 * and the app describe the same thing in the same words.
 *
 * CAROUSEL IS NOT OFFERED. The app retired the horizontal rail on this block —
 * `LayoutEngine` draws CAROUSEL as the 2-column grid — so listing it would be a
 * third radio that produces the second one's layout. The wire value still
 * parses (it is the enum's unknown-value fallback, and rows written before the
 * change still carry it); [normalizeLayout] folds it into the grid so those
 * deployments land on the option that describes what they actually get.
 */
const LAYOUTS: Array<{
  wire: HomeLayoutType;
  label: string;
  description: string;
  Icon: typeof LayoutGrid;
}> = [
  {
    wire: 'GRID_2_COL',
    label: '2-column grid',
    description: 'Side-by-side card grid, two per row.',
    Icon: LayoutGrid,
  },
  {
    wire: 'LIST',
    label: 'Full-width list',
    description: 'Vertical stack of full-width rows.',
    Icon: List,
  },
];

/** CAROUSEL renders as the 2-column grid in the app; show it as such. */
function normalizeLayout(layout: HomeLayoutType | undefined): HomeLayoutType {
  return layout === 'CAROUSEL' || layout === undefined ? 'GRID_2_COL' : layout;
}

/**
 * Shown when the catalog is empty, so the preview still answers the question
 * being asked. Titles mirror the real catalog's shape without pretending to be
 * live data — the caption below the frame says which is on screen.
 */
const SAMPLE_CARDS: PreviewCard[] = [
  { id: 'sample-1', title: 'Doctor home visit', category: 'Doctor' },
  { id: 'sample-2', title: 'Post-op wound care', category: 'Post surgery' },
  { id: 'sample-3', title: 'Nursing attendant', category: 'Nursing' },
  { id: 'sample-4', title: 'Lab sample collection', category: 'Diagnostics' },
];

export function CareServicesPanel() {
  const queryClient = useQueryClient();
  const canWrite = useCan('content.write');

  const sections = useQuery({ queryKey: qk.homeSections, queryFn: homeSections.list });
  const catalog = useQuery({
    queryKey: qk.services,
    queryFn: services.list,
    staleTime: 300_000,
  });

  const careServices = sections.data?.find((s) => s.sectionKey === CARE_SERVICES_KEY);
  // No document yet is the NORMAL state on a deployment that has never used the
  // selector — Care Services predates the CMS. The app falls back to CAROUSEL
  // in exactly the same case, which it now draws as the 2-column grid, so that
  // is what the preview must show.
  const selected: HomeLayoutType = normalizeLayout(careServices?.layoutType);

  const save = useMutation({
    mutationFn: (layoutType: HomeLayoutType) => setCareServicesLayout(layoutType),

    // Optimistic, unlike every other mutation in this console — because here
    // the preview IS the feedback. Waiting for the round trip would mean
    // clicking a layout and watching nothing happen.
    onMutate: async (layoutType) => {
      await queryClient.cancelQueries({ queryKey: qk.homeSections });
      const previous = queryClient.getQueryData<HomeSectionWire[]>(qk.homeSections);
      queryClient.setQueryData<HomeSectionWire[]>(qk.homeSections, (old) => {
        if (!old) return old;
        return old.map((s) =>
          s.sectionKey === CARE_SERVICES_KEY ? { ...s, layoutType } : s,
        );
      });
      return { previous };
    },

    // Roll back to what the server still holds, so the preview never claims a
    // layout the app is not rendering.
    onError: (error, _layout, context) => {
      if (context?.previous) {
        queryClient.setQueryData(qk.homeSections, context.previous);
      }
      toast.error(normalizeError(error).message);
    },

    onSuccess: () => toast.success('Layout updated.'),

    // The upsert branch returns a section the list did not have, so a refetch
    // is required even on success — the optimistic patch above can only edit a
    // row that already exists.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.homeSections });
    },
  });

  const cards: PreviewCard[] =
    (catalog.data ?? [])
      .filter((s) => s.isActive !== false)
      .slice(0, 4)
      .map((s) => ({
        id: s.id,
        title: s.title ?? s.titleEn ?? 'Untitled service',
        category: typeof s.category === 'string' ? s.category : undefined,
        imageUrl: s.imageUrl,
      })) ?? [];
  const usingSamples = cards.length === 0;
  const previewCards = usingSamples ? SAMPLE_CARDS : cards;

  if (sections.isError) {
    return (
      <ApiErrorState error={sections.error} onRetry={() => void sections.refetch()} />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Care services layout</CardTitle>
        <CardDescription>
          How the Care Services block arranges its cards on the patient home
          screen. Saved the moment you choose one.
        </CardDescription>
      </CardHeader>
      <CardContent className="@container">
        {/* Below 900px the options stack above the frame; at or above, they sit
            side by side. Container-relative, not viewport-relative — what
            matters is the space this card actually has, which the collapsible
            sidebar changes without the window resizing. */}
        <div className="flex flex-col gap-7 @min-[900px]:flex-row @min-[900px]:items-start">
          <div className="min-w-0 flex-1">
            {sections.isPending ? (
              <div className="space-y-2">
                {LAYOUTS.map((l) => (
                  <Skeleton key={l.wire} className="h-[68px]" />
                ))}
              </div>
            ) : (
              <DisabledWhenDenied
                capability="content.write"
                reason="Only an admin can change what patients see."
              >
                <RadioGroup
                  value={selected}
                  onValueChange={(v) => save.mutate(v as HomeLayoutType)}
                  disabled={!canWrite || save.isPending}
                >
                  <div className="space-y-2">
                    {LAYOUTS.map(({ wire, label, description, Icon }) => {
                      const active = selected === wire;
                      return (
                        <label
                          key={wire}
                          htmlFor={`layout-${wire}`}
                          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                            active ? 'border-primary bg-accent' : 'hover:bg-accent/50'
                          }`}
                        >
                          <RadioGroupItem value={wire} id={`layout-${wire}`} className="mt-1" />
                          <Icon className="text-muted-foreground mt-0.5 size-5 shrink-0" />
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{label}</span>
                              {/* The stored value, shown so an operator
                                  debugging the API sees the same token the
                                  payload carries. */}
                              <code className="text-muted-foreground font-mono text-[11px]">
                                {wire}
                              </code>
                              {save.isPending && active && (
                                <Loader2 className="size-3.5 animate-spin" />
                              )}
                            </div>
                            <p className="text-muted-foreground text-xs">{description}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </RadioGroup>
              </DisabledWhenDenied>
            )}

            {!careServices && !sections.isPending && (
              <p className="text-muted-foreground mt-3 text-xs">
                No Care Services section exists yet — the app is rendering its
                default 2-column grid. Choosing a layout creates one.
              </p>
            )}
          </div>

          <div className="shrink-0 space-y-2">
            <PhonePreview
              layoutType={selected}
              cards={previewCards}
              surface="care-services"
            />
            <p className="text-muted-foreground text-xs">
              {catalog.isPending
                ? 'Loading catalog…'
                : usingSamples
                  ? 'Sample cards — add services to preview your own.'
                  : `Showing your ${previewCards.length} most recent services.`}
            </p>
            <p className="text-muted-foreground text-xs">
              Previewed at 360px, the width the layout actually ships to.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
