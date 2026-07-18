import '../redesign.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import PayPageLayout from '@/components/PayPageLayout';

export default async function PayPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const resolvedSearchParams = await searchParams;
  const amount = (resolvedSearchParams?.amt as string) || '';
  const currency = (resolvedSearchParams?.cur as string) || 'INR';
  const cause = (resolvedSearchParams?.cause as string) || 'Contribution';
  const source = (resolvedSearchParams?.source as string) || '';

  return (
    <main className="main-home-container" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />

      <section className="donate-section" style={{ paddingTop: '140px', flex: 1, paddingBottom: '80px' }}>
        <PayPageLayout amount={amount} currency={currency} cause={cause} source={source} />
      </section>

      <Footer />
    </main>
  );
}
