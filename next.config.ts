import type { NextConfig } from "next";

const supabaseImageHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : undefined;
  } catch {
    return undefined;
  }
})();

const nextConfig: NextConfig = {
  async headers() {
    const privateApiHeaders = [
      '/api/account/:path*',
      '/api/checkout/vouchers',
      '/api/community/:path*',
      '/api/creations/:path*',
      '/api/favourites',
      '/api/jobs/:path*',
      '/api/my-books/:path*',
      '/api/order-covers',
      '/api/orders/:path*',
      '/api/user/:path*',
      '/api/user-assets/:path*',
    ].map((source) => ({
      source,
      headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }],
    }))

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "base-uri 'self'; frame-ancestors 'self'; object-src 'none'" },
          { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(self)' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
      ...privateApiHeaders,
    ]
  },
  images: {
    remotePatterns: supabaseImageHost
      ? [
          {
            protocol: 'https',
            hostname: supabaseImageHost,
            pathname: '/storage/v1/object/public/**',
          },
          {
            protocol: 'https',
            hostname: supabaseImageHost,
            pathname: '/storage/v1/object/sign/**',
          },
        ]
      : [],
  },
};

export default nextConfig;
