const fs = require('fs');
const { execSync } = require('child_process');

let fixedSomething = true;
let iterations = 0;

while (fixedSomething && iterations < 150) {
  fixedSomething = false;
  iterations++;
  
  let log = "";
  try {
    log = execSync('npx tsc --noEmit', { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    log = e.stdout || e.stderr || "";
  }
  
  // Find all TS1002, TS1160, TS1161, TS1127 errors
  const regex = /([^(\s]+)\((\d+),\d+\): error (TS1002|TS1160|TS1161|TS1127)/g;
  let match;
  let matches = [];
  while ((match = regex.exec(log)) !== null) {
    matches.push({ file: match[1], line: parseInt(match[2], 10), code: match[3] });
  }
  
  if (matches.length === 0) {
    console.log("No more string/regex errors!");
    break;
  }
  
  // Group by file and sort descending
  const filesToFix = {};
  for (const m of matches) {
    if (!filesToFix[m.file]) filesToFix[m.file] = new Set();
    filesToFix[m.file].add(m.line);
  }
  
  for (const [file, linesSet] of Object.entries(filesToFix)) {
    const filePath = 'c:/Users/NEXAWAVE/Desktop/NGO/' + file;
    if (!fs.existsSync(filePath)) continue;
    
    const contentLines = fs.readFileSync(filePath, 'utf8').split('\n');
    const sortedLines = Array.from(linesSet).sort((a, b) => b - a);
    
    let fileModified = false;
    for (const lineNum of sortedLines) {
      const idx = lineNum - 1;
      if (idx < 0 || idx >= contentLines.length - 1) continue;
      
      contentLines[idx] = contentLines[idx] + '\\n' + contentLines[idx + 1];
      contentLines.splice(idx + 1, 1);
      fileModified = true;
      fixedSomething = true;
    }
    
    if (fileModified) {
      fs.writeFileSync(filePath, contentLines.join('\n'));
      console.log(`Fixed errors in ${file}`);
    }
  }
}
console.log("Auto-fix complete after", iterations, "iterations");
