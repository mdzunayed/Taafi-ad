/**
 * Socket.io event payloads.
 *
 * NOTE THE CASING. Every REST payload for bookings is snake_case, but the
 * socket events are camelCase — they are hand-built object literals in the
 * route handlers, not model projections, so they never passed through the
 * Mongoose transform that produces the snake_case wire shape. Do not "fix"
 * these to match `BookingWire`; they are a different contract.
 *
 * @see backend/src/routes/patient.js  notifyAdminsBookingReady
 * @see backend/src/utils/paymentBroadcast.js
 * @see backend/src/utils/cancellationBroadcast.js
 */

/** `new_care_request` — a patient just submitted a booking. */
export interface NewCareRequestEvent {
  requestId: string;
  patientName: string;
  patientPhone: string;
  careType: string;
  locationText: string;
  urgencyLevel: 'low' | 'medium' | 'high' | 'critical' | string;
  preferredTime: string | null;
  createdAt: string;
  /** Console-relative path, e.g. `/dashboard/bookings/<id>`. */
  deepLink: string;
}

/**
 * The other broadcasts already emitted into `room:admins`. The console only
 * needs them as refetch triggers, so they are typed loosely — read the
 * authoritative state back over REST rather than trusting these fields.
 */
export interface BookingTouchedEvent {
  requestId?: string;
  bookingId?: string;
  id?: string;
}

/**
 * The events actually broadcast into `room:admins`, copied verbatim from the
 * emitters. Note `CARE_REQUEST_CANCELLED` is SCREAMING_CASE while its
 * neighbours are `namespace:lower` — that inconsistency is in the backend, and
 * a socket listener on a name that does not exist fails silently, so these are
 * transcribed rather than derived.
 */
export const REALTIME_EVENTS = {
  newCareRequest: 'new_care_request',
  cancelled: 'CARE_REQUEST_CANCELLED',
  paymentUpdated: 'booking:payment_updated',
  payoutRequested: 'payout:requested',
  payoutResolved: 'payout:resolved',
  prescriptionPaid: 'prescription:paid',
} as const;
