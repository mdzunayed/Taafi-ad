import { api } from './http';
import { P } from './paths';
import { unwrapArray, unwrapFlat } from './unwrap';
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
