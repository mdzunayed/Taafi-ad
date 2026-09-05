import { api } from './http';
import { P } from './paths';
import { unwrapArray, unwrapFlat } from './unwrap';
import type {
  ActivityEventWire,
  AdminStatsWire,
  ChartDataWire,
  LiveServiceWire,
} from '@/types/wire/misc';

/** `GET /admin/stats` — flat object, no envelope. */
export async function getStats(): Promise<AdminStatsWire> {
  const res = await api.get(`${P.admin}/stats`);
  return unwrapFlat<AdminStatsWire>(res);
}

/** `GET /admin/chart-data` — `{series: [...]}`, always 7 buckets. */
export async function getChartData(): Promise<ChartDataWire> {
  const res = await api.get(`${P.admin}/chart-data`);
  return unwrapFlat<ChartDataWire>(res);
}

/** `GET /admin/activity` — bare array. */
export async function getActivity(): Promise<ActivityEventWire[]> {
  const res = await api.get(`${P.admin}/activity`);
  return unwrapArray<ActivityEventWire>(res, '/admin/activity');
}

/** `GET /admin/live-services` — bare array, capped at 200. */
export async function getLiveServices(): Promise<LiveServiceWire[]> {
  const res = await api.get(`${P.admin}/live-services`);
  return unwrapArray<LiveServiceWire>(res, '/admin/live-services');
}
