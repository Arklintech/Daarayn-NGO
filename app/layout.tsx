import type { Metadata } from "next";
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
  title: "Daarayn Aid – Command Center",
  description: "Enterprise management panel for Daarayn Foundation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${poppins.variable} ${playfair.variable} ${cinzel.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-luxury-bg text-gray-100 selection:bg-luxury-gold selection:text-black">
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
