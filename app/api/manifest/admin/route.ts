import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    name: 'Daarayn Admin Panel',
    short_name: 'Daarayn Admin',
    description: 'Enterprise operational command center for Daarayn Foundation.',
    start_url: '/admin/dashboard',
    scope: '/admin',
    display: 'standalone',
    display_override: ['standalone', 'window-controls-overlay', 'minimal-ui'],
    orientation: 'any',
    categories: ['humanitarian', 'finance', 'productivity'],
    prefer_related_applications: false,
    background_color: '#080c10',
    theme_color: '#d4af37',
    shortcuts: [
      {
        name: 'Command Dashboard',
        short_name: 'Dashboard',
        url: '/admin/dashboard',
        icons: [{ src: '/icons/admin-icon-192.png?v=3', sizes: '192x192' }]
      },
      {
        name: 'Field Operations',
        short_name: 'Field Ops',
        url: '/admin/field-ops',
        icons: [{ src: '/icons/admin-icon-192.png?v=3', sizes: '192x192' }]
      }
    ],
    icons: [
      {
        src: '/icons/admin-icon-192.png?v=3',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/admin-icon-512.png?v=3',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/admin-icon-512-maskable.png?v=3',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      },
    ],
  });
}

