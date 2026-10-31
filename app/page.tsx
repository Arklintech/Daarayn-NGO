import type { Metadata } from 'next';
import fs from 'fs';
import path from 'path';
import './redesign.css';
import GlobalHeader from '../components/GlobalHeader';
import HeroSection from '../components/HeroSection';
import LegacySections from '../components/LegacySections';
import Footer from '../components/Footer';
import HomePrograms from '../components/programs/HomePrograms';

export const metadata: Metadata = {
  title: 'Daarayn Foundation – Structured Charity. Documented Impact.',
  description:
    'Daarayn Foundation delivers structured, transparent charity built on amanah. Every donation is logged, every distribution documented, every life valued. Give with confidence.',
  alternates: {
    canonical: 'https://daaraynorg.com',
  },
  openGraph: {
    url: 'https://daaraynorg.com',
    title: 'Daarayn Foundation – Structured Charity. Documented Impact.',
    description:
      'Every donation logged. Every distribution documented. Give with confidence — built on amanah and verification.',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://daaraynorg.com/#organization',
      name: 'Daarayn Foundation',
      url: 'https://daaraynorg.com',
      logo: {
        '@type': 'ImageObject',
        url: 'https://daaraynorg.com/daarayn-logo-transparent.png',
        width: 512,
        height: 512,
      },
      description:
        'Daarayn Foundation delivers structured, transparent charity built on amanah. Every donation is logged, every distribution documented.',
      foundingDate: '2023',
      areaServed: 'Worldwide',
      nonprofitStatus: 'NonprofitType',
    },
    {
      '@type': 'WebSite',
      '@id': 'https://daaraynorg.com/#website',
      url: 'https://daaraynorg.com',
      name: 'Daarayn Foundation',
      publisher: { '@id': 'https://daaraynorg.com/#organization' },
    },
  ],
};

export default function Home() {
  // A 4K master is used when it is present in public/ (none is in the repository today).
  const has4k = fs.existsSync(path.join(process.cwd(), 'public', 'hero-video-4k.mp4'));
  return (
    <main className="main-home-container">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* The wrapper lets the hero video extend BEHIND the navbar and the quick-donation ribbon on phones (see .hero-with-header in redesign.css) */}
      <div className="hero-with-header">
        <GlobalHeader showRibbon={true} />
        <HeroSection has4k={has4k} />
      </div>
      <HomePrograms />
      <LegacySections />
      <Footer />
    </main>
  );
}
