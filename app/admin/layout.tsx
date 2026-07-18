import AdminLayoutClient from './AdminLayoutClient';

export const metadata = {
  title: "Daarayn Admin Panel",
  manifest: "/api/manifest/admin",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
