import { getSupabase } from './supabase';

/** A row of public.deals (off-chain metadata). Escrow state lives on Solana. */
export type Deal = {
  deal_id: string;
  seller: string;
  title: string;
  description: string;
  price_clp: number;
  photos: string[];
  communes: string[];
  time_slots: TimeSlot[];
  venue: string | null;
  created_at: string;
};

export type TimeSlot = { date: string; from: string; to: string };

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
