import { PO, SystemAlert } from './types';

// No sample/demo Purchase Orders are seeded. All POs must be created via the
// AI PDF Parser ("Confirm & Maintain PO") or the manual "Create PO" flow, and
// are persisted to the database (Supabase Cloud when configured, plus a local
// server-side cache). Keeping this list empty prevents fake demo data from
// masking real sync issues and from showing up alongside genuine POs.
export const INITIAL_POS: PO[] = [];

export const INITIAL_ALERTS: SystemAlert[] = [];
