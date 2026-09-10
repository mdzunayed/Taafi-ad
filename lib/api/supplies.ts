import { api } from './http';
import { P } from './paths';
import { unwrapFieldArray, unwrapField } from './unwrap';

/**
 * The consumables catalog — medicines, dressings, equipment — and the
 * back-office service catalog that feeds the invoice editor's two pickers.
 *
 * Both reads are UNPAGINATED and both are meant to be. The pickers fuzzy-match
 * as the operator types, and a paged source would mean either a round-trip per
 * keystroke or a picker that can only find what happens to be on page one.
 * They are cached with a long `staleTime` and refetched on write instead.
 */

export interface SupplyWire {
  id: string;
  name: string;
  category: 'medicine' | 'bandage' | 'equipment' | 'procedure' | 'other';
  unitPrice: number;
  /** Free text: 'pack', 'piece', 'ml', 'strip of 10'. */
  unit: string;
  description?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const SUPPLY_CATEGORIES = [
  'medicine',
  'bandage',
  'equipment',
  'procedure',
  'other',
] as const;

export type SupplyCategory = (typeof SUPPLY_CATEGORIES)[number];

export interface SupplyBody {
  name?: string;
  category?: SupplyCategory;
  unitPrice?: number;
  unit?: string;
  description?: string;
  isActive?: boolean;
}

/**
 * `GET /admin/supplies` — `{success, count, supplies}`.
 *
 * No `active` filter by default: the management table curates deactivated rows
 * too, and the invoice picker filters client-side off the same cache entry
 * rather than holding a second copy of the catalog.
 */
export async function listSupplies(): Promise<SupplyWire[]> {
  const res = await api.get(`${P.admin}/supplies`);
  return unwrapFieldArray<SupplyWire>(res, 'supplies');
}

export async function createSupply(body: SupplyBody): Promise<SupplyWire> {
  const res = await api.post(`${P.admin}/supplies`, body);
  return unwrapField<SupplyWire>(res, 'supply');
}

/**
 * `PATCH /admin/supplies/:id` — partial.
 *
 * The table's Live switch sends only `{isActive}`. Do not turn this into a PUT
 * that resends the whole row: a stale form field would silently overwrite an
 * edit made in another tab.
 */
export async function updateSupply(
  id: string,
  body: SupplyBody,
): Promise<SupplyWire> {
  const res = await api.patch(`${P.admin}/supplies/${id}`, body);
  return unwrapField<SupplyWire>(res, 'supply');
}

export async function deleteSupply(id: string): Promise<void> {
  await api.delete(`${P.admin}/supplies/${id}`);
}

/** A row from the back-office service catalog. */
export interface ServiceCatalogWire {
  id: string;
  title: string;
  /**
   * The catalog's SUGGESTION, or null when pricing is variable and nobody has
   * pinned a number. Null is not ৳0 — the editor leaves the price box empty
   * and makes the operator name a figure, because a service billed at a zero
   * nobody agreed to is worse than one that took an extra keystroke.
   */
  unitPrice: number | null;
  category: string;
  providerType: string | null;
  isActive: boolean;
  /** Back-office only: billable here, hidden from every public catalog read. */
  isAdminOnly: boolean;
}

/**
 * `GET /admin/services/catalog` — the FULL catalog, `isAdminOnly` rows
 * included.
 *
 * Deliberately not the public `GET /api/services`. That endpoint sits behind a
 * response cache keyed on the querystring alone, so it can never serve an
 * admin-inclusive payload without risking replaying it to anonymous readers —
 * see the route comment in `backend/src/routes/admin.js`.
 */
export async function listServiceCatalog(): Promise<ServiceCatalogWire[]> {
  const res = await api.get(`${P.admin}/services/catalog`);
  return unwrapFieldArray<ServiceCatalogWire>(res, 'services');
}
