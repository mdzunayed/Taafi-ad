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
  /**
   * The invoice archive, keyed by its query. Server-side paging and search
   * mean each filter combination is a distinct page of rows, so they cannot
   * share one cache entry the way the client-filtered `bookings` list does.
   */
  bookingArchive: (query: Record<string, unknown>) =>
    ['bookings', 'archive', query] as const,

  providers: ['providers'] as const,
  qualifications: (id: string) => ['providers', id, 'qualifications'] as const,

  patients: ['patients'] as const,
  patient: (id: string) => ['patients', id] as const,
  /**
   * Type-ahead results, keyed by the term. A per-term entry is what makes
   * backspacing instant: the previous query's rows are still cached, so the
   * list repaints from memory instead of flashing empty on a refetch.
   */
  patientSearch: (q: string) => ['patients', 'search', q] as const,
  /** The verified-doctor roster behind the manual booking form's dispatch picker. */
  approvedDoctors: ['providers', 'doctors', 'approved'] as const,

  accounts: (query: Record<string, unknown>) => ['accounts', query] as const,
  account: (id: string) => ['accounts', id] as const,

  prescriptions: (status?: string) => ['prescriptions', status ?? 'queue'] as const,

  billing: (from?: string, to?: string) => ['billing', from ?? '', to ?? ''] as const,
  cashInHand: ['finance', 'cash-in-hand'] as const,
  payouts: (status: string) => ['finance', 'payouts', status] as const,

  settings: ['settings'] as const,
  auditLogs: (params: Record<string, unknown>) => ['audit-logs', params] as const,
  auditActions: ['audit-logs', 'actions'] as const,

  /**
   * The back-office catalogs behind the invoice editor's pickers. Separate
   * keys from `services` below: that one holds the CMS's decorated storefront
   * rows (images, ratings, category pills) from a different endpoint, and
   * sharing an entry would have the picker render whichever shape was fetched
   * last.
   */
  supplies: ['supplies'] as const,
  serviceCatalog: ['service-catalog'] as const,

  services: ['content', 'services'] as const,
  /**
   * The catalog page's list, back-office rows included. A DIFFERENT endpoint
   * from `services` above, so it needs its own entry — but nested underneath
   * it, because invalidation is prefix-matched: every existing
   * `invalidateQueries({ queryKey: qk.services })` already clears this too.
   */
  servicesAll: ['content', 'services', 'all'] as const,
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
