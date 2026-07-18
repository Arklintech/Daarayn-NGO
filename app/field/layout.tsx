import FieldLayoutClient from './FieldLayoutClient';

export const metadata = {
  title: "Daarayn Field Operations",
  manifest: "/api/manifest/field",
};

export default function FieldLayout({ children }: { children: React.ReactNode }) {
  return <FieldLayoutClient>{children}</FieldLayoutClient>;
}
