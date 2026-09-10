import { api } from './http';
import { P } from './paths';
import { unwrapArray, unwrapFieldArray, unwrapFlat } from './unwrap';
import type { AdminAccountWire } from '@/types/wire/account';
import type { PatientDetailWire } from '@/types/wire/misc';

/**
 * `GET /admin/patients` — bare array, newest first, capped at 500.
 *
 * Rows are the full `Account.toJSON()`, so they carry the governance fields
 * (`status_reason`, `permissions_denied`) even though a patient never has the
 * latter. Typed as `AdminAccountWire` so the row actions and the status pill
 * get the same shape here as on the staff roster.
 */
export async function listPatients(): Promise<AdminAccountWire[]> {
  const res = await api.get(`${P.admin}/patients`);
  return unwrapArray<AdminAccountWire>(res, '/admin/patients');
}

/**
 * `GET /admin/patients/:id`.
 *
 * Exposes `medical_vault` — protected health information. The page that
 * renders this is `force-dynamic`, keeps nothing in persistent cache, and puts
 * the vault behind an explicit reveal.
 */
export async function getPatient(id: string): Promise<PatientDetailWire> {
  const res = await api.get(`${P.admin}/patients/${id}`);
  return unwrapFlat<PatientDetailWire>(res);
}

/**
 * A patient as the manual booking form's search box renders them.
 *
 * A deliberately thin projection, and thin at the SERVER: `GET /admin/patients`
 * returns the full `Account.toJSON()` including the medical vault, and reusing
 * it for a dropdown would ship protected health information into a popover
 * nobody asked to open.
 */
export interface PatientSearchHit {
  id: string;
  fullName: string;
  phone: string;
  address: string;
  status: string;
}

/**
 * `GET /admin/patients/search?q=` — name or phone, capped at 20 rows.
 *
 * The server matches the number in BOTH spellings: the operator types what the
 * caller reads out ('01711…') while storage is canonical ('8801711…'). It
 * answers a query under two characters with an empty list rather than the
 * roster, so a cleared input does not paint 500 patients.
 */
export async function searchPatients(q: string): Promise<PatientSearchHit[]> {
  const res = await api.get(`${P.admin}/patients/search`, { params: { q } });
  return unwrapFieldArray<PatientSearchHit>(res, 'patients');
}
