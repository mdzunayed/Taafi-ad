/**
 * Phone numbers for the two things an operator does with one: dial it, or open
 * a WhatsApp thread with it.
 *
 * The canonical digit form is the SERVER's, mirrored here rule for rule from
 * `backend/src/utils/phone.js`. That mirroring is the whole point of the file
 * and is worth more than any extra case a cleverer local implementation could
 * cover: the number this console opens a chat with has to be the number the
 * OTP gateway already delivers to, or an operator ends up messaging a thread
 * the patient will never see. New country branches land there first.
 *
 * Nothing here VALIDATES by default — a stored number the server accepted is
 * dialled as-is even when it is not a Bangladeshi mobile, because a foreign
 * patient with a real number is a normal case and a disabled button helps
 * nobody. `isDialable` exists only to keep an empty or junk field from
 * rendering a link to nowhere.
 */

/**
 * Strip to digits, then Bangladesh local → international.
 *
 * `+880 1700-00 01` → `880170000001`, `01700000001` → `8801700000001`. Any
 * other shape is returned as its bare digits, which is the correct thing to do
 * with an already-international number and the honest thing to do with junk.
 */
function normalize(phone: string | null | undefined): string {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) {
    return `880${digits.slice(1)}`;
  }
  return digits;
}

/**
 * The `wa.me/<number>` path segment: bare international digits, NO leading
 * `+`. WhatsApp resolves nothing else — a `+` or a local `01…` both land on
 * "phone number shared via url is invalid" rather than a chat.
 */
export function formatForWhatsApp(phone: string | null | undefined): string {
  return normalize(phone);
}

/**
 * The `tel:` URI's number, in E.164.
 *
 * The `+` form rather than the local one deliberately: a mobile dialer accepts
 * either, but the desk softphones this console is actually driven from route
 * an unprefixed `01…` through whatever national plan they were configured
 * with, and get it wrong when that is not Bangladesh.
 */
export function formatForTel(phone: string | null | undefined): string {
  const digits = normalize(phone);
  return digits ? `+${digits}` : '';
}

/**
 * Enough digits to be somebody's number. The floor is ten, the shortest
 * national mobile in use anywhere; a Bangladeshi one normalises to thirteen.
 *
 * This gates the buttons, so it is a check for a BLANK-or-broken field, not a
 * correctness check — see the note at the top of the file.
 */
export function isDialable(phone: string | null | undefined): boolean {
  return normalize(phone).length >= 10;
}

/**
 * A booking's short reference — the tail of its id, uppercased. `#A3F91C`.
 *
 * `care_requests` has no human-facing booking code; identity is the 24-hex
 * ObjectId, which is unreadable over the phone and unquotable in a message to
 * a patient. Six characters is short enough to read aloud and, because the
 * bookings table already filters on `id.includes(term)`, a patient quoting one
 * back is found by pasting it into that search box. Anything shorter stops
 * being a filter; anything longer stops being speakable.
 */
export function bookingRef(id: string | null | undefined): string {
  const s = String(id ?? '');
  return s ? s.slice(-6).toUpperCase() : '';
}
