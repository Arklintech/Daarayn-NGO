import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    name: 'Daarayn Command Center',
    short_name: 'Command Ops',
    description: 'Enterprise administration panel for Daarayn Foundation.',
    start_url: '/admin/login',
    scope: '/admin',
    display: 'standalone',
    background_color: '#030a06',
    theme_color: '#10b981',
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
