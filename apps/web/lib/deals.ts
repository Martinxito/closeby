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

export type TimeSlot = { date: string; from: string; to: string };

/** What may be sent to the browser: everything except the private file path. */
export type PublicDeal = Omit<Deal, 'file_path'>;

export function toPublicDeal(deal: Deal): PublicDeal {
  const { file_path: _private, ...rest } = deal;
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

export async function insertDigitalDeal(deal: NewDigitalDeal): Promise<void> {
  const { error } = await getSupabase()
    .from('deals')
    .insert({ ...deal, kind: 'digital' });
  if (error) throw new Error(`Could not save deal ${deal.deal_id}: ${error.message}`);
}
