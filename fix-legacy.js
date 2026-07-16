const fs = require('fs');
const html = fs.readFileSync('c:/Users/NEXAWAVE/Desktop/NGO/public/index.html', 'utf8');
const parts = html.split('<!-- ================= PROGRAMS ================= -->');

if (parts.length > 1) {
  let legacyHtml = '<!-- ================= PROGRAMS ================= -->' + parts[1];
  const jsx = `export default function LegacySections() {
  return (
    <div dangerouslySetInnerHTML={{ __html: \`${legacyHtml.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\` }} />
  );
}`;
  fs.writeFileSync('c:/Users/NEXAWAVE/Desktop/NGO/components/LegacySections.tsx', jsx);
  console.log('Fixed components/LegacySections.tsx');
}
