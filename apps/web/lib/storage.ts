// Supabase Storage access for files being sold and their previews. Server-only.
//
// Files go from the browser straight to Supabase with one-time signed upload URLs:
// Vercel functions reject request bodies over ~4.5 MB, so they cannot pass through us.
import 'server-only';

import { createHash } from 'node:crypto';
import { getSupabase } from './supabase';

export const FILES_BUCKET = 'files'; // private: the files for sale
export const PREVIEWS_BUCKET = 'previews'; // public read: what the buyer sees before paying

export const MAX_FILE_BYTES = 50 * 1024 * 1024; // matches the bucket limit in migration 0003
export const MAX_PREVIEW_BYTES = 10 * 1024 * 1024;
export const PREVIEW_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'audio/mpeg', 'audio/mp4', 'video/mp4', 'application/pdf'];

export type SignedUpload = { path: string; uploadUrl: string };

export async function createSignedUpload(bucket: string, path: string): Promise<SignedUpload> {
  const { data, error } = await getSupabase().storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Could not create upload URL for ${bucket}/${path}: ${error?.message}`);
  return { path: data.path, uploadUrl: data.signedUrl };
}

/** SHA-256 (hex) of a stored file, or null if it does not exist. Never trust the browser's hash. */
export async function hashStoredFile(bucket: string, path: string): Promise<string | null> {
  const { data, error } = await getSupabase().storage.from(bucket).download(path);
  if (error || !data) return null;
  return createHash('sha256').update(Buffer.from(await data.arrayBuffer())).digest('hex');
}

export async function storedFileExists(bucket: string, path: string): Promise<boolean> {
  const { data } = await getSupabase().storage.from(bucket).exists(path);
  return Boolean(data);
}

export function publicUrl(bucket: string, path: string): string {
  return getSupabase().storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** Keeps a readable, storage-safe file name: no folders, no odd characters. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'archivo';
  const cleaned = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // drop accents: storage keys must be ASCII-safe
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-100);
  return cleaned || 'archivo';
}

/** Short-lived download link for a private file, saved under its original name. */
export async function createSignedDownload(bucket: string, path: string, fileName: string, expiresInSecs = 300): Promise<string> {
  const { data, error } = await getSupabase().storage.from(bucket).createSignedUrl(path, expiresInSecs, { download: fileName });
  if (error || !data) throw new Error(`Could not create download URL for ${bucket}/${path}: ${error?.message}`);
  return data.signedUrl;
}
