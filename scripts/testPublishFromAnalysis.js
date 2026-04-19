const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';

function request(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', ...headers }
    };

    const fullUrl = new URL(BASE + url);
    const req = http.request(fullUrl, opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function multipartRequest(url, fields = {}, files = [], headers = {}) {
  return new Promise((resolve, reject) => {
    const boundary = `----FormBoundary${Date.now()}`;
    const chunks = [];

    Object.entries(fields).forEach(([key, value]) => {
      chunks.push(Buffer.from(`--${boundary}\r\n`));
      chunks.push(Buffer.from(`Content-Disposition: form-data; name=\"${key}\"\r\n\r\n`));
      chunks.push(Buffer.from(String(value)));
      chunks.push(Buffer.from('\r\n'));
    });

    files.forEach((file) => {
      const filename = path.basename(file.path);
      const fileData = fs.readFileSync(file.path);
      chunks.push(Buffer.from(`--${boundary}\r\n`));
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name=\"${file.field}\"; filename=\"${filename}\"\r\nContent-Type: ${file.contentType || 'application/octet-stream'}\r\n\r\n`
        )
      );
      chunks.push(fileData);
      chunks.push(Buffer.from('\r\n'));
    });

    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    const body = Buffer.concat(chunks);

    const opts = {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        ...headers
      }
    };

    const fullUrl = new URL(BASE + url);
    const req = http.request(fullUrl, opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function run() {
  const now = Date.now();
  const user = {
    username: `cfpub_${now}`,
    email: `cfpub_${now}@colorforge.com`,
    password: 'Pass1234!'
  };

  const register = await request('POST', '/api/auth/register', user);
  if (register.status !== 201 || !register.body?.success) {
    console.log('TEST_OK=false');
    console.log('STEP=register');
    console.log(JSON.stringify(register.body));
    process.exit(2);
  }

  const token = register.body.data.token;

  const imgPath = path.join(__dirname, '..', 'test_image.png');
  const analysis = await multipartRequest(
    '/api/analysis',
    {},
    [{ field: 'image', path: imgPath, contentType: 'image/png' }],
    { Authorization: `Bearer ${token}` }
  );

  if (analysis.status !== 201 || !analysis.body?.success) {
    console.log('TEST_OK=false');
    console.log('STEP=analysis');
    console.log(JSON.stringify(analysis.body));
    process.exit(3);
  }

  const analysisId = analysis.body.data._id;

  const post = await request(
    'POST',
    '/api/posts',
    {
      title: 'Publicado desde analisis',
      description: 'Post sin adjuntar imagen, reutiliza analysisId',
      analysisId,
      privacy: 'public'
    },
    { Authorization: `Bearer ${token}` }
  );

  console.log(`POST_STATUS=${post.status}`);
  console.log(`POST_SUCCESS=${post.body?.success === true}`);
  if (post.body?.error) {
    console.log(`POST_ERROR=${post.body.error}`);
  }

  if (post.status !== 201 || !post.body?.success) {
    console.log('TEST_OK=false');
    process.exit(4);
  }

  console.log('TEST_OK=true');
  console.log(`POST_ID=${post.body.data._id}`);
  console.log(`POST_IMAGE_URLS=${JSON.stringify(post.body.data.imageUrls)}`);
}

run().catch((error) => {
  console.log('TEST_OK=false');
  console.log(`UNCAUGHT=${error.message}`);
  process.exit(1);
});
