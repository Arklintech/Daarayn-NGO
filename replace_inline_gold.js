const fs = require('fs');
const path = require('path');

const targetFiles = [
  path.join(__dirname, 'components', 'DonateForm.tsx'),
  path.join(__dirname, 'app', 'pay', 'page.tsx'),
  path.join(__dirname, 'components', 'Navbar.tsx')
];

for (const targetFile of targetFiles) {
  if (fs.existsSync(targetFile)) {
    let content = fs.readFileSync(targetFile, 'utf8');

    // Replace classes and variables
    content = content.replace(/btn-gold/g, 'btn-ivory');
    content = content.replace(/className="gold"/g, 'className="ivory"');
    content = content.replace(/class="gold"/g, 'class="ivory"');
    
    content = content.replace(/var\(--gold-light\)/g, 'var(--ivory-light)');
    content = content.replace(/var\(--gold-deep\)/g, 'var(--ivory-deep)');
    content = content.replace(/#D4AF37/g, '#FFFFE3');
    content = content.replace(/rgba\(212,\s*175,\s*55/g, 'rgba(255, 255, 227');

    fs.writeFileSync(targetFile, content, 'utf8');
    console.log(`${targetFile} updated.`);
  }
}
