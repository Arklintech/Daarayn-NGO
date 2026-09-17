import type { Metadata } from 'next';
import './redesign.css';
import GlobalHeader from '../components/GlobalHeader';
import HeroSection from '../components/HeroSection';
import LegacySections from '../components/LegacySections';
import Footer from '../components/Footer';

export const metadata: Metadata = {
  title: 'Daarayn Foundation – Structured Charity. Documented Impact.',
  description:
    'Daarayn Foundation delivers structured, transparent charity built on amanah. Every donation is logged, every distribution documented, every life valued. Give with confidence.',
  alternates: {
    canonical: 'https://daarayn.org',
  },
  openGraph: {
    url: 'https://daarayn.org',
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
      '@id': 'https://daarayn.org/#organization',
      name: 'Daarayn Foundation',
      url: 'https://daarayn.org',
      logo: {
        '@type': 'ImageObject',
        url: 'https://daarayn.org/daarayn-logo-transparent.png',
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
      '@id': 'https://daarayn.org/#website',
      url: 'https://daarayn.org',
      name: 'Daarayn Foundation',
      publisher: { '@id': 'https://daarayn.org/#organization' },
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
      <LegacySections />
      <Footer />
    </main>
  );
}
