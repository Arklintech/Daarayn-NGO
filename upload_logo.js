const fs = require('fs');
const https = require('https');
const path = require('path');

const imgPath = path.join(__dirname, 'public', 'daarayn-logo-transparent.png');
const imgBuffer = fs.readFileSync(imgPath);
const base64Image = imgBuffer.toString('base64');

const data = new URLSearchParams();
data.append('image', base64Image);
data.append('key', '7400494cf3a5df6bc320f772ba6d9f82');

const options = {
  hostname: 'api.imgbb.com',
  path: '/1/upload',
  method: 'POST',
  headers: {
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
