import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: 'daarayn-admin',
    name: 'Daarayn Admin Panel',
    short_name: 'Daarayn Admin',
    description: 'Enterprise Operations and Trust Administration Command Center.',
    start_url: '/admin',
    scope: '/admin',
    display: 'standalone',
    background_color: '#0A0B0D',
    theme_color: '#E05A47', // Admin Accent: Operational Orange
    icons: [
      { src: '/icons/adm-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/adm-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ],
    shortcuts: [
      {
        name: 'Donor CRM',
        short_name: 'CRM',
        url: '/admin/crm',
        icons: [{ src: '/icons/shortcut-crm.png', sizes: '96x96' }]
      },
      {
        name: 'Financial Audit Ledger',
        short_name: 'Finance',
        url: '/admin/finance',
        icons: [{ src: '/icons/shortcut-finance.png', sizes: '96x96' }]
      }
    ]
  };
}
