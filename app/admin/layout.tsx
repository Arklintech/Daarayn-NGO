import AdminLayoutClient from './AdminLayoutClient';

export const metadata = {
  title: "Daarayn Admin Panel",
  manifest: "/api/manifest/admin",
  icons: {
    icon: [
      { url: "/icons/admin-icon-192.png?v=3", sizes: "192x192", type: "image/png" },
      { url: "/icons/admin-icon-512.png?v=3", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/icons/admin-icon-192.png?v=3",
    apple: "/icons/admin-apple-touch-icon.png?v=3",
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
