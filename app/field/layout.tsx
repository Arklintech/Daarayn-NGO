import FieldLayoutClient from './FieldLayoutClient';

export const metadata = {
  title: "Daarayn Field Operations",
  manifest: "/api/manifest/field",
  icons: {
    icon: [
      { url: "/icons/field-icon-192.png?v=3", sizes: "192x192", type: "image/png" },
      { url: "/icons/field-icon-512.png?v=3", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/icons/field-icon-192.png?v=3",
    apple: "/icons/field-apple-touch-icon.png?v=3",
  },
};

export default function FieldLayout({ children }: { children: React.ReactNode }) {
  return <FieldLayoutClient>{children}</FieldLayoutClient>;
}
