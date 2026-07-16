const fs = require('fs');
const path = require('path');

const DIRS = ['app', 'components', 'public'];
const EXTENSIONS = ['.ts', '.tsx', '.css'];

const replacements = [
  { search: /text-luxury-gold/g, replace: 'text-luxury-ivory' },
  { search: /bg-luxury-gold/g, replace: 'bg-luxury-ivory' },
  { search: /border-luxury-gold/g, replace: 'border-luxury-ivory' },
  { search: /from-luxury-gold to-luxury-gold-light/g, replace: 'from-luxury-ivory to-white' },
  { search: /from-luxury-gold/g, replace: 'from-luxury-ivory' },
  { search: /to-luxury-gold-light/g, replace: 'to-white' },
  { search: /to-luxury-gold/g, replace: 'to-luxury-ivory' },
  { search: /animate-pulse-gold/g, replace: 'animate-pulse-ivory' },
  { search: /selection:bg-luxury-gold/g, replace: 'selection:bg-luxury-ivory' },
  { search: /text-luxury-gold-light/g, replace: 'text-white' },
];

function processDirectory(directory) {
  const files = fs.readdirSync(directory);
  
  for (const file of files) {
    const fullPath = path.join(directory, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else if (EXTENSIONS.some(ext => file.endsWith(ext))) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let modified = false;
      
      for (const { search, replace } of replacements) {
        if (search.test(content)) {
          content = content.replace(search, replace);
          modified = true;
        }
      }
      
      if (modified) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated: ${fullPath}`);
      }
    }
  }
}

DIRS.forEach(dir => {
  const fullDirPath = path.join(__dirname, dir);
  if (fs.existsSync(fullDirPath)) {
    processDirectory(fullDirPath);
  }
});

console.log('Global replacement completed successfully.');
