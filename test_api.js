const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
let token1 = '';
let token2 = '';
let user1Id = '';
let user2Id = '';
let analysisId = '';
let postId = '';
let commentId = '';
let notificationId = '';

const now = Date.now();
const user1 = {
  username: `cfuser1_${now}`,
  email: `cfuser1_${now}@colorforge.com`,
  password: 'Pass1234!'
};
const user2 = {
  username: `cfuser2_${now}`,
  email: `cfuser2_${now}@colorforge.com`,
  password: 'Pass1234!'
};

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
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
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
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${key}"\r\n\r\n`));
      chunks.push(Buffer.from(String(value)));
      chunks.push(Buffer.from('\r\n'));
    });

    files.forEach((file) => {
      const filename = path.basename(file.path);
      const fileData = fs.readFileSync(file.path);
      chunks.push(Buffer.from(`--${boundary}\r\n`));
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${file.field}"; filename="${filename}"\r\nContent-Type: ${file.contentType || 'application/octet-stream'}\r\n\r\n`
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
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function ok(label, res, expectedStatus = 200) {
  const pass = res.status === expectedStatus && (typeof res.body !== 'string' ? res.body.success === true : true);
  console.log(`  [${pass ? '✓' : '✗'}] ${label} → HTTP ${res.status}`);
  if (!pass) console.log('      Body:', JSON.stringify(res.body, null, 2));
  return pass;
}

function fail(label, res, expectedStatus) {
  const pass = res.status === expectedStatus;
  console.log(`  [${pass ? '✓' : '✗'}] ${label} → HTTP ${res.status} (esperado ${expectedStatus})`);
  if (!pass) console.log('      Body:', JSON.stringify(res.body, null, 2));
  return pass;
}

async function run() {
  let errors = 0;

  console.log('\n=== AUTH ===');
  let r;

  r = await request('POST', '/api/auth/register', user1);
  if (!ok('POST /register user1', r, 201)) errors++;

  r = await request('POST', '/api/auth/register', user2);
  if (!ok('POST /register user2', r, 201)) errors++;

  r = await request('POST', '/api/auth/login', {
    email: user1.email, password: user1.password
  });
  if (!ok('POST /login correcto', r)) errors++;
  if (r.body.success) {
    token1 = r.body.data.token;
    user1Id = r.body.data.user._id;
  }

  r = await request('POST', '/api/auth/login', {
    email: user2.email, password: user2.password
  });
  if (!ok('POST /login user2', r)) errors++;
  if (r.body.success) {
    token2 = r.body.data.token;
    user2Id = r.body.data.user._id;
  }

  r = await request('POST', '/api/auth/login', {
    email: user1.email, password: 'wrongpassword'
  });
  if (!fail('POST /login contraseña incorrecta → 401', r, 401)) errors++;

  r = await request('GET', '/api/auth/me', null, { Authorization: `Bearer ${token1}` });
  if (!ok('GET /me (token válido)', r)) errors++;

  r = await request('GET', '/api/auth/me', null, { Authorization: 'Bearer tokenbasura' });
  if (!fail('GET /me (token inválido) → 401', r, 401)) errors++;

  console.log('\n=== ANALYSIS ===');

  const imgPath = path.join(__dirname, 'test_image.png');
  r = await multipartRequest(
    '/api/analysis',
    {},
    [{ field: 'image', path: imgPath, contentType: 'image/png' }],
    { Authorization: `Bearer ${token1}` }
  );
  if (!ok('POST /analysis (subir imagen)', r, 201)) errors++;
  if (r.body.success) analysisId = r.body.data._id;

  r = await request('GET', '/api/analysis', null, { Authorization: `Bearer ${token1}` });
  if (!ok('GET /analysis (lista propia)', r)) errors++;

  r = await request('GET', `/api/analysis/${analysisId}`, null, { Authorization: `Bearer ${token1}` });
  if (!ok(`GET /analysis/:id (propio)`, r)) errors++;

  r = await request('GET', `/api/analysis/${analysisId}`, null, { Authorization: `Bearer ${token2}` });
  if (!fail('GET /analysis/:id (ajeno) → 403', r, 403)) errors++;

  console.log('\n=== POSTS ===');

  r = await multipartRequest(
    '/api/posts',
    {
      description: 'Mi primera miniatura pintada con ColorForge',
      title: 'Post prueba',
      techniques: JSON.stringify(['dry brushing', 'washing']),
      colors: JSON.stringify(['#FF0000', '#00FF00']),
      privacy: 'public',
      faction: 'Ultramarines',
      analysisId
    },
    [{ field: 'images', path: imgPath, contentType: 'image/png' }],
    { Authorization: `Bearer ${token1}` }
  );
  if (!ok('POST /posts (crear post)', r, 201)) errors++;
  if (r.body.success) postId = r.body.data._id;

  r = await request('GET', '/api/posts');
  if (!ok('GET /posts (público)', r)) errors++;

  r = await request('GET', `/api/posts/${postId}`, null, { Authorization: `Bearer ${token1}` });
  if (!ok('GET /posts/:id (público)', r)) errors++;

  r = await request('PATCH', `/api/posts/${postId}`, {
    title: 'Post editado',
    description: 'Descripcion editada',
    techniques: JSON.stringify(['glazing']),
    colors: JSON.stringify(['#123456']),
    privacy: 'public',
    faction: 'Dark Angels'
  }, { Authorization: `Bearer ${token1}` });
  if (!ok('PATCH /posts/:id (editar)', r)) errors++;

  r = await request('POST', `/api/posts/${postId}/rate`, { value: 5 }, {
    Authorization: `Bearer ${token2}`
  });
  if (!ok('POST /posts/:id/rate (valorar)', r)) errors++;

  r = await request('POST', `/api/posts/${postId}/rate`, { value: 4 }, {
    Authorization: `Bearer ${token2}`
  });
  if (!ok('POST /posts/:id/rate (actualizar valoración)', r)) errors++;

  r = await request('POST', `/api/posts/${postId}/rate`, { value: 9 }, {
    Authorization: `Bearer ${token1}`
  });
  if (!fail('POST /posts/:id/rate (valor inválido) → 400', r, 400)) errors++;

  r = await multipartRequest(
    `/api/posts/${postId}/comment`,
    { text: 'Que buena tecnica de wet blending!', link: 'https://example.com/tutorial' },
    [{ field: 'image', path: imgPath, contentType: 'image/png' }],
    { Authorization: `Bearer ${token2}` }
  );
  if (!ok('POST /posts/:id/comment (comentar)', r, 201)) errors++;
  if (r.body.success) commentId = r.body.data._id;

  r = await request('PATCH', `/api/posts/${postId}/comments/${commentId}`, {
    text: 'Comentario editado',
    link: 'https://example.com/updated'
  }, { Authorization: `Bearer ${token2}` });
  if (!ok('PATCH /posts/:postId/comments/:commentId', r)) errors++;

  r = await request('POST', `/api/posts/${postId}/save`, null, { Authorization: `Bearer ${token2}` });
  if (!ok('POST /posts/:id/save', r)) errors++;

  r = await request('POST', `/api/users/${user2Id}/follow`, null, { Authorization: `Bearer ${token1}` });
  if (!ok('POST /users/:id/follow', r)) errors++;

  r = await request('GET', `/api/users/${user1Id}/posts`, null, { Authorization: `Bearer ${token2}` });
  if (!ok('GET /users/:id/posts', r)) errors++;

  r = await request('GET', '/api/notifications', null, { Authorization: `Bearer ${token1}` });
  if (!ok('GET /notifications', r)) errors++;
  if (r.body.success && r.body.data.length > 0) {
    notificationId = r.body.data[0]._id;
    const readRes = await request('PATCH', `/api/notifications/${notificationId}/read`, null, { Authorization: `Bearer ${token1}` });
    if (!ok('PATCH /notifications/:id/read', readRes)) errors++;
  }

  r = await request('PATCH', '/api/notifications/read-all', null, { Authorization: `Bearer ${token1}` });
  if (!ok('PATCH /notifications/read-all', r)) errors++;

  console.log(`\n${'─'.repeat(50)}`);
  if (errors === 0) {
    console.log('✓ Todas las pruebas pasaron correctamente.\n');
  } else {
    console.log(`✗ ${errors} prueba(s) fallaron.\n`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Error inesperado:', err.message);
  process.exit(1);
});
