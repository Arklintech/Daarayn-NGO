const fs = require('fs');
const path = require('path');

const DIRS = ['app', 'components', 'public'];
const EXTENSIONS = ['.ts', '.tsx', '.css'];

const replacements = [
  { search: /text-luxury-ivory/g, replace: 'text-luxury-gold' },
  { search: /bg-luxury-ivory/g, replace: 'bg-luxury-gold' },
  { search: /border-luxury-ivory/g, replace: 'border-luxury-gold' },
  { search: /from-luxury-ivory to-white/g, replace: 'from-luxury-gold to-luxury-gold-light' },
  { search: /from-luxury-ivory/g, replace: 'from-luxury-gold' },
  { search: /to-luxury-ivory/g, replace: 'to-luxury-gold' },
  { search: /animate-pulse-ivory/g, replace: 'animate-pulse-gold' },
  { search: /selection:bg-luxury-ivory/g, replace: 'selection:bg-luxury-gold' },
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
