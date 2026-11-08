export function setupDeletionReview(queueId) {
  const key = 'splitshow:deletion-queue:' + queueId;
  const candidates = new Map(JSON.parse(localStorage.getItem(key) || '[]'));
  const queuedNames = new Set(candidates.keys());
  const endpoint = name => '/api/deletion-candidates/' + encodeURIComponent(name);
  const save = () => localStorage.setItem(key, JSON.stringify([...candidates]));

  const review = document.createElement('button');
  review.type = 'button';
  review.textContent = 'Review deletions';
  review.style.width = 'auto';
  review.style.paddingInline = '10px';
  const dialog = document.createElement('dialog');
  dialog.style.cssText = 'margin:auto;padding:20px;width:min(90%,600px);color:#fff;background:#191a23;border:1px solid #555;border-radius:12px';
  const title = document.createElement('h2');
  title.textContent = 'Review deletions';
  const list = document.createElement('div');
  list.style.cssText = 'display:grid;gap:8px;margin:12px 0;max-height:50vh;overflow:auto';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const close = document.createElement('button');
  close.textContent = 'Close';
  close.addEventListener('click', () => dialog.close());
  const keep = document.createElement('button');
  keep.textContent = 'Keep selected';
  const confirm = document.createElement('button');
  confirm.textContent = 'Delete selected files';
  dialog.append(title, list, status, close, keep, confirm);
  review.addEventListener('click', () => {
    const fullscreen = document.fullscreenElement;
    (fullscreen || document.body).append(dialog);
    status.textContent = '';
    render();
    dialog.showModal();
  });
  dialog.addEventListener('close', () => dialog.remove());

  function render() {
    list.replaceChildren();
    if (!candidates.size) list.textContent = 'No files queued.';
    keep.disabled = confirm.disabled = true;
    for (const [name] of candidates) {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = name;
      label.append(checkbox, ' ' + name);
      list.append(label);
    }
  }
  list.addEventListener('change', () => {
    keep.disabled = confirm.disabled = !list.querySelector(':checked');
  });

  keep.addEventListener('click', () => {
    for (const input of list.querySelectorAll(':checked')) candidates.delete(input.value);
    save();
    render();
    status.textContent = 'Selected files kept.';
  });

  confirm.addEventListener('click', async () => {
    const names = [...list.querySelectorAll(':checked')].map(input => input.value);
    if (!names.length || !window.confirm('Permanently delete ' + names.length + ' selected file(s)?')) return;
    keep.disabled = confirm.disabled = close.disabled = true;
    for (const input of list.querySelectorAll('input')) input.disabled = true;
    const errors = [];
    for (const name of names) {
      try {
        const response = await fetch(endpoint(name), {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identity: candidates.get(name) })
        });
        if (!response.ok && response.status !== 404) {
          const { error } = await response.json();
          throw new Error(error);
        }
        candidates.delete(name);
        save();
      } catch (error) {
        errors.push(name + ' · ' + error.message);
      }
    }
    close.disabled = false;
    render();
    status.textContent = errors.length ? errors.join(' · ') : 'Selected files removed.';
  });

  return {
    review, queuedNames,
    async queue(item, signal) {
      const response = await fetch(endpoint(item.name), { signal });
      if (!response.ok) throw new Error('Could not queue file.');
      const { name, identity } = await response.json();
      candidates.set(name, identity);
      save();
    }
  };
}
