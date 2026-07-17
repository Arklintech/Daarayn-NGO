import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: 'daarayn-field',
    name: 'Daarayn Field Operations',
    short_name: 'Daarayn Field',
    description: 'Offline-resilient workspace for local field trust activities.',
    start_url: '/agent',
    scope: '/agent',
    display: 'standalone',
    background_color: '#0A0B0D',
    theme_color: '#FFB000', // Field Accent: Warning/Operational Amber
    icons: [
      { src: '/icons/fld-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/fld-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ],
    shortcuts: [
      {
        name: 'Assigned Cases',
        short_name: 'Cases',
        url: '/agent',
        icons: [{ src: '/icons/shortcut-cases.png', sizes: '96x96' }]
      },
      {
        name: 'New Offline Report',
        short_name: 'New Report',
        url: '/agent/reports/new',
        icons: [{ src: '/icons/shortcut-report.png', sizes: '96x96' }]
      }
    ]
  };
}
