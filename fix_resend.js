const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'lib', 'email', 'resend.ts');
let content = fs.readFileSync(file, 'utf8');

// The write_to_file tool literally wrote \` instead of ` and \$ instead of $
content = content.replace(/\\`/g, '`');
content = content.replace(/\\\$/g, '$');
content = content.replace(/\\\\n/g, '\\n');
content = content.replace(/\\\\\*/g, '\\*');

fs.writeFileSync(file, content);
console.log("Fixed escaping in resend.ts");
