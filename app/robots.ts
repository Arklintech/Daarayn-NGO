import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/field/',
          '/api/',
          '/donor/dashboard/',
        ],
      },
    ],
    sitemap: 'https://daaraynorg.com/sitemap.xml',
  };
}
