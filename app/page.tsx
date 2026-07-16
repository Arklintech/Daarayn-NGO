import './redesign.css';
import Navbar from '../components/Navbar';
import QuickDonationRibbon from '../components/QuickDonationRibbon';
import HeroSection from '../components/HeroSection';
import LegacySections from '../components/LegacySections';
import Footer from '../components/Footer';

export default function Home() {
  return (
    <main className="main-home-container">
      <Navbar />
      <QuickDonationRibbon />
      <HeroSection />
      <LegacySections />
      <Footer />
    </main>
  );
}
