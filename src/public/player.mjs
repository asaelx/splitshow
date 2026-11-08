export function mountPlayer(root, items, {
  columns = 3, rows = 3, imageDuration = 3, paused = true, onPauseChange, onQueueRemoval
} = {}) {
  const lifecycle = new AbortController();
  const failed = new Set();
  const queued = new Set();
  const pending = new Set();
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const grid = document.createElement('div');
  grid.className = 'splitshow-grid';
  grid.style.setProperty('--splitshow-columns', Math.min(columns, Math.max(1, pool.length)));
  root.classList.add('splitshow-player');
  root.replaceChildren(grid);
  const tiles = pool.slice(0, columns * rows).map(item => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'splitshow-tile';
    button.setAttribute('aria-label', 'Skip this tile');
    const pane = document.createElement('div');
    pane.className = 'splitshow-pane';
    pane.append(button);
    grid.append(pane);
    const trash = document.createElement('button');
    trash.type = 'button';
    trash.className = 'splitshow-trash';
    trash.setAttribute('aria-label', 'Queue current file for deletion');
    trash.title = 'Queue for deletion';
    const icon = document.createElement('img');
    icon.src = new URL('./icons/trash.svg', import.meta.url);
    icon.alt = '';
    trash.append(icon);
    const status = document.createElement('span');
    status.className = 'splitshow-queue-status';
    status.setAttribute('role', 'status');
    if (onQueueRemoval) pane.append(trash, status);
    return { button, trash, status, item };
  });
  if (!tiles.length) grid.textContent = 'No playable media found.';

  const controls = document.createElement('div');
  controls.className = 'splitshow-controls';
  const play = document.createElement('button');
  const fullscreen = document.createElement('button');
  play.type = fullscreen.type = 'button';
  play.disabled = !tiles.length;
  const playIcon = document.createElement('img');
  const fullscreenIcon = document.createElement('img');
  playIcon.alt = fullscreenIcon.alt = '';
  play.append(playIcon);
  fullscreen.append(fullscreenIcon);
  controls.append(play, fullscreen);
  root.append(controls);

  function listen(target, event, callback) {
    target.addEventListener(event, callback, { signal: lifecycle.signal });
  }

  function stopTile(tile) {
    clearTimeout(tile.timer);
    tile.timer = undefined;
    tile.loading?.abort();
    tile.loading = undefined;
    if (tile.media instanceof HTMLVideoElement) {
      tile.media.pause();
      tile.media.removeAttribute('src');
      tile.media.load();
    }
    tile.media = undefined;
  }

  function advance(tile, manual = false) {
    const available = pool.filter(item => !failed.has(item) && !queued.has(item));
    const alternatives = available.filter(item => item !== tile.item);
    const unused = alternatives.filter(item => !tiles.some(other => other.item === item));
    const canReplay = available.includes(tile.item);
    const candidates = unused.length ? unused : canReplay && !manual ? [tile.item] : alternatives;
    const next = candidates[Math.floor(Math.random() * candidates.length)];
    show(tile, next ?? (canReplay ? tile.item : undefined));
  }

  function resumeTile(tile) {
    if (!tile.ready || !tile.media || paused) return;
    if (tile.media instanceof HTMLVideoElement) {
      tile.media.play().catch(() => {});
    } else {
      tile.started = performance.now();
      tile.timer = setTimeout(() => advance(tile), tile.remaining);
    }
  }

  function show(tile, item, url = item?.url, fallback = false) {
    stopTile(tile);
    tile.item = item;
    tile.ready = false;
    tile.remaining = imageDuration * 1000;
    tile.button.replaceChildren();
    tile.trash.disabled = !item || pending.has(item);
    if (!item) {
      const allQueued = pool.every(candidate => queued.has(candidate));
      tile.button.textContent = allQueued ? 'All files queued for review' : 'No playable media · Retry';
      tile.button.disabled = allQueued;
      tile.button.setAttribute('aria-label', 'Retry media in this tile');
      return;
    }
    tile.button.disabled = false;
    tile.button.setAttribute('aria-label', 'Skip this tile');
    const video = item.type === 'video';
    const media = document.createElement(video ? 'video' : 'img');
    tile.media = media;
    if (video) {
      media.muted = true;
      media.playsInline = true;
      media.preload = 'metadata';
      media.addEventListener('ended', () => { if (tile.media === media) advance(tile); });
    } else {
      media.alt = '';
    }
    media.addEventListener(video ? 'loadedmetadata' : 'load', () => {
      if (tile.media !== media) return;
      tile.ready = true;
      resumeTile(tile);
    }, { once: true });
    media.addEventListener('error', async () => {
      if (tile.media !== media) return;
      if (!fallback && item.fallback) {
        const loading = new AbortController();
        tile.loading = loading;
        tile.button.textContent = 'Preparing compatible media…';
        try {
          const compatible = await item.fallback(loading.signal);
          if (!loading.signal.aborted) show(tile, item, compatible, true);
          return;
        } catch {
          if (loading.signal.aborted) return;
        }
      }
      failed.add(item);
      advance(tile);
    }, { once: true });
    tile.button.append(media);
    media.src = url;
  }

  function setPaused(value) {
    paused = value;
    setIcon(play, playIcon, paused ? 'play' : 'pause', paused ? 'Play' : 'Pause');
    for (const tile of tiles) {
      if (!paused) {
        resumeTile(tile);
      } else if (tile.media instanceof HTMLVideoElement) {
        tile.media.pause();
      } else if (tile.timer !== undefined) {
        clearTimeout(tile.timer);
        tile.timer = undefined;
        tile.remaining = Math.max(0, tile.remaining - (performance.now() - tile.started));
      }
    }
    onPauseChange?.(paused);
  }

  function setIcon(button, image, name, label) {
    image.src = new URL(`./icons/${name}.svg`, import.meta.url);
    button.setAttribute('aria-label', label);
    button.title = label;
  }

  function updateFullscreen() {
    const active = document.fullscreenElement === root;
    setIcon(fullscreen, fullscreenIcon, active ? 'minimize' : 'maximize',
      active ? 'Exit fullscreen' : 'Enter fullscreen');
  }

  listen(play, 'click', () => setPaused(!paused));
  fullscreen.hidden = !root.requestFullscreen || !document.fullscreenEnabled;
  listen(fullscreen, 'click', async () => {
    try {
      if (document.fullscreenElement === root) await document.exitFullscreen();
      else await root.requestFullscreen();
    } catch {}
  });
  listen(document, 'fullscreenchange', updateFullscreen);
  updateFullscreen();
  setPaused(paused);

  for (const tile of tiles) {
    listen(tile.button, 'click', () => {
      if (!tile.item) failed.clear();
      advance(tile, true);
    });
    if (onQueueRemoval) listen(tile.trash, 'click', async () => {
      const item = tile.item;
      if (!item || pending.has(item)) return;
      pending.add(item);
      tile.trash.disabled = true;
      tile.status.textContent = '';
      try {
        await onQueueRemoval(item, lifecycle.signal);
        if (lifecycle.signal.aborted) return;
        queued.add(item);
        for (const other of tiles) {
          if (other.item === item) advance(other);
        }
        tile.status.textContent = 'Queued for review';
      } catch {
        if (!lifecycle.signal.aborted) tile.status.textContent = 'Could not queue file';
      } finally {
        pending.delete(item);
        tile.trash.disabled = !tile.item || pending.has(tile.item);
      }
    });
    show(tile, tile.item);
  }

  return {
    destroy() {
      lifecycle.abort();
      for (const tile of tiles) stopTile(tile);
      root.replaceChildren();
      root.classList.remove('splitshow-player');
    }
  };
}
