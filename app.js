/* 같이가자 — 친구들과 같이 짜는 여행 플래너 (vanilla JS + Supabase) */
(() => {
'use strict';
const CFG = window.TRIP_CONFIG || {};
const REMOTE = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);

/* ───────── 유틸 ───────── */
const $ = (id) => document.getElementById(id);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const k in (attrs || {})) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}
const ls = {
  get(k, d) { try { const v = localStorage.getItem('tp.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('tp.' + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem('tp.' + k); } catch (e) {} },
};
const rid = (n = 8) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const pd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fd = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return fd(d); };
const md = (s) => { const d = pd(s); return `${d.getMonth() + 1}.${d.getDate()}`; };
const mdw = (s) => `${md(s)} (${WD[pd(s).getDay()]})`;
function tripDays(t) {
  const out = [];
  if (!t || !t.start || !t.end || t.end < t.start) return out;
  for (let d = t.start; d <= t.end && out.length < 60; d = addDays(d, 1)) out.push(d);
  return out;
}
function dday(t) {
  const today = fd(new Date());
  if (today < t.start) return 'D-' + Math.round((pd(t.start) - pd(today)) / 864e5);
  if (today <= t.end) return '여행 중';
  return '다녀옴';
}
const won = (n) => '₩' + Math.round(n).toLocaleString('ko-KR');
const yuan = (n) => '¥' + (Math.round(n * 100) / 100).toLocaleString('ko-KR');
const money = (n, cur) => (cur === 'KRW' ? won(n) : yuan(n));
const fmtDist = (m) => (m < 1000 ? Math.max(10, Math.round(m / 10) * 10) + 'm' : (m / 1000).toFixed(m < 10000 ? 1 : 0) + 'km');
const fmtMin = (min) => { min = Math.max(1, Math.round(min)); return min < 60 ? min + '분' : Math.floor(min / 60) + '시간' + (min % 60 ? ' ' + (min % 60) + '분' : ''); };

/* ───────── 좌표 (WGS-84 ↔ GCJ-02: 중국 지도는 좌표가 살짝 어긋나 있어서 보정 필요) ───────── */
const Geo = (() => {
  const a = 6378245.0, ee = 0.00669342162296594323, PI = Math.PI;
  const inChina = (lat, lng) => lng > 72.004 && lng < 137.8347 && lat > 0.8293 && lat < 55.8271;
  function tLat(x, y) {
    let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    r += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
    r += (20 * Math.sin(y * PI) + 40 * Math.sin(y / 3 * PI)) * 2 / 3;
    r += (160 * Math.sin(y / 12 * PI) + 320 * Math.sin(y * PI / 30)) * 2 / 3;
    return r;
  }
  function tLng(x, y) {
    let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    r += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
    r += (20 * Math.sin(x * PI) + 40 * Math.sin(x / 3 * PI)) * 2 / 3;
    r += (150 * Math.sin(x / 12 * PI) + 300 * Math.sin(x / 30 * PI)) * 2 / 3;
    return r;
  }
  function delta(lat, lng) {
    let dLat = tLat(lng - 105, lat - 35), dLng = tLng(lng - 105, lat - 35);
    const rad = lat / 180 * PI; let magic = Math.sin(rad); magic = 1 - ee * magic * magic;
    const sq = Math.sqrt(magic);
    dLat = (dLat * 180) / ((a * (1 - ee)) / (magic * sq) * PI);
    dLng = (dLng * 180) / (a / sq * Math.cos(rad) * PI);
    return [dLat, dLng];
  }
  function toGcj(lat, lng) { if (!inChina(lat, lng)) return [lat, lng]; const [a1, b1] = delta(lat, lng); return [lat + a1, lng + b1]; }
  function toWgs(lat, lng) {
    if (!inChina(lat, lng)) return [lat, lng];
    let wl = lat, wn = lng;
    for (let i = 0; i < 4; i++) { const [gl, gn] = toGcj(wl, wn); wl += lat - gl; wn += lng - gn; }
    return [wl, wn];
  }
  function hav(a1, b1, a2, b2) {
    const R = 6371000, r = PI / 180, dA = (a2 - a1) * r, dB = (b2 - b1) * r;
    const s = Math.sin(dA / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dB / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  return { toGcj, toWgs, hav };
})();

/* ───────── 상수 ───────── */
const KINDS = [
  { k: 'spot', e: '📍', n: '관광' }, { k: 'food', e: '🍜', n: '맛집' }, { k: 'cafe', e: '☕', n: '카페' },
  { k: 'shop', e: '🛍️', n: '쇼핑' }, { k: 'hotel', e: '🏨', n: '숙소' }, { k: 'air', e: '✈️', n: '공항·항공' },
  { k: 'move', e: '🚆', n: '교통' }, { k: 'etc', e: '📝', n: '기타' }, { k: 'expense', e: '💳', n: '비용만' },
];
const KIND = Object.fromEntries(KINDS.map((x) => [x.k, x]));
const DAY_COLORS = ['#4f7f72', '#c58a5c', '#7d7bb5', '#b5738c', '#5f8fb3', '#8c9a5e', '#a38c5f'];
const MODES = { walk: { e: '🚶', n: '도보' }, taxi: { e: '🚕', n: '택시' }, transit: { e: '🚌', n: '대중교통' } };
const SEEDS = [
  { id: 'dalian-k7m2x9', trip: { title: '대련 여행', emoji: '🌊', start: '2026-12-11', end: '2026-12-13', city: '대련', cityZh: '大连', lat: 38.914, lng: 121.6147, members: [], rate: 200 },
    items: [{ id: 'dalian-k7m2x9-air', kind: 'air', title: '대련 저우수이쯔 국제공항', local: '大连周水子国际机场', lat: 38.9657, lng: 121.5386, day: '2026-12-11', order: 1, memo: '항공편·도착 시간을 적어줘' }] },
  { id: 'yantai-p4w8qz', trip: { title: '옌타이 여행', emoji: '🍎', start: '2026-12-24', end: '2026-12-27', city: '옌타이', cityZh: '烟台', lat: 37.4638, lng: 121.4479, members: [], rate: 200 },
    items: [{ id: 'yantai-p4w8qz-air', kind: 'air', title: '옌타이 펑라이 국제공항', local: '烟台蓬莱国际机场', lat: 37.6572, lng: 120.9872, day: '2026-12-24', order: 1, memo: '항공편·도착 시간을 적어줘' }] },
];

/* ───────── 상태 ───────── */
const S = {
  me: ls.get('me', ''), tripId: null, trip: null, items: [],
  tab: 'plan', day: 'all', reorder: false, hl: null, fit: true,
  net: 'ok', // ok | off
  layer: ls.get('layer', 'amap'), mapSmall: ls.get('mapSmall', false),
};
let outbox = ls.get('outbox', []);
let routes = ls.get('routes', {});

/* ───────── 저장/동기화 ───────── */
const sb = REMOTE ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
let chan = null, flushing = false, flushTimer = null;

const known = () => ls.get('trips', []);
function addKnown(id) { const k = known(); if (!k.includes(id)) { k.unshift(id); ls.set('trips', k); } }
const cacheGet = (id) => ls.get('t.' + id, null);
function cachePut() { if (S.tripId && S.trip) ls.set('t.' + S.tripId, { trip: S.trip, items: S.items }); }
const pending = (k, id) => outbox.some((o) => o.k === k && o.id === id);

function queue(op) {
  if (!REMOTE) return;
  outbox = outbox.filter((o) => !(o.k === op.k && o.id === op.id));
  outbox.push(op); ls.set('outbox', outbox);
  flush();
}
async function flush() {
  if (!REMOTE || flushing) return;
  flushing = true; clearTimeout(flushTimer);
  try {
    while (outbox.length) {
      const op = outbox[0];
      const now = new Date().toISOString();
      const q = op.k === 'trip'
        ? sb.from('trips').upsert({ id: op.id, data: op.data, updated_at: now })
        : sb.from('items').upsert({ id: op.id, trip_id: op.trip_id, data: op.data, deleted: !!op.deleted, updated_at: now });
      const { error } = await q;
      if (error) throw error;
      // 보내는 사이 같은 항목을 또 고쳤으면 그건 남겨둔다
      if (outbox[0] === op) outbox.shift(); else outbox = outbox.filter((o) => o !== op);
      ls.set('outbox', outbox);
    }
    setNet('ok');
  } catch (e) {
    console.warn('sync failed', e);
    setNet('off');
    flushTimer = setTimeout(flush, 8000);
  } finally { flushing = false; renderStatus(); }
}
function setNet(v) { if (S.net !== v) { S.net = v; renderStatus(); } }

const rowToItem = (r) => Object.assign({}, r.data, { id: r.id });
function itemData(it) { const d = Object.assign({}, it); delete d.id; return d; }

async function pull() {
  if (!REMOTE || !S.tripId) return;
  const id = S.tripId;
  try {
    const [t, it] = await Promise.all([
      sb.from('trips').select('id,data').eq('id', id).maybeSingle(),
      sb.from('items').select('id,data,deleted').eq('trip_id', id),
    ]);
    if (t.error) throw t.error; if (it.error) throw it.error;
    if (S.tripId !== id) return;
    if (!t.data) {
      if (S.trip) queue({ k: 'trip', id, data: S.trip }); // 이 기기에서 만든 여행이 아직 안 올라간 경우
      else { S.missing = true; renderAll(); }
      setNet('ok'); return;
    }
    if (!pending('trip', id)) S.trip = t.data.data;
    const local = new Map(S.items.map((x) => [x.id, x]));
    const next = [];
    for (const r of it.data) {
      if (pending('item', r.id)) { if (local.has(r.id)) next.push(local.get(r.id)); continue; }
      if (!r.deleted) next.push(rowToItem(r));
    }
    const seen = new Set(it.data.map((r) => r.id));
    for (const x of S.items) if (!seen.has(x.id) && pending('item', x.id)) next.push(x);
    S.items = next; S.missing = false;
    cachePut(); setNet('ok'); ensureMember(); renderAll();
  } catch (e) { console.warn('pull failed', e); setNet('off'); }
}
function subscribe() {
  if (!REMOTE) return;
  if (chan) { sb.removeChannel(chan); chan = null; }
  const id = S.tripId; if (!id) return;
  chan = sb.channel('trip-' + id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: 'trip_id=eq.' + id }, (p) => {
      const r = p.new; if (!r || !r.id || S.tripId !== id || pending('item', r.id)) return;
      S.items = S.items.filter((x) => x.id !== r.id);
      if (!r.deleted) S.items.push(rowToItem(r));
      cachePut(); renderAll();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trips', filter: 'id=eq.' + id }, (p) => {
      const r = p.new; if (!r || !r.data || S.tripId !== id || pending('trip', id)) return;
      S.trip = r.data; cachePut(); renderAll();
    })
    .subscribe((st) => { if (st === 'SUBSCRIBED') pull(); });
}

function saveTrip() { cachePut(); queue({ k: 'trip', id: S.tripId, data: S.trip }); renderAll(); }
function saveItem(it, quiet) {
  const i = S.items.findIndex((x) => x.id === it.id);
  if (i >= 0) S.items[i] = it; else S.items.push(it);
  cachePut(); queue({ k: 'item', id: it.id, trip_id: S.tripId, data: itemData(it), deleted: false });
  if (!quiet) renderAll();
}
function removeItem(it) {
  S.items = S.items.filter((x) => x.id !== it.id);
  cachePut(); queue({ k: 'item', id: it.id, trip_id: S.tripId, data: itemData(it), deleted: true });
  renderAll();
  toast('삭제했어', '되돌리기', () => saveItem(it));
}
function ensureMember() {
  if (!S.me || !S.trip) return;
  const m = S.trip.members || [];
  if (!m.includes(S.me)) { S.trip.members = m.concat(S.me); cachePut(); queue({ k: 'trip', id: S.tripId, data: S.trip }); }
}

/* ───────── 이동 거리·시간 ───────── */
const rkey = (a, b) => `${a.lat.toFixed(5)},${a.lng.toFixed(5)};${b.lat.toFixed(5)},${b.lng.toFixed(5)}`;
const routeQ = []; let routeBusy = false;
function roadInfo(a, b) {
  const key = rkey(a, b), straight = Geo.hav(a.lat, a.lng, b.lat, b.lng);
  const c = routes[key];
  if (c) return { d: c.d, t: c.t, straight, exact: true };
  if (straight > 30 && straight < 400000 && !routeQ.includes(key) && routes[key] !== 0) { routeQ.push(key); pumpRoutes(); }
  const d = straight * 1.35;
  return { d, t: d / 6.9 + 90, straight, exact: false }; // 시내 평균 약 25km/h 가정
}
async function pumpRoutes() {
  if (routeBusy) return; routeBusy = true;
  let changed = false;
  while (routeQ.length) {
    const key = routeQ[0];
    const [p1, p2] = key.split(';').map((s) => s.split(',').map(Number));
    try {
      const base = CFG.ROUTER_URL || 'https://router.project-osrm.org/route/v1/driving/';
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 7000);
      const res = await fetch(`${base}${p1[1]},${p1[0]};${p2[1]},${p2[0]}?overview=false`, { signal: ctl.signal });
      clearTimeout(tm);
      const j = await res.json();
      if (j.code === 'Ok' && j.routes && j.routes[0]) { routes[key] = { d: j.routes[0].distance, t: j.routes[0].duration }; changed = true; }
      else routes[key] = 0;
    } catch (e) { routeQ.length = 0; break; } // 연결 안 되면 추정치로 계속 보여줌
    routeQ.shift();
    await new Promise((r) => setTimeout(r, 250));
  }
  routeBusy = false;
  if (changed) { const keys = Object.keys(routes); if (keys.length > 600) keys.slice(0, 200).forEach((k) => delete routes[k]); ls.set('routes', routes); renderList(); }
}
function legInfo(a, b, set) {
  const r = roadInfo(a, b);
  const walkD = Math.min(r.d, r.straight * 1.3);
  const mode = (set && set.mode) || (walkD <= 1200 ? 'walk' : 'taxi');
  let dist = r.d, min;
  if (mode === 'walk') { dist = walkD; min = walkD / 75; }
  else if (mode === 'taxi') min = (r.t * 1.25) / 60 + 3; // 신호·정체 여유 + 잡는 시간
  else min = (r.t * 1.7) / 60 + 10; // 대중교통은 대략치
  const manual = set && set.min > 0;
  if (manual) min = set.min;
  return { mode, dist, min, exact: r.exact, manual };
}
const amapNav = (a, b, mode) => `https://uri.amap.com/navigation?from=${a.lng},${a.lat},${encodeURIComponent(a.title || '출발')}&to=${b.lng},${b.lat},${encodeURIComponent(b.title || '도착')}&mode=${{ walk: 'walk', taxi: 'car', transit: 'bus' }[mode] || 'car'}&coordinate=wgs84&callnative=1&src=trip`;
const amapMarker = (p) => `https://uri.amap.com/marker?position=${p.lng},${p.lat}&name=${encodeURIComponent(p.local || p.title || '')}&coordinate=wgs84&callnative=1&src=trip`;

/* ───────── 일정 계산 ───────── */
const hasLoc = (x) => typeof x.lat === 'number' && typeof x.lng === 'number';
function dayItems(day) {
  const days = tripDays(S.trip);
  return S.items.filter((x) => x.kind !== 'expense' && (day === 'none' ? !x.day || !days.includes(x.day) : x.day === day))
    .sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.id).localeCompare(String(b.id)));
}
function hotelAnchors(day) {
  const hotels = S.items.filter((x) => x.kind === 'hotel' && hasLoc(x) && x.day);
  const out = (x) => x.out || addDays(x.day, 1);
  return {
    start: hotels.find((x) => x.day < day && day <= out(x)) || null,
    end: hotels.find((x) => x.day <= day && day < out(x)) || null,
  };
}
/* 하루치를 [항목/숙소 앵커/이동구간] 순서로 풀어낸다 */
function buildDay(day) {
  const items = dayItems(day), seq = [];
  if (day !== 'none' && items.length) {
    const an = hotelAnchors(day);
    if (an.start && items[0].id !== an.start.id) seq.push({ anchor: 'start', it: an.start });
    items.forEach((it) => seq.push({ it }));
    if (an.end && items[items.length - 1].id !== an.end.id) seq.push({ anchor: 'end', it: an.end });
  } else items.forEach((it) => seq.push({ it }));
  let n = 0, dist = 0, min = 0;
  seq.forEach((s, i) => {
    if (!s.anchor && hasLoc(s.it)) s.n = ++n;
    const prev = seq[i - 1];
    if (prev && day !== 'none' && hasLoc(prev.it) && hasLoc(s.it)) {
      s.leg = legInfo(prev.it, s.it, s.anchor ? null : s.it.leg); s.from = prev.it;
      dist += s.leg.dist; min += s.leg.min;
    }
  });
  return { seq, items, dist, min };
}
const toKRW = (it) => (it.cur === 'KRW' ? it.cost : it.cost * (S.trip.rate || 200));
const costItems = () => S.items.filter((x) => x.cost > 0);

/* ───────── 화면: 홈 ───────── */
function renderHome() {
  $('trip').hidden = true; $('home').hidden = false;
  $('btnMe').textContent = S.me ? `${S.me} ✎` : '이름 정하기';
  const list = $('homeList'); list.replaceChildren();
  const ids = known().slice().sort((x, y) => { const a = cacheGet(x), b = cacheGet(y); return String((a && a.trip && a.trip.start) || '9').localeCompare(String((b && b.trip && b.trip.start) || '9')); });
  ids.forEach((id) => {
    const c = cacheGet(id); const t = c && c.trip;
    list.append(h('button', { class: 'trip-card', onclick: () => go(id) },
      h('div', { class: 'em' }, (t && t.emoji) || '✈️'),
      h('div', null, h('b', null, t ? t.title : '불러오는 중…'), h('span', null, t ? `${mdw(t.start)} – ${mdw(t.end)} · ${(t.members || []).length}명` : id)),
      t ? h('div', { class: 'dday' }, dday(t)) : null));
  });
  if (!ids.length) list.append(h('div', { class: 'empty' }, h('b', null, '아직 여행이 없어'), '새 여행을 만들거나, 친구가 보낸 링크로 들어와줘'));
  $('homeHint').textContent = REMOTE ? '' : '데모 모드 — 지금은 이 기기에만 저장돼. Supabase를 연결하면 친구들과 실시간으로 같이 짤 수 있어.';
}

/* ───────── 화면: 여행 ───────── */
function renderAll() {
  if (!S.tripId) return renderHome();
  $('home').hidden = true; $('trip').hidden = false;
  const t = S.trip;
  if (!t) {
    $('tTitle').textContent = S.missing ? '여행을 찾을 수 없어' : '불러오는 중…'; $('tSub').textContent = '';
    $('list').replaceChildren(h('div', { class: 'empty' }, S.missing ? '링크가 잘못됐거나 삭제된 여행이야' : (S.net === 'off' ? '인터넷 연결을 확인해줘' : '')));
    $('dayBar').replaceChildren(); $('dayTools').replaceChildren(); renderStatus(); return;
  }
  $('tTitle').textContent = t.title;
  $('tSub').textContent = `${mdw(t.start)} – ${mdw(t.end)} · ${dday(t)} · ${(t.members || []).join(', ') || '멤버 없음'}`;
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
  $('planView').hidden = S.tab !== 'plan'; $('costView').hidden = S.tab !== 'cost';
  $('fab').textContent = S.tab === 'cost' ? '+ 비용 추가' : '+ 일정 추가';
  renderStatus();
  if (S.tab === 'plan') { renderDayBar(); renderList(); drawMap(); } else renderCost();
}
function renderStatus() {
  const el = $('status'); if (!el) return;
  let msg = '', off = false;
  if (!REMOTE) msg = '데모 모드 · 이 기기에만 저장돼 (Supabase 연결 전)';
  else if (S.net === 'off' || !navigator.onLine) { off = true; msg = '오프라인 · 마지막으로 불러온 일정이야.' + (outbox.length ? ` 수정한 ${outbox.length}건은 연결되면 자동 반영돼.` : ' 수정하면 연결될 때 자동 반영돼.'); }
  el.hidden = !msg || !S.tripId; el.textContent = msg; el.classList.toggle('off', off);
}
function renderDayBar() {
  const days = tripDays(S.trip), bar = $('dayBar');
  if (S.day !== 'all' && S.day !== 'none' && !days.includes(S.day)) S.day = 'all';
  const mk = (key, label, small) => h('button', { class: S.day === key ? 'on' : '', onclick: () => { S.day = key; S.fit = true; S.reorder = false; renderAll(); } }, label, small ? h('small', null, small) : null);
  const noneN = dayItems('none').length;
  bar.replaceChildren(mk('all', '전체'), ...days.map((d, i) => mk(d, 'Day ' + (i + 1), mdw(d))), mk('none', '보관함', noneN ? String(noneN) : ''));
}
function renderList() {
  if (!S.trip || S.tab !== 'plan') return;
  const days = tripDays(S.trip), list = $('list'), tools = $('dayTools');
  const show = S.day === 'all' ? days : [S.day];
  list.replaceChildren(); let total = 0;
  show.forEach((day) => {
    const b = buildDay(day); total += b.items.length;
    const di = days.indexOf(day), color = day === 'none' ? '#9a9da2' : DAY_COLORS[di % DAY_COLORS.length];
    const sum = b.items.reduce((s, x) => s + (x.cost > 0 ? toKRW(x) : 0), 0);
    const info = [b.dist ? '이동 ' + fmtDist(b.dist) + ' · ' + fmtMin(b.min) : '', sum ? won(sum) : ''].filter(Boolean).join(' · ');
    list.append(h('div', { class: 'day-h' }, h('b', null, day === 'none' ? '보관함' : 'Day ' + (di + 1)), h('span', null, day === 'none' ? '날짜 미정 · 가고 싶은 곳' : mdw(day)), h('i', null, info)));
    if (!b.items.length) {
      list.append(h('div', { class: 'empty' }, S.day === 'all' ? '아직 일정이 없어' : h('b', null, day === 'none' ? '찜해둔 곳이 없어' : '이 날 일정이 비어있어'), S.day === 'all' ? '' : '아래 + 버튼으로 추가해줘'));
      return;
    }
    b.seq.forEach((s, i) => {
      const it = s.it, last = i === b.seq.length - 1;
      const right = [];
      if (s.leg) {
        const m = MODES[s.leg.mode];
        right.push(h('button', { class: 'leg', onclick: () => (s.anchor ? window.open(amapNav(s.from, it, s.leg.mode), '_blank') : legSheet(it, s.from, s.leg)) },
          m.e, ' ', m.n, ' ', h('b', null, (s.leg.manual ? '' : '약 ') + fmtMin(s.leg.min)), ' · ', fmtDist(s.leg.dist), s.leg.exact || s.leg.mode === 'walk' ? '' : ' (직선 추정)', h('span', { class: 'go' }, s.anchor ? '길찾기 ›' : '변경 ›')));
      }
      if (s.anchor) {
        right.push(h('div', { class: 'anchor' }, s.anchor === 'start' ? '🏨 숙소에서 출발 · ' : '🏨 숙소로 복귀 · ', it.title));
      } else {
        const k = KIND[it.kind] || KIND.etc;
        const card = h('button', { class: 'card' + (S.hl === it.id ? ' hl' : ''), id: 'c-' + it.id, onclick: () => editSheet(it) },
          h('div', { class: 't1' }, it.time ? h('span', { class: 'time' }, it.time) : null, h('span', { class: 'ttl' }, it.title || '(이름 없음)')),
          h('div', { class: 'kind' }, k.e + ' ' + k.n, it.local && it.local !== it.title ? ' · ' + it.local : '', it.kind === 'hotel' && it.day ? ` · ${md(it.day)}~${md(it.out || addDays(it.day, 1))}` : ''),
          it.memo ? h('div', { class: 'memo' }, it.memo) : null,
          h('div', { class: 'meta' },
            it.cost > 0 ? h('span', { class: 'chip cost' }, money(it.cost, it.cur) + (it.payer ? ' · ' + it.payer + ' 결제' : '')) : null,
            it.costNote ? h('span', { class: 'chip cost' }, it.costNote) : null,
            !hasLoc(it) && it.kind !== 'move' && it.kind !== 'etc' ? h('span', { class: 'chip warn' }, '위치 없음') : null,
            it.by ? h('span', { class: 'chip' }, it.by) : null));
        if (S.reorder && S.day !== 'all') {
          const idx = b.items.indexOf(it);
          right.push(h('div', { class: 'card-wrap' }, card, h('div', { class: 'ord' },
            h('button', { disabled: idx === 0, onclick: () => move(b.items, idx, -1) }, '▲'),
            h('button', { disabled: idx === b.items.length - 1, onclick: () => move(b.items, idx, 1) }, '▼'))));
        } else right.push(card);
      }
      list.append(h('div', { class: 'row' + (last ? ' last' : '') },
        h('div', { class: 'rail' }, h('div', { class: 'dot' + (s.n ? '' : ' none'), style: s.n ? 'background:' + color : '' }, s.n || (s.anchor ? '🏨' : '·'))),
        h('div', { style: 'min-width:0' }, right)));
    });
  });
  tools.replaceChildren(
    h('span', null, S.day === 'all' ? `전체 ${total}곳` : `${total}곳`),
    S.day !== 'all' && total > 1 ? h('button', { onclick: () => { S.reorder = !S.reorder; renderList(); } }, S.reorder ? '순서 편집 완료' : '순서 편집') : h('span'));
}
function move(arr, idx, dir) {
  const a = arr[idx], b = arr[idx + dir]; if (!a || !b) return;
  arr.forEach((x, i) => { x._o = i + 1; });
  [a._o, b._o] = [b._o, a._o];
  arr.forEach((x) => { const o = x._o; delete x._o; if (x.order !== o) { x.order = o; saveItem(x, true); } });
  renderAll();
}

/* ───────── 지도 ───────── */
let map = null, layerG = null, tileL = null, pickMap = null, pickTile = null;
const TILES = {
  amap: { url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', opt: { subdomains: '1234', maxZoom: 18, attribution: '© 高德地图' }, name: '高德' },
  osm: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', opt: { maxZoom: 19, attribution: '© OpenStreetMap' }, name: 'OSM' },
};
const toMap = (lat, lng) => (S.layer === 'amap' ? Geo.toGcj(lat, lng) : [lat, lng]);
const fromMap = (lat, lng) => (S.layer === 'amap' ? Geo.toWgs(lat, lng) : [lat, lng]);
function setTiles(m, old) { if (old) m.removeLayer(old); const t = TILES[S.layer] || TILES.osm; return L.tileLayer(t.url, t.opt).addTo(m); }
function initMap() {
  if (map || !window.L) return;
  map = L.map('map', { zoomControl: false, attributionControl: true }).setView([37.5, 121.5], 9);
  map.attributionControl.setPrefix('');
  tileL = setTiles(map); layerG = L.layerGroup().addTo(map);
}
function drawMap() {
  $('mapWrap').classList.toggle('small', !!S.mapSmall);
  $('btnMapSize').textContent = S.mapSmall ? '지도 펼치기' : '지도 접기';
  $('btnLayer').textContent = '지도: ' + (TILES[S.layer] || TILES.osm).name + ' ⇄';
  $('btnLayer').hidden = !!S.mapSmall;
  if (S.mapSmall || !S.trip || !window.L) return;
  initMap(); map.invalidateSize(); layerG.clearLayers();
  const days = tripDays(S.trip), show = S.day === 'all' ? days : [S.day], pts = [];
  show.forEach((day) => {
    const b = buildDay(day), di = days.indexOf(day), color = day === 'none' ? '#9a9da2' : DAY_COLORS[di % DAY_COLORS.length], line = [];
    b.seq.forEach((s) => {
      if (!hasLoc(s.it)) return;
      const ll = toMap(s.it.lat, s.it.lng); line.push(ll); pts.push(ll);
      if (s.anchor) return;
      const icon = L.divIcon({ className: '', iconSize: [28, 28], iconAnchor: [14, 14], html: `<div class="mk${S.hl === s.it.id ? ' hl' : ''}" style="background:${color}">${s.n}</div>` });
      L.marker(ll, { icon, zIndexOffset: S.hl === s.it.id ? 1000 : 0 }).addTo(layerG).on('click', () => focusItem(s.it.id));
    });
    if (day !== 'none' && line.length > 1) L.polyline(line, { color, weight: 3, opacity: 0.75, dashArray: '1 7', lineCap: 'round' }).addTo(layerG);
  });
  if (S.fit) {
    S.fit = false;
    if (pts.length > 1) map.fitBounds(pts, { padding: [36, 36], maxZoom: 15 });
    else if (pts.length === 1) map.setView(pts[0], 14);
    else if (typeof S.trip.lat === 'number') map.setView(toMap(S.trip.lat, S.trip.lng), 11);
  }
}
function focusItem(id) {
  S.hl = id; renderList(); drawMap();
  const el = $('c-' + id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ───────── 비용 ───────── */
function settle(items, members) {
  const bal = {}; members.forEach((m) => { bal[m] = 0; });
  items.forEach((it) => {
    const share = (it.split && it.split.length ? it.split : members).filter(Boolean); if (!share.length) return;
    const amt = toKRW(it);
    bal[it.payer] = (bal[it.payer] || 0) + amt;
    share.forEach((m) => { bal[m] = (bal[m] || 0) - amt / share.length; });
  });
  const pos = [], neg = [];
  Object.entries(bal).forEach(([m, v]) => { if (v > 1) pos.push([m, v]); else if (v < -1) neg.push([m, -v]); });
  pos.sort((a, b) => b[1] - a[1]); neg.sort((a, b) => b[1] - a[1]);
  const out = [];
  while (pos.length && neg.length) {
    const p = pos[0], n = neg[0], x = Math.min(p[1], n[1]);
    out.push({ from: n[0], to: p[0], amt: x }); p[1] -= x; n[1] -= x;
    if (p[1] < 1) pos.shift(); if (n[1] < 1) neg.shift();
  }
  return out;
}
function renderCost() {
  const v = $('costView'), t = S.trip, items = costItems(), members = t.members || [], days = tripDays(t);
  const total = items.reduce((s, x) => s + toKRW(x), 0);
  const cny = items.filter((x) => x.cur !== 'KRW').reduce((s, x) => s + x.cost, 0);
  const krw = items.filter((x) => x.cur === 'KRW').reduce((s, x) => s + x.cost, 0);
  const rateIn = h('input', { type: 'number', inputMode: 'decimal', value: t.rate || 200, onchange: (e) => { const r = parseFloat(e.target.value); if (r > 0) { S.trip.rate = r; saveTrip(); } } });
  v.replaceChildren(h('div', { class: 'box' },
    h('h3', null, '총 비용 (원화 환산)'), h('div', { class: 'big' }, won(total)),
    h('div', { class: 'subline' }, [cny ? yuan(cny) : '', krw ? won(krw) : ''].filter(Boolean).join(' + ') || '아직 입력한 비용이 없어', members.length > 1 && total ? ` · 1인당 약 ${won(total / members.length)} (${members.length}명)` : ''),
    h('div', { class: 'rate' }, '환율  1위안 =', rateIn, '원', h('span', { class: 'hint' }, '(직접 수정)'))));

  const paid = items.filter((x) => x.payer), tr = settle(paid, members);
  if (items.length) {
    v.append(h('div', { class: 'box' }, h('h3', null, '정산'),
      tr.length ? tr.map((x) => h('div', { class: 'settle' }, h('b', null, x.from), ' → ', h('b', null, x.to), '  ', won(x.amt)))
        : h('div', { class: 'subline' }, paid.length ? '주고받을 돈이 없어' : '비용에 "결제한 사람"을 넣으면 누가 누구에게 얼마 보내면 되는지 계산해줄게'),
      items.length > paid.length ? h('p', { class: 'hint', style: 'margin-top:10px' }, `결제한 사람이 없는 ${items.length - paid.length}건은 정산에서 빠져 있어 (예상 비용)`) : null));
    const group = (title, rows) => rows.length && v.append(h('div', { class: 'box' }, h('h3', null, title),
      rows.map(([label, amt]) => h('div', { class: 'kv', style: 'display:block' }, h('div', { style: 'display:flex;justify-content:space-between' }, h('span', null, label), h('b', null, won(amt))), h('div', { class: 'bar' }, h('i', { style: `width:${total ? Math.max(2, (amt / total) * 100) : 0}%` }))))));
    const sumBy = (fn) => { const m = new Map(); items.forEach((x) => { const k = fn(x); m.set(k, (m.get(k) || 0) + toKRW(x)); }); return m; };
    const byDay = sumBy((x) => (days.includes(x.day) ? x.day : '')), byKind = sumBy((x) => x.kind);
    group('날짜별', [...days.filter((d) => byDay.has(d)).map((d, i) => [`Day ${days.indexOf(d) + 1} · ${mdw(d)}`, byDay.get(d)]), ...(byDay.has('') ? [['날짜 미정', byDay.get('')]] : [])]);
    group('종류별', [...byKind.entries()].sort((a, b) => b[1] - a[1]).map(([k, a]) => [(KIND[k] || KIND.etc).e + ' ' + (KIND[k] || KIND.etc).n, a]));
    v.append(h('div', { class: 'box' }, h('h3', null, `내역 ${items.length}건`),
      items.slice().sort((a, b) => String(a.day || '9').localeCompare(String(b.day || '9')) || (a.order || 0) - (b.order || 0)).map((x) =>
        h('button', { class: 'kv cost-row', onclick: () => editSheet(x) },
          h('span', null, (KIND[x.kind] || KIND.etc).e + ' ' + (x.title || '(이름 없음)'), h('small', null, [x.day && days.includes(x.day) ? md(x.day) : '날짜 미정', x.payer ? x.payer + ' 결제' : '결제자 미정', x.costNote].filter(Boolean).join(' · '))),
          h('b', null, money(x.cost, x.cur))))));
  } else v.append(h('div', { class: 'empty' }, h('b', null, '비용을 추가해봐'), '일정에 금액을 적거나, 아래 버튼으로 비용만 따로 넣을 수 있어'));
}

/* ───────── 시트 공통 ───────── */
function openSheet(...kids) { const s = $('sheet'); s.replaceChildren(...kids); s.hidden = false; $('sheetBg').hidden = false; s.scrollTop = 0; }
function closeSheet() { $('sheet').hidden = true; $('sheetBg').hidden = true; }
let toastT = null;
function toast(msg, act, fn) {
  const el = $('toast'); clearTimeout(toastT);
  el.replaceChildren(h('span', null, msg), act ? h('button', { onclick: () => { el.hidden = true; fn(); } }, act) : null);
  el.hidden = false; toastT = setTimeout(() => { el.hidden = true; }, act ? 6000 : 2500);
}
const field = (label, ...kids) => h('div', { class: 'f' }, label ? h('label', null, label) : null, kids);

/* ───────── 장소 검색 ───────── */
/* 한국어 이름 → 중국어 이름 사전. [중국어, 한국어 표시명, 다른 한국어 표기…] */
const KO_PLACES = {
  '大连': [
    ['星海广场', '성해광장', '싱하이광장'], ['星海公园', '성해공원', '싱하이공원'], ['星海湾大桥', '성해만대교', '싱하이만대교'],
    ['俄罗斯风情街', '러시아거리', '러시아풍정거리', '러시아풍경거리'], ['中山广场', '중산광장', '중산광장'], ['人民广场', '인민광장'],
    ['东港音乐喷泉广场', '동항 음악분수', '둥강음악분수', '동항분수', '동항'], ['大连东方水城', '동방수성', '베니스수성', '베네치아수성', '동방베니스'],
    ['老虎滩海洋公园', '노호탄 해양공원', '라오후탄', '노호탄'], ['棒棰岛', '방추도', '방추이다오', '빵추이다오'], ['滨海路', '빈해로', '빈하이루'],
    ['大连渔人码头', '어인마두', '피셔맨스워프', '위런마터우', '어부부두'], ['圣亚海洋世界', '성아해양세계', '셩야해양세계', '성야해양세계'],
    ['金石滩', '금석탄', '진스탄'], ['大连发现王国', '발현왕국', '디스커버리랜드', '디스커버리킹덤'], ['旅顺日俄监狱旧址', '여순감옥', '뤼순감옥'],
    ['旅顺口区', '여순', '뤼순'], ['旅顺火车站', '여순역', '뤼순역'], ['二〇三高地', '203고지', '이령삼고지'], ['白玉山', '백옥산', '바이위산'],
    ['青泥洼桥', '청니와교', '칭니와차오'], ['天津街', '천진가', '톈진제', '천진거리'], ['西安路', '서안로', '시안루'], ['东关街', '동관가', '둥관제'],
    ['大连站', '대련역', '다롄역'], ['大连北站', '대련북역', '다롄북역'], ['大连周水子国际机场', '대련공항', '다롄공항', '저우수이쯔공항', '주수자공항'],
    ['劳动公园', '노동공원', '라오둥공원'], ['大连森林动物园', '삼림동물원', '대련동물원'], ['莲花山观景台', '연화산 전망대', '연화산', '롄화산'],
    ['大连博物馆', '대련박물관'], ['大连自然博物馆', '자연박물관'], ['付家庄公园', '부가장', '푸자좡'], ['和平广场', '화평광장', '허핑광장'],
    ['大连柏威年', '파빌리온', '백위년'], ['大连恒隆广场', '항륭광장', '헝룽광장', '올림피아66'], ['罗斯福购物中心', '루스벨트쇼핑센터', '나사복', '뤄쓰푸'],
    ['友好广场', '우호광장', '유하오광장'], ['港湾广场', '항만광장'], ['大连电视塔', '대련TV타워', '전시탑', '티비타워'], ['燕窝岭', '연와령', '옌워링'],
    ['北大桥', '북대교', '베이다차오'], ['大连理工大学', '대련이공대학', '대련이공대'], ['黑石礁', '흑석초', '헤이스자오'], ['高新园区', '고신원구', '하이테크존'],
  ],
  '烟台': [
    ['烟台山公园', '연태산', '옌타이산', '연태산공원'], ['朝阳街', '조양가', '차오양제', '조양거리'], ['所城里', '소성리', '쒀청리'],
    ['养马岛', '양마도', '양마다오'], ['蓬莱阁', '봉래각', '펑라이거', '펑라이각'], ['八仙过海景区', '팔선과해', '바셴궈하이'], ['三仙山', '삼선산', '싼셴산'],
    ['张裕酒文化博物馆', '장유와인박물관', '장위와인박물관', '장유박물관', '장위박물관'], ['烟台大学', '연태대학', '옌타이대학'],
    ['烟台第一海水浴场', '제1해수욕장', '제일해수욕장'], ['烟台金沙滩', '금사탄', '진사탄'], ['烟台渔人码头', '어인마두', '피셔맨스워프', '위런마터우'],
    ['月亮湾', '월량만', '웨량완'], ['东炮台', '동포대', '둥파오타이'], ['烟台蓬莱国际机场', '연태공항', '옌타이공항', '펑라이공항', '봉래공항'],
    ['烟台站', '연태역', '옌타이역'], ['烟台南站', '연태남역', '옌타이남역'], ['烟台大悦城', '조이시티', '대열성', '다웨청'], ['万达广场', '완다광장', '만달광장'],
    ['滨海广场', '빈해광장', '빈하이광장'], ['昆嵛山', '곤유산', '쿤위산'], ['长岛', '장도', '창다오'], ['南山公园', '남산공원'], ['毓璜顶公园', '육황정', '위황딩'],
    ['海昌鲸鲨海洋公园', '해창해양공원', '해창'], ['烟台博物馆', '연태박물관'], ['芝罘岛', '지부도', '즈푸다오'], ['黄海明珠', '황해명주'],
    ['威海', '위해', '웨이하이'], ['刘公岛', '유공도', '류궁다오'], ['蓬莱', '봉래', '펑라이'], ['莱山区', '래산구', '라이산'], ['芝罘区', '지부구', '즈푸구'],
  ],
};
const hasHangul = (s) => /[가-힣]/.test(s);
function koAliases(q, t) {
  const nq = q.replace(/\s+/g, ''); if (nq.length < 2) return [];
  const cities = Object.keys(KO_PLACES).sort((a, b) => (b === (t.cityZh || '')) - (a === (t.cityZh || '')));
  const exact = [], part = [];
  cities.forEach((c) => KO_PLACES[c].forEach((e) => {
    const al = e.slice(1).map((x) => x.replace(/\s+/g, ''));
    if (al.includes(nq)) exact.push({ zh: e[0], ko: e[1], city: c });
    else if (al.some((a) => a.includes(nq) || nq.includes(a))) part.push({ zh: e[0], ko: e[1], city: c });
  }));
  return exact.concat(part).slice(0, 3);
}
async function nomi(query, t, bias) {
  let u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&namedetails=1&accept-language=ko,zh-CN,en&q=${encodeURIComponent(query)}`;
  if (bias && typeof t.lat === 'number') u += `&viewbox=${t.lng - 0.9},${t.lat + 0.7},${t.lng + 0.9},${t.lat - 0.7}`;
  const res = await fetch(u); if (!res.ok) throw new Error('search ' + res.status);
  return res.json();
}
/* 한국어 위키백과에서 좌표가 있는 문서를 찾는다 (한국어 이름 검색 보조) */
async function wikiKo(q, t) {
  const u = `https://ko.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrlimit=8&gsrsearch=${encodeURIComponent(q)}&prop=coordinates%7Clanglinks%7Cdescription&lllang=zh&lllimit=max&colimit=max`;
  const j = await (await fetch(u)).json();
  const pages = Object.values((j.query && j.query.pages) || {}).filter((p) => p.coordinates && p.coordinates[0]).sort((a, b) => (a.index || 0) - (b.index || 0));
  let out = pages.map((p) => ({ title: p.title, local: (p.langlinks && p.langlinks[0] && p.langlinks[0]['*']) || '', sub: p.description || '위키백과', lat: p.coordinates[0].lat, lng: p.coordinates[0].lon }));
  if (typeof t.lat === 'number') { const near = out.filter((r) => Geo.hav(t.lat, t.lng, r.lat, r.lng) < 400000); if (near.length) out = near; }
  return out;
}
async function searchPlaces(q, t) {
  const out = [], seen = new Set();
  const push = (r) => { const k = r.lat.toFixed(4) + ',' + r.lng.toFixed(4); if (!seen.has(k) && isFinite(r.lat) && isFinite(r.lng)) { seen.add(k); out.push(r); } };
  const ko = hasHangul(q), alias = ko ? koAliases(q, t) : [];
  if (CFG.AMAP_KEY) {
    try {
      const kw = alias.length ? alias[0].zh : q;
      const u = `https://restapi.amap.com/v3/place/text?key=${CFG.AMAP_KEY}&keywords=${encodeURIComponent(kw)}&city=${encodeURIComponent((alias[0] && alias[0].city) || t.cityZh || '')}&offset=10&page=1&extensions=base`;
      const j = await (await fetch(u)).json();
      (j.pois || []).forEach((p, i) => {
        const [lng, lat] = String(p.location || '').split(',').map(Number); if (!lat) return;
        const [wl, wn] = Geo.toWgs(lat, lng);
        push({ title: alias.length && i === 0 ? alias[0].ko : p.name, local: p.name, sub: [p.cityname, p.adname, typeof p.address === 'string' ? p.address : ''].filter(Boolean).join(' '), lat: wl, lng: wn });
      });
      if (out.length) return out;
    } catch (e) { console.warn('amap search failed', e); }
  }
  const fromRow = (r, koName) => {
    const parts = String(r.display_name || '').split(',').map((s) => s.trim());
    const nd = r.namedetails || {}, zh = nd['name:zh'] || nd.name || '';
    const title = koName || nd['name:ko'] || r.name || parts[0];
    return { title, local: zh && zh !== title ? zh : '', sub: parts.slice(1, 5).join(', '), lat: parseFloat(r.lat), lng: parseFloat(r.lon) };
  };
  let failed = 0, tried = 0;
  const attempt = async (fn) => { tried++; try { return await fn(); } catch (e) { failed++; console.warn('search step failed', e); return []; } };
  // 1) 한국어 이름이 사전에 있으면 중국어 이름으로 바꿔서 찾는다
  for (const a of alias) {
    const same = !t.cityZh || a.city === t.cityZh;
    let rows = await attempt(() => nomi(a.zh, t, same));
    if (!rows.length) rows = await attempt(() => nomi(a.zh + ' ' + a.city, t, false));
    rows.slice(0, 3).forEach((r, i) => { const x = fromRow(r, i === 0 ? a.ko : ''); if (!x.local) x.local = a.zh; push(x); });
  }
  // 2) 입력한 그대로 찾는다
  if (!out.length) {
    let rows = await attempt(() => nomi(q, t, true));
    if (!rows.length && (t.cityZh || t.city)) rows = await attempt(() => nomi(q + ' ' + (t.cityZh || t.city), t, false));
    rows.forEach((r) => push(fromRow(r)));
  }
  // 3) 한국어인데 아직 못 찾았으면 한국어 위키백과에서 찾는다
  if (ko && out.length < 3) {
    let rows = await attempt(() => wikiKo(q, t));
    if (!rows.length && t.city && !q.includes(t.city)) rows = await attempt(() => wikiKo(t.city + ' ' + q, t));
    rows.forEach(push);
  }
  if (!out.length && failed === tried) throw new Error('search unreachable');
  return out;
}

/* ───────── 일정 추가/수정 시트 ───────── */
function editSheet(src, preset) {
  const t = S.trip, days = tripDays(t), isNew = !src;
  const defDay = S.day !== 'all' && S.day !== 'none' ? S.day : S.day === 'none' ? '' : (days[0] || '');
  const d = Object.assign({ id: S.tripId + '-' + rid(10), kind: 'spot', title: '', day: defDay, cur: 'CNY' }, preset || {}, src ? JSON.parse(JSON.stringify(src)) : {});
  const members = t.members || [];

  const kindBox = h('div', { class: 'chips' });
  const locBox = h('div'), resBox = h('div'), outBox = h('div'), splitBox = h('div', { class: 'chips' }), placeWrap = h('div');
  const title = h('input', { type: 'text', value: d.title || '', placeholder: '장소 이름 (예: 성해광장, 러시아거리)', enterKeyHint: 'search', oninput: (e) => { d.title = e.target.value; },
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } } });
  const searchBtn = h('button', { class: 'btn-ghost fit', onclick: doSearch }, '검색');

  function paintKinds() {
    kindBox.replaceChildren(...KINDS.map((k) => h('button', { class: d.kind === k.k ? 'on' : '', onclick: () => { d.kind = k.k; paintKinds(); paintLoc(); paintOut(); } }, k.e + ' ' + k.n)));
    searchBtn.hidden = d.kind === 'expense';
    title.placeholder = d.kind === 'expense' ? '무엇에 쓴 비용인지 (예: 택시비, 환전)' : '장소 이름 (예: 성해광장, 러시아거리)';
  }
  function paintLoc() {
    if (d.kind === 'expense') { locBox.replaceChildren(); resBox.replaceChildren(); return; }
    locBox.replaceChildren(h('div', { class: 'loc' },
      hasLoc(d) ? [h('b', null, '📍 위치 지정됨'), d.local ? ' · ' + d.local : '', d.addr ? h('div', null, d.addr) : null] : '위치가 없으면 지도·거리 계산에서 빠져. 검색하거나 지도에서 찍어줘.',
      h('div', { class: 'acts' },
        h('button', { class: 'btn-ghost', onclick: () => pickOnMap(d, () => { d.addr = ''; paintLoc(); }) }, hasLoc(d) ? '지도에서 다시 지정' : '지도에서 지정'),
        hasLoc(d) ? h('a', { class: 'btn-ghost', href: amapMarker(d), target: '_blank', rel: 'noopener', style: 'text-decoration:none;color:inherit' }, '高德지도에서 보기') : null,
        hasLoc(d) ? h('button', { class: 'btn-ghost', onclick: () => { delete d.lat; delete d.lng; delete d.local; delete d.addr; paintLoc(); } }, '위치 지우기') : null)));
  }
  async function doSearch() {
    const q = (d.title || '').trim(); if (!q || d.kind === 'expense') return;
    title.blur();
    resBox.replaceChildren(h('div', { class: 'results' }, h('div', { class: 'msg' }, '검색 중…')));
    try {
      const rows = await searchPlaces(q, t);
      if (!rows.length) { resBox.replaceChildren(h('div', { class: 'results' }, h('div', { class: 'msg' }, '결과가 없어. 띄어쓰기를 바꾸거나 더 짧게(예: "성해"), 또는 한자·영어 이름으로 다시 검색해줘. "지도에서 지정"으로 직접 찍어도 돼.'))); return; }
      resBox.replaceChildren(h('div', { class: 'results' }, rows.map((r) => {
        const far = typeof t.lat === 'number' ? Geo.hav(t.lat, t.lng, r.lat, r.lng) : null;
        return h('button', { onclick: () => { d.lat = r.lat; d.lng = r.lng; d.local = r.local || ''; d.addr = r.sub || ''; d.title = r.title; title.value = r.title; resBox.replaceChildren(); paintLoc(); } },
          h('b', null, r.title, r.local ? ' · ' + r.local : ''), h('span', null, [r.sub, far != null ? `${t.city || '중심'}에서 ${fmtDist(far)}` : ''].filter(Boolean).join(' · ')));
      })));
    } catch (e) {
      resBox.replaceChildren(h('div', { class: 'results' }, h('div', { class: 'msg' }, '지금은 장소 검색에 연결이 안 돼. 이름만 적고 "지도에서 지정"으로 위치를 찍을 수 있어.')));
    }
  }
  const daySel = h('select', { onchange: (e) => { d.day = e.target.value; paintOut(); } },
    h('option', { value: '' }, '보관함 (날짜 미정)'), days.map((x, i) => h('option', { value: x }, `Day ${i + 1} · ${mdw(x)}`)));
  daySel.value = days.includes(d.day) ? d.day : '';
  d.day = daySel.value;
  function paintOut() {
    if (d.kind !== 'hotel' || !d.day) { outBox.replaceChildren(); return; }
    const opts = []; for (let x = addDays(d.day, 1); x <= addDays(t.end, 1) && opts.length < 30; x = addDays(x, 1)) opts.push(x);
    if (!opts.includes(d.out)) d.out = t.end > d.day ? t.end : opts[0];
    const sel = h('select', { onchange: (e) => { d.out = e.target.value; } }, opts.map((x) => h('option', { value: x }, mdw(x) + ' 체크아웃')));
    sel.value = d.out;
    outBox.replaceChildren(field('체크아웃 (숙박 기간 동안 매일 숙소 기준으로 거리를 계산해)', sel));
  }
  function paintSplit() {
    const cur = d.split && d.split.length ? d.split : members;
    splitBox.replaceChildren(...members.map((m) => h('button', { class: cur.includes(m) ? 'on' : '', onclick: () => {
      let n = cur.includes(m) ? cur.filter((x) => x !== m) : cur.concat(m);
      if (!n.length) n = [m];
      d.split = n.length === members.length ? null : n; paintSplit();
    } }, m)));
  }
  const payer = h('select', { onchange: (e) => { d.payer = e.target.value || null; } }, h('option', { value: '' }, '미정 (예상 비용)'), members.map((m) => h('option', { value: m }, m)));
  payer.value = members.includes(d.payer) ? d.payer : '';
  const cur = h('select', { class: 'fit', style: 'width:96px;flex:none', onchange: (e) => { d.cur = e.target.value; } }, h('option', { value: 'CNY' }, '¥ 위안'), h('option', { value: 'KRW' }, '₩ 원'));
  cur.value = d.cur || 'CNY';

  paintKinds(); paintLoc(); paintOut(); paintSplit();
  placeWrap.append(h('div', { class: 'rowf' }, title, searchBtn), resBox, locBox);

  openSheet(
    h('h2', null, isNew ? (d.kind === 'expense' ? '비용 추가' : '일정 추가') : '수정'),
    field('종류', kindBox),
    field('이름', placeWrap),
    h('div', { class: 'rowf' },
      field('날짜', daySel),
      field('시간 (선택)', h('input', { type: 'time', value: d.time || '', onchange: (e) => { d.time = e.target.value; } }))),
    outBox,
    field('비용 (선택)', h('div', { class: 'rowf' },
      h('input', { type: 'number', inputMode: 'decimal', placeholder: '금액', value: d.cost > 0 ? d.cost : '', oninput: (e) => { d.cost = parseFloat(e.target.value) || 0; } }), cur)),
    h('div', { class: 'rowf' },
      field('결제한 사람', payer),
      field('비용 메모', h('input', { type: 'text', placeholder: '예: 1인 ¥80 예상', value: d.costNote || '', oninput: (e) => { d.costNote = e.target.value; } }))),
    members.length > 1 ? field('같이 나눌 사람', splitBox) : null,
    field('메모', h('textarea', { placeholder: '예약번호, 영업시간, 꼭 먹을 메뉴…', value: d.memo || '', oninput: (e) => { d.memo = e.target.value; } })),
    h('button', { class: 'btn-primary', style: 'width:100%', onclick: () => {
      d.title = (d.title || '').trim();
      if (!d.title) { toast('이름을 적어줘'); title.focus(); return; }
      if (!d.cost) { delete d.cost; }
      if (d.kind !== 'hotel') delete d.out;
      if (isNew || (src && src.day !== d.day)) d.order = Math.max(0, ...S.items.filter((x) => x.day === d.day).map((x) => x.order || 0)) + 1;
      if (isNew) d.by = S.me;
      if (d.kind === 'expense') S.tab = 'cost'; else if (isNew && S.tab === 'plan' && S.day !== 'all') S.day = d.day || 'none';
      S.hl = d.id; S.fit = true; closeSheet(); saveItem(d);
    } }, '저장'),
    isNew ? null : h('button', { class: 'btn-danger', onclick: () => { closeSheet(); removeItem(src); } }, '삭제'));
}

/* ───────── 이동 구간 시트 ───────── */
function legSheet(it, from, leg) {
  const set = Object.assign({}, it.leg || {});
  const box = h('div', { class: 'chips' });
  const paint = () => box.replaceChildren(
    h('button', { class: !set.mode ? 'on' : '', onclick: () => { delete set.mode; paint(); } }, '자동'),
    ...Object.entries(MODES).map(([k, m]) => h('button', { class: set.mode === k ? 'on' : '', onclick: () => { set.mode = k; paint(); } }, m.e + ' ' + m.n)));
  paint();
  openSheet(h('h2', null, '이동 방법'),
    h('p', { class: 'subline', style: 'margin:-6px 0 14px' }, `${from.title} → ${it.title} · ${fmtDist(leg.dist)}`),
    field('무엇으로 이동해?', box),
    field('걸리는 시간 직접 입력 (분, 선택)', h('input', { type: 'number', inputMode: 'numeric', placeholder: '비워두면 자동 계산', value: set.min || '', oninput: (e) => { set.min = parseInt(e.target.value, 10) || 0; } })),
    h('p', { class: 'hint', style: 'margin-bottom:14px' }, '시간은 도로 거리 기준 어림값이야. 실제 대중교통·택시 시간과 요금은 아래 高德지도에서 정확히 볼 수 있어.'),
    h('a', { class: 'btn-ghost', style: 'display:block;text-align:center;text-decoration:none;color:inherit;margin-bottom:10px', href: amapNav(from, it, set.mode || leg.mode), target: '_blank', rel: 'noopener' }, '高德지도에서 실제 경로 보기'),
    h('button', { class: 'btn-primary', style: 'width:100%', onclick: () => {
      const n = Object.assign({}, it); if (!set.min) delete set.min;
      if (Object.keys(set).length) n.leg = set; else delete n.leg;
      closeSheet(); saveItem(n);
    } }, '저장'));
}

/* ───────── 지도에서 위치 지정 ───────── */
let pickDone = null;
function pickOnMap(d, cb) {
  $('picker').hidden = false;
  if (!pickMap) { pickMap = L.map('pickMap', { zoomControl: true }); pickMap.attributionControl.setPrefix(''); }
  pickTile = setTiles(pickMap, pickTile);
  const c = hasLoc(d) ? [d.lat, d.lng] : (map && !S.mapSmall ? fromMap(map.getCenter().lat, map.getCenter().lng) : [S.trip.lat || 37.5, S.trip.lng || 121.5]);
  pickMap.invalidateSize(); pickMap.setView(toMap(c[0], c[1]), hasLoc(d) ? 16 : 13);
  setTimeout(() => pickMap.invalidateSize(), 50);
  pickDone = () => { const p = pickMap.getCenter(); const [la, ln] = fromMap(p.lat, p.lng); d.lat = +la.toFixed(6); d.lng = +ln.toFixed(6); cb(); };
}

/* ───────── 여행 설정 / 새 여행 ───────── */
function tripSheet(isNew) {
  const base = isNew ? { title: '', emoji: '✈️', start: fd(new Date()), end: addDays(fd(new Date()), 2), city: '', cityZh: '', members: S.me ? [S.me] : [], rate: 200 } : JSON.parse(JSON.stringify(S.trip));
  const d = base, memBox = h('div', { class: 'chips' }), cityRes = h('div');
  const paintMem = () => memBox.replaceChildren(...(d.members || []).map((m) => h('button', { class: 'on', onclick: () => { if (confirmRemove(m)) { d.members = d.members.filter((x) => x !== m); paintMem(); } } }, m + '  ×')));
  const confirmRemove = (m) => window.confirm(`${m} 님을 멤버에서 뺄까?`);
  const memIn = h('input', { type: 'text', placeholder: '이름 추가' });
  const addMem = () => { const v = memIn.value.trim(); if (v && !d.members.includes(v)) { d.members.push(v); paintMem(); } memIn.value = ''; };
  const city = h('input', { type: 'text', value: d.city || '', placeholder: '예: 대련, 옌타이, 칭다오', oninput: (e) => { d.city = e.target.value; } });
  const findCity = async () => {
    const q = (d.city || '').trim(); if (!q) return;
    cityRes.replaceChildren(h('div', { class: 'results' }, h('div', { class: 'msg' }, '검색 중…')));
    try {
      const rows = await searchPlaces(q, {});
      cityRes.replaceChildren(h('div', { class: 'results' }, rows.length ? rows.slice(0, 5).map((r) => h('button', { onclick: () => { d.lat = r.lat; d.lng = r.lng; d.cityZh = r.local || d.cityZh || ''; cityRes.replaceChildren(h('p', { class: 'hint', style: 'margin-top:6px' }, '✓ 지도 중심을 ' + r.title + '(으)로 맞췄어')); } }, h('b', null, r.title, r.local ? ' · ' + r.local : ''), h('span', null, r.sub))) : h('div', { class: 'msg' }, '결과가 없어')));
    } catch (e) { cityRes.replaceChildren(h('div', { class: 'results' }, h('div', { class: 'msg' }, '검색 연결이 안 돼. 나중에 다시 해도 돼.'))); }
  };
  paintMem();
  openSheet(h('h2', null, isNew ? '새 여행' : '여행 설정'),
    field('여행 이름', h('input', { type: 'text', value: d.title, placeholder: '예: 대련 여행', oninput: (e) => { d.title = e.target.value; } })),
    h('div', { class: 'rowf' },
      field('가는 날', h('input', { type: 'date', value: d.start, onchange: (e) => { d.start = e.target.value; } })),
      field('오는 날', h('input', { type: 'date', value: d.end, onchange: (e) => { d.end = e.target.value; } }))),
    field('도시 (장소 검색·지도 중심에 쓰여)', h('div', { class: 'rowf' }, city, h('button', { class: 'btn-ghost fit', onclick: findCity }, '찾기')), cityRes),
    field('같이 가는 사람', memBox, h('div', { class: 'rowf', style: 'margin-top:8px' }, memIn, h('button', { class: 'btn-ghost fit', onclick: addMem }, '추가'))),
    h('button', { class: 'btn-primary', style: 'width:100%', onclick: () => {
      addMem(); d.title = (d.title || '').trim();
      if (!d.title) return toast('여행 이름을 적어줘');
      if (!d.start || !d.end || d.end < d.start) return toast('날짜를 확인해줘');
      closeSheet();
      if (isNew) {
        const id = 'trip-' + rid(10);
        ls.set('t.' + id, { trip: d, items: [] }); addKnown(id);
        if (REMOTE) queue({ k: 'trip', id, data: d });
        go(id);
      } else { S.trip = d; S.fit = true; saveTrip(); }
    } }, isNew ? '만들기' : '저장'),
    isNew ? null : h('div', { class: 'menu', style: 'margin-top:10px' },
      h('button', { onclick: () => nameSheet() }, '내 이름 바꾸기', h('small', null, '지금: ' + (S.me || '없음'))),
      h('button', { onclick: () => { if (window.confirm('내 목록에서만 빠져. 친구들 일정은 그대로야. 뺄까?')) { ls.set('trips', known().filter((x) => x !== S.tripId)); closeSheet(); go(null); } } }, '내 목록에서 이 여행 빼기')));
}
function nameSheet(after) {
  const others = ((S.trip && S.trip.members) || []).filter((m) => m !== S.me);
  const inp = h('input', { type: 'text', value: S.me || '', placeholder: '예: 예링', maxLength: 12 });
  const done = (v) => {
    v = (v || '').trim(); if (!v) return toast('이름을 적어줘');
    const old = S.me; S.me = v; ls.set('me', v);
    if (S.trip && old && old !== v && (S.trip.members || []).includes(old) && !S.trip.members.includes(v)) {
      S.trip.members = S.trip.members.map((m) => (m === old ? v : m)); cachePut(); queue({ k: 'trip', id: S.tripId, data: S.trip });
      // 이름을 바꾸면 결제·정산·작성자 기록도 같이 바꿔준다 (안 그러면 정산에 옛 이름이 유령처럼 남는다)
      S.items.slice().forEach((it) => {
        const usedIn = it.payer === old || it.by === old || (it.split || []).includes(old);
        if (!usedIn) return;
        const n = Object.assign({}, it);
        if (n.payer === old) n.payer = v;
        if (n.by === old) n.by = v;
        if (n.split) n.split = n.split.map((m) => (m === old ? v : m));
        saveItem(n, true);
      });
    }
    ensureMember(); closeSheet(); renderAll(); if (after) after();
  };
  openSheet(h('h2', null, '이름을 알려줘'),
    h('p', { class: 'subline', style: 'margin:-6px 0 14px' }, '누가 추가했는지, 누가 결제했는지 표시할 때 써. 로그인은 없어.'),
    field('내 이름', inp),
    others.length ? field('이미 있는 이름이면 골라줘', h('div', { class: 'chips' }, others.map((m) => h('button', { onclick: () => done(m) }, m)))) : null,
    h('button', { class: 'btn-primary', style: 'width:100%', onclick: () => done(inp.value) }, '확인'));
}

/* ───────── 일정 내 검색 ───────── */
function markText(text, q) {
  const out = [], low = text.toLowerCase(); let i = 0, p;
  while (q && (p = low.indexOf(q, i)) >= 0) { if (p > i) out.push(text.slice(i, p)); out.push(h('mark', null, text.slice(p, p + q.length))); i = p + q.length; }
  out.push(text.slice(i)); return out;
}
function renderSearch() {
  const q = $('searchInput').value.trim().toLowerCase(), box = $('searchResults'), days = tripDays(S.trip);
  if (!q) { box.replaceChildren(h('div', { class: 'empty' }, '이 여행에 넣어둔 일정·메모·비용에서 찾아줘')); return; }
  const hits = S.items.filter((x) => [x.title, x.local, x.addr, x.memo, x.costNote, x.by, x.payer, (KIND[x.kind] || {}).n].some((v) => v && String(v).toLowerCase().includes(q)))
    .sort((a, b) => String(a.day || '9').localeCompare(String(b.day || '9')) || (a.order || 0) - (b.order || 0));
  if (!hits.length) { box.replaceChildren(h('div', { class: 'empty' }, '찾는 일정이 없어')); return; }
  box.replaceChildren(...hits.map((x) => h('button', { class: 'sr', onclick: () => {
    $('search').hidden = true;
    if (x.kind === 'expense') { S.tab = 'cost'; renderAll(); editSheet(x); return; }
    S.tab = 'plan'; S.day = days.includes(x.day) ? x.day : 'none'; S.fit = true; renderAll(); focusItem(x.id);
  } },
    h('b', null, (KIND[x.kind] || KIND.etc).e, ' ', markText(x.title || '', q)),
    h('span', null, [days.includes(x.day) ? `Day ${days.indexOf(x.day) + 1} · ${mdw(x.day)}` : '보관함', x.time, x.cost > 0 ? money(x.cost, x.cur) : ''].filter(Boolean).join(' · ')),
    x.memo ? h('span', null, markText(x.memo, q)) : null, x.local ? h('span', null, markText(x.local, q)) : null)));
}

/* ───────── 라우팅 ───────── */
function go(id, replace) {
  const url = id ? '?t=' + encodeURIComponent(id) : location.pathname;
  if (replace) history.replaceState(null, '', url); else history.pushState(null, '', url);
  route();
}
function route() {
  const id = new URLSearchParams(location.search).get('t');
  closeSheet(); $('search').hidden = true; $('picker').hidden = true;
  if (chan && sb) { sb.removeChannel(chan); chan = null; }
  S.tripId = id || null; S.trip = null; S.items = []; S.missing = false; S.day = 'all'; S.tab = 'plan'; S.reorder = false; S.hl = null; S.fit = true;
  if (!id) { renderHome(); return; }
  addKnown(id);
  const c = cacheGet(id);
  if (c) { S.trip = c.trip; S.items = c.items || []; }
  else if (!REMOTE) S.missing = true;
  renderAll();
  if (REMOTE) { subscribe(); pull(); flush(); }
  if (!S.me) nameSheet(); else ensureMember();
}

/* ───────── 이벤트 ───────── */
function bind() {
  $('btnBack').onclick = () => go(null);
  $('btnNewTrip').onclick = () => (S.me ? tripSheet(true) : nameSheet(() => tripSheet(true)));
  $('btnMe').onclick = () => nameSheet();
  $('btnSettings').onclick = () => S.trip && tripSheet(false);
  $('btnShare').onclick = async () => {
    if (!S.trip) return;
    const url = location.origin + location.pathname + '?t=' + encodeURIComponent(S.tripId);
    try { if (navigator.share) await navigator.share({ title: S.trip.title, text: S.trip.title + ' 일정 같이 짜자!', url }); else { await navigator.clipboard.writeText(url); toast('링크를 복사했어. 친구들에게 보내줘'); } }
    catch (e) { if (e && e.name !== 'AbortError') window.prompt('이 링크를 복사해서 보내줘', url); }
  };
  $('btnSearch').onclick = () => { if (!S.trip) return; $('search').hidden = false; $('searchInput').value = ''; renderSearch(); $('searchInput').focus(); };
  $('searchClose').onclick = () => { $('search').hidden = true; };
  $('searchInput').oninput = renderSearch;
  $('fab').onclick = () => S.trip && editSheet(null, S.tab === 'cost' ? { kind: 'expense', day: '' } : null);
  document.querySelectorAll('.tabbar button').forEach((b) => { b.onclick = () => { S.tab = b.dataset.tab; S.fit = true; renderAll(); window.scrollTo(0, 0); }; });
  $('sheetBg').onclick = closeSheet;
  $('btnMapSize').onclick = () => { S.mapSmall = !S.mapSmall; ls.set('mapSmall', S.mapSmall); S.fit = true; drawMap(); };
  $('btnLayer').onclick = () => { S.layer = S.layer === 'amap' ? 'osm' : 'amap'; ls.set('layer', S.layer); if (map) tileL = setTiles(map, tileL); S.fit = true; drawMap(); };
  $('pickCancel').onclick = () => { $('picker').hidden = true; };
  $('pickOk').onclick = () => { $('picker').hidden = true; if (pickDone) pickDone(); };
  window.addEventListener('popstate', route);
  window.addEventListener('online', () => { flush(); pull(); renderStatus(); });
  window.addEventListener('offline', renderStatus);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { flush(); pull(); } });
  setInterval(() => { if (!document.hidden && S.tripId) pull(); }, 45000); // 실시간 연결이 끊겨도 주기적으로 맞춰준다
}

/* ───────── 시작 ───────── */
function seedDemo() {
  if (REMOTE || ls.get('seeded', false)) return;
  SEEDS.forEach((s) => { ls.set('t.' + s.id, { trip: s.trip, items: s.items }); addKnown(s.id); });
  ls.set('seeded', true);
}
seedDemo(); bind(); route();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.__trip = { S, Geo, settle, legInfo }; // 디버깅용
})();
