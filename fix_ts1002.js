const fs = require('fs');

const logPath = 'C:/Users/NEXAWAVE/.gemini/antigravity-ide/brain/824a44a6-6e76-42a7-879d-d999302cda16/.system_generated/tasks/task-6730.log';
const logContent = fs.readFileSync(logPath, 'utf8');

const regex = /([^(\s]+)\((\d+),\d+\): error (TS1002|TS1160|TS1161|TS1127)/g;
let match;
const filesToFix = {};

while ((match = regex.exec(logContent)) !== null) {
  const file = match[1];
  const lineNum = parseInt(match[2], 10);
  const errorType = match[3];
  
  if (!filesToFix[file]) filesToFix[file] = new Set();
  filesToFix[file].add(lineNum);
}

for (const [file, linesSet] of Object.entries(filesToFix)) {
  const filePath = 'c:/Users/NEXAWAVE/Desktop/NGO/' + file;
  if (!fs.existsSync(filePath)) continue;
  
  const contentLines = fs.readFileSync(filePath, 'utf8').split('\n');
  const sortedLines = Array.from(linesSet).sort((a, b) => b - a); // Reverse order
  
  for (const lineNum of sortedLines) {
    const idx = lineNum - 1; // 0-indexed
    if (idx < 0 || idx >= contentLines.length - 1) continue;
    
    // The newline at the end of this line needs to be replaced with \\n
    // So we append the next line to this line, with \\n in between
    contentLines[idx] = contentLines[idx] + '\\n' + contentLines[idx + 1];
    contentLines.splice(idx + 1, 1);
  }
  
  fs.writeFileSync(filePath, contentLines.join('\n'));
}

console.log("Fixed files!");
