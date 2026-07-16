const fs = require('fs');
const path = require('path');

function findMaps(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(findMaps(file));
    } else if (file.endsWith('.map')) {
      results.push(file);
    }
  });
  return results;
}

const mapFiles = findMaps('c:/Users/NEXAWAVE/Desktop/NGO/.next/server');
let recoveredFiles = 0;

for (const mapFile of mapFiles) {
  try {
    const content = fs.readFileSync(mapFile, 'utf8');
    const sourcemap = JSON.parse(content);
    if (sourcemap.sources && sourcemap.sourcesContent) {
      for (let i = 0; i < sourcemap.sources.length; i++) {
        let sourcePath = sourcemap.sources[i];
        if (sourcePath.includes('Desktop/NGO/lib/ai/')) {
          // Extract everything after NGO/
          const match = sourcePath.match(/NGO\/(lib\/ai\/.*\.ts)$/);
          if (match) {
            const cleanPath = match[1];
            const fullPath = path.join('c:/Users/NEXAWAVE/Desktop/NGO', cleanPath);
            const sourceCode = sourcemap.sourcesContent[i];
            
            if (sourceCode) {
              fs.mkdirSync(path.dirname(fullPath), { recursive: true });
              fs.writeFileSync(fullPath, sourceCode);
              console.log('Recovered:', cleanPath);
              recoveredFiles++;
            }
          }
        }
      }
    }
  } catch (e) {
    // ignore
  }
}
console.log('Recovered ' + recoveredFiles + ' files from sourcemaps.');
