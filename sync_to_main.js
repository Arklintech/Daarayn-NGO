const fs = require('fs');
const path = require('path');

const srcDir = 'c:\\Users\\NEXAWAVE\\Desktop\\NGO';
const destDir = 'c:\\Users\\NEXAWAVE\\Desktop\\NGO--main';

const filesToSync = [
  'app/admin/AdminLayoutClient.tsx',
  'app/admin/communications/page.tsx',
  'app/admin/donors/[id]/page.tsx',
  'app/admin/donors/[id]/tabs/AnalyticsTab.tsx',
  'app/admin/donors/[id]/tabs/LedgerTab.tsx',
  'app/admin/faqs/page.tsx',
  'app/admin/field-ops/page.tsx',
  'app/admin/programs/page.tsx',
  'app/admin/campaigns/page.tsx',
  'app/admin/causes/page.tsx',
  'app/admin/causes/[causeId]/page.tsx',
  'app/admin/ai/page.tsx',
  'components/Navbar.tsx',
  'components/GlobalHeader.tsx',
  'components/QuickDonationRibbon.tsx',
  'components/Footer.tsx',
  'components/LegacySections.tsx',
  'components/DonationSuccess.tsx',
  'app/redesign.css',
  'public/style.css',
  'lib/communication-resolver.ts',
  'app/api/admin/donations/route.ts',
  'app/api/admin/notifications/route.ts',
  'app/api/field/chat/route.ts',
  'app/api/field/reports/[reportId]/route.ts',
  'app/field/FieldLayoutClient.tsx',
  'app/field/login/page.tsx',
  'app/field/messages/page.tsx',
  'app/field/profile/page.tsx',
  'app/providers/RoleBootstrap.tsx',
  'components/providers/PWAProvider.tsx',
  'lib/FieldAgentAuthContext.tsx',
  'lib/broadcast-worker.ts',
  'lib/db-field-ops.ts',
  'lib/db.ts',
  'lib/firebase.ts',
  'lib/google/sheets.ts',
  'lib/notifications.ts',
  'lib/repositories/baseRepository.ts',
  'lib/security/audit-logger.ts',
  'lib/services/donationService.ts',
  'lib/sync/AuditLogger.ts',
  'lib/sync/SyncEngine.ts',
  'components/HeroSection.tsx',
  'app/layout.tsx',
  'app/page.tsx',
  'app/admin/layout.tsx',
  'app/field/layout.tsx',
  'app/robots.ts',
  'app/sitemap.ts',
  'lib/security/session.ts',
  'lib/google/client.ts',
  'lib/sync/GoogleSheetsClient.ts',
  'components/DonateForm.tsx',
  'components/PayPageLayout.tsx',
  'app/pay/page.tsx',
  'app/admin/login/page.tsx',
  'app/api/donate/route.ts',
  'next.config.ts'
];

for (const relPath of filesToSync) {
  const src = path.join(srcDir, relPath);
  const dest = path.join(destDir, relPath);
  try {
    const content = fs.readFileSync(src, 'utf8');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content, 'utf8');
    console.log(`[SUCCESS] Synced ${relPath}`);
  } catch (err) {
    console.error(`[ERROR] Failed syncing ${relPath}:`, err.message);
  }
}
