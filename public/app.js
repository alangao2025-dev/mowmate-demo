const FEE = 0.10;
const MIN_PRICE = 25;
const CASH_OWED_LIMIT = 50;
const PRO_NAME = 'Carlos M.';
const SERVICES = [
  { id: 'mow', name: 'Mowing', add: 0, required: true },
];
const WINDOWS = ['8–11 AM', '11 AM–2 PM', '2–5 PM', 'Anytime'];
const YARDS = { both: 'Front & back', front: 'Front only', back: 'Back only' };
const ADDRESSES = [
  { id: 'a1', label: 'Home', full: '1234 Maple Ave, Austin, TX 78704', street: 'Maple Ave', area: 5000, dist: 1.1 },
  { id: 'a2', label: 'Rental', full: '77 Cedar Ln, Austin, TX 78745', street: 'Cedar Ln', area: 3500, dist: 3.2 },
];
const STATUS = {
  open: 'Waiting for a pro', accepted: 'Pro assigned', in_progress: 'In progress',
  pending_confirm: 'Awaiting confirmation', completed: 'Completed', disputed: 'In dispute', cancelled: 'Cancelled',
};
const STEP_IDX = { open: 0, accepted: 1, in_progress: 2, pending_confirm: 3, disputed: 3, completed: 4 };

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, '');
const dayISO = off => { const d = new Date(Date.now() + off * 864e5); return d.toISOString().slice(0, 10); };
const fmtDate = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

function suggest(area, services) {
  const base = Math.max(30, area * 0.008);
  const add = services.reduce((a, id) => a + SERVICES.find(s => s.id === id).add, 0);
  const mid = base + add;
  return [Math.round(mid * 0.9), Math.round(mid * 1.15)];
}

function seedOrders() {
  const o = (id, customer, full, street, area, dist, services, price, pay, day, win, extra = {}) => ({
    id, mine: false, customer, full, street, area, dist, yard: 'both', services, price, pay,
    date: dayISO(day), window: win, notes: '', gate: '', dog: false, status: 'open', pro: null, log: [{ st: 'open', t: Date.now() }], ...extra,
  });
  return [
    o(101, 'Jennifer K.', '8801 Oak Hollow Dr, Austin, TX 78745', 'Oak Hollow Dr', 6500, 1.4, ['mow'], 55, 'card', 1, '8–11 AM'),
    o(102, 'Mike R.', '2207 Barton Hills Dr, Austin, TX 78704', 'Barton Hills Dr', 4000, 2.8, ['mow'], 35, 'cash', 2, 'Anytime'),
    o(103, 'Linda S.', '4410 Westlake Dr, Austin, TX 78746', 'Westlake Dr', 12000, 5.1, ['mow'], 100, 'card', 2, '2–5 PM', { dog: true, gate: '#4521', notes: 'Back gate on the left side.' }),
    o(104, 'Tom H.', '615 Elm St, Austin, TX 78704', 'Elm St', 3000, 0.9, ['mow'], 30, 'cash', 1, '11 AM–2 PM'),
  ];
}

function initialState() {
  return {
    nextId: 201,
    orders: seedOrders(),
    cust: { tab: 'home', view: null, form: newForm(), rate: {} },
    pro: { tab: 'jobs', view: null, online: true, filter: 'all', sort: 'dist', strikes: 0 },
    wallet: { balance: 186.5, owed: 0, jobs: 14, rating: 4.9, tx: [
      { label: 'Job #88 · Card', amt: 49.5 }, { label: 'Tip · Job #88', amt: 5 }, { label: 'Cash fee · Job #86', amt: -4 },
    ] },
  };
}
function newForm() {
  return { addr: 'a1', area: 5000, yard: 'both', services: ['mow'], date: dayISO(1), window: '8–11 AM', gate: '', dog: false, notes: '', price: '', pay: 'card' };
}

const KEY = 'mowmate-demo-v2';
let S;
try { S = JSON.parse(localStorage.getItem(KEY)) || initialState(); } catch { S = initialState(); }
const save = () => localStorage.setItem(KEY, JSON.stringify(S));
const byId = id => S.orders.find(o => o.id === id);

function toast(side, title, msg) {
  const box = document.getElementById('toast-' + side);
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<b>${esc(title)}</b>${esc(msg)}`;
  box.prepend(el);
  [...box.children].slice(2).forEach(x => x.remove());
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 3200);
}

function setStatus(o, st) { o.status = st; o.log.push({ st, t: Date.now() }); }

/* ---------------- shared bits ---------------- */
function lawn(kind, label, thumb) {
  return `<div class="lawn ${kind}${thumb ? ' thumb' : ''}">${label ? `<span>${label}</span>` : ''}</div>`;
}
function progress(o) {
  const idx = STEP_IDX[o.status] ?? 0;
  const names = ['Posted', 'Accepted', 'Arrived', 'Done', 'Paid'];
  return `<div class="prog"><div class="bar" style="width:calc(${idx * 25}% - ${idx * 5}px)"></div>${names.map((n, i) =>
    `<div class="s ${i < idx || o.status === 'completed' ? 'done' : ''} ${i === idx && o.status !== 'completed' ? 'cur' : ''}"><i>${i < idx || o.status === 'completed' ? '✓' : ''}</i>${n}</div>`).join('')}</div>`;
}
const payChip = o => o.pay === 'cash' ? '<span class="chip cash">💵 Cash</span>' : '<span class="chip card">💳 Card</span>';
const stChip = o => `<span class="chip st-${o.status}">${STATUS[o.status]}</span>`;

/* ---------------- customer app ---------------- */
function renderCustomer() {
  const c = S.cust;
  let hdr, body;
  if (c.view) {
    const o = byId(c.view);
    hdr = `<button class="back" data-act="c-back">‹ Orders</button><h1>Order #${o.id}</h1><span style="width:50px"></span>`;
    body = custOrder(o);
  } else if (c.tab === 'book') {
    hdr = `<h1>Book a mow</h1>`;
    body = custBook();
  } else if (c.tab === 'orders') {
    hdr = `<h1>My orders</h1>`;
    body = custOrders();
  } else {
    hdr = `<div class="brand">🌿 MowMate</div><span class="chip">Austin, TX</span>`;
    body = custHome();
  }
  const active = S.orders.filter(o => o.mine && ['accepted', 'in_progress', 'pending_confirm'].includes(o.status)).length;
  document.getElementById('customer').innerHTML = `
    <div class="hdr">${hdr}</div>
    <div class="screen" id="c-screen">${body}</div>
    <nav class="nav">
      ${navBtn('c', 'home', '🏠', 'Home', c)}
      ${navBtn('c', 'book', '➕', 'Book', c)}
      ${navBtn('c', 'orders', '📋', 'Orders', c, active)}
    </nav>`;
  if (c.tab === 'book' && !c.view) updatePrice();
}
function navBtn(p, tab, ic, label, st, badge) {
  return `<button class="${st.tab === tab && !st.view ? 'on' : ''}" data-act="${p}-tab" data-tab="${tab}"><span class="ic">${ic}</span>${label}${badge ? `<span class="badge">${badge}</span>` : ''}</button>`;
}

function custHome() {
  const mine = S.orders.filter(o => o.mine && !['completed', 'cancelled'].includes(o.status));
  return `
    <div class="hero">
      <div class="hello">Hi Alex 👋</div>
      <div class="t">Get your lawn mowed —<br>at your price.</div>
      <button class="btn" data-act="c-tab" data-tab="book">Book a mow</button>
    </div>
    <div class="sec-t">Active orders</div>
    ${mine.length ? mine.map(orderCard).join('') : `<div class="card empty"><div class="big">🌱</div>No active orders yet.</div>`}
    <div class="sec-t">My properties</div>
    ${ADDRESSES.map(a => `<div class="card row"><div><div class="b">${a.label}</div><div class="mut small">${a.full}</div></div><span class="chip">${a.area.toLocaleString()} sq ft</span></div>`).join('')}
    <div class="sec-t">How it works</div>
    <div class="steps3">
      <div><b>💲</b>You set the price</div>
      <div><b>⚡</b>Nearby pros accept</div>
      <div><b>✅</b>Pay by card or cash</div>
    </div>`;
}

function orderCard(o) {
  return `<div class="card ord" data-act="c-open" data-id="${o.id}">
    <div class="top"><div><div class="b">${esc(o.street)}</div><div class="meta">${fmtDate(o.date)} · ${o.window}<br>${o.area.toLocaleString()} sq ft · ${YARDS[o.yard]}</div></div>
    <div style="text-align:right"><div class="price">${money(o.price)}</div>${payChip(o)}</div></div>
    <div style="margin-top:8px">${stChip(o)}</div></div>`;
}

function custOrders() {
  const mine = S.orders.filter(o => o.mine).sort((a, b) => b.id - a.id);
  if (!mine.length) return `<div class="empty"><div class="big">📋</div>No orders yet.<button class="btn primary" data-act="c-tab" data-tab="book">Book your first mow</button></div>`;
  return mine.map(orderCard).join('');
}

function custBook() {
  const f = S.cust.form;
  return `<form id="book-form" autocomplete="off">
    <div class="field"><label class="lb">Address</label>
      <select class="inp" name="addr">${ADDRESSES.map(a => `<option value="${a.id}" ${f.addr === a.id ? 'selected' : ''}>${a.label} — ${a.full}</option>`).join('')}</select></div>
    <div class="field"><label class="lb">Lawn size</label>
      <div class="inline"><input class="inp" name="area" type="number" min="500" step="100" value="${f.area}"><button type="button" class="btn ghost sm" data-act="toast-c" data-msg="Demo: draw your lawn outline on a satellite map to measure it.">📐 Measure on map</button></div>
      <div class="mut small" style="margin-top:4px">sq ft</div></div>
    <div class="field"><label class="lb">Yard</label>
      <div class="seg">${Object.entries(YARDS).map(([k, v]) => `<label><input type="radio" name="yard" value="${k}" ${f.yard === k ? 'checked' : ''}>${v}</label>`).join('')}</div></div>
    <div class="field"><label class="lb">When</label>
      <div class="inline"><input class="inp" type="date" name="date" min="${dayISO(0)}" value="${f.date}">
      <select class="inp" name="window">${WINDOWS.map(w => `<option ${f.window === w ? 'selected' : ''}>${w}</option>`).join('')}</select></div></div>
    <div class="field"><label class="lb">Photos of your lawn</label>
      <div class="photos">${lawn('before', '', true)}<button type="button" class="ph-add" data-act="toast-c" data-msg="Demo: opens camera / photo library.">＋</button></div></div>
    <div class="field"><label class="lb">Access</label>
      <div class="inline"><input class="inp" name="gate" placeholder="Gate code (optional)" value="${esc(f.gate)}"></div>
      <label class="check" style="margin-top:8px"><input type="checkbox" name="dog" ${f.dog ? 'checked' : ''}>There's a dog in the yard</label>
      <div class="mut small" style="margin-top:4px">🔒 Gate code is only shown to the pro after they accept.</div></div>
    <div class="field"><label class="lb">Notes for the pro</label>
      <textarea class="inp" name="notes" placeholder="e.g. Please don't mow the flower bed by the fence.">${esc(f.notes)}</textarea></div>

    <div class="sec-t">Your price</div>
    <div class="price-box">
      <div class="price-in">$<input name="price" type="number" inputmode="decimal" min="0" placeholder="0" value="${esc(f.price)}"></div>
      <div class="suggest" id="sug"></div>
      <div class="meter"><i id="meter-dot" style="left:0"></i></div>
      <div id="price-note"></div>
      <div class="quick" id="quick"></div>
    </div>

    <div class="sec-t">Payment</div>
    <label class="pay-opt"><input type="radio" name="pay" value="card" ${f.pay === 'card' ? 'checked' : ''}><span class="ic">💳</span><div><div class="b">Card / Apple Pay</div><div class="mut small">Visa •••• 4242 · Charged now, held until job is done</div></div></label>
    <label class="pay-opt"><input type="radio" name="pay" value="cash" ${f.pay === 'cash' ? 'checked' : ''}><span class="ic">💵</span><div><div class="b">Cash</div><div class="mut small">Pay the pro in person after the job</div></div></label>
    ${f.pay === 'cash' ? `<div class="note warn">Cash payments are made directly to the pro and are not covered by MowMate Payment Protection. Please have exact change ready.</div>` : ''}
    <button type="button" class="btn primary" id="post-btn" data-act="c-post" style="margin-top:14px">Post job</button>
  </form>`;
}

function readForm() {
  const fm = document.getElementById('book-form');
  if (!fm) return;
  const fd = new FormData(fm);
  const f = S.cust.form;
  const prevAddr = f.addr;
  f.addr = fd.get('addr');
  f.area = Number(fd.get('area')) || 0;
  if (f.addr !== prevAddr) { f.area = ADDRESSES.find(a => a.id === f.addr).area; fm.area.value = f.area; }
  f.yard = fd.get('yard');
  f.services = ['mow'];
  f.date = fd.get('date');
  f.window = fd.get('window');
  f.gate = fd.get('gate');
  f.dog = fd.get('dog') === 'on';
  f.notes = fd.get('notes');
  f.price = fd.get('price');
  const prevPay = f.pay;
  f.pay = fd.get('pay');
  save();
  if (prevPay !== f.pay) { const y = document.getElementById('c-screen').scrollTop; renderCustomer(); document.getElementById('c-screen').scrollTop = y; }
}

function updatePrice() {
  const f = S.cust.form;
  const [lo, hi] = suggest(f.area, f.services);
  const p = Number(f.price);
  document.getElementById('sug').innerHTML = `Similar lawns nearby: <b>${money(lo)} – ${money(hi)}</b> (based on ${f.area.toLocaleString()} sq ft)`;
  const max = hi * 1.4;
  document.getElementById('meter-dot').style.left = Math.min(100, Math.max(0, p / max * 100)) + '%';
  let note = '';
  if (!f.price) note = `<div class="note info">Set any price you like. Pros nearby see it and accept first-come, first-served.</div>`;
  else if (p < MIN_PRICE) note = `<div class="note err">Minimum price is ${money(MIN_PRICE)}.</div>`;
  else if (p < lo) note = `<div class="note warn">Below typical price — it may take longer to find a pro.</div>`;
  else if (p <= hi) note = `<div class="note ok">Fair price — pros usually accept within an hour.</div>`;
  else note = `<div class="note ok">Great price — likely to be accepted fast! ⚡</div>`;
  document.getElementById('price-note').innerHTML = note;
  document.getElementById('quick').innerHTML = [lo, Math.round((lo + hi) / 2), hi].map(v => `<button type="button" data-act="c-setprice" data-v="${v}">${money(v)}</button>`).join('');
  document.getElementById('post-btn').disabled = !(p >= MIN_PRICE) || !f.date;
}

function custOrder(o) {
  let h = `<div class="card">
    <div class="row"><div>${stChip(o)}</div>${payChip(o)}</div>
    ${o.status !== 'cancelled' ? `<div style="margin-top:14px">${progress(o)}</div>` : ''}
  </div>`;

  if (o.pro && o.status !== 'cancelled') {
    h += `<div class="card"><div class="pro-card"><div class="avatar">CM</div><div style="flex:1"><div class="b">${PRO_NAME}</div>
      <div class="mut small">★ 4.9 · 212 jobs · Austin</div><div class="verified">✔ ID verified · Background checked · Insured</div></div></div>
      ${['accepted', 'in_progress'].includes(o.status) ? `<div class="btns" style="margin-top:6px"><button class="btn ghost" data-act="toast-c" data-msg="Demo: in-app chat with ${PRO_NAME}.">💬 Message</button><button class="btn ghost" data-act="toast-c" data-msg="Demo: masked call via +1 (512) 555-0100. Your real number stays private.">📞 Call</button></div>` : ''}
    </div>`;
  }

  if (o.status === 'open') {
    h += `<div class="note warn">Looking for a pro nearby… No takers after 30 min? Raising your price helps.</div>
      <div class="btns"><button class="btn ghost" data-act="c-raise" data-id="${o.id}" data-v="5">+ $5</button><button class="btn ghost" data-act="c-raise" data-id="${o.id}" data-v="10">+ $10</button><button class="btn ghost" data-act="c-raise" data-id="${o.id}" data-v="20">+ $20</button></div>`;
  }
  if (o.status === 'accepted') h += `<div class="note info">🚚 ${PRO_NAME} will arrive ${fmtDate(o.date)}, ${o.window}. You'll be notified when they're on the way.</div>`;
  if (o.status === 'in_progress') h += `<div class="card"><div class="b" style="margin-bottom:8px">🟢 ${PRO_NAME} is working on your lawn</div>${lawn('before', 'Before · ' + new Date(o.log.at(-1).t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))}</div>`;

  if (['pending_confirm', 'completed', 'disputed'].includes(o.status)) {
    h += `<div class="card"><div class="b" style="margin-bottom:8px">Before & after</div><div class="lawn-pair">${lawn('before', 'Before')}${lawn('after', 'After')}</div></div>`;
  }
  if (o.status === 'pending_confirm') {
    if (o.pay === 'cash') {
      h += `<div class="note warn">💵 ${PRO_NAME} reported receiving <b>${money(o.cashReported)}</b> in cash. Is that correct?</div>
        <button class="btn primary" data-act="c-confirm" data-id="${o.id}">Yes, I paid ${money(o.cashReported)} — confirm</button>
        <button class="btn danger" data-act="c-dispute" data-id="${o.id}">Amount is wrong / Report a problem</button>`;
    } else {
      h += `<div class="note info">Check the photos. Payment of ${money(o.price)} is released to the pro when you confirm (auto-confirms in 48h).</div>
        <button class="btn primary" data-act="c-confirm" data-id="${o.id}">Confirm & release payment</button>
        <button class="btn danger" data-act="c-dispute" data-id="${o.id}">Report a problem</button>`;
    }
  }
  if (o.status === 'disputed') h += `<div class="note err">Our support team is reviewing photos and GPS check-in records. We'll get back to you within 24 hours.</div>`;
  if (o.status === 'completed') {
    if (o.rating) {
      h += `<div class="card" style="text-align:center"><div class="b">Thanks for your review!</div><div style="color:#f5b301;font-size:22px;margin:4px 0">${'★'.repeat(o.rating)}${'☆'.repeat(5 - o.rating)}</div>${o.tip ? `<div class="mut small">Tip: ${money(o.tip)} (100% goes to the pro)</div>` : ''}</div>
        <button class="btn primary" data-act="c-rebook" data-id="${o.id}">Book ${PRO_NAME} again</button>`;
    } else {
      const r = S.cust.rate[o.id] || { stars: 5, tip: o.pay === 'card' ? 5 : 0 };
      h += `<div class="card"><div class="b" style="text-align:center">How did ${PRO_NAME} do?</div>
        <div class="stars">${[1, 2, 3, 4, 5].map(i => `<button class="${i <= r.stars ? 'on' : ''}" data-act="c-star" data-id="${o.id}" data-v="${i}">★</button>`).join('')}</div>
        ${o.pay === 'card' ? `<div class="mut small" style="margin:8px 0 6px">Add a tip</div><div class="tips">${[0, 3, 5, 10].map(v => `<button class="${r.tip === v ? 'on' : ''}" data-act="c-tip" data-id="${o.id}" data-v="${v}">${v ? '$' + v : 'No tip'}</button>`).join('')}</div>` : ''}
        <button class="btn primary" data-act="c-rate" data-id="${o.id}">Submit review</button></div>`;
    }
  }

  h += `<div class="card"><div class="b" style="margin-bottom:6px">Job details</div>
    <div class="kv"><span>Address</span><span>${esc(o.full)}</span></div>
    <div class="kv"><span>Date</span><span>${fmtDate(o.date)} · ${o.window}</span></div>
    <div class="kv"><span>Lawn</span><span>${o.area.toLocaleString()} sq ft · ${YARDS[o.yard]}</span></div>
    ${o.notes ? `<div class="kv"><span>Notes</span><span style="text-align:right;max-width:60%">${esc(o.notes)}</span></div>` : ''}
    <hr><div class="kv"><span>Your price</span><span class="b">${money(o.price)}</span></div>
    <div class="kv"><span>Payment</span><span>${o.pay === 'cash' ? 'Cash to pro' : (o.status === 'cancelled' ? 'Refunded' : (o.status === 'completed' ? 'Paid · Visa 4242' : 'Held · Visa 4242'))}</span></div>
  </div>`;

  if (['open', 'accepted'].includes(o.status)) h += `<button class="btn danger" data-act="c-cancel" data-id="${o.id}">Cancel order</button>`;
  return h;
}

/* ---------------- pro app ---------------- */
function renderPro() {
  const p = S.pro;
  let hdr, body;
  if (p.view) {
    const o = byId(p.view);
    hdr = `<button class="back" data-act="p-back">‹ Back</button><h1>Job #${o.id}</h1><span style="width:40px"></span>`;
    body = proJob(o);
  } else {
    hdr = `<div class="brand">🌿 MowMate <small>PRO</small></div>
      <div class="online">${p.online ? 'Online' : 'Offline'}<button class="tgl ${p.online ? 'on' : ''}" data-act="p-online" aria-label="toggle online"></button></div>`;
    body = p.tab === 'mine' ? proMine() : p.tab === 'wallet' ? proWallet() : proBoard();
  }
  const openCount = p.online ? S.orders.filter(o => o.status === 'open').length : 0;
  document.getElementById('pro').innerHTML = `
    <div class="hdr">${hdr}</div>
    <div class="screen">${body}</div>
    <nav class="nav">
      ${navBtn('p', 'jobs', '📍', 'Jobs', p, openCount)}
      ${navBtn('p', 'mine', '🗓️', 'My jobs', p)}
      ${navBtn('p', 'wallet', '💰', 'Wallet', p)}
    </nav>`;
}

function conflict(o) {
  return S.orders.find(x => x.pro === PRO_NAME && x.id !== o.id && ['accepted', 'in_progress'].includes(x.status) && x.date === o.date && x.window === o.window && o.window !== 'Anytime');
}
const cashLocked = () => S.wallet.owed > CASH_OWED_LIMIT;

function proBoard() {
  const p = S.pro;
  if (!p.online) return `<div class="empty"><div class="big">😴</div>You're offline.<br>Go online to see jobs near you.<button class="btn primary" data-act="p-online">Go online</button></div>`;
  let jobs = S.orders.filter(o => o.status === 'open' && (p.filter === 'all' || o.pay === p.filter));
  jobs.sort((a, b) => p.sort === 'dist' ? a.dist - b.dist : b.price - a.price);
  return `
    <div class="pro-stats"><div><b>${S.orders.filter(o => o.status === 'open').length}</b><span>Open nearby</span></div><div><b>★ ${S.wallet.rating}</b><span>Rating</span></div><div><b>${money(S.wallet.balance)}</b><span>Balance</span></div></div>
    <div class="filters">
      ${[['all', 'All'], ['card', '💳 Card'], ['cash', '💵 Cash']].map(([k, v]) => `<button class="${p.filter === k ? 'on' : ''}" data-act="p-filter" data-v="${k}">${v}</button>`).join('')}
      <select data-act-change="p-sort"><option value="dist" ${p.sort === 'dist' ? 'selected' : ''}>Nearest</option><option value="price" ${p.sort === 'price' ? 'selected' : ''}>Highest pay</option></select>
    </div>
    ${jobs.length ? jobs.map(jobCard).join('') : `<div class="empty"><div class="big">🌾</div>No open jobs right now.<br>We'll notify you when one comes in.</div>`}`;
}

function jobCard(o) {
  const c = conflict(o);
  const locked = o.pay === 'cash' && cashLocked();
  return `<div class="card job">
    <div class="top">${lawn('before', '', true)}
      <div class="info"><div class="row"><div class="price">${money(o.price)}</div>${payChip(o)}</div>
        <div class="line">📍 ${esc(o.street)} area · ${o.dist} mi</div>
        <div class="line">🗓️ ${fmtDate(o.date)} · ${o.window}</div>
        <div class="line">📐 ${o.area.toLocaleString()} sq ft · ${YARDS[o.yard]}</div>
      </div></div>
    <div>${o.dog ? '<span class="tag alert">🐕 Dog in yard</span>' : ''}${c ? '<span class="tag alert">⚠ Time conflict</span>' : ''}</div>
    <div class="acts"><button class="btn ghost" data-act="p-open" data-id="${o.id}">Details</button>
      <button class="btn primary" data-act="p-accept" data-id="${o.id}" ${locked ? 'disabled' : ''}>${locked ? 'Settle fees first' : 'Accept'}</button></div>
  </div>`;
}

function proMine() {
  const mine = S.orders.filter(o => o.pro === PRO_NAME);
  const groups = [
    ['Active', mine.filter(o => ['in_progress', 'pending_confirm', 'disputed'].includes(o.status))],
    ['Upcoming', mine.filter(o => o.status === 'accepted').sort((a, b) => a.date.localeCompare(b.date))],
    ['Completed', mine.filter(o => o.status === 'completed').sort((a, b) => b.id - a.id)],
  ];
  if (!mine.length) return `<div class="empty"><div class="big">🗓️</div>No jobs yet.<button class="btn primary" data-act="p-tab" data-tab="jobs">Find jobs</button></div>`;
  return groups.filter(g => g[1].length).map(([t, list]) => `<div class="sec-t">${t}</div>` + list.map(o => `
    <div class="card ord" data-act="p-open" data-id="${o.id}"><div class="top"><div><div class="b">${esc(o.street)}</div>
    <div class="meta">${fmtDate(o.date)} · ${o.window}<br>${esc(o.customer)}</div></div>
    <div style="text-align:right"><div class="price">${money(o.price)}</div>${payChip(o)}</div></div><div style="margin-top:8px">${stChip(o)}</div></div>`).join('')).join('');
}

function proJob(o) {
  const mine = o.pro === PRO_NAME;
  const fee = o.price * FEE;
  let h = `<div class="card"><div class="row"><div class="price b" style="font-size:28px">${money(o.price)}</div><div>${payChip(o)} ${mine ? stChip(o) : ''}</div></div>
    <div class="mut small" style="margin-top:4px">${o.pay === 'cash' ? `Collect ${money(o.price)} cash · ${money(fee)} platform fee billed to your account` : `You earn ${money(o.price - fee)} after ${FEE * 100}% fee · Tips 100% yours`}</div>
    ${mine && o.status !== 'cancelled' ? `<div style="margin-top:14px">${progress(o)}</div>` : ''}</div>`;

  h += `<div class="card"><div class="pro-card"><div class="avatar c">${esc(o.customer.split(' ').map(s => s[0]).join(''))}</div><div style="flex:1"><div class="b">${esc(o.customer)}</div><div class="mut small">★ 4.8 · Homeowner</div></div>
    ${mine && ['accepted', 'in_progress'].includes(o.status) ? `<button class="btn ghost sm" data-act="toast-p" data-msg="Demo: masked call via +1 (512) 555-0100.">📞</button>` : ''}</div><hr>
    <div class="kv"><span>Address</span><span style="text-align:right">${mine ? esc(o.full) : esc(o.street) + ' area · ' + o.dist + ' mi'}</span></div>
    ${mine ? `<div class="kv"><span>Gate code</span><span class="b">${o.gate ? esc(o.gate) : '—'}</span></div>` : ''}
    <div class="kv"><span>Date</span><span>${fmtDate(o.date)} · ${o.window}</span></div>
    <div class="kv"><span>Lawn</span><span>${o.area.toLocaleString()} sq ft · ${YARDS[o.yard]}</span></div>
    ${o.notes ? `<div class="kv"><span>Notes</span><span style="text-align:right;max-width:60%">${esc(o.notes)}</span></div>` : ''}
    ${o.dog ? `<div class="note err">🐕 Dog in yard — ask the owner before entering.</div>` : ''}
    ${!mine ? `<div class="note info">🔒 Exact address and gate code are shown after you accept.</div>` : ''}
  </div>`;

  if (!mine && o.status === 'open') {
    const locked = o.pay === 'cash' && cashLocked();
    h += locked ? `<div class="note err">You owe ${money(S.wallet.owed)} in cash-job fees. Settle in Wallet to accept cash jobs.</div>` : '';
    h += `<button class="btn primary" data-act="p-accept" data-id="${o.id}" ${locked ? 'disabled' : ''}>Accept job</button>`;
  }
  if (!mine && o.status !== 'open') h += `<div class="note warn">This job was taken by another pro.</div>`;

  if (mine && o.status === 'accepted') {
    h += `<div class="btns"><button class="btn ghost" data-act="toast-p" data-msg="Opening Google Maps → ${esc(o.full)}">🧭 Navigate</button><button class="btn ghost" data-act="toast-p" data-msg="Customer notified: you're on the way.">🚚 On my way</button></div>
      <button class="btn primary" data-act="p-arrive" data-id="${o.id}">📷 I've arrived — take "before" photo</button>
      <div class="mut small" style="margin-top:6px;text-align:center">GPS check-in: you must be within 300 ft of the address.</div>
      <button class="btn danger" data-act="p-cancel" data-id="${o.id}" style="margin-top:14px">Cancel job</button>`;
  }
  if (mine && o.status === 'in_progress') {
    h += `<div class="card"><div class="b" style="margin-bottom:8px">Before photo ✓</div>${lawn('before', 'Before')}</div>`;
    if (o.pay === 'cash') {
      h += `<div class="card"><div class="b">💵 Cash received</div><div class="mut small" style="margin:4px 0 8px">Enter the amount the customer paid you.</div>
        <div class="price-in" style="font-size:24px">$<input id="cash-amt" type="number" value="${o.price}" style="font-size:24px"></div></div>
        <button class="btn primary" data-act="p-finish" data-id="${o.id}">📷 Take "after" photo & confirm cash received</button>`;
    } else {
      h += `<button class="btn primary" data-act="p-finish" data-id="${o.id}">📷 Take "after" photo & finish job</button>`;
    }
  }
  if (mine && ['pending_confirm', 'completed', 'disputed'].includes(o.status)) {
    h += `<div class="card"><div class="lawn-pair">${lawn('before', 'Before')}${lawn('after', 'After')}</div></div>`;
  }
  if (mine && o.status === 'pending_confirm') h += `<div class="note info">⏳ Waiting for the customer to confirm. Auto-confirms in 48 hours.</div>`;
  if (mine && o.status === 'disputed') h += `<div class="note err">The customer reported a problem. Support will review photos & GPS logs and contact you.</div>`;
  if (mine && o.status === 'completed') {
    h += `<div class="card"><div class="b" style="margin-bottom:6px">Earnings</div>
      <div class="kv"><span>Job price</span><span>${money(o.price)}</span></div>
      <div class="kv"><span>Platform fee (${FEE * 100}%)</span><span>−${money(fee)}</span></div>
      ${o.tip ? `<div class="kv"><span>Tip</span><span>+${money(o.tip)}</span></div>` : ''}
      <hr><div class="kv"><span>${o.pay === 'cash' ? 'Kept in cash' : 'Added to balance'}</span><span class="b">${money(o.pay === 'cash' ? o.price : o.price - fee + (o.tip || 0))}</span></div>
      ${o.rating ? `<div class="kv"><span>Customer rating</span><span style="color:#f5b301">${'★'.repeat(o.rating)}</span></div>` : ''}</div>`;
  }
  return h;
}

function proWallet() {
  const w = S.wallet;
  return `<div class="wallet-hero"><div class="small" style="opacity:.8">Available balance</div><div class="amt">${money(w.balance)}</div>
      <button class="btn" data-act="p-cashout" ${w.balance <= 0 ? 'disabled' : ''}>Cash out to bank •••• 6789</button></div>
    ${w.owed > 0 ? `<div class="card"><div class="row"><div><div class="b">Cash-job fees owed</div><div class="mut small">${w.owed > CASH_OWED_LIMIT ? 'Over $50 limit — cash jobs paused' : 'Auto-deducted from future card earnings'}</div></div><div class="b" style="color:var(--red)">${money(w.owed)}</div></div>
      <button class="btn ghost" data-act="p-payfees">Pay now with debit card</button></div>` : ''}
    <div class="pro-stats"><div><b>${w.jobs}</b><span>Jobs done</span></div><div><b>★ ${w.rating}</b><span>Rating</span></div><div><b>${S.pro.strikes}</b><span>Strikes (30d)</span></div></div>
    <div class="card"><div class="b" style="margin-bottom:4px">Recent activity</div>
      ${w.tx.slice(0, 12).map(t => `<div class="tx"><span>${esc(t.label)}</span><span class="${t.amt >= 0 ? 'plus' : 'minus'}">${t.amt >= 0 ? '+' : '−'}${money(Math.abs(t.amt))}</span></div>`).join('')}</div>
    <div class="note info">📄 Your 1099-K tax form will be available here in January.</div>`;
}

/* ---------------- money logic ---------------- */
function settle(o) {
  const w = S.wallet;
  const fee = o.price * FEE;
  w.jobs++;
  if (o.pay === 'card') {
    let net = o.price - fee;
    w.tx.unshift({ label: `Job #${o.id} · Card`, amt: net });
    if (w.owed > 0) {
      const d = Math.min(w.owed, net);
      w.owed -= d; net -= d;
      w.tx.unshift({ label: 'Cash fees auto-deducted', amt: -d });
    }
    w.balance += net;
  } else {
    w.tx.unshift({ label: `Cash fee · Job #${o.id}`, amt: -fee });
    const d = Math.min(w.balance, fee);
    w.balance -= d;
    w.owed += fee - d;
  }
}

function complete(o) {
  setStatus(o, 'completed');
  settle(o);
  toast('pro', 'Job completed', o.pay === 'cash'
    ? `#${o.id} confirmed. ${money(o.price * FEE)} fee charged to your account.`
    : `#${o.id} confirmed. ${money(o.price * (1 - FEE))} added to your balance.`);
}

/* ---------------- actions ---------------- */
const actions = {
  side: el => { document.body.dataset.show = el.dataset.side; },
  reset: () => { if (confirm('重置所有演示数据？')) { S = initialState(); save(); render(); } },
  'toast-c': el => toast('customer', 'MowMate', el.dataset.msg),
  'toast-p': el => toast('pro', 'MowMate Pro', el.dataset.msg),

  'c-tab': el => { S.cust.tab = el.dataset.tab; S.cust.view = null; },
  'c-back': () => { S.cust.view = null; S.cust.tab = 'orders'; },
  'c-open': el => { S.cust.view = +el.dataset.id; },
  'c-setprice': el => { S.cust.form.price = el.dataset.v; document.querySelector('#book-form [name=price]').value = el.dataset.v; save(); updatePrice(); return false; },
  'c-post': () => {
    readForm();
    const f = S.cust.form;
    if (!(Number(f.price) >= MIN_PRICE)) return false;
    const a = ADDRESSES.find(x => x.id === f.addr);
    const o = {
      id: S.nextId++, mine: true, customer: 'Alex P.', full: a.full, street: a.street, area: f.area, dist: a.dist,
      yard: f.yard, services: f.services, price: Number(f.price), pay: f.pay, date: f.date, window: f.window,
      notes: f.notes.trim(), gate: f.gate.trim(), dog: f.dog, status: 'open', pro: null, log: [{ st: 'open', t: Date.now() }],
    };
    S.orders.push(o);
    S.cust.form = newForm();
    S.cust.view = o.id;
    toast('customer', 'Job posted', o.pay === 'card' ? `${money(o.price)} charged to Visa 4242 and held until the job is done.` : `Pay ${money(o.price)} in cash to your pro after the job.`);
    if (S.pro.online) toast('pro', '🔔 New job nearby', `${money(o.price)} · ${o.dist} mi · ${o.pay === 'cash' ? 'Cash' : 'Card'} · ${fmtDate(o.date)}`);
  },
  'c-raise': el => {
    const o = byId(+el.dataset.id);
    o.price += +el.dataset.v;
    toast('customer', 'Price updated', `New price ${money(o.price)}. Re-sent to nearby pros.`);
    if (S.pro.online) toast('pro', '⬆ Price raised', `Job on ${o.street} is now ${money(o.price)}`);
  },
  'c-cancel': el => {
    const o = byId(+el.dataset.id);
    const msg = o.status === 'open' ? 'Cancel this order? You will get a full refund.' : 'Cancel this order? Free if more than 24h before the visit; otherwise a $10 fee goes to the pro.';
    if (!confirm(msg)) return false;
    const hadPro = o.pro;
    setStatus(o, 'cancelled');
    toast('customer', 'Order cancelled', o.pay === 'card' ? `${money(o.price)} refunded to Visa 4242.` : 'No charge.');
    if (hadPro) toast('pro', 'Job cancelled', `Customer cancelled job #${o.id}.`);
  },
  'c-confirm': el => { complete(byId(+el.dataset.id)); toast('customer', 'Thanks!', 'Job confirmed. Please rate your pro.'); },
  'c-dispute': el => {
    const o = byId(+el.dataset.id);
    if (!confirm('Report a problem with this job? Support will review it.')) return false;
    setStatus(o, 'disputed');
    toast('pro', '⚠ Dispute opened', `Customer reported a problem on job #${o.id}.`);
  },
  'c-star': el => { const id = +el.dataset.id; const o = byId(id); S.cust.rate[id] = { ...(S.cust.rate[id] || { tip: o.pay === 'card' ? 5 : 0 }), stars: +el.dataset.v }; },
  'c-tip': el => { const id = +el.dataset.id; S.cust.rate[id] = { ...(S.cust.rate[id] || { stars: 5 }), tip: +el.dataset.v }; },
  'c-rate': el => {
    const o = byId(+el.dataset.id);
    const r = S.cust.rate[o.id] || { stars: 5, tip: o.pay === 'card' ? 5 : 0 };
    o.rating = r.stars; o.tip = o.pay === 'card' ? r.tip : 0;
    if (o.tip) { S.wallet.balance += o.tip; S.wallet.tx.unshift({ label: `Tip · Job #${o.id}`, amt: o.tip }); }
    toast('pro', '⭐ New review', `${'★'.repeat(o.rating)} from ${o.customer}${o.tip ? ` + ${money(o.tip)} tip` : ''}`);
  },
  'c-rebook': el => {
    const o = byId(+el.dataset.id);
    Object.assign(S.cust.form, { addr: ADDRESSES.find(a => a.full === o.full).id, area: o.area, yard: o.yard, services: o.services, price: String(o.price), pay: o.pay, notes: o.notes, gate: o.gate, dog: o.dog });
    S.cust.view = null; S.cust.tab = 'book';
  },

  'p-tab': el => { S.pro.tab = el.dataset.tab; S.pro.view = null; },
  'p-back': () => { S.pro.view = null; },
  'p-open': el => { S.pro.view = +el.dataset.id; },
  'p-online': () => { S.pro.online = !S.pro.online; },
  'p-filter': el => { S.pro.filter = el.dataset.v; },
  'p-accept': el => {
    const o = byId(+el.dataset.id);
    if (o.status !== 'open') { toast('pro', 'Too late', 'Another pro already took this job.'); return; }
    const c = conflict(o);
    if (c && !confirm(`This overlaps with job #${c.id} (${fmtDate(c.date)}, ${c.window}). Accept anyway?`)) return false;
    o.pro = PRO_NAME;
    setStatus(o, 'accepted');
    S.pro.view = o.id;
    toast('pro', 'Job accepted ✓', `Full address & gate code unlocked for #${o.id}.`);
    if (o.mine) toast('customer', '🎉 Your job was accepted', `${PRO_NAME} (★4.9) will mow your lawn on ${fmtDate(o.date)}.`);
  },
  'p-cancel': el => {
    const o = byId(+el.dataset.id);
    if (!confirm('Cancel this job? It will go back to the job board and count as a strike (3 strikes in 30 days = paused).')) return false;
    o.pro = null;
    setStatus(o, 'open');
    S.pro.strikes++;
    S.pro.view = null;
    if (o.mine) toast('customer', 'Pro cancelled', `We're finding you another pro for job #${o.id}.`);
  },
  'p-arrive': el => {
    const o = byId(+el.dataset.id);
    setStatus(o, 'in_progress');
    toast('pro', 'Checked in ✓', 'GPS verified · Before photo uploaded.');
    if (o.mine) toast('customer', 'Your pro has arrived', `${PRO_NAME} checked in and started working.`);
  },
  'p-finish': el => {
    const o = byId(+el.dataset.id);
    if (o.pay === 'cash') {
      const v = Number(document.getElementById('cash-amt').value);
      if (!(v > 0)) { toast('pro', 'Check amount', 'Enter the cash amount you received.'); return false; }
      o.cashReported = v;
    }
    setStatus(o, 'pending_confirm');
    toast('pro', 'Job submitted', 'After photo uploaded. Waiting for customer confirmation.');
    if (o.mine) toast('customer', '✅ Job done!', 'Check the before/after photos and confirm.');
    else setTimeout(() => {
      if (o.status !== 'pending_confirm') return;
      o.rating = 5;
      complete(o);
      save(); render();
    }, 2500);
  },
  'p-cashout': () => {
    const w = S.wallet;
    if (w.balance <= 0) return false;
    w.tx.unshift({ label: 'Cash out to bank', amt: -w.balance });
    toast('pro', 'Transfer started', `${money(w.balance)} → bank •••• 6789. Arrives in 1–3 business days.`);
    w.balance = 0;
  },
  'p-payfees': () => {
    const w = S.wallet;
    toast('pro', 'Fees paid', `${money(w.owed)} charged to debit card •••• 1122.`);
    w.owed = 0;
  },
};

function render() { renderCustomer(); renderPro(); }

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  if (el.closest('#book-form')) readForm();
  const r = fn(el);
  if (r === false) return;
  save();
  if (el.dataset.act !== 'side' && !el.dataset.act.startsWith('toast')) {
    render();
    if (el.dataset.act.endsWith('open') || el.dataset.act.endsWith('tab') || el.dataset.act.endsWith('back') || ['c-post', 'p-accept', 'c-rebook'].includes(el.dataset.act)) {
      document.querySelectorAll('.screen').forEach(s => { if (s.closest(el.closest('#pro') ? '#pro' : '#customer')) s.scrollTop = 0; });
    }
  }
});
document.addEventListener('input', e => {
  if (e.target.closest('#book-form')) { readForm(); updatePrice(); }
});
document.addEventListener('change', e => {
  if (e.target.closest('#book-form')) { readForm(); if (document.getElementById('book-form')) updatePrice(); }
  if (e.target.dataset.actChange === 'p-sort') { S.pro.sort = e.target.value; save(); renderPro(); }
});

render();
