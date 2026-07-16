const fs = require('fs');
const https = require('https');
const path = require('path');

const imgPath = path.join(__dirname, 'public', 'daarayn-logo-transparent.png');
const imgBuffer = fs.readFileSync(imgPath);
const base64Image = imgBuffer.toString('base64');

const data = new URLSearchParams();
data.append('image', base64Image);
data.append('type', 'base64');

const options = {
  hostname: 'api.imgur.com',
  path: '/3/image',
  method: 'POST',
  headers: {
    'Authorization': 'Client-ID d3b11566378fbdb', // common public client id
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(data.toString())
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log(body);
  });
});

req.on('error', (e) => console.error(e));
req.write(data.toString());
req.end();
