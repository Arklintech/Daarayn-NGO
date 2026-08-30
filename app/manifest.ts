import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: 'daarayn-public',
    name: 'Daarayn Trust OS',
    short_name: 'Daarayn',
    description: 'Transparency ledger, campaign hub, and donor portal.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'window-controls-overlay', 'minimal-ui'],
    orientation: 'any',
    categories: ['humanitarian', 'finance', 'productivity'],
    prefer_related_applications: false,
    background_color: '#0A0B0D',
    theme_color: '#00B4D8', // Public Accent: Executive Teal
    icons: [
      { src: '/icons/icon-192.png?v=2', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png?v=2', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512-maskable.png?v=2', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
}

