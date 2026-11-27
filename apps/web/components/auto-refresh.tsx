'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Re-renders the server page every few seconds, so the seller sees the buyer's progress. */
export function AutoRefresh({ everySecs = 10 }: { everySecs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, everySecs * 1000);
    return () => clearInterval(id);
  }, [router, everySecs]);
  return null;
}
