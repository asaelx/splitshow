const express = require('express');
const https = require('https');
const path = require('path');
const fs = require('fs');
const net = require('net');
const os = require('os');
const { execFileSync } = require('child_process');

function getLocalIP() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

function generateCert(localIP) {
  const sanList = ['DNS:localhost', 'IP:127.0.0.1'];
  if (localIP) sanList.push(`IP:${localIP}`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splitshow-'));
  try {
    const keyFile = path.join(tmpDir, 'key.pem');
    const certFile = path.join(tmpDir, 'cert.pem');
    const cfgFile = path.join(tmpDir, 'san.cnf');

    fs.writeFileSync(cfgFile, [
      '[req]',
      'distinguished_name = req_distinguished_name',
      'req_extensions = v3_req',
      'prompt = no',
      '[req_distinguished_name]',
      'CN = splitshow',
      '[v3_req]',
      'subjectAltName = ' + sanList.join(','),
      'basicConstraints = CA:FALSE',
      'keyUsage = digitalSignature, keyEncipherment',
      'extendedKeyUsage = serverAuth',
    ].join('\n'));

    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048',
      '-keyout', keyFile, '-out', certFile,
      '-days', '365', '-nodes',
      '-config', cfgFile, '-extensions', 'v3_req',
    ], { stdio: 'pipe' });

    return {
      key: fs.readFileSync(keyFile, 'utf8'),
      cert: fs.readFileSync(certFile, 'utf8'),
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']);
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.ogv', '.m4v', '.mov']);

function parseYouTubeId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1);
    return u.searchParams.get('v') || null;
  } catch {
    return null;
  }
}

function scanMedia(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    console.error(`Cannot read directory: ${dir}`);
    process.exit(1);
  }
  return entries
    .filter(f => {
      const ext = path.extname(f).toLowerCase();
      return IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext);
    })
    .map(f => ({
      name: f,
      type: IMAGE_EXTS.has(path.extname(f).toLowerCase()) ? 'image' : 'video',
    }));
}

function isPortFree(port) {
  return new Promise(resolve => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => { srv.close(); resolve(true); });
    srv.listen(port); // bind to all interfaces, same as app.listen
  });
}

async function findPort(preferred) {
  for (let i = 0; i <= 10; i++) {
    if (await isPortFree(preferred + i)) return preferred + i;
  }
  throw new Error(`No free port found between ${preferred} and ${preferred + 10}`);
}

async function startServer({ mediaDir, imageDuration, preferredPort, musicUrl }) {
  const app = express();
  const musicId = parseYouTubeId(musicUrl);

  if (musicUrl && !musicId) {
    console.warn(`Warning: could not parse a YouTube video ID from "${musicUrl}" — music disabled`);
  }

  app.get('/api/media', (_req, res) => {
    res.json({ media: scanMedia(mediaDir), imageDuration, musicId });
  });

  app.use('/media', express.static(mediaDir));
  app.use(express.static(path.join(__dirname, 'public')));

  const port = await findPort(preferredPort);
  const localIP = getLocalIP();
  const { cert, key } = generateCert(localIP);

  const server = https.createServer({ cert, key }, app).listen(port, () => {
    console.log(`splitshow  →  https://localhost:${port}`);
    if (localIP) console.log(`           →  https://${localIP}:${port}`);
    console.log(`media dir  →  ${mediaDir}`);
    if (localIP) console.log(`(first LAN visit: accept the self-signed cert in your browser)`);
    if (port !== preferredPort) {
      console.log(`(port ${preferredPort} was busy, using ${port})`);
    }
  });

  server.on('error', err => {
    console.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  });
}

module.exports = startServer;
