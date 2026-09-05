/** Centralised React Query keys, so invalidation after a mutation is exact. */
export const qk = {
  stats: ['stats'] as const,
  chart: ['chart'] as const,
  activity: ['activity'] as const,
  liveServices: ['live-services'] as const,

  bookings: ['bookings'] as const,
  booking: (id: string) => ['bookings', id] as const,
  dispatch: (id: string, role: string) => ['bookings', id, 'dispatch', role] as const,
  teamPool: (id: string) => ['bookings', id, 'team-pool'] as const,
  pendingDeposit: ['bookings', 'pending-deposit'] as const,
  pendingPayment: ['bookings', 'pending-payment'] as const,

  providers: ['providers'] as const,
  qualifications: (id: string) => ['providers', id, 'qualifications'] as const,

  patients: ['patients'] as const,
  patient: (id: string) => ['patients', id] as const,

  accounts: (query: Record<string, unknown>) => ['accounts', query] as const,
  account: (id: string) => ['accounts', id] as const,

  prescriptions: (status?: string) => ['prescriptions', status ?? 'queue'] as const,

  billing: (from?: string, to?: string) => ['billing', from ?? '', to ?? ''] as const,
  cashInHand: ['finance', 'cash-in-hand'] as const,
  payouts: (status: string) => ['finance', 'payouts', status] as const,

  settings: ['settings'] as const,
  auditLogs: (params: Record<string, unknown>) => ['audit-logs', params] as const,
  auditActions: ['audit-logs', 'actions'] as const,

  services: ['content', 'services'] as const,
  categories: ['content', 'categories'] as const,
  homeSections: ['content', 'home-sections'] as const,
  banners: ['content', 'banners'] as const,
  homeLayout: ['content', 'home-layout'] as const,
  // A distinct key from `banners` even though both read the same endpoint: the
  // Announcements tab shows a filtered subset, and sharing one cache entry
  // would make a bulletin edit silently repaint the Banners table with the
  // filtered list.
  announcements: ['content', 'announcements'] as const,
};
