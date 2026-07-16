const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, 'components', 'LegacySections.tsx');

let content = fs.readFileSync(targetFile, 'utf8');

// Replace classes
content = content.replace(/class="btn btn-gold"/g, 'class="btn btn-ivory"');
content = content.replace(/class="btn btn-gold btn-full-width"/g, 'class="btn btn-ivory btn-full-width"');
content = content.replace(/class="gold"/g, 'class="ivory"');
content = content.replace(/className="gold"/g, 'className="ivory"');

// Replace CSS vars and hex
content = content.replace(/var\(--gold-light\)/g, 'var(--ivory-light)');
content = content.replace(/var\(--gold-deep\)/g, 'var(--ivory-deep)');
content = content.replace(/#D4AF37/g, '#FFFFE3');

fs.writeFileSync(targetFile, content, 'utf8');
console.log('LegacySections.tsx updated.');
