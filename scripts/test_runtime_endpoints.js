const http = require('http');

const endpoints = [
  { name: "Public Website", path: "/" },
  { name: "Admin Login", path: "/admin/login" },
  { name: "Field Login", path: "/field/login" },
  { name: "Admin Shell", path: "/admin" },
  { name: "Field Shell", path: "/field" },
  { name: "Notification Center", path: "/admin/notifications" },
  { name: "Field Operations", path: "/admin/field-ops" },
  { name: "KHIZR Admin Interface", path: "/admin/ai" },
  { name: "KHIZR Public Assistant", path: "/assistant" },
  { name: "Pay Page", path: "/pay" },
  { name: "Donor Dashboard", path: "/donor/dashboard" }
];

async function checkEndpoint(ep) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:3001${ep.path}`, (res) => {
      resolve({ name: ep.name, path: ep.path, status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 400 });
    });
    req.on('error', (err) => {
      resolve({ name: ep.name, path: ep.path, status: "ERROR: " + err.message, ok: false });
    });
    req.setTimeout(5000, () => {
      req.destroy();
      resolve({ name: ep.name, path: ep.path, status: "TIMEOUT", ok: false });
    });
  });
}

async function run() {
  console.log("=== RUNNING LOCAL RUNTIME HEALTH VERIFICATION (PORT 3001) ===");
  for (const ep of endpoints) {
    const res = await checkEndpoint(ep);
    const icon = res.ok ? "✓" : "✗";
    console.log(`[${icon}] ${res.name.padEnd(25)} | Path: ${res.path.padEnd(25)} | HTTP ${res.status}`);
  }
}

run();
