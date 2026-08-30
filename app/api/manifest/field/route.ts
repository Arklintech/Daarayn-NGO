import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    name: 'Daarayn Field Operations',
    short_name: 'Field Agent Ops',
    description: 'Field Agent operations and reporting portal for Daarayn Foundation.',
    start_url: '/field/dashboard',
    scope: '/field',
    display: 'standalone',
    display_override: ['standalone', 'window-controls-overlay', 'minimal-ui'],
    orientation: 'any',
    categories: ['humanitarian', 'productivity', 'utilities'],
    prefer_related_applications: false,
    background_color: '#020704',
    theme_color: '#10b981',
    shortcuts: [
      {
        name: 'New Field Need',
        short_name: 'New Need',
        description: 'Submit a new field emergency or aid report',
        url: '/field/reports/new',
        icons: [{ src: '/icons/field-icon-192.png?v=3', sizes: '192x192' }]
      },
      {
        name: 'Field Messages',
        short_name: 'Messages',
        description: 'Communicate with field coordinators',
        url: '/field/messages',
        icons: [{ src: '/icons/field-icon-192.png?v=3', sizes: '192x192' }]
      }
    ],
    icons: [
      {
        src: '/icons/field-icon-192.png?v=3',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/field-icon-512.png?v=3',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/field-icon-512-maskable.png?v=3',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      },
    ],
  });
}

