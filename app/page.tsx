import './redesign.css';
import HeroSection from '../components/HeroSection';
import LegacySections from '../components/LegacySections';
import Footer from '../components/Footer';

export default function Home() {
  return (
    <main className="main-home-container">
      <HeroSection />
      <LegacySections />
      <Footer />
    </main>
  );
}
