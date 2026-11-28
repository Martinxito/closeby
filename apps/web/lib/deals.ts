import { getSupabase } from './supabase';

/** A row of public.deals (off-chain metadata). Escrow state lives on Solana. Server-only. */
export type Deal = {
  deal_id: string;
  seller: string;
  kind: 'digital' | 'physical';
  title: string;
  description: string;
  price_clp: number;
  // Digital deals
  content_hash: string | null;
  file_path: string | null; // private: never send to the browser
  file_name: string | null;
  file_size: number | null;
  file_type: string | null;
  preview_url: string | null;
  // In-person deals
  photos: string[];
  communes: string[];
  time_slots: TimeSlot[];
  venue: string | null;
  created_at: string;
};

/** In-person: when the seller can meet, as they wrote it (e.g. "Sáb y dom, 10:00–18:00"). */
export type TimeSlot = { label: string };

/** What may be sent to the browser: everything except the private file path and the
 * exact meeting place (only buyer and seller can read it, via /api/deals/[dealId]/meeting). */
export type PublicDeal = Omit<Deal, 'file_path' | 'venue'>;

export function toPublicDeal(deal: Deal): PublicDeal {
  const { file_path: _file, venue: _venue, ...rest } = deal;
  return rest;
}

/** deal_id is the program's u64 order_id stored as a digit string. */
export function isDealId(value: string): boolean {
  return /^[0-9]{1,20}$/.test(value);
}

/** Returns the deal, or null when it does not exist. Throws on connection errors. */
export async function getDeal(dealId: string): Promise<Deal | null> {
  const { data, error } = await getSupabase()
    .from('deals')
    .select('*')
    .eq('deal_id', dealId)
    .maybeSingle<Deal>();

  if (error) throw new Error(`Could not load deal ${dealId}: ${error.message}`);
  return data;
}

export type NewDigitalDeal = {
  deal_id: string;
  seller: string;
  title: string;
  description: string;
  price_clp: number;
  content_hash: string;
  file_path: string;
  file_name: string;
  file_size: number;
  file_type: string;
  preview_url: string | null;
};

export type NewPhysicalDeal = {
  deal_id: string;
  seller: string;
  title: string;
  description: string;
  price_clp: number;
  communes: string[];
  time_slots: TimeSlot[];
  photos: string[];
  preview_url: string | null;
};

export async function insertPhysicalDeal(deal: NewPhysicalDeal): Promise<void> {
  const { error } = await getSupabase()
    .from('deals')
    .insert({ ...deal, kind: 'physical' });
  if (error) throw new Error(`Could not save deal ${deal.deal_id}: ${error.message}`);
}

/** Saves the meeting place. Callers must check its hash against the on-chain order first. */
export async function saveVenue(dealId: string, venue: string): Promise<void> {
  const { error } = await getSupabase().from('deals').update({ venue }).eq('deal_id', dealId).eq('kind', 'physical');
  if (error) throw new Error(`Could not save the venue of ${dealId}: ${error.message}`);
}

export async function insertDigitalDeal(deal: NewDigitalDeal): Promise<void> {
  const { error } = await getSupabase()
    .from('deals')
    .insert({ ...deal, kind: 'digital' });
  if (error) throw new Error(`Could not save deal ${deal.deal_id}: ${error.message}`);
}
