const fs = require('fs');
const path = require('path');

const walkSync = (dir, filelist = []) => {
  if (!fs.existsSync(dir)) return filelist;
  fs.readdirSync(dir).forEach(file => {
    const dirFile = path.join(dir, file);
    if (fs.statSync(dirFile).isDirectory()) {
      if (['node_modules', '.next', '.git'].includes(file)) return;
      filelist = walkSync(dirFile, filelist);
    } else {
      if (['.ts', '.tsx', '.js', '.jsx', '.md', '.json', '.txt', '.css'].some(ext => file.endsWith(ext))) {
        filelist.push(dirFile);
      }
    }
  });
  return filelist;
};

const dirs = ['app', 'components', 'lib', 'docs', 'scripts', 'config'];
let allFiles = [];
dirs.forEach(d => {
  allFiles = allFiles.concat(walkSync(path.join(process.cwd(), d)));
});
allFiles = allFiles.concat(walkSync(process.cwd()).filter(f => f.indexOf('\\app\\') === -1 && f.indexOf('\\components\\') === -1 && f.indexOf('\\lib\\') === -1 && f.indexOf('\\docs\\') === -1 && f.indexOf('\\scripts\\') === -1 && f.indexOf('\\config\\') === -1 && fs.statSync(f).isFile()));

let replacedCount = 0;
allFiles.forEach(file => {
  if (file.includes('node_modules') || file.includes('.next') || file.includes('.git') || file.includes('rename.js')) return;
  const content = fs.readFileSync(file, 'utf8');
  let newContent = content;
  
  newContent = newContent.replace(/MOMIN/g, 'KHIZR');
  newContent = newContent.replace(/Momin/g, 'Khizr');
  newContent = newContent.replace(/momin/g, 'khizr');
  
  if (newContent !== content) {
    fs.writeFileSync(file, newContent, 'utf8');
    replacedCount++;
    console.log('Updated:', file);
  }
});
console.log(`Replaced in ${replacedCount} files.`);
