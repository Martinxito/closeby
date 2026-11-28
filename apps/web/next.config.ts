import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The escrow client (solana/client) ships as TypeScript source in the workspace,
  // so Next.js has to compile it like our own code.
  transpilePackages: ['@closeby/solana'],
};

export default nextConfig;
