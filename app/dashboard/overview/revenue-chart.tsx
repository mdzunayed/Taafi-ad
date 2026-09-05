'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { ChartPointWire } from '@/types/wire/misc';

/**
 * Approved against declined, per day, for the last seven days.
 *
 * Grouped bars rather than stacked: the question this answers is "how does
 * approved compare with declined on a given day", which is a comparison of two
 * magnitudes against a shared baseline — stacking would only preserve the
 * total, and the total is not the interesting number here.
 *
 * Colours are categorical slots 1 and 2 (blue / orange). Both modes were run
 * through the palette validator and pass every check — lightness band, chroma
 * floor, CVD separation (worst pair ΔE 24.7 light / 26.8 dark against a ≥8
 * target), normal-vision separation, and ≥3:1 contrast against each surface.
 * The dark values are separately chosen steps, not an automatic flip.
 */
const config = {
  approved: { label: 'Approved', color: 'var(--chart-approved)' },
  declined: { label: 'Declined', color: 'var(--chart-declined)' },
} satisfies ChartConfig;

export function RevenueChart({ series }: { series: ChartPointWire[] }) {
  // The endpoint always returns seven zero-filled buckets, so an empty array
  // is not the empty case — seven zeroes is. Plotting those draws axes around
  // nothing, which reads as a broken chart rather than a quiet week.
  const hasData = series.some((d) => (d.approved ?? 0) + (d.declined ?? 0) > 0);

  if (!series.length || !hasData) {
    return (
      <p className="text-muted-foreground flex h-64 items-center justify-center text-sm">
        No bookings were approved or declined in the last seven days.
      </p>
    );
  }

  return (
    <ChartContainer
      config={config}
      className="[--chart-approved:#2a78d6] [--chart-declined:#eb6834] dark:[--chart-approved:#3987e5] dark:[--chart-declined:#d95926] h-64 w-full"
    >
      <BarChart accessibilityLayer data={series} barGap={2} maxBarSize={18}>
        {/* Recessive grid: horizontal only, so it reads as a measuring aid
            rather than a cage around the data. */}
        <CartesianGrid vertical={false} strokeOpacity={0.4} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          fontSize={12}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={32}
          fontSize={12}
          allowDecimals={false}
        />
        <ChartTooltip content={<ChartTooltipContent />} cursor={false} />
        <ChartLegend content={<ChartLegendContent />} />
        {/* 4px rounded data-ends, anchored to the baseline. */}
        <Bar dataKey="approved" fill="var(--color-approved)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="declined" fill="var(--color-declined)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
