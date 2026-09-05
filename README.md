# Taafi Admin

The operations console for the Taafi care platform, served at `admin.taafi.com`.

This used to live inside the Flutter app as an `/admin/:name` route. It moved
out so ops staff get a desktop-shaped tool, patients stop shipping admin code in
their APK, and an ops fix doesn't have to wait for app-store review. The Flutter
app now refuses a back-office login outright and points people here.

## Read this first

**The seeded `admin@taafi.app` account is a `super_admin`.** It holds every
capability, including the three the console gates its write surfaces on —
`finance_write` (confirm deposits, refunds), `manage_content` (banners,
announcements, care services) and `manage_admins` (mint and re-role other
staff). A fresh database therefore signs in to the whole console.

It used to seed as `support_member`, which meant a fresh database had no
account able to promote anything — the Audit Log missing and "Confirm deposit
received" greyed out, with no way out of it from inside the product.

To exercise the RESTRICTED view, demote it and sign back in:

```bash
cd ../backend
node scripts/promoteSuperAdmin.js --role=support_member --apply   # restricted
node scripts/promoteSuperAdmin.js --apply                         # back to full
```

The script is a dry run without `--apply`, and prints the capabilities the
account holds before and after. **Sign out and back in after either.** The API
re-reads the role from Mongo per request, but this console renders its role
badge and gates its buttons on the identity in the session cookie, which is
only rewritten at login — so a still-open session shows the old view.

## Running it

```bash
cp .env.example .env.local     # already correct for a local backend
npm install
npm run dev                    # http://localhost:3000
```

The backend must be running separately (`cd ../backend && npm start`, port 5000).

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Browser-side. The origin is *derived* from this — see below. |
| `API_ORIGIN` | Server-side only, used by the BFF route handlers. Defaults to the derived origin. |

### The `/api/v1` trap

`NEXT_PUBLIC_API_BASE_URL` is named as though it addressed the whole API. It
does not. The backend aliases `/api/v1` over exactly three routers — auth,
admin and provider. Everything else (the content CMS, `/api/documents`,
`/api/config`) answers at `/api/*` only, and `/api/v1/promo-banners` is a 404
that reads exactly like a missing record.

So `lib/config/env.ts` strips the suffix down to a bare origin and
`lib/api/paths.ts` owns the per-domain prefixes. **Never concatenate onto the
env var directly.**

## How auth works

The backend sets no cookies at all — no `cookie-parser`, no `Set-Cookie`
anywhere — and issues bearer tokens in a JSON body. But `proxy.ts` has to gate
`/dashboard/*` before any HTML renders, and it can only read cookies. Hence a
thin BFF:

- `app/api/auth/{login,refresh,logout,session}` are the only code that talks to
  Express `/auth/*`. They mint three httpOnly cookies: `taafi_at` (access JWT),
  `taafi_rt` (refresh token, scoped to `path=/api/auth` so the 30-day
  credential rides on exactly two requests), and `taafi_session` (a ~200-byte
  identity the dashboard layout reads during server render).
- Everything else goes **browser → Express directly** with an access token held
  in a module-level variable. Never `localStorage`: an XSS can ride an open tab,
  but it must not be able to walk off with a 30-day refresh token.

### Refresh is serialised on purpose

`rotateRefreshToken` on the backend is a non-atomic read-modify-write, and
rotation is single-use with reuse detection. Two concurrent refreshes both
succeed, mint two chains, and the orphan later trips the reuse check —
`revokeAllForAccount` then signs the user out of **every device**. Two open tabs
is enough to cause it.

`lib/auth/refresh.ts` therefore layers an in-tab single-flight, a cross-tab
`navigator.locks` mutex with a double-checked read, and a per-process
idempotency map in the refresh route handler. The lock is the one actually
relied upon.

**Test it before trusting it:** set `JWT_TTL=60s` on the backend, sign in, open
four tabs on `/dashboard/overview`, wait 70s, then focus each in quick
succession. Expect exactly one `POST /auth/refresh` in the backend log and no
reuse warning. If all four tabs bounce to `/login`, the lock is broken.

### `proxy.ts` is not a security boundary

It decodes the JWT without verifying it — this app deliberately does not hold
`JWT_SECRET`. A forged cookie gets past it and receives an empty shell, because
every byte of data comes from Express, which checks the signature. The file
says so in a comment; keep it that way.

## RBAC

`lib/rbac/permissions.ts` is a literal transcription of
`backend/src/utils/permissions.js`. It exists because `/auth/login` returns
`user.permissions` — the explicit-grants array — not the computed set, so the
sidebar needs the table to decide what to render for the *signed-in* user.

It is no longer the source for anyone else: `GET /admin/accounts` returns
`effective_permissions` per row, computed server-side. The staff roster and the
permission matrix read that.

`lib/rbac/capabilities.ts` is where the UI is **deliberately stricter than the
API**. The backend gates the whole admin router with `requireRole('admin')`,
which expanded to include `support_member` — so the API let support staff edit
banners, approve prescriptions and confirm payments, contradicting the intent
written into the backend's own permission table.

**Most of that has now been closed on the server.** `manage_bookings`,
`view_patients`, `finance_read` and `manage_content` were defined but enforced
by no route; they now guard the booking writes, the patient reads, the finance
reads and the whole CMS respectively. The `content.*` notes are gone as a
result — the API is the stricter one there now.

Where a divergence remains, the entry records both facts:

```ts
{ uiPermission: 'finance_write', serverGuard: 'requirePermission(MANAGE_BOOKINGS)',
  note: 'API gates this on manage_bookings; UI is stricter — confirming money moved is a finance action.' }
```

Don't "fix" a divergence by loosening the UI. When the backend tightens the
route, delete the note. One entry runs the other way: `accounts.permissions`
is gated server-side by `requireSuperAdmin()`, which no permission slug can
express, so the UI gates on the role as well.

**Revocation.** `effectivePermissionsFor` is now
`(role baseline ∪ grants) − denials`, not a plain union — `permissions_denied[]`
on the account is what lets the matrix narrow a support member without demoting
them. `super_admin` short-circuits before the subtraction, so it cannot lock
itself out of the screen that would undo the edit.

Two enforcement points, one visual outcome: `<PermissionGate>` guesses from the
mirror, and `<ApiErrorState>` renders the *same* banner from the server's real
403 `required[]`. The second is what saves you when the mirror drifts.

## Things the API does that will surprise you

- **Six envelope shapes.** Bare arrays (`/admin/requests`, `/patients`,
  `/providers`, `/billing`, `/activity`, `/live-services`), a flat object
  (`/admin/stats`), `{success, <key>}`, `{success, items, page, …}` (audit log
  only — it is the sole paginated endpoint), `{ok: true}` (CMS deletes), and
  bare documents. `lib/api/unwrap.ts` handles each explicitly; a generic
  unwrapper silently discards the finance rollups.
- **Three casing conventions.** Bookings/settings/providers are snake_case;
  finance and the CMS are camelCase; auth's top level is camelCase with a
  snake_case `user` inside. There is no global converter, on purpose —
  `PUT /admin/settings` silently ignores unknown keys, so a camelised
  `platformCommissionPercent` returns 200 and changes nothing.
- **CORS `allowedHeaders` is a closed list**: `Content-Type`, `Authorization`,
  `x-account-id`, `X-Account-Id`. Adding any other request header fails the
  *preflight* and surfaces as a statusless network error.
- **Silent row caps**: 500 on patients/providers/billing, 200 on payouts, and
  `/admin/requests` is unbounded and unpaginated. `<ResultCapNotice>` says so
  rather than implying a capped billing report is complete.
- **`PATCH /providers/:id/verify` used to be a toggle** — a double-click
  un-verified a live doctor. It now requires an explicit `{verified: boolean}`
  and 400s on an empty body. Prefer
  `POST /providers/:id/verification` (`approve` / `reject` /
  `request_reupload`), which records a reason and texts the provider; the
  console uses that one.
- **`PATCH /admin/prescriptions/:id` refuses an APPROVED script**, with a 409
  `prescription_locked` — the same refusal the doctor's own pad gets, and
  deliberately not an admin override. `locked_at` means those exact words were
  signed off, and the patient may already hold the released version. Amend
  first, approve second; the review sheet orders the two that way.
- **Amending is not deciding.** That route leaves `admin_approval_status`
  exactly as it found it, so a corrected draft still faces the decision form. A
  sent-back draft also stays sent back.
- **`PATCH /admin/bookings/:id/status` takes either vocabulary** — a
  patient-facing `milestone` or a canonical `status` — and the console sends
  the milestone. The write is a CAS guarded on the booking not already being
  terminal, so a closed visit answers 409 and cannot be reopened by any route.
- **Presigned document links expire in 30 minutes.** Re-read
  `GET /admin/bookings/:id` before opening an attachment.
- **Login is capped at 5 failures per 15 minutes per IP** and the office shares
  one NAT address. Never auto-retry a login.

## Real-time dispatch alerts

The console holds one Socket.io connection for the whole shift, created in
`lib/realtime/socket.ts` and driven by `<RealtimeProvider>` in the dashboard
shell. A `new_care_request` broadcast raises a persistent banner, loops a chime
and posts a desktop notification until an operator opens or dismisses it.

- **The room is `room:admins`**, joined server-side from the JWT role. All three
  back-office roles map to it. They did not used to — only the literal `admin`
  role did, so a `super_admin` or `support_member` fell through to `room:users`
  and received *none* of the admin broadcasts, silently. If you add a role,
  add it to `roleRoomFor` in the backend or it will be deaf.
- **Socket payloads are camelCase**, unlike the snake_case booking REST
  payloads — they are hand-built literals in the route handlers, not model
  projections. See `types/wire/realtime.ts`; a mismatch renders a blank banner
  rather than throwing.
- **`CARE_REQUEST_CANCELLED` is SCREAMING_CASE** while its neighbours are
  `namespace:lower`. Transcribe event names, never derive them — a listener on
  a name that does not exist fails silently.
- **Events are refetch triggers, never a cache source.** Every handler
  invalidates React Query rather than merging the payload; delivery is
  at-most-once with no ordering guarantee across a reconnect. Reconnect itself
  invalidates, because anything that changed while disconnected arrived as an
  event nobody heard.
- **The chime needs a user gesture.** Browsers refuse autoplay on a tab nobody
  has clicked — which is exactly the state ops are in when an alert fires.
  `startChime` detects the block and the banner offers *Enable alerts*, which
  unlocks audio and requests notification permission from the same click.
  Permission is never requested on load: `denied` is sticky and cannot be
  re-requested from script.
- **`SOCKET_ORIGIN` on the backend is a separate check from
  `CORS_ALLOWED_ORIGINS`** and is not covered by it. Unset means `*`.

## The emergency switches actually do something now

`maintenance_mode` and `system_notification` were write-only for a long time —
persisted by `PUT /admin/settings`, rendered as controls, and read by no server
route and no client. Flipping the kill switch paused nothing, and because the
switch stayed on in the UI there was nothing to reveal it.

- `POST /patient/requests` now refuses with **503 `bookings_paused`** while
  maintenance mode is on, gated *before* validation so a paused platform
  answers the same way regardless of the body. Creation only — visits already
  in progress keep running.
- `GET /api/config/platform` (public, camelCase, 30s cache) exposes
  `bookingsPaused` + `broadcastMessage` so the patient app can disable its CTA
  and show the operator's own wording instead of failing at submit. Advisory
  only; the 503 is the real gate.
- Backed by `backend/tests/maintenanceMode.test.js`.

## Deploy checklist

- Set `CORS_ALLOWED_ORIGINS=https://admin.taafi.com` on the backend. It is
  currently **empty, which reflects every origin with `credentials: true`**.
- Set `SOCKET_ORIGIN=https://admin.taafi.com` too — see above, it is a
  different check and defaults to `*`.
- Confirm with `curl -H 'Origin: https://evil.example' -i <api>/api/v1/admin/stats`
  — no `access-control-allow-origin` should come back.
- The whole app is `robots: noindex`. It renders medical vaults and bank
  account numbers; keep it that way.

## Layout

```
app/
├── (auth)/            login, forced password reset
├── api/auth/          the BFF — the only code that calls Express /auth/*
└── dashboard/
    ├── overview/      KPIs, 7-day chart, activity, live monitor
    ├── bookings/      list, detail (invoice + dispatch + status override),
    │                  manual creation, payment queue
    ├── rx-approvals/  review queue, amendment editor, approve / send back / reject
    ├── providers/     roster, credential review + verification decision, provisioning
    ├── patients/      list, detail (PHI behind a reveal), manual creation
    ├── finance/       billing, cash clearance, payouts
    ├── content/       services, categories, home sections, banners, app-open ad
    └── system/        settings, staff & permission matrix, audit log
lib/{api,auth,rbac,realtime,format,config}   types/wire
components/{ui,layout,rbac,data,common,providers}
public/sounds/      incoming-request.mp3 — the dispatch chime
```
