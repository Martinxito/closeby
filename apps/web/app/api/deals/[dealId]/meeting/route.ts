// In-person: the exact meeting place. It never goes on-chain (only its SHA-256) and only
// the buyer and the seller can read it.
//
//   POST { venue }  the buyer saves the place they proposed. Accepted only if
//                   SHA-256(venue) equals the order's on-chain place_hash.
//   GET             buyer or seller read it (null if not set or if it does not match).
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth/server';
import { getDeal, isDealId, saveVenue } from '@/lib/deals';
import { canSeeMeetingPlace } from '@/lib/escrow/rules';
import { getOrder } from '@/lib/escrow/server';

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

export async function GET(request: Request, { params }: RouteContext<'/api/deals/[dealId]/meeting'>) {
  const { dealId } = await params;
  const loaded = await load(request, dealId);
  if (loaded instanceof NextResponse) return loaded;
  const { deal, order, viewer } = loaded;

  if (!canSeeMeetingPlace(order, viewer)) return error(403, 'Solo el comprador y el vendedor ven el lugar del encuentro.');
  // Never show a place that does not match what the buyer committed to on-chain.
  const venue = deal.venue && order?.placeHash === sha256(deal.venue) ? deal.venue : null;
  return json({ venue });
}

export async function POST(request: Request, { params }: RouteContext<'/api/deals/[dealId]/meeting'>) {
  const { dealId } = await params;
  const loaded = await load(request, dealId);
  if (loaded instanceof NextResponse) return loaded;
  const { order, viewer } = loaded;

  const body = (await request.json().catch(() => null)) as { venue?: unknown } | null;
  const venue = typeof body?.venue === 'string' ? body.venue.trim() : '';
  if (venue.length < 3 || venue.length > 200) return error(400, 'Escribe el lugar del encuentro.');

  if (!order || order.kind !== 'physical' || order.buyer !== viewer) return error(403, 'Solo quien reservó puede guardar el lugar.');
  if (order.placeHash !== sha256(venue)) return error(409, 'El lugar no coincide con tu reserva.');

  try {
    await saveVenue(dealId, venue);
    return json({ venue });
  } catch (err) {
    console.error(err);
    return error(500, 'No pudimos guardar el lugar. Intenta de nuevo.');
  }
}

async function load(request: Request, dealId: string) {
  if (!isDealId(dealId)) return error(404, 'No encontramos esta venta.');
  const viewer = await authenticate(request);
  if (!viewer) return error(401, 'Entra para continuar.');
  const deal = await getDeal(dealId);
  if (!deal || deal.kind !== 'physical') return error(404, 'No encontramos esta venta.');
  const order = await getOrder(dealId, deal.seller);
  return { deal, order, viewer };
}

function json(body: unknown) {
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}

function error(status: number, message: string) {
  return NextResponse.json({ error: { message } }, { status, headers: { 'Cache-Control': 'no-store' } });
}
