import type { Metadata } from 'next';
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
  return (
    <main className="main-home-container">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <GlobalHeader showRibbon={true} />
      <HeroSection />
      <HomePrograms />
      <LegacySections />
      <Footer />
    </main>
  );
}
