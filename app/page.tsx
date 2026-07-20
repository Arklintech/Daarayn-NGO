import './redesign.css';
import GlobalHeader from '../components/GlobalHeader';
import HeroSection from '../components/HeroSection';
import LegacySections from '../components/LegacySections';
import Footer from '../components/Footer';

export default function Home() {
  return (
    <main className="main-home-container">
      <GlobalHeader showRibbon={true} />
      <HeroSection />
      <LegacySections />
      <Footer />
    </main>
  );
}
