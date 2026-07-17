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
    background_color: '#0A0B0D',
    theme_color: '#00B4D8', // Public Accent: Executive Teal
    icons: [
      { src: '/icons/pub-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/pub-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
}
