'use strict';

// ---- 設定 -------------------------------------------------------------
const DEFAULTS = {
  repo: 'keigo29/Cmd',
  ledger: 'Notes/クローゼット.md',
  photoDir: 'Data/closet',
};
const CATEGORIES = [
  { key: 'outer', label: 'アウター', optional: true },
  { key: 'top', label: 'トップス' },
  { key: 'bottom', label: 'ボトムス' },
  { key: 'shoes', label: '靴' },
];
const LS = { settings: 'closet.settings', reviews: 'closet.reviews', cache: 'closet.cache' };

// 個人データを含まない見本（トークンがないとき用）
const DEMO_LEDGER = `# クローゼット
## アウター
| id | 名前 | 色 | 季節 | 写真 | メモ |
|---|---|---|---|---|---|
| outer-001 | ムートンジャケット | ブラウン | 秋冬 | 未登録 | 見本 |
| outer-002 | レザージャケット | ブラック | 秋冬 | 未登録 | 見本 |
## トップス
| id | 名前 | 色 | 季節 | 写真 | メモ |
|---|---|---|---|---|---|
| top-001 | 無地Tシャツ | ブラック | 春夏 | 未登録 | 見本 |
| top-002 | 無地Tシャツ | ホワイト | 春夏 | 未登録 | 見本 |
| top-003 | パーカー | ブラック | 秋冬 | 未登録 | 見本 |
| top-004 | クルーネックニット | グレー | 秋冬 | 未登録 | 見本 |
## ボトムス
| id | 名前 | 色 | 季節 | 写真 | メモ |
|---|---|---|---|---|---|
| bottom-001 | スラックス | ブラック | 通年 | 未登録 | 見本 |
| bottom-002 | ストレートデニム | インディゴ | 通年 | 未登録 | 見本 |
## 靴
| id | 名前 | 色 | 季節 | 写真 | メモ |
|---|---|---|---|---|---|
| shoes-001 | レザースニーカー | ホワイト | 通年 | 未登録 | 見本 |
| shoes-002 | サイドゴアブーツ | ブラック | 秋冬 | 未登録 | 見本 |
`;
const DEMO_TODAY = {
  date: new Date().toISOString().slice(0, 10),
  items: ['outer-001', 'top-004', 'bottom-001', 'shoes-002'],
  reason: '見本です。TEDDYが Data/closet/today.json を書くと、ここに今日のおすすめが出ます。',
};

const COLORS = {
  'ブラック': '#1f1f1f', '黒': '#1f1f1f',
  'ホワイト': '#f3f1ec', '白': '#f3f1ec', 'オフホワイト': '#ece6d8', 'アイボリー': '#ece6d8',
  'グレー': '#8a8a8a', 'チャコール': '#45464a', 'ライトグレー': '#c4c4c4',
  'ネイビー': '#1f2a44', 'インディゴ': '#2c3e66', 'ブルー': '#3c6ea8', 'サックス': '#9dbbd8',
  'ブラウン': '#6b4a2f', '茶': '#6b4a2f', 'キャメル': '#b0834f', 'ベージュ': '#d6c3a0', 'カーキ': '#6f6a45',
  'オリーブ': '#5d6339', 'グリーン': '#3f6b4a', 'レッド': '#a83a32', 'ボルドー': '#5c1f2a',
  'イエロー': '#d8b445', 'ピンク': '#d99aa5', 'パープル': '#6a4f86',
};
const LIGHT = new Set(['#f3f1ec', '#ece6d8', '#c4c4c4', '#d6c3a0', '#9dbbd8', '#d8b445', '#d99aa5']);

// ---- 状態 -------------------------------------------------------------
const state = {
  items: [],
  today: null,
  mode: 'demo', // 'cmd' | 'demo'
  photos: {},   // id -> objectURL
  pick: { outer: null, top: null, bottom: null, shoes: null },
};

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 保存できない環境では無視 */ }
}
function settings() { return { ...DEFAULTS, ...load(LS.settings, {}) }; }

// ---- 台帳の読み取り ---------------------------------------------------
function categoryOf(heading, id) {
  const c = CATEGORIES.find(c => heading.includes(c.label));
  if (c) return c.key;
  const prefix = (id || '').split('-')[0];
  return CATEGORIES.some(c => c.key === prefix) ? prefix : null;
}

// Notes/クローゼット.md の「## カテゴリ」見出しの下の表を読む
function parseLedger(md, photoDir) {
  const items = [];
  let heading = '';
  let cols = null;
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('## ')) { heading = line.slice(3); cols = null; continue; }
    if (!line.startsWith('|')) { cols = null; continue; }
    const cells = line.replace(/^\||\|$/g, '').split('|').map(s => s.trim());
    if (cells.every(c => /^:?-+:?$/.test(c))) continue;
    if (!cols) { cols = cells; continue; }
    const row = Object.fromEntries(cols.map((c, i) => [c, cells[i] || '']));
    const id = row['id'];
    if (!id || id.startsWith('（')) continue;
    const category = categoryOf(heading, id);
    if (!category) continue;
    const photoCell = row['写真'] || '';
    let photo = null;
    if (photoCell && !/未登録|^-$/.test(photoCell)) {
      photo = photoCell.includes('/') ? photoCell : `${photoDir}/${photoCell}`;
    }
    items.push({
      id, category,
      name: row['名前'] || id,
      color: row['色'] || '',
      season: row['季節'] || '',
      memo: row['メモ'] || '',
      photo,
      temp: /（仮）/.test(row['名前'] || ''),
    });
  }
  return items;
}

// ---- GitHub から読む --------------------------------------------------
function contentsUrl(repo, path) {
  return `https://api.github.com/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
}
async function ghFetch(path, as = 'text') {
  const s = settings();
  const res = await fetch(contentsUrl(s.repo, path), {
    headers: { Authorization: `Bearer ${s.token}`, Accept: 'application/vnd.github.raw' },
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${path} を読めませんでした（${res.status}）`);
  return as === 'blob' ? res.blob() : res.text();
}

async function loadFromCmd() {
  const s = settings();
  const md = await ghFetch(s.ledger);
  if (md == null) throw new Error(`${s.ledger} が見つかりません`);
  state.items = parseLedger(md, s.photoDir);
  const todayText = await ghFetch(`${s.photoDir}/today.json`);
  state.today = todayText ? JSON.parse(todayText) : null;
  state.mode = 'cmd';
  save(LS.cache, { md, today: state.today, at: Date.now() });
  loadPhotos();
}

async function loadPhotos() {
  for (const it of state.items) {
    if (!it.photo || state.photos[it.id]) continue;
    try {
      const blob = await ghFetch(it.photo, 'blob');
      if (blob) { state.photos[it.id] = URL.createObjectURL(blob); render(); }
    } catch { /* 写真がなくても色で表示する */ }
  }
}

function loadDemo() {
  state.items = parseLedger(DEMO_LEDGER, DEFAULTS.photoDir);
  state.today = DEMO_TODAY;
  state.mode = 'demo';
}

async function refresh() {
  const s = settings();
  if (!s.token) { loadDemo(); render(); return; }
  setSource('読み込み中…');
  try {
    await loadFromCmd();
  } catch (e) {
    const cache = load(LS.cache, null);
    if (cache) {
      state.items = parseLedger(cache.md, s.photoDir);
      state.today = cache.today;
      state.mode = 'cmd';
      alert(`${e.message}\n前回読み込んだデータを表示します。`);
    } else {
      alert(`${e.message}\n見本データを表示します。`);
      loadDemo();
    }
  }
  render();
}

// ---- 表示 -------------------------------------------------------------
const $ = sel => document.querySelector(sel);
const byId = id => state.items.find(i => i.id === id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function colorOf(name) {
  for (const [k, v] of Object.entries(COLORS)) if (name.includes(k)) return v;
  return '#9a948c';
}
function setSource(text) { $('#source').textContent = text; }

function thumb(it) {
  if (!it) return '<div class="thumb light" style="background:var(--line)">なし</div>';
  const url = state.photos[it.id];
  if (url) return `<div class="thumb" style="background-image:url('${url}')"></div>`;
  const c = colorOf(it.color);
  return `<div class="thumb ${LIGHT.has(c) ? 'light' : ''}" style="background:${c}">${esc(it.name.replace('（仮）', ''))}</div>`;
}
function card(it, extra = '') {
  return `<div class="item ${extra}" data-id="${esc(it.id)}">
    ${thumb(it)}
    <div class="meta">
      <div class="name">${esc(it.name)}</div>
      <div class="sub">${esc(it.color || '色未確認')} ・ ${esc(it.season || '季節未確認')}</div>
    </div>
  </div>`;
}

function renderCloset() {
  // 色とカテゴリの偏りをざっくり出す
  const counts = {};
  for (const it of state.items) counts[it.color || '未確認'] = (counts[it.color || '未確認'] || 0) + 1;
  const chips = Object.entries(counts).sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `<span class="chip"><span class="dot" style="background:${colorOf(c)}"></span>${esc(c)} ${n}</span>`);
  const temp = state.items.filter(i => i.temp).length;
  $('#summary').innerHTML = chips.join('') +
    (temp ? `<span class="chip tag-temp">仮登録 ${temp}</span>` : '');

  $('#closetList').innerHTML = CATEGORIES.map(c => {
    const list = state.items.filter(i => i.category === c.key);
    return `<h2>${c.label}（${list.length}）</h2>` +
      (list.length ? `<div class="grid">${list.map(it => card(it)).join('')}</div>` : '<p class="empty">まだありません</p>');
  }).join('');
}

function flatlay(ids) {
  const pieces = CATEGORIES.map(c => {
    const it = byId(ids[c.key]);
    if (!it) return '';
    return `<div class="piece ${c.key}">${thumb(it)}<div class="label">${esc(it.name)}</div></div>`;
  }).join('');
  return pieces || '<p class="empty">まだ選ばれていません</p>';
}

function renderCoord() {
  $('#pickers').innerHTML = CATEGORIES.map(c => {
    const list = state.items.filter(i => i.category === c.key);
    const none = c.optional
      ? `<div class="item selectable none ${state.pick[c.key] ? '' : 'selected'}" data-cat="${c.key}" data-id="">なし</div>` : '';
    return `<h2>${c.label}</h2><div class="pick-row">${none}${list.map(it =>
      card(it, `selectable ${state.pick[c.key] === it.id ? 'selected' : ''}`).replace('class="item', `data-cat="${c.key}" class="item`)
    ).join('')}</div>`;
  }).join('');
  $('#coordPreview').innerHTML = flatlay(state.pick);
}

function itemsToIds(list) {
  const ids = {};
  for (const id of list || []) { const it = byId(id); if (it) ids[it.category] = id; }
  return ids;
}

function renderToday() {
  const t = state.today;
  if (!t || !t.items) {
    $('#todayBox').innerHTML = '<p class="empty">今日のおすすめはまだありません。<br>TEDDYが Data/closet/today.json を書くと出ます。</p>';
    return;
  }
  const ids = itemsToIds(t.items);
  const reviewed = load(LS.reviews, []).find(r => r.id === `today-${t.date}`);
  $('#todayBox').innerHTML = `
    <div class="card">
      <div class="head"><h2 style="margin:0">今日のおすすめ</h2><span class="date">${esc(t.date || '')}</span></div>
      ${t.weather ? `<p class="hint">${esc(t.weather)}</p>` : ''}
      <div class="flatlay" style="margin:10px 0">${flatlay(ids)}</div>
      ${t.reason ? `<p>${esc(t.reason)}</p>` : ''}
      <div class="vote" data-today="1">
        <button data-vote="1" class="up ${reviewed && reviewed.vote === 1 ? 'on' : ''}">👍 いい</button>
        <button data-vote="-1" class="down ${reviewed && reviewed.vote === -1 ? 'on' : ''}">👎 ちがう</button>
      </div>
    </div>`;
}

function renderReview() {
  const reviews = load(LS.reviews, []);
  if (!reviews.length) {
    $('#reviewList').innerHTML = '<p class="empty">まだレビューはありません。<br>「着せ替え」でコーデを入れるか、「今日」で👍／👎してください。</p>';
    return;
  }
  const up = reviews.filter(r => r.vote === 1).length;
  const down = reviews.filter(r => r.vote === -1).length;
  $('#reviewList').innerHTML = `<p class="hint">この端末に保存しています。👍 ${up} ・ 👎 ${down}</p>` +
    reviews.slice().reverse().map(r => `
    <div class="card" data-review="${esc(r.id)}">
      <div class="head"><strong>${r.source === 'today' ? '今日のおすすめ' : '自分で組んだコーデ'}</strong><span class="date">${esc(r.date)}</span></div>
      <div class="mini">${r.items.map(id => thumb(byId(id))).join('')}</div>
      <div class="vote">
        <button data-vote="1" class="up ${r.vote === 1 ? 'on' : ''}">👍</button>
        <button data-vote="-1" class="down ${r.vote === -1 ? 'on' : ''}">👎</button>
        <button data-del="1" class="ghost">消す</button>
      </div>
    </div>`).join('');
}

function render() {
  setSource(state.mode === 'cmd' ? `Cmd から ${state.items.length} 点` : '見本データ');
  renderCloset();
  renderCoord();
  renderToday();
  renderReview();
}

// ---- 操作 -------------------------------------------------------------
function upsertReview(entry) {
  const list = load(LS.reviews, []);
  const i = list.findIndex(r => r.id === entry.id);
  if (i >= 0) list[i] = { ...list[i], ...entry }; else list.push(entry);
  save(LS.reviews, list);
}

document.addEventListener('click', e => {
  const tab = e.target.closest('.tabs button');
  if (tab) {
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b === tab));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${tab.dataset.view}`));
    window.scrollTo(0, 0);
    return;
  }

  const pick = e.target.closest('#pickers .item');
  if (pick) {
    const cat = pick.dataset.cat;
    state.pick[cat] = pick.dataset.id || null;
    renderCoord();
    return;
  }

  const vote = e.target.closest('.vote button');
  if (vote) {
    const box = vote.closest('.vote');
    if (box.dataset.today) {
      const t = state.today;
      upsertReview({ id: `today-${t.date}`, date: t.date, source: 'today', items: t.items.filter(byId), vote: Number(vote.dataset.vote) });
    } else {
      const id = vote.closest('[data-review]').dataset.review;
      if (vote.dataset.del) save(LS.reviews, load(LS.reviews, []).filter(r => r.id !== id));
      else upsertReview({ id, vote: Number(vote.dataset.vote) });
    }
    renderToday();
    renderReview();
  }
});

$('#saveCoord').addEventListener('click', () => {
  const items = CATEGORIES.map(c => state.pick[c.key]).filter(Boolean);
  if (!items.length) { alert('アイテムを選んでください'); return; }
  const date = new Date().toISOString().slice(0, 10);
  upsertReview({ id: `self-${Date.now()}`, date, source: 'self', items, vote: 0 });
  renderReview();
  alert('レビューに入れました。「レビュー」タブで👍／👎できます。');
});

$('#randomCoord').addEventListener('click', () => {
  for (const c of CATEGORIES) {
    const list = state.items.filter(i => i.category === c.key);
    const pool = c.optional ? [null, ...list.map(i => i.id)] : list.map(i => i.id);
    state.pick[c.key] = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }
  renderCoord();
});

// ---- 設定ダイアログ ---------------------------------------------------
const dlg = $('#settings');
$('#openSettings').addEventListener('click', () => {
  const s = settings();
  $('#token').value = s.token || '';
  $('#repo').value = s.repo;
  $('#ledger').value = s.ledger;
  $('#photoDir').value = s.photoDir;
  dlg.showModal();
});
dlg.addEventListener('close', () => {
  if (dlg.returnValue === 'save') {
    save(LS.settings, {
      token: $('#token').value.trim(),
      repo: $('#repo').value.trim() || DEFAULTS.repo,
      ledger: $('#ledger').value.trim() || DEFAULTS.ledger,
      photoDir: $('#photoDir').value.trim() || DEFAULTS.photoDir,
    });
    state.photos = {};
    refresh();
  } else if (dlg.returnValue === 'demo') {
    loadDemo();
    render();
  }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
refresh();
