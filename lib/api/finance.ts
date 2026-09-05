import { api } from './http';
import { P } from './paths';
import { unwrapArray, unwrapField, unwrapFlat } from './unwrap';
import type { BookingWire } from '@/types/wire/booking';
import type {
  CashInHandSummaryWire,
  CashSettlementResultWire,
  PayoutQueueWire,
  PayoutRequestWire,
} from '@/types/wire/finance';

/**
 * `GET /admin/billing` — bare array of completed bookings, capped at 500.
 * `endDate` is inclusive of the whole day and filters on `updated_at`.
 */
export async function listBilling(range?: {
  startDate?: string;
  endDate?: string;
}): Promise<BookingWire[]> {
  const res = await api.get(`${P.admin}/billing`, { params: range });
  return unwrapArray<BookingWire>(res, '/admin/billing');
}

export async function getCashInHand(): Promise<CashInHandSummaryWire> {
  const res = await api.get(`${P.admin}/finance/cash-in-hand`);
  return unwrapFlat<CashInHandSummaryWire>(res);
}

/**
 * `POST /admin/finance/settle-provider-cash`.
 *
 * A compare-and-swap on the provider's exact balance: if they collect another
 * payment between the page load and this call, the server answers 409 with a
 * message written for the user. Show that message and refetch — do not map it
 * onto a generic "something went wrong".
 */
export async function settleProviderCash(body: {
  providerId: string;
  amountCollected: number;
  adminNotes?: string;
}): Promise<CashSettlementResultWire> {
  const res = await api.post(`${P.admin}/finance/settle-provider-cash`, body);
  return unwrapFlat<CashSettlementResultWire>(res);
}

/** `GET /admin/finance/payouts` — rows carry FULL bank account numbers. */
export async function listPayouts(
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'all' = 'PENDING',
): Promise<PayoutQueueWire> {
  const res = await api.get(`${P.admin}/finance/payouts`, { params: { status } });
  return unwrapFlat<PayoutQueueWire>(res);
}

/** 409 when the payout was already resolved by someone else. */
export async function approvePayout(
  id: string,
  referenceId: string,
): Promise<PayoutRequestWire> {
  const res = await api.post(`${P.admin}/finance/payouts/${id}/approve`, {
    referenceId,
  });
  return unwrapField<PayoutRequestWire>(res, 'payoutRequest');
}

export async function rejectPayout(
  id: string,
  reason: string,
): Promise<PayoutRequestWire> {
  const res = await api.post(`${P.admin}/finance/payouts/${id}/reject`, { reason });
  return unwrapField<PayoutRequestWire>(res, 'payoutRequest');
}
