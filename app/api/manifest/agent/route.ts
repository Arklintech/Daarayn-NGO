import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    name: 'Daarayn Field Operations',
    short_name: 'Agent Ops',
    description: 'Field agent operations and reporting portal for Daarayn Foundation.',
    start_url: '/agent/login',
    display: 'standalone',
    background_color: '#080c10',
    theme_color: '#d4af37',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  });
}
