const fs = require('fs');
const path = require('path');

const DIRS = ['app', 'components', 'public'];
const EXTENSIONS = ['.ts', '.tsx', '.css'];

const replacements = [
  { search: /#FFFEE0/g, replace: '#FFF9DD' },
  { search: /255,\s*254,\s*224/g, replace: '255, 249, 221' }
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

console.log('Global color replacement to Bavarian Cream (#FFF9DD) completed successfully.');
