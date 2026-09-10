import { api } from './http';
import { P } from './paths';
import { unwrapArray, unwrapFlat } from './unwrap';

/**
 * Content CMS — the surfaces that drive what patients see in the mobile app.
 *
 * TWO THINGS DIFFER HERE from the rest of the admin API:
 *
 *  1. The prefix is `${P.content}` = `/api`, NOT `/api/v1`. These routers have
 *     no v1 alias; `/api/v1/promo-banners` is a 404 that reads like a missing
 *     record.
 *  2. Payloads are camelCase (`isActive`, `priorityOrder`, `titleEn`) and
 *     DELETE answers `{ok: true}` rather than `{success: true}`.
 *
 * Image uploads are multipart with an 8 MB server cap. Never set
 * `Content-Type` by hand on a FormData request — doing so drops the multipart
 * boundary and the server receives an empty body.
 */

export interface CmsItem {
  id: string;
  [key: string]: unknown;
}

/**
 * What kind of notice a banner is. Mirrors the backend `PromoBanner.categoryTag`
 * enum, which is the authority — an unknown value is clamped to ANNOUNCEMENT
 * server-side rather than rejected, so this list going stale degrades the badge
 * rather than the write.
 */
export type BannerCategoryTag =
  'ANNOUNCEMENT' | 'FEATURE' | 'HEALTH_TIP' | 'NOTICE';

export const BANNER_CATEGORY_TAGS: BannerCategoryTag[] = [
  'ANNOUNCEMENT',
  'FEATURE',
  'HEALTH_TIP',
  'NOTICE',
];

/** What the patient reads on the badge — transcribed from `BannerCategoryTagX.label`. */
export const BANNER_CATEGORY_LABEL: Record<BannerCategoryTag, string> = {
  ANNOUNCEMENT: 'Announcement',
  FEATURE: 'Feature',
  HEALTH_TIP: 'Health tip',
  NOTICE: 'System notice',
};

/** Where a banner's CTA sends the patient. Mirrors `PromoBanner.actionType`. */
export type BannerActionType =
  'SERVICE' | 'CATEGORY' | 'EXTERNAL_URL' | 'PROMO_CODE' | 'CUSTOM_ROUTE' | 'NONE';

export const BANNER_ACTION_TYPES: BannerActionType[] = [
  'SERVICE',
  'CATEGORY',
  'EXTERNAL_URL',
  'PROMO_CODE',
  'CUSTOM_ROUTE',
  'NONE',
];

export const BANNER_ACTION_LABEL: Record<BannerActionType, string> = {
  SERVICE: 'Open a service',
  CATEGORY: 'Open a category',
  EXTERNAL_URL: 'Open a link',
  PROMO_CODE: 'Apply a promo code',
  CUSTOM_ROUTE: 'Open an app screen',
  NONE: 'Nothing — read only',
};

/**
 * NOTE ON FIELD NAMES. These are the names the backend actually serves
 * (`backend/src/models/PromoBanner.js` + `decorate()` in `routes/promoBanners.js`).
 *
 * This interface previously declared `titleEn` / `titleBn` / `startsAt` / `endsAt`,
 * none of which exist on the wire — so the Banner column rendered `—` for every
 * row and the Window column said `Always` for every scheduled campaign. That is
 * the same defect `HomeSectionWire` below documents; check any rename here
 * against the model and `decorate()` first.
 */
/**
 * The in-app screens a banner can be pointed at, for `CUSTOM_ROUTE`.
 *
 * These strings are the Flutter client's route vocabulary
 * (`features/patient/navigation/dynamic_route_dispatcher.dart`), not URL
 * paths — `/dashboard`-style values are rejected by the API. The field stays
 * free text so `service:<id>` and a full https:// link still work, and so a
 * route added to a newer app build can be typed in before this list catches
 * up; these are the ones worth one click.
 */
export const BANNER_ROUTE_PRESETS: { value: string; label: string }[] = [
  { value: 'home', label: 'Home' },
  { value: 'new_request', label: 'Book a service' },
  { value: 'activities', label: 'Activities' },
  { value: 'activities:active_care', label: 'Activities — Active care' },
  { value: 'activities:history', label: 'Activities — History' },
  { value: 'activities:medications', label: 'Activities — Medications' },
  { value: 'account', label: 'Account' },
];

export interface PromoBannerWire extends CmsItem {
  tagText?: string;
  title?: string;
  buttonText?: string;
  imageUrl?: string;
  gradientColors?: string[];
  priorityOrder?: number;
  isActive?: boolean;
  startDate?: string | null;
  endDate?: string | null;
  actionType?: BannerActionType;
  /**
   * Populated to an object when the backend resolved the target service (see
   * `TARGET_SERVICE_POPULATE`), a bare id string otherwise, null when unset.
   */
  targetServiceId?: string | { id: string; title: string } | null;
  targetCategoryId?: string | null;
  targetUrl?: string;
  promoCode?: string;
  /**
   * In-app destination for `actionType: 'CUSTOM_ROUTE'`. Not a URL path — the
   * vocabulary is the Flutter client's `dispatchDynamicRoute` (see
   * BANNER_ROUTE_PRESETS below). The server rejects a string it could never
   * resolve, so a typo here comes back as a 400 rather than a dead tap.
   */
  targetRoute?: string;
  /** News-bulletin half — the badge and the reader-sheet body. */
  categoryTag?: BannerCategoryTag;
  detailContent?: string;
  createdAt?: string;
}

/**
 * NOTE ON FIELD NAMES — the same class of defect this file documents twice
 * above. This interface previously declared `categoryId` and `providerType`,
 * neither of which is on the wire, so the services table's Provider type
 * column rendered `—` for every row.
 *
 * The authority is `decorate()` in `backend/src/routes/services.js`. The
 * catalog speaks snake_case for the fields it shares with a booking
 * (`provider_type`) and camelCase for the rest.
 */
export interface ServiceWire extends CmsItem {
  title?: string;
  titleEn?: string;
  description?: string;
  /**
   * Legacy list price. NOT a CMS field any more — the console writes
   * `defaultBaseFee` and the server mirrors it here for the patient app's
   * price sort. Nullable, and nothing in this console should read it.
   */
  price?: number | null;
  duration?: string | null;
  imageUrl?: string;
  /** The stored vocabulary, and the only shape the write endpoints accept. */
  status?: 'active' | 'inactive';
  /**
   * Read-side alias for `status === 'active'`. Served by the backend and also
   * normalized in `services.list` below, so it is safe to read even against an
   * older API. Never send it as a write field — use `status`.
   */
  isActive?: boolean;
  /** Legacy free-text category. `categoryIds` wins when non-empty. */
  category?: string;
  categoryIds?: string[];
  categorySlugs?: string[];
  categorySlug?: string | null;
  isUrgentAvailable?: boolean;
  /**
   * Back-office only: billable on an invoice, excluded from every public
   * catalog read. Enforced server-side by `PUBLIC_SERVICE_FILTER`, not by this
   * console — see `backend/src/models/Service.js`.
   */
  isAdminOnly?: boolean;
  provider_type?: string | null;
  /** Whether `provider_type` was set by an admin or inferred from the title. */
  provider_type_source?: 'assigned' | 'inferred' | 'none';
  /**
   * What the booking fee dialog pre-fills when this service is picked.
   * Suggestions, not prices — the committed numbers live on the booking.
   *
   * `defaultBaseFee` is NULLABLE and null is the meaningful case: it means
   * pricing is variable and nobody has pinned a figure, which is what the
   * catalog's "Variable / Unset" badge renders and why the fee dialog opens an
   * empty box. It is no longer derived from `price` on read. Guard with
   * `!= null`, never `!== undefined` — a null slips through the latter and
   * reaches the input as the string "null".
   *
   * `defaultAdvanceDeposit` still falls back to the platform default, so in
   * practice it arrives populated; it is typed nullable for symmetry and
   * because the fallback is a server-side promise, not a schema guarantee.
   */
  defaultBaseFee?: number | null;
  defaultAdvanceDeposit?: number | null;
  default_base_fee_source?: 'assigned' | 'unset';
  default_advance_deposit_source?: 'assigned' | 'platform_default';
  /** Earned from patient feedback, never stored. */
  rating?: number;
  ratingCount?: number;
}

export interface CategoryWire extends CmsItem {
  nameEn?: string;
  nameBn?: string;
  descriptionEn?: string | null;
  descriptionBn?: string | null;
  /** The join key against a service's category, not a display string. */
  slug?: string;
  iconUrl?: string;
  displayOrder?: number;
  isActive?: boolean;
  /**
   * Does this category get a pill on the patient Home rail? A SEPARATE
   * question from `isActive`: a category can be real, hold services and answer
   * deep links without earning one of the few slots on a phone-width rail.
   */
  showOnHomeRail?: boolean;
}

/**
 * The one place that decides whether a catalog row is live.
 *
 * `s.isActive !== false` is NOT equivalent and was a real defect: the backend
 * did not serve `isActive` at all, so `undefined !== false` passed every
 * deactivated service straight through the manual-booking picker. Reading
 * `status` as the fallback makes the check true regardless of which field the
 * API populated.
 */
export function isServiceActive(s: ServiceWire): boolean {
  if (typeof s.isActive === 'boolean') return s.isActive;
  return s.status !== 'inactive';
}

/**
 * How a section arranges its cards. Mirrors the backend
 * `DynamicSection.layoutType` enum, which is the authority — every write path
 * validates against `schema.path('layoutType').enumValues`, so a value missing
 * here is a 400 rather than a silent no-op.
 *
 * Orthogonal to `uiTemplate`, which says what a *card* looks like; this says
 * how the cards are arranged. Only the reserved `CARE_SERVICES` section reads
 * it today — see `careServicesSection` below.
 */
export type HomeLayoutType = 'GRID_2_COL' | 'CAROUSEL' | 'LIST';

/**
 * NOTE ON FIELD NAMES. These are the names the backend actually serves
 * (`backend/src/models/DynamicSection.js` + the `decorate()` serializer). This
 * interface previously declared `layout` / `displayOrder` / `items`, none of
 * which exist on the wire — so the Layout, Order and Items columns on the CMS
 * table rendered `—`, `—` and `0` for every row. If you rename anything here,
 * check it against `decorate()` first.
 */
export interface HomeSectionWire extends CmsItem {
  sectionKey?: string;
  titleEn?: string;
  titleBn?: string;
  /** Which card template renders this section. NOT the arrangement. */
  uiTemplate?: string;
  layoutType?: HomeLayoutType;
  orderIndex?: number;
  isActive?: boolean;
  styleTokens?: {
    titleColorLight?: string | null;
    titleColorDark?: string | null;
    sectionBackgroundColor?: string | null;
  } | null;
  /** The section's cards. Embedded, not a ref array. */
  contentData?: Array<Record<string, unknown>>;
}

function collection<T>(path: string, endpoint: string) {
  return {
    list: async (): Promise<T[]> => {
      const res = await api.get(`${P.content}${path}`);
      return unwrapArray<T>(res, endpoint);
    },
    create: async (body: FormData | Record<string, unknown>): Promise<T> => {
      const res = await api.post(`${P.content}${path}`, body);
      return unwrapFlat<T>(res);
    },
    update: async (
      id: string,
      body: FormData | Record<string, unknown>,
    ): Promise<T> => {
      const res = await api.put(`${P.content}${path}/${id}`, body);
      return unwrapFlat<T>(res);
    },
    setActive: async (id: string, isActive: boolean): Promise<T> => {
      const res = await api.patch(`${P.content}${path}/${id}/status`, { isActive });
      return unwrapFlat<T>(res);
    },
    /** Answers `{ok: true}`, not `{success: true}`. */
    remove: async (id: string): Promise<{ ok: boolean }> => {
      const res = await api.delete(`${P.content}${path}/${id}`);
      return unwrapFlat<{ ok: boolean }>(res);
    },
    /**
     * `PATCH /reorder` — takes the full list of ids in their desired
     * top-to-bottom sequence; the server renumbers the order column to
     * 0..n-1 in one `bulkWrite` and answers with the re-sorted list.
     *
     * The body is `{ids}`. It previously sent `{order: [{id, displayOrder}]}`,
     * which every one of these routers answers with a 400 — it went unnoticed
     * because nothing called reorder until the home-sections manager did.
     */
    reorder: async (ids: string[]): Promise<T[]> => {
      const res = await api.patch(`${P.content}${path}/reorder`, { ids });
      return unwrapArray<T>(res, `${endpoint}/reorder`);
    },
  };
}

export const banners = collection<PromoBannerWire>('/promo-banners', '/api/promo-banners');

/**
 * Announcements — the same rows `banners` serves, narrowed to the ones that
 * carry a readable body.
 *
 * There is no announcements collection on the server. A promo banner and an
 * announcement are ONE PromoBanner row seen two ways: the artwork is a carousel
 * slide, and a non-empty `detailContent` makes it a bulletin the patient app
 * opens in a sheet. So a row can legitimately appear in both tabs, and
 * `detailContent` is the only discriminator that exists without adding a schema
 * field.
 *
 * Filtered HERE rather than with a query parameter because the server's
 * `GET /api/promo-banners` is Redis-cached under one key: a `?categoryTag=`
 * branch would need the cache key to vary by query string or it would hand the
 * next caller the filtered array. The list is small enough that this is free.
 *
 * `create` is inherited unchanged — the form always writes a `detailContent`,
 * which is what makes the new row show up in this list.
 */
export const announcements = {
  ...banners,
  list: async (): Promise<PromoBannerWire[]> => {
    const rows = await banners.list();
    return rows.filter((b) => String(b.detailContent ?? '').trim() !== '');
  },
};

const serviceCollection = collection<ServiceWire>('/services', '/api/services');

/**
 * The services catalog, with two deviations from the generic collection — both
 * because this router speaks `status: 'active'|'inactive'` where every other
 * CMS collection speaks `isActive`.
 *
 *   setActive  sends `{status}`, the vocabulary the row actually stores. The
 *              generic helper sends `{isActive}`, which this route once
 *              answered with a 400 — so the Live switch had never worked. The
 *              route now takes both spellings (`services.js`, the
 *              `PATCH /:id/status` handler), so this override is no longer
 *              load-bearing; it stays because writing the stored field is the
 *              honest shape and costs nothing.
 *   list       fills in `isActive` when the API did not, so the shared
 *              `ContentCollection` switch and every service picker read one
 *              field. READ-SIDE ONLY; writes still speak `status`.
 *
 * Both are belt-and-braces against an older backend: the API now serves
 * `isActive` and accepts either shape on the toggle.
 */
export const services = {
  ...serviceCollection,
  list: async (): Promise<ServiceWire[]> => {
    const rows = await serviceCollection.list();
    return rows.map((s) => ({ ...s, isActive: isServiceActive(s) }));
  },
  /**
   * The CMS list: storefront rows AND back-office ones, from the authenticated
   * `GET /api/services/manage`.
   *
   * `list` above stays on the public route, which excludes back-office rows in
   * the database query itself. That is deliberate and worth keeping: every
   * service picker in this console reads `list`, so a row that must never be
   * bookable or linkable cannot reach one even if a picker forgets to filter.
   * Only the catalog page, which has a section for them, asks for this.
   */
  listAll: async (): Promise<ServiceWire[]> => {
    const res = await api.get(`${P.content}/services/manage`);
    const rows = unwrapArray<ServiceWire>(res, '/api/services/manage');
    return rows.map((s) => ({ ...s, isActive: isServiceActive(s) }));
  },
  setActive: async (id: string, isActive: boolean): Promise<ServiceWire> => {
    const res = await api.patch(`${P.content}/services/${id}/status`, {
      status: isActive ? 'active' : 'inactive',
    });
    return unwrapFlat<ServiceWire>(res);
  },
};

export const categories = collection<CategoryWire>('/categories', '/api/categories');
const homeSectionCollection = collection<HomeSectionWire>(
  '/home-sections',
  '/api/home-sections',
);

/**
 * Home sections, plus the card-image upload the section editor needs.
 *
 * `sanitizeItems` on the server requires every `contentData` item to carry a
 * `title` AND an `imageUrl`, and the section is saved as one whole-array
 * replace. So a card's image has to become a URL BEFORE the section is saved —
 * which is what this dedicated endpoint is for. It is the only upload endpoint
 * in the CMS that is not attached to its resource's own POST/PUT.
 */
export const homeSections = {
  ...homeSectionCollection,
  /**
   * `POST /api/home-sections/images` — multipart `itemId` + `image`, answering
   * `{imageUrl}`.
   *
   * `itemId` doubles as the image's storage publicId, so it must be the same id
   * the card is saved with or the picture and the card part ways. The server
   * constrains it to `/^[A-Za-z0-9_-]{1,64}$/` (path-traversal hardening), so
   * mint it with `newSectionItemId()` below rather than by hand.
   *
   * No `Content-Type` header is set: axios derives the multipart boundary from
   * the FormData, and naming the type by hand drops it and empties the body.
   */
  uploadImage: async (itemId: string, file: File): Promise<string> => {
    const body = new FormData();
    body.append('itemId', itemId);
    body.append('image', file);
    const res = await api.post(`${P.content}/home-sections/images`, body);
    const out = unwrapFlat<{ imageUrl?: string }>(res);
    return out?.imageUrl ?? '';
  },
};

/** The server's `SAFE_ITEM_ID`. Mirrored so a bad id fails in the form, not on save. */
export const SECTION_ITEM_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * A fresh `itemId` for a new section card. Stable for the card's lifetime —
 * it is also the publicId its image is stored under, so regenerating one would
 * orphan the picture.
 */
export function newSectionItemId(): string {
  return `card_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The reserved `sectionKey` the patient app treats specially: it is the Care
 * Services block on Home, so the app reads its `layoutType` and skips it in the
 * generic dynamic-sections list (otherwise it would render twice).
 */
export const CARE_SERVICES_KEY = 'CARE_SERVICES';

/**
 * `PUT /api/home-sections/care-services` — set the Care Services layout.
 *
 * Deliberately NOT `PATCH /:id/layout`. Care Services predates the CMS: it has
 * always rendered the live catalog, so on most deployments there is no
 * `CARE_SERVICES` document to patch a layout onto. This endpoint upserts —
 * creating the section on first use — which is the difference between a
 * selector that works on a seeded dev database and one that works in
 * production.
 */
export async function setCareServicesLayout(
  layoutType: HomeLayoutType,
): Promise<HomeSectionWire> {
  const res = await api.put(`${P.content}/home-sections/care-services`, { layoutType });
  return unwrapFlat<HomeSectionWire>(res);
}

// ── Home layout ─────────────────────────────────────────────────────────────

/**
 * The patient Home geometry an operator owns, as served by `/api/home-layout`.
 *
 * camelCase, like the rest of this file. Note it is NOT the same shape as
 * `SettingsHomeLayoutWire` in `types/wire/misc.ts`: that is how the field sits
 * on the settings document (snake_case), this is how the content endpoint
 * projects it.
 *
 * Every field always arrives — the server fills defaults for a row written
 * before the feature existed, and clamps a hand-edited one — so the form never
 * has to render an empty slider.
 */
export interface HomeLayoutWire {
  /** Share of the full viewport height the promo hero occupies. */
  bannerHeightFraction: number;
  /** Columns in the Care Services grid. */
  careGridColumns: number;
  /** Care tile width:height. Below 1 is taller than wide. */
  careTileAspect: number;
}

/**
 * What the Flutter binary shipped with. The app falls back to these numbers
 * when it cannot reach the API, so they are also what the form shows as
 * "default" — the two ends agreeing is what makes a failed fetch invisible
 * rather than a reflow.
 */
export const HOME_LAYOUT_DEFAULTS: HomeLayoutWire = {
  bannerHeightFraction: 0.65,
  careGridColumns: 2,
  careTileAspect: 0.8,
};

/**
 * Bounds mirroring `HomeLayoutSchema` in the backend's `models/Settings.js`,
 * and mirrored again as clamps in the Flutter client. Kept here so the slider
 * gets the right track and an out-of-range value is impossible to submit,
 * rather than discovered as a 400.
 */
export const HOME_LAYOUT_BOUNDS = {
  bannerHeightFraction: { min: 0.2, max: 0.95, step: 0.01 },
  careGridColumns: { min: 1, max: 4, step: 1 },
  careTileAspect: { min: 0.4, max: 2, step: 0.05 },
} as const;

export const homeLayout = {
  get: async (): Promise<HomeLayoutWire> => {
    const res = await api.get(`${P.content}/home-layout`);
    return unwrapFlat<HomeLayoutWire>(res);
  },
  /** PARTIAL — send only the knobs that changed; the rest keep their values. */
  update: async (patch: Partial<HomeLayoutWire>): Promise<HomeLayoutWire> => {
    const res = await api.put(`${P.content}/home-layout`, patch);
    return unwrapFlat<HomeLayoutWire>(res);
  },
};
