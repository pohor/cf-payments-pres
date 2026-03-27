// =============================================
// Comments System
// =============================================
const API = '/api/threads';
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const relTime = d => {
  const s = Math.floor((Date.now() - new Date(d+'Z').getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
};

let threads = [];
let activeThreadId = null;
let commentMode = false;

const $pins = document.getElementById('cPins');
const $threads = document.getElementById('cThreads');
const $sidebar = document.getElementById('cSidebar');
const $sidebarList = document.getElementById('cSidebarList');
const $badge = document.getElementById('cBadge');
const $addBtn = document.getElementById('cAddBtn');
const $viewAll = document.getElementById('cViewAll');
const $nameFloat = document.getElementById('cNameFloat');
const $nameInput = document.getElementById('cNameInput');

// ---- Name persistence ----
$nameInput.value = localStorage.getItem('c-name') || '';
function saveName() {
  const name = $nameInput.value.trim();
  if (!name) return;
  localStorage.setItem('c-name', name);
  $nameFloat.classList.remove('show');
  // Auto-enter comment mode after saving name
  commentMode = true;
  document.body.classList.add('comment-mode');
  $addBtn.classList.add('active');
}
document.getElementById('cNameSave').addEventListener('click', saveName);
$nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveName(); });
function getAuthor() { return ($nameInput.value.trim() || localStorage.getItem('c-name')) || 'Anonymous'; }
function ensureName() {
  if (localStorage.getItem('c-name')) return true;
  $nameFloat.classList.add('show');
  $nameInput.focus();
  return false;
}

// ---- "Add comment" mode ----
$addBtn.addEventListener('click', () => {
  commentMode = !commentMode;
  document.body.classList.toggle('comment-mode', commentMode);
  $addBtn.classList.toggle('active', commentMode);
});

// Click to place comment in comment mode
document.addEventListener('click', (e) => {
  if (!commentMode) return;
  if (e.target.closest('.c-toolbar, .c-thread, .c-sidebar, .c-pin, .c-name-float, .lightbox')) return;
  e.preventDefault();
  e.stopPropagation();
  const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
  const x = e.clientX / zoom + window.scrollX;
  const y = e.clientY / zoom + window.scrollY;
  const slide = document.elementFromPoint(e.clientX, e.clientY)?.closest('.slide');
  commentMode = false;
  document.body.classList.remove('comment-mode');
  $addBtn.classList.remove('active');
  openNewThread({ x, y, slideId: slide ? slide.id : '', text: '' });
}, true);

// ---- "View all" sidebar ----
$viewAll.addEventListener('click', () => $sidebar.classList.toggle('open'));
document.getElementById('cSidebarClose').addEventListener('click', () => $sidebar.classList.remove('open'));

// ---- Close threads on outside click ----
document.addEventListener('mousedown', (e) => {
  if (commentMode) return;
  if (!e.target.closest('.c-thread, .c-pin, .c-toolbar')) closeAllThreads();
});

// ---- Create new thread popover ----
function openNewThread(sel) {
  closeAllThreads();
  const div = document.createElement('div');
  div.className = 'c-thread open';
  div.style.left = Math.min(sel.x + 16, window.innerWidth - 360 + window.scrollX) + 'px';
  div.style.top = (sel.y + 16) + 'px';
  div.innerHTML = `
    <div class="c-reply-input" style="border:none;flex-wrap:wrap;">
      <input id="cNewName" placeholder="Your name..." value="${esc(getAuthor())}" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:6px;margin-bottom:6px;font-size:13px;flex:none;">
      <textarea id="cNewTA" placeholder="Leave a comment..." rows="2" style="width:100%;"></textarea>
      <button id="cNewSubmit">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 8h12M10 4l4 4-4 4"/></svg>
      </button>
    </div>
  `;
  div.addEventListener('click', e => e.stopPropagation());
  $threads.appendChild(div);
  const ta = document.getElementById('cNewTA');
  ta.focus();
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; });
  const submit = async () => {
    const body = ta.value.trim();
    if (!body) return;
    const nameVal = document.getElementById('cNewName').value.trim() || 'Anonymous';
    localStorage.setItem('c-name', nameVal);
    await fetch(API, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ slide_id: sel.slideId, selected_text: sel.text || '', pin_x: sel.x, pin_y: sel.y, body, author: nameVal })
    });
    div.remove();
    loadThreads();
  };
  document.getElementById('cNewSubmit').addEventListener('click', submit);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });
}

// ---- Render pins ----
function renderPins() {
  $pins.innerHTML = '';
  threads.forEach((t, i) => {
    const pin = document.createElement('div');
    pin.className = 'c-pin' + (activeThreadId === t.id ? ' active' : '');
    pin.style.left = (t.pin_x - 15) + 'px';
    pin.style.top = (t.pin_y - 15) + 'px';
    pin.textContent = i + 1;
    pin.addEventListener('click', (e) => { e.stopPropagation(); toggleThread(t.id); });
    $pins.appendChild(pin);
  });
}

// ---- Thread popover ----
function toggleThread(id) {
  if (activeThreadId === id) { closeAllThreads(); return; }
  closeAllThreads();
  activeThreadId = id;
  const t = threads.find(x => x.id === id);
  if (!t) return;
  const div = document.createElement('div');
  div.className = 'c-thread open';
  div.dataset.threadId = id;
  div.style.left = Math.min(t.pin_x + 20, window.innerWidth - 360 + window.scrollX) + 'px';
  div.style.top = (t.pin_y + 20) + 'px';
  div.innerHTML = `
    <div class="c-thread-header">
      <div class="c-thread-context">${t.selected_text ? '"' + esc(t.selected_text.substring(0, 80)) + '"' : 'Comment'}</div>
      <div class="c-thread-actions">
        <button class="c-resolve-btn" title="Resolve">&#10003;</button>
        <button class="c-delete-btn" title="Delete thread">&times;</button>
      </div>
    </div>
    <div class="c-replies">
      ${t.replies.map(r => `
        <div class="c-reply" data-reply-id="${r.id}">
          <div class="c-reply-top">
            <div class="c-reply-author">${esc(r.author || 'Anonymous')}</div>
            <div class="c-reply-time">${relTime(r.created_at)}</div>
          </div>
          <div class="c-reply-body">${esc(r.body)}</div>
          <div class="c-reply-actions">
            <button class="c-edit-reply" data-id="${r.id}" title="Edit">&#9998;</button>
            <button class="c-delete-reply" data-id="${r.id}" title="Delete">&times;</button>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="c-reply-input">
      <textarea placeholder="Reply..." rows="1"></textarea>
      <button class="c-reply-submit">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 8h12M10 4l4 4-4 4"/></svg>
      </button>
    </div>
  `;
  div.querySelector('.c-resolve-btn').addEventListener('click', async () => {
    await fetch(API + '/' + id + '/resolve', { method: 'PATCH' });
    closeAllThreads(); loadThreads();
  });
  div.querySelector('.c-delete-btn').addEventListener('click', async () => {
    if (!confirm('Delete this entire thread?')) return;
    await fetch(API + '/' + id, { method: 'DELETE' });
    closeAllThreads(); loadThreads();
  });
  div.querySelectorAll('.c-edit-reply').forEach(btn => {
    btn.addEventListener('click', () => {
      const replyEl = btn.closest('.c-reply');
      const bodyEl = replyEl.querySelector('.c-reply-body');
      const oldText = bodyEl.textContent;
      bodyEl.innerHTML = '<div class="c-edit-area"><textarea>' + esc(oldText) + '</textarea><button class="save">Save</button><button class="cancel">Cancel</button></div>';
      const editTA = bodyEl.querySelector('textarea');
      editTA.focus();
      editTA.style.height = editTA.scrollHeight + 'px';
      bodyEl.querySelector('.cancel').addEventListener('click', () => { bodyEl.textContent = oldText; });
      bodyEl.querySelector('.save').addEventListener('click', async () => {
        const nb = editTA.value.trim();
        if (!nb) return;
        await fetch('/api/replies/' + btn.dataset.id, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ body: nb }) });
        loadThreads();
      });
    });
  });
  div.querySelectorAll('.c-delete-reply').forEach(btn => {
    btn.addEventListener('click', async () => {
      await fetch('/api/replies/' + btn.dataset.id, { method: 'DELETE' });
      loadThreads();
    });
  });
  const ta = div.querySelector('.c-reply-input textarea');
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; });
  const submitReply = async () => {
    const body = ta.value.trim();
    if (!body) return;
    await fetch(API + '/' + id + '/replies', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ body, author: getAuthor() }) });
    ta.value = '';
    loadThreads();
  };
  div.querySelector('.c-reply-submit').addEventListener('click', submitReply);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitReply(); } });
  div.addEventListener('click', (e) => e.stopPropagation());
  $threads.appendChild(div);
  div.querySelector('.c-replies').scrollTop = 99999;
  renderPins();
}

function closeAllThreads() {
  activeThreadId = null;
  $threads.innerHTML = '';
  renderPins();
}

// ---- Sidebar ----
function renderSidebar() {
  if (threads.length === 0) {
    $sidebarList.innerHTML = '<div class="c-sidebar-empty">No comments yet.<br>Click "Add comment" to get started.</div>';
    return;
  }
  $sidebarList.innerHTML = threads.map((t, i) => `
    <div class="c-sidebar-item" data-id="${t.id}">
      <div class="c-sidebar-item-top">
        <span class="c-sidebar-item-num">${i + 1}</span>
        <span class="c-sidebar-item-preview">${esc(t.replies[0]?.body?.substring(0, 60) || '')}</span>
        <div class="c-sidebar-item-actions">
          <button class="c-sb-resolve" data-id="${t.id}">Resolve</button>
          <button class="c-sb-delete" data-id="${t.id}">Delete</button>
        </div>
      </div>
      <div class="c-sidebar-item-meta">${esc(t.replies[0]?.author || 'Anonymous')} &middot; ${relTime(t.replies[0]?.created_at || t.created_at)}</div>
      ${t.replies.length > 1 ? '<div class="c-sidebar-item-replies">' + (t.replies.length - 1) + ' repl' + (t.replies.length > 2 ? 'ies' : 'y') + '</div>' : ''}
    </div>
  `).join('');
  $sidebarList.querySelectorAll('.c-sidebar-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.c-sidebar-item-actions')) return;
      const id = parseInt(el.dataset.id);
      const t = threads.find(x => x.id === id);
      if (t) { $sidebar.classList.remove('open'); window.scrollTo({ top: t.pin_y - 200, behavior: 'smooth' }); setTimeout(() => toggleThread(id), 400); }
    });
  });
  $sidebarList.querySelectorAll('.c-sb-resolve').forEach(btn => {
    btn.addEventListener('click', async (e) => { e.stopPropagation(); await fetch(API + '/' + btn.dataset.id + '/resolve', { method: 'PATCH' }); loadThreads(); });
  });
  $sidebarList.querySelectorAll('.c-sb-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => { e.stopPropagation(); if (!confirm('Delete?')) return; await fetch(API + '/' + btn.dataset.id, { method: 'DELETE' }); loadThreads(); });
  });
}

// ---- Load all ----
async function loadThreads() {
  try {
    const res = await fetch(API);
    threads = await res.json();
    $badge.textContent = threads.length;
    renderPins();
    renderSidebar();
    if (activeThreadId && threads.find(t => t.id === activeThreadId)) {
      const id = activeThreadId; activeThreadId = null; toggleThread(id);
    }
  } catch (e) { console.warn('Comments API not available:', e.message); }
}

// Keyboard
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAllThreads(); $sidebar.classList.remove('open'); $nameFloat.classList.remove('show');
    if (commentMode) { commentMode = false; document.body.classList.remove('comment-mode'); $addBtn.classList.remove('active'); }
  }
});

loadThreads();
