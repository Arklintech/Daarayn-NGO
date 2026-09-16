const https = require('https');

const BASE_URL = 'https://daarayn-ngo-ruby.vercel.app';

function httpGet(path) {
  return new Promise((resolve, reject) => {
    https.get(`${BASE_URL}${path}`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: body.slice(0, 200) });
        }
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log("=== LIVE PRODUCTION E2E SMOKE TEST ===");
  console.log(`Target: ${BASE_URL}`);

  try {
    const causes = await httpGet('/api/causes');
    console.log(`\n1. /api/causes: Status ${causes.status}, Success: ${causes.body?.success}, Count: ${causes.body?.causes?.length}`);

    const ledger = await httpGet('/api/ledger');
    console.log(`2. /api/ledger: Status ${ledger.status}, Count: ${Array.isArray(ledger.body) ? ledger.body.length : 0}`);

    const dash = await httpGet('/api/admin/dashboard');
    console.log(`3. /api/admin/dashboard: Status ${dash.status}, Success: ${dash.body?.success}, Total Donations: ₹${dash.body?.stats?.totalDonations}`);

    const notifs = await httpGet('/api/admin/notifications');
    console.log(`4. /api/admin/notifications: Status ${notifs.status}, Success: ${notifs.body?.success}, Unread: ${notifs.body?.notifications?.filter(n=>!n.read).length}`);

    const comms = await httpGet('/api/admin/communications');
    console.log(`5. /api/admin/communications: Status ${comms.status}, Success: ${comms.body?.success}, Count: ${comms.body?.communications?.length}`);

  } catch (err) {
    console.error("Test Error:", err.message);
  }
}

runTests();
