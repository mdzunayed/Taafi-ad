/**
 * Finance payloads.
 *
 * NOTE THE CASING: this domain is camelCase on the wire, unlike bookings and
 * providers, which are snake_case. Both are correct — they are different
 * controllers written at different times. Do not "fix" either one.
 */

export interface CashInHandRowWire {
  accountId: string;
  name: string;
  role: string;
  phone?: string;
  cashInHand: number;
  lastCollectionAt: string | null;
  isPayoutLocked?: boolean;
}

export interface CashInHandSummaryWire {
  success: boolean;
  providers: CashInHandRowWire[];
  totalCashInField: number;
  collectedToday: number;
  outstandingProvidersCount: number;
}

export interface CashSettlementResultWire {
  success: boolean;
  receiptId: string;
  log?: unknown;
  provider: { accountId: string; cashInHand: number };
}

export interface PayoutRequestWire {
  id: string;
  providerAccountId?: string;
  providerName?: string;
  providerRole?: string;
  amount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  /**
   * SENSITIVE. Rows carry the provider's FULL bank account number. Mask by
   * default, reveal on an explicit click, and never put this in a CSV export
   * or a logged payload.
   */
  accountNumber?: string;
  accountName?: string;
  bankName?: string;
  method?: string;
  referenceId?: string | null;
  rejectionReason?: string | null;
  requestedAt?: string;
  resolvedAt?: string | null;
}

export interface PayoutQueueWire {
  success: boolean;
  items: PayoutRequestWire[];
  pendingCount: number;
  pendingTotal: number;
}
