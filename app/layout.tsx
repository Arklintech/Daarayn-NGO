import type { Metadata, Viewport } from "next";
import { Playfair_Display, Poppins, Cinzel } from "next/font/google";
import "./globals.css";
import { AuthContextProvider } from "@/lib/AuthContext";
import { PWAProvider } from "@/components/providers/PWAProvider";
import { RoleBootstrapProvider } from "@/app/providers/RoleBootstrap";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://daarayn.org'),
  title: {
    default: 'Daarayn Foundation – Structured Charity. Documented Impact.',
    template: '%s | Daarayn Foundation',
  },
  description:
    'Daarayn Foundation delivers structured, transparent charity built on amanah. Every donation is logged, every distribution documented, every life valued. Give with confidence.',
  keywords: [
    'Islamic charity',
    'structured giving',
    'transparent NGO',
    'donation tracking',
    'Quran endowment',
    'masjid fund',
    'family relief',
    'amanah charity',
    'daarayn',
  ],
  authors: [{ name: 'Daarayn Foundation', url: 'https://daarayn.org' }],
  creator: 'Daarayn Foundation',
  publisher: 'Daarayn Foundation',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://daarayn.org',
    siteName: 'Daarayn Foundation',
    title: 'Daarayn Foundation – Structured Charity. Documented Impact.',
    description:
      'Every donation logged. Every distribution documented. Give with confidence — built on amanah and verification.',
    images: [
      {
        url: '/icons/icon-512.png',
        width: 512,
        height: 512,
        alt: 'Daarayn Foundation',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Daarayn Foundation – Structured Charity',
    description:
      'Every donation logged. Every distribution documented. Give with confidence — built on amanah.',
    images: ['/icons/icon-512.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#030a06",
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${poppins.variable} ${playfair.variable} ${cinzel.variable} h-full antialiased`}>
      <body className="min-h-[100dvh] h-full flex flex-col bg-luxury-bg text-gray-100 selection:bg-luxury-gold selection:text-black overflow-x-hidden">
        <PWAProvider>
          <RoleBootstrapProvider>
            <AuthContextProvider>
              {children}
            </AuthContextProvider>
          </RoleBootstrapProvider>
        </PWAProvider>
      </body>
    </html>
  );
}
