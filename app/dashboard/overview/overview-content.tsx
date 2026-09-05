'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  CalendarDays,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiErrorState } from '@/components/rbac/api-error-state';
import { EmptyState } from '@/components/data/states';
import { getActivity, getChartData, getLiveServices, getStats } from '@/lib/api/overview';
import { qk } from '@/lib/api/query-keys';
import { humanize, money, relativeTime } from '@/lib/format';
import { RevenueChart } from './revenue-chart';

const POLL_MS = 30_000;

function KpiCard({
  label,
  value,
  icon: Icon,
  delta,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  delta?: number;
  tone?: 'warn';
}) {
  const Trend = (delta ?? 0) >= 0 ? TrendingUp : TrendingDown;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2">
          <Icon className={tone === 'warn' ? 'size-4 text-amber-600' : 'size-4'} />
          {label}
        </CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {delta !== undefined && (
        <CardContent className="pt-0">
          <p className="text-muted-foreground flex items-center gap-1 text-xs">
            <Trend className="size-3" />
            {Math.abs(delta)}% vs yesterday
          </p>
        </CardContent>
      )}
    </Card>
  );
}

export function OverviewContent() {
  const stats = useQuery({
    queryKey: qk.stats,
    queryFn: getStats,
    refetchInterval: POLL_MS,
  });
  const chart = useQuery({ queryKey: qk.chart, queryFn: getChartData });
  const activity = useQuery({
    queryKey: qk.activity,
    queryFn: getActivity,
    refetchInterval: POLL_MS,
  });
  const live = useQuery({
    queryKey: qk.liveServices,
    queryFn: getLiveServices,
    refetchInterval: POLL_MS,
  });

  if (stats.isError) {
    return <ApiErrorState error={stats.error} onRetry={() => stats.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.isLoading || !stats.data ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))
        ) : (
          <>
            <KpiCard
              label="Active services"
              value={String(stats.data.active_services ?? 0)}
              icon={Activity}
            />
            <KpiCard
              label="Pending approvals"
              value={String(stats.data.pending_approvals ?? 0)}
              icon={BadgeCheck}
            />
            <KpiCard
              label="Emergency alerts"
              value={String(stats.data.emergency_alerts ?? 0)}
              icon={AlertTriangle}
              tone="warn"
            />
            <KpiCard
              label="Revenue today"
              value={money(stats.data.daily_revenue)}
              icon={CalendarDays}
              delta={stats.data.revenue_delta}
            />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Bookings, last 7 days</CardTitle>
            <CardDescription>Approved against declined, per day.</CardDescription>
          </CardHeader>
          <CardContent>
            {chart.isLoading ? (
              <Skeleton className="h-64" />
            ) : chart.isError ? (
              <ApiErrorState error={chart.error} onRetry={() => chart.refetch()} />
            ) : (
              <RevenueChart series={chart.data?.series ?? []} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>The last eight platform events.</CardDescription>
          </CardHeader>
          <CardContent>
            {activity.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : !activity.data?.length ? (
              <EmptyState title="No activity yet" />
            ) : (
              <ScrollArea className="h-64 pr-3">
                <ul className="space-y-3">
                  {activity.data.map((event) => (
                    <li key={event.id} className="space-y-0.5 text-sm">
                      <p className="leading-snug">{event.message}</p>
                      <p className="text-muted-foreground text-xs">
                        {relativeTime(event.timestamp)}
                      </p>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Live monitor</CardTitle>
          <CardDescription>
            Visits currently in progress. Refreshes every 30 seconds.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {live.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : live.isError ? (
            <ApiErrorState error={live.error} onRetry={() => live.refetch()} />
          ) : !live.data?.length ? (
            <EmptyState
              title="Nothing in progress"
              description="Dispatched visits appear here while they are running."
            />
          ) : (
            <ul className="divide-y">
              {live.data.map((service) => (
                <li
                  key={service.id}
                  className="flex flex-wrap items-center gap-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {service.patientName}
                      {service.area && (
                        <span className="text-muted-foreground font-normal">
                          {' '}
                          · {service.area}
                        </span>
                      )}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {service.providerName ?? service.doctorName ?? 'Unassigned'}
                      {service.serviceType ? ` · ${service.serviceType}` : ''}
                    </p>
                  </div>
                  <Badge variant="outline">{humanize(service.status)}</Badge>
                  <div className="w-32">
                    <Progress value={Math.round((service.progressPercent ?? 0) * 100)} />
                    <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                      {service.elapsedMinutes}/{service.totalMinutes} min
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
