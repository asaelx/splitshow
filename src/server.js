const express = require('express');
const path = require('path');
const fs = require('fs');
const net = require('net');

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

  const server = app.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`splitshow  →  ${url}`);
    console.log(`media dir  →  ${mediaDir}`);
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
