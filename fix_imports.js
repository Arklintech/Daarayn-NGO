const fs = require('fs');
const path = require('path');
function walk(dir) {
  fs.readdirSync(dir).forEach(f => {
    let p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      walk(p);
    } else if (p.endsWith('.ts') || p.endsWith('.tsx')) {
      let c = fs.readFileSync(p, 'utf8');
      let nc = c.replace(/from\s+['"](\.\/.*)\.ts['"]/g, 'from "$1"').replace(/from\s+['"](\.\.\/.*)\.ts['"]/g, 'from "$1"');
      if (c !== nc) {
        fs.writeFileSync(p, nc);
        console.log('Fixed:', p);
      }
    }
  });
}
walk('./lib/ai');
