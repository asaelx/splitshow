const express = require('express');
const { createHash } = require('node:crypto');
const path = require('path');
const fs = require('fs');
const net = require('net');
const os = require('os');

function getLocalIP() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']);
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.ogv', '.m4v', '.mov']);
const AUDIO_EXTS = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.flac', '.wav', '.opus']);

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

const MUSIC_DIR = path.join(__dirname, '..', 'music');

function scanMusic() {
  let entries;
  try {
    entries = fs.readdirSync(MUSIC_DIR);
  } catch {
    return [];
  }
  return entries
    .filter(f => AUDIO_EXTS.has(path.extname(f).toLowerCase()))
    .map(f => f);
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
    res.json({ media: scanMedia(mediaDir), imageDuration, musicId, musicTracks: scanMusic(), queueId });
  });

  const mediaRoot = fs.realpathSync(mediaDir);
  const queueId = createHash('sha256').update(mediaRoot).digest('hex');
  function candidate(req, res, next) {
    const name = req.params.name;
    const extension = path.extname(name).toLowerCase();
    if (!name || name.startsWith('.') || /[/\\\0]/.test(name) ||
        (!IMAGE_EXTS.has(extension) && !VIDEO_EXTS.has(extension))) {
      return res.status(400).json({ error: 'Invalid media file.' });
    }
    try {
      const file = path.join(mediaRoot, name);
      const stat = fs.lstatSync(file, { bigint: true });
      if (!stat.isFile() || fs.realpathSync(file) !== file) return res.status(404).json({ error: 'Media file unavailable.' });
      req.candidate = { name, file, identity: [stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':') };
      next();
    } catch (error) {
      res.status(error.code === 'ENOENT' ? 404 : 500).json({ error: 'Media file unavailable.' });
    }
  }
  app.get('/api/deletion-candidates/:name', candidate, (req, res) => {
    const { name, identity } = req.candidate;
    res.set('Cache-Control', 'no-store').json({ name, identity });
  });
  app.delete('/api/deletion-candidates/:name', express.json({ limit: '1kb' }), candidate, (req, res) => {
    if (!req.is('application/json')) return res.sendStatus(415);
    if (req.body?.identity !== req.candidate.identity) {
      return res.status(409).json({ error: 'File changed since it was queued.' });
    }
    try {
      fs.unlinkSync(req.candidate.file);
      res.sendStatus(204);
    } catch {
      res.status(500).json({ error: 'Could not delete the media file.' });
    }
  });

  app.use('/music', express.static(MUSIC_DIR));
  app.use('/media', express.static(mediaDir));
  app.use(express.static(path.join(__dirname, 'public')));

  const port = await findPort(preferredPort);

  const server = app.listen(port, () => {
    const localIP = getLocalIP();
    console.log(`splitshow  →  http://localhost:${port}`);
    if (localIP) console.log(`           →  http://${localIP}:${port}`);
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
