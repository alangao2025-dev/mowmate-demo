const FEE = 0.10;
const MIN_PRICE = 25;
const CASH_OWED_LIMIT = 50;
const PRO_NAME = 'Carlos M.';

const LANG_KEY = 'mowmate-lang';
let LANG = localStorage.getItem(LANG_KEY) || 'zh';
const T = (en, zh) => LANG === 'zh' ? zh : en;

const WINDOWS = ['8–11 AM', '11 AM–2 PM', '2–5 PM', 'Anytime'];
const winL = w => LANG === 'zh' ? { '8–11 AM': '上午 8–11 点', '11 AM–2 PM': '中午 11–2 点', '2–5 PM': '下午 2–5 点', 'Anytime': '时间不限' }[w] : w;
const yardL = k => ({ both: T('Front & back', '前院+后院'), front: T('Front only', '仅前院'), back: T('Back only', '仅后院') }[k]);
const ADDRESSES = [
  { id: 'a1', label: ['Home', '自住房'], full: '1234 Maple Ave, Austin, TX 78704', street: 'Maple Ave', area: 5000, dist: 1.1 },
  { id: 'a2', label: ['Rental', '出租房'], full: '77 Cedar Ln, Austin, TX 78745', street: 'Cedar Ln', area: 3500, dist: 3.2 },
];
const addrLabel = a => T(...a.label);
const statusL = st => ({
  open: T('Waiting for a pro', '等待接单'), accepted: T('Pro assigned', '已接单'), in_progress: T('In progress', '服务中'),
  pending_confirm: T('Awaiting confirmation', '待确认'), completed: T('Completed', '已完成'), disputed: T('In dispute', '纠纷处理中'), cancelled: T('Cancelled', '已取消'),
}[st]);
const STEP_IDX = { open: 0, accepted: 1, in_progress: 2, pending_confirm: 3, disputed: 3, completed: 4 };

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, '');
const sqft = n => n.toLocaleString() + T(' sq ft', ' 平方英尺');
const mi = n => n + T(' mi', ' 英里');
const dayISO = off => { const d = new Date(Date.now() + off * 864e5); return d.toISOString().slice(0, 10); };
const fmtDate = iso => new Date(iso + 'T12:00:00').toLocaleDateString(T('en-US', 'zh-CN'), { weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime = t => new Date(t).toLocaleTimeString(T('en-US', 'zh-CN'), { hour: 'numeric', minute: '2-digit' });
const notesOf = o => (LANG === 'zh' && o.notesZh) || o.notes;

function suggest(area) {
  const mid = Math.max(30, area * 0.008);
  return [Math.round(mid * 0.9), Math.round(mid * 1.15)];
}

function seedOrders() {
  const o = (id, customer, full, street, area, dist, price, pay, day, win, extra = {}) => ({
    id, mine: false, customer, full, street, area, dist, yard: 'both', price, pay,
    date: dayISO(day), window: win, notes: '', gate: '', dog: false, status: 'open', pro: null, log: [{ st: 'open', t: Date.now() }], ...extra,
  });
  return [
    o(101, 'Jennifer K.', '8801 Oak Hollow Dr, Austin, TX 78745', 'Oak Hollow Dr', 6500, 1.4, 55, 'card', 1, '8–11 AM'),
    o(102, 'Mike R.', '2207 Barton Hills Dr, Austin, TX 78704', 'Barton Hills Dr', 4000, 2.8, 35, 'cash', 2, 'Anytime'),
    o(103, 'Linda S.', '4410 Westlake Dr, Austin, TX 78746', 'Westlake Dr', 12000, 5.1, 100, 'card', 2, '2–5 PM', { dog: true, gate: '#4521', notes: 'Back gate on the left side.', notesZh: '后院门在左侧。' }),
    o(104, 'Tom H.', '615 Elm St, Austin, TX 78704', 'Elm St', 3000, 0.9, 30, 'cash', 1, '11 AM–2 PM'),
  ];
}

function initialState() {
  return {
    nextId: 201,
    orders: seedOrders(),
    cust: { tab: 'home', view: null, form: newForm(), rate: {} },
    pro: { tab: 'jobs', view: null, online: true, filter: 'all', sort: 'dist', strikes: 0 },
    wallet: { balance: 186.5, owed: 0, jobs: 14, rating: 4.9, tx: [
      { k: 'card', id: 88, amt: 49.5 }, { k: 'tip', id: 88, amt: 5 }, { k: 'cashfee', id: 86, amt: -4 },
    ] },
  };
}
function newForm() {
  return { addr: 'a1', area: 5000, yard: 'both', date: dayISO(1), window: '8–11 AM', gate: '', dog: false, notes: '', price: '', pay: 'card' };
}
const txLabel = t => ({
  card: T(`Job #${t.id} · Card`, `订单 #${t.id} · 刷卡`),
  tip: T(`Tip · Job #${t.id}`, `小费 · 订单 #${t.id}`),
  cashfee: T(`Cash fee · Job #${t.id}`, `现金单服务费 · 订单 #${t.id}`),
  deduct: T('Cash fees auto-deducted', '自动抵扣现金单服务费'),
  cashout: T('Cash out to bank', '提现到银行卡'),
}[t.k]);

const KEY = 'mowmate-demo-v3';
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
const beforeL = () => T('Before', '施工前');
const afterL = () => T('After', '施工后');
function progress(o) {
  const idx = STEP_IDX[o.status] ?? 0;
  const names = [T('Posted', '已发布'), T('Accepted', '已接单'), T('Arrived', '已到达'), T('Done', '已完工'), T('Paid', '已付款')];
  return `<div class="prog"><div class="bar" style="width:calc(${idx * 25}% - ${idx * 5}px)"></div>${names.map((n, i) =>
    `<div class="s ${i < idx || o.status === 'completed' ? 'done' : ''} ${i === idx && o.status !== 'completed' ? 'cur' : ''}"><i>${i < idx || o.status === 'completed' ? '✓' : ''}</i>${n}</div>`).join('')}</div>`;
}
const payChip = o => o.pay === 'cash' ? `<span class="chip cash">💵 ${T('Cash', '现金')}</span>` : `<span class="chip card">💳 ${T('Card', '刷卡')}</span>`;
const stChip = o => `<span class="chip st-${o.status}">${statusL(o.status)}</span>`;

/* ---------------- customer app ---------------- */
function renderCustomer() {
  const c = S.cust;
  let hdr, body;
  if (c.view) {
    const o = byId(c.view);
    hdr = `<button class="back" data-act="c-back">‹ ${T('Orders', '订单')}</button><h1>${T('Order', '订单')} #${o.id}</h1><span style="width:50px"></span>`;
    body = custOrder(o);
  } else if (c.tab === 'book') {
    hdr = `<h1>${T('Book a mow', '预约割草')}</h1>`;
    body = custBook();
  } else if (c.tab === 'orders') {
    hdr = `<h1>${T('My orders', '我的订单')}</h1>`;
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
      ${navBtn('c', 'home', '🏠', T('Home', '首页'), c)}
      ${navBtn('c', 'book', '➕', T('Book', '下单'), c)}
      ${navBtn('c', 'orders', '📋', T('Orders', '订单'), c, active)}
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
      <div class="hello">${T('Hi Alex 👋', 'Alex，你好 👋')}</div>
      <div class="t">${T('Get your lawn mowed —<br>at your price.', '割草价格<br>你说了算。')}</div>
      <button class="btn" data-act="c-tab" data-tab="book">${T('Book a mow', '预约割草')}</button>
    </div>
    <div class="sec-t">${T('Active orders', '进行中的订单')}</div>
    ${mine.length ? mine.map(orderCard).join('') : `<div class="card empty"><div class="big">🌱</div>${T('No active orders yet.', '暂无进行中的订单')}</div>`}
    <div class="sec-t">${T('My properties', '我的房产')}</div>
    ${ADDRESSES.map(a => `<div class="card row"><div><div class="b">${addrLabel(a)}</div><div class="mut small">${a.full}</div></div><span class="chip">${sqft(a.area)}</span></div>`).join('')}
    <div class="sec-t">${T('How it works', '使用流程')}</div>
    <div class="steps3">
      <div><b>💲</b>${T('You set the price', '你来定价')}</div>
      <div><b>⚡</b>${T('Nearby pros accept', '附近师傅抢单')}</div>
      <div><b>✅</b>${T('Pay by card or cash', '刷卡或现金支付')}</div>
    </div>`;
}

function orderCard(o) {
  return `<div class="card ord" data-act="c-open" data-id="${o.id}">
    <div class="top"><div><div class="b">${esc(o.street)}</div><div class="meta">${fmtDate(o.date)} · ${winL(o.window)}<br>${sqft(o.area)} · ${yardL(o.yard)}</div></div>
    <div style="text-align:right"><div class="price">${money(o.price)}</div>${payChip(o)}</div></div>
    <div style="margin-top:8px">${stChip(o)}</div></div>`;
}

function custOrders() {
  const mine = S.orders.filter(o => o.mine).sort((a, b) => b.id - a.id);
  if (!mine.length) return `<div class="empty"><div class="big">📋</div>${T('No orders yet.', '还没有订单')}<button class="btn primary" data-act="c-tab" data-tab="book">${T('Book your first mow', '预约第一次割草')}</button></div>`;
  return mine.map(orderCard).join('');
}

function custBook() {
  const f = S.cust.form;
  return `<form id="book-form" autocomplete="off">
    <div class="field"><label class="lb">${T('Address', '地址')}</label>
      <select class="inp" name="addr">${ADDRESSES.map(a => `<option value="${a.id}" ${f.addr === a.id ? 'selected' : ''}>${addrLabel(a)} — ${a.full}</option>`).join('')}</select></div>
    <div class="field"><label class="lb">${T('Lawn size', '草坪面积')}</label>
      <div class="inline"><input class="inp" name="area" type="number" min="500" step="100" value="${f.area}"><button type="button" class="btn ghost sm" data-act="toast-c" data-msg="${T('Demo: draw your lawn outline on a satellite map to measure it.', '演示：在卫星地图上圈出草坪范围，自动计算面积。')}">📐 ${T('Measure on map', '地图测量')}</button></div>
      <div class="mut small" style="margin-top:4px">${T('sq ft', '平方英尺（sq ft）')}</div></div>
    <div class="field"><label class="lb">${T('Yard', '院子')}</label>
      <div class="seg">${['both', 'front', 'back'].map(k => `<label><input type="radio" name="yard" value="${k}" ${f.yard === k ? 'checked' : ''}>${yardL(k)}</label>`).join('')}</div></div>
    <div class="field"><label class="lb">${T('When', '上门时间')}</label>
      <div class="inline"><input class="inp" type="date" name="date" min="${dayISO(0)}" value="${f.date}">
      <select class="inp" name="window">${WINDOWS.map(w => `<option value="${w}" ${f.window === w ? 'selected' : ''}>${winL(w)}</option>`).join('')}</select></div></div>
    <div class="field"><label class="lb">${T('Photos of your lawn', '草坪照片')}</label>
      <div class="photos">${lawn('before', '', true)}<button type="button" class="ph-add" data-act="toast-c" data-msg="${T('Demo: opens camera / photo library.', '演示：打开相机或相册。')}">＋</button></div></div>
    <div class="field"><label class="lb">${T('Access', '进门信息')}</label>
      <div class="inline"><input class="inp" name="gate" placeholder="${T('Gate code (optional)', '大门密码（选填）')}" value="${esc(f.gate)}"></div>
      <label class="check" style="margin-top:8px"><input type="checkbox" name="dog" ${f.dog ? 'checked' : ''}>${T("There's a dog in the yard", '院子里有狗')}</label>
      <div class="mut small" style="margin-top:4px">🔒 ${T('Gate code is only shown to the pro after they accept.', '大门密码只在师傅接单后才会显示。')}</div></div>
    <div class="field"><label class="lb">${T('Notes for the pro', '给师傅的备注')}</label>
      <textarea class="inp" name="notes" placeholder="${T("e.g. Please don't mow the flower bed by the fence.", '例如：篱笆旁边的花坛不要割。')}">${esc(f.notes)}</textarea></div>

    <div class="sec-t">${T('Your price', '你的出价')}</div>
    <div class="price-box">
      <div class="price-in">$<input name="price" type="number" inputmode="decimal" min="0" placeholder="0" value="${esc(f.price)}"></div>
      <div class="suggest" id="sug"></div>
      <div class="meter"><i id="meter-dot" style="left:0"></i></div>
      <div id="price-note"></div>
      <div class="quick" id="quick"></div>
    </div>

    <div class="sec-t">${T('Payment', '支付方式')}</div>
    <label class="pay-opt"><input type="radio" name="pay" value="card" ${f.pay === 'card' ? 'checked' : ''}><span class="ic">💳</span><div><div class="b">${T('Card / Apple Pay', '银行卡 / Apple Pay')}</div><div class="mut small">${T('Visa •••• 4242 · Charged now, held until job is done', 'Visa •••• 4242 · 下单时扣款，完工后才付给师傅')}</div></div></label>
    <label class="pay-opt"><input type="radio" name="pay" value="cash" ${f.pay === 'cash' ? 'checked' : ''}><span class="ic">💵</span><div><div class="b">${T('Cash', '现金')}</div><div class="mut small">${T('Pay the pro in person after the job', '完工后当面付给师傅')}</div></div></label>
    ${f.pay === 'cash' ? `<div class="note warn">${T('Cash payments are made directly to the pro and are not covered by MowMate Payment Protection. Please have exact change ready.', '现金直接付给师傅，不在 MowMate 资金保障范围内。请提前备好零钱。')}</div>` : ''}
    <button type="button" class="btn primary" id="post-btn" data-act="c-post" style="margin-top:14px">${T('Post job', '发布订单')}</button>
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
  const [lo, hi] = suggest(f.area);
  const p = Number(f.price);
  document.getElementById('sug').innerHTML = T(
    `Similar lawns nearby: <b>${money(lo)} – ${money(hi)}</b> (based on ${sqft(f.area)})`,
    `附近同类草坪成交价：<b>${money(lo)} – ${money(hi)}</b>（按 ${sqft(f.area)} 估算）`);
  const max = hi * 1.4;
  document.getElementById('meter-dot').style.left = Math.min(100, Math.max(0, p / max * 100)) + '%';
  let note = '';
  if (!f.price) note = `<div class="note info">${T('Set any price you like. Pros nearby see it and accept first-come, first-served.', '价格由你自己定。附近师傅都能看到，先接先得。')}</div>`;
  else if (p < MIN_PRICE) note = `<div class="note err">${T(`Minimum price is ${money(MIN_PRICE)}.`, `最低价格为 ${money(MIN_PRICE)}。`)}</div>`;
  else if (p < lo) note = `<div class="note warn">${T('Below typical price — it may take longer to find a pro.', '低于常见价格，可能需要更久才有人接单。')}</div>`;
  else if (p <= hi) note = `<div class="note ok">${T('Fair price — pros usually accept within an hour.', '价格合理，通常 1 小时内就有师傅接单。')}</div>`;
  else note = `<div class="note ok">${T('Great price — likely to be accepted fast! ⚡', '价格很有吸引力，很快就会被接单！⚡')}</div>`;
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
      <div class="mut small">${T('★ 4.9 · 212 jobs · Austin', '★ 4.9 · 已完成 212 单 · Austin')}</div><div class="verified">${T('✔ ID verified · Background checked · Insured', '✔ 已实名 · 已背调 · 已投保')}</div></div></div>
      ${['accepted', 'in_progress'].includes(o.status) ? `<div class="btns" style="margin-top:6px"><button class="btn ghost" data-act="toast-c" data-msg="${T(`Demo: in-app chat with ${PRO_NAME}.`, `演示：与 ${PRO_NAME} 在 App 内聊天。`)}">💬 ${T('Message', '发消息')}</button><button class="btn ghost" data-act="toast-c" data-msg="${T('Demo: masked call via +1 (512) 555-0100. Your real number stays private.', '演示：通过隐私号 +1 (512) 555-0100 通话，不暴露你的真实号码。')}">📞 ${T('Call', '打电话')}</button></div>` : ''}
    </div>`;
  }

  if (o.status === 'open') {
    h += `<div class="note warn">${T('Looking for a pro nearby… No takers after 30 min? Raising your price helps.', '正在为你寻找附近的师傅… 30 分钟没人接的话，加点价会更快。')}</div>
      <div class="btns">${[5, 10, 20].map(v => `<button class="btn ghost" data-act="c-raise" data-id="${o.id}" data-v="${v}">+ $${v}</button>`).join('')}</div>`;
  }
  if (o.status === 'accepted') h += `<div class="note info">🚚 ${T(`${PRO_NAME} will arrive ${fmtDate(o.date)}, ${winL(o.window)}. You'll be notified when they're on the way.`, `${PRO_NAME} 将在 ${fmtDate(o.date)} ${winL(o.window)} 上门，出发时会通知你。`)}</div>`;
  if (o.status === 'in_progress') h += `<div class="card"><div class="b" style="margin-bottom:8px">🟢 ${T(`${PRO_NAME} is working on your lawn`, `${PRO_NAME} 正在为你割草`)}</div>${lawn('before', beforeL() + ' · ' + fmtTime(o.log.at(-1).t))}</div>`;

  if (['pending_confirm', 'completed', 'disputed'].includes(o.status)) {
    h += `<div class="card"><div class="b" style="margin-bottom:8px">${T('Before & after', '施工前后对比')}</div><div class="lawn-pair">${lawn('before', beforeL())}${lawn('after', afterL())}</div></div>`;
  }
  if (o.status === 'pending_confirm') {
    if (o.pay === 'cash') {
      h += `<div class="note warn">💵 ${T(`${PRO_NAME} reported receiving <b>${money(o.cashReported)}</b> in cash. Is that correct?`, `${PRO_NAME} 填写的实收现金为 <b>${money(o.cashReported)}</b>，金额对吗？`)}</div>
        <button class="btn primary" data-act="c-confirm" data-id="${o.id}">${T(`Yes, I paid ${money(o.cashReported)} — confirm`, `对，我付了 ${money(o.cashReported)}，确认完工`)}</button>
        <button class="btn danger" data-act="c-dispute" data-id="${o.id}">${T('Amount is wrong / Report a problem', '金额不对 / 反馈问题')}</button>`;
    } else {
      h += `<div class="note info">${T(`Check the photos. Payment of ${money(o.price)} is released to the pro when you confirm (auto-confirms in 48h).`, `请查看照片。确认后 ${money(o.price)} 才会付给师傅（48 小时不操作自动确认）。`)}</div>
        <button class="btn primary" data-act="c-confirm" data-id="${o.id}">${T('Confirm & release payment', '确认完工并付款')}</button>
        <button class="btn danger" data-act="c-dispute" data-id="${o.id}">${T('Report a problem', '反馈问题')}</button>`;
    }
  }
  if (o.status === 'disputed') h += `<div class="note err">${T("Our support team is reviewing photos and GPS check-in records. We'll get back to you within 24 hours.", '客服正在核查照片和 GPS 打卡记录，24 小时内给你答复。')}</div>`;
  if (o.status === 'completed') {
    if (o.rating) {
      h += `<div class="card" style="text-align:center"><div class="b">${T('Thanks for your review!', '感谢你的评价！')}</div><div style="color:#f5b301;font-size:22px;margin:4px 0">${'★'.repeat(o.rating)}${'☆'.repeat(5 - o.rating)}</div>${o.tip ? `<div class="mut small">${T(`Tip: ${money(o.tip)} (100% goes to the pro)`, `小费：${money(o.tip)}（全部归师傅）`)}</div>` : ''}</div>
        <button class="btn primary" data-act="c-rebook" data-id="${o.id}">${T(`Book ${PRO_NAME} again`, `再次预约 ${PRO_NAME}`)}</button>`;
    } else {
      const r = S.cust.rate[o.id] || { stars: 5, tip: o.pay === 'card' ? 5 : 0 };
      h += `<div class="card"><div class="b" style="text-align:center">${T(`How did ${PRO_NAME} do?`, `${PRO_NAME} 干得怎么样？`)}</div>
        <div class="stars">${[1, 2, 3, 4, 5].map(i => `<button class="${i <= r.stars ? 'on' : ''}" data-act="c-star" data-id="${o.id}" data-v="${i}">★</button>`).join('')}</div>
        ${o.pay === 'card' ? `<div class="mut small" style="margin:8px 0 6px">${T('Add a tip', '给点小费')}</div><div class="tips">${[0, 3, 5, 10].map(v => `<button class="${r.tip === v ? 'on' : ''}" data-act="c-tip" data-id="${o.id}" data-v="${v}">${v ? '$' + v : T('No tip', '不给')}</button>`).join('')}</div>` : ''}
        <button class="btn primary" data-act="c-rate" data-id="${o.id}">${T('Submit review', '提交评价')}</button></div>`;
    }
  }

  const payStatus = o.pay === 'cash' ? T('Cash to pro', '现金付给师傅')
    : o.status === 'cancelled' ? T('Refunded', '已退款')
    : o.status === 'completed' ? T('Paid · Visa 4242', '已支付 · Visa 4242') : T('Held · Visa 4242', '平台托管中 · Visa 4242');
  h += `<div class="card"><div class="b" style="margin-bottom:6px">${T('Job details', '订单详情')}</div>
    <div class="kv"><span>${T('Address', '地址')}</span><span>${esc(o.full)}</span></div>
    <div class="kv"><span>${T('Date', '时间')}</span><span>${fmtDate(o.date)} · ${winL(o.window)}</span></div>
    <div class="kv"><span>${T('Lawn', '草坪')}</span><span>${sqft(o.area)} · ${yardL(o.yard)}</span></div>
    ${o.notes ? `<div class="kv"><span>${T('Notes', '备注')}</span><span style="text-align:right;max-width:60%">${esc(notesOf(o))}</span></div>` : ''}
    <hr><div class="kv"><span>${T('Your price', '你的出价')}</span><span class="b">${money(o.price)}</span></div>
    <div class="kv"><span>${T('Payment', '支付')}</span><span>${payStatus}</span></div>
  </div>`;

  if (['open', 'accepted'].includes(o.status)) h += `<button class="btn danger" data-act="c-cancel" data-id="${o.id}">${T('Cancel order', '取消订单')}</button>`;
  return h;
}

/* ---------------- pro app ---------------- */
function renderPro() {
  const p = S.pro;
  let hdr, body;
  if (p.view) {
    const o = byId(p.view);
    hdr = `<button class="back" data-act="p-back">‹ ${T('Back', '返回')}</button><h1>${T('Job', '订单')} #${o.id}</h1><span style="width:40px"></span>`;
    body = proJob(o);
  } else {
    hdr = `<div class="brand">🌿 MowMate <small>PRO</small></div>
      <div class="online">${p.online ? T('Online', '接单中') : T('Offline', '已下线')}<button class="tgl ${p.online ? 'on' : ''}" data-act="p-online" aria-label="toggle online"></button></div>`;
    body = p.tab === 'mine' ? proMine() : p.tab === 'wallet' ? proWallet() : proBoard();
  }
  const openCount = p.online ? S.orders.filter(o => o.status === 'open').length : 0;
  document.getElementById('pro').innerHTML = `
    <div class="hdr">${hdr}</div>
    <div class="screen">${body}</div>
    <nav class="nav">
      ${navBtn('p', 'jobs', '📍', T('Jobs', '接单大厅'), p, openCount)}
      ${navBtn('p', 'mine', '🗓️', T('My jobs', '我的订单'), p)}
      ${navBtn('p', 'wallet', '💰', T('Wallet', '钱包'), p)}
    </nav>`;
}

function conflict(o) {
  return S.orders.find(x => x.pro === PRO_NAME && x.id !== o.id && ['accepted', 'in_progress'].includes(x.status) && x.date === o.date && x.window === o.window && o.window !== 'Anytime');
}
const cashLocked = () => S.wallet.owed > CASH_OWED_LIMIT;

function proBoard() {
  const p = S.pro;
  if (!p.online) return `<div class="empty"><div class="big">😴</div>${T("You're offline.<br>Go online to see jobs near you.", '你已下线。<br>上线后才能看到附近的订单。')}<button class="btn primary" data-act="p-online">${T('Go online', '上线接单')}</button></div>`;
  const jobs = S.orders.filter(o => o.status === 'open' && (p.filter === 'all' || o.pay === p.filter));
  jobs.sort((a, b) => p.sort === 'dist' ? a.dist - b.dist : b.price - a.price);
  return `
    <div class="pro-stats"><div><b>${S.orders.filter(o => o.status === 'open').length}</b><span>${T('Open nearby', '附近待接')}</span></div><div><b>★ ${S.wallet.rating}</b><span>${T('Rating', '评分')}</span></div><div><b>${money(S.wallet.balance)}</b><span>${T('Balance', '余额')}</span></div></div>
    <div class="filters">
      ${[['all', T('All', '全部')], ['card', '💳 ' + T('Card', '刷卡')], ['cash', '💵 ' + T('Cash', '现金')]].map(([k, v]) => `<button class="${p.filter === k ? 'on' : ''}" data-act="p-filter" data-v="${k}">${v}</button>`).join('')}
      <select data-act-change="p-sort"><option value="dist" ${p.sort === 'dist' ? 'selected' : ''}>${T('Nearest', '距离最近')}</option><option value="price" ${p.sort === 'price' ? 'selected' : ''}>${T('Highest pay', '价格最高')}</option></select>
    </div>
    ${jobs.length ? jobs.map(jobCard).join('') : `<div class="empty"><div class="big">🌾</div>${T("No open jobs right now.<br>We'll notify you when one comes in.", '暂时没有待接订单。<br>有新订单会第一时间通知你。')}</div>`}`;
}

function jobCard(o) {
  const c = conflict(o);
  const locked = o.pay === 'cash' && cashLocked();
  return `<div class="card job">
    <div class="top">${lawn('before', '', true)}
      <div class="info"><div class="row"><div class="price">${money(o.price)}</div>${payChip(o)}</div>
        <div class="line">📍 ${esc(o.street)} ${T('area', '附近')} · ${mi(o.dist)}</div>
        <div class="line">🗓️ ${fmtDate(o.date)} · ${winL(o.window)}</div>
        <div class="line">📐 ${sqft(o.area)} · ${yardL(o.yard)}</div>
      </div></div>
    <div>${o.dog ? `<span class="tag alert">🐕 ${T('Dog in yard', '院里有狗')}</span>` : ''}${c ? `<span class="tag alert">⚠ ${T('Time conflict', '时间冲突')}</span>` : ''}</div>
    <div class="acts"><button class="btn ghost" data-act="p-open" data-id="${o.id}">${T('Details', '详情')}</button>
      <button class="btn primary" data-act="p-accept" data-id="${o.id}" ${locked ? 'disabled' : ''}>${locked ? T('Settle fees first', '请先结清欠费') : T('Accept', '抢单')}</button></div>
  </div>`;
}

function proMine() {
  const mine = S.orders.filter(o => o.pro === PRO_NAME);
  const groups = [
    [T('Active', '进行中'), mine.filter(o => ['in_progress', 'pending_confirm', 'disputed'].includes(o.status))],
    [T('Upcoming', '待上门'), mine.filter(o => o.status === 'accepted').sort((a, b) => a.date.localeCompare(b.date))],
    [T('Completed', '已完成'), mine.filter(o => o.status === 'completed').sort((a, b) => b.id - a.id)],
  ];
  if (!mine.length) return `<div class="empty"><div class="big">🗓️</div>${T('No jobs yet.', '还没有接单')}<button class="btn primary" data-act="p-tab" data-tab="jobs">${T('Find jobs', '去接单')}</button></div>`;
  return groups.filter(g => g[1].length).map(([t, list]) => `<div class="sec-t">${t}</div>` + list.map(o => `
    <div class="card ord" data-act="p-open" data-id="${o.id}"><div class="top"><div><div class="b">${esc(o.street)}</div>
    <div class="meta">${fmtDate(o.date)} · ${winL(o.window)}<br>${esc(o.customer)}</div></div>
    <div style="text-align:right"><div class="price">${money(o.price)}</div>${payChip(o)}</div></div><div style="margin-top:8px">${stChip(o)}</div></div>`).join('')).join('');
}

function proJob(o) {
  const mine = o.pro === PRO_NAME;
  const fee = o.price * FEE;
  const pct = FEE * 100;
  let h = `<div class="card"><div class="row"><div class="price b" style="font-size:28px">${money(o.price)}</div><div>${payChip(o)} ${mine ? stChip(o) : ''}</div></div>
    <div class="mut small" style="margin-top:4px">${o.pay === 'cash'
      ? T(`Collect ${money(o.price)} cash · ${money(fee)} platform fee billed to your account`, `当面收现金 ${money(o.price)} · 平台服务费 ${money(fee)} 从你的账户扣除`)
      : T(`You earn ${money(o.price - fee)} after ${pct}% fee · Tips 100% yours`, `扣除 ${pct}% 服务费后到手 ${money(o.price - fee)} · 小费全归你`)}</div>
    ${mine && o.status !== 'cancelled' ? `<div style="margin-top:14px">${progress(o)}</div>` : ''}</div>`;

  h += `<div class="card"><div class="pro-card"><div class="avatar c">${esc(o.customer.split(' ').map(s => s[0]).join(''))}</div><div style="flex:1"><div class="b">${esc(o.customer)}</div><div class="mut small">★ 4.8 · ${T('Homeowner', '业主')}</div></div>
    ${mine && ['accepted', 'in_progress'].includes(o.status) ? `<button class="btn ghost sm" data-act="toast-p" data-msg="${T('Demo: masked call via +1 (512) 555-0100.', '演示：通过隐私号 +1 (512) 555-0100 通话。')}">📞</button>` : ''}</div><hr>
    <div class="kv"><span>${T('Address', '地址')}</span><span style="text-align:right">${mine ? esc(o.full) : `${esc(o.street)} ${T('area', '附近')} · ${mi(o.dist)}`}</span></div>
    ${mine ? `<div class="kv"><span>${T('Gate code', '大门密码')}</span><span class="b">${o.gate ? esc(o.gate) : '—'}</span></div>` : ''}
    <div class="kv"><span>${T('Date', '时间')}</span><span>${fmtDate(o.date)} · ${winL(o.window)}</span></div>
    <div class="kv"><span>${T('Lawn', '草坪')}</span><span>${sqft(o.area)} · ${yardL(o.yard)}</span></div>
    ${o.notes ? `<div class="kv"><span>${T('Notes', '备注')}</span><span style="text-align:right;max-width:60%">${esc(notesOf(o))}</span></div>` : ''}
    ${o.dog ? `<div class="note err">🐕 ${T('Dog in yard — ask the owner before entering.', '院子里有狗，进门前请先联系业主。')}</div>` : ''}
    ${!mine ? `<div class="note info">🔒 ${T('Exact address and gate code are shown after you accept.', '接单后才显示详细门牌号和大门密码。')}</div>` : ''}
  </div>`;

  if (!mine && o.status === 'open') {
    const locked = o.pay === 'cash' && cashLocked();
    h += locked ? `<div class="note err">${T(`You owe ${money(S.wallet.owed)} in cash-job fees. Settle in Wallet to accept cash jobs.`, `你还欠现金单服务费 ${money(S.wallet.owed)}，请先在钱包里结清，才能接现金单。`)}</div>` : '';
    h += `<button class="btn primary" data-act="p-accept" data-id="${o.id}" ${locked ? 'disabled' : ''}>${T('Accept job', '抢单')}</button>`;
  }
  if (!mine && o.status !== 'open') h += `<div class="note warn">${T('This job was taken by another pro.', '这一单已经被其他师傅接走了。')}</div>`;

  if (mine && o.status === 'accepted') {
    h += `<div class="btns"><button class="btn ghost" data-act="toast-p" data-msg="${T('Opening Google Maps → ', '正在打开 Google 地图 → ')}${esc(o.full)}">🧭 ${T('Navigate', '导航')}</button><button class="btn ghost" data-act="toast-p" data-msg="${T("Customer notified: you're on the way.", '已通知业主：你已出发。')}">🚚 ${T('On my way', '我已出发')}</button></div>
      <button class="btn primary" data-act="p-arrive" data-id="${o.id}">📷 ${T('I\'ve arrived — take "before" photo', '已到达，拍施工前照片')}</button>
      <div class="mut small" style="margin-top:6px;text-align:center">${T('GPS check-in: you must be within 300 ft of the address.', 'GPS 打卡：需在地址 300 英尺（约 90 米）范围内。')}</div>
      <button class="btn danger" data-act="p-cancel" data-id="${o.id}" style="margin-top:14px">${T('Cancel job', '取消接单')}</button>`;
  }
  if (mine && o.status === 'in_progress') {
    h += `<div class="card"><div class="b" style="margin-bottom:8px">${T('Before photo ✓', '施工前照片 ✓')}</div>${lawn('before', beforeL())}</div>`;
    if (o.pay === 'cash') {
      h += `<div class="card"><div class="b">💵 ${T('Cash received', '实收现金')}</div><div class="mut small" style="margin:4px 0 8px">${T('Enter the amount the customer paid you.', '填写业主实际付给你的金额。')}</div>
        <div class="price-in" style="font-size:24px">$<input id="cash-amt" type="number" value="${o.price}" style="font-size:24px"></div></div>
        <button class="btn primary" data-act="p-finish" data-id="${o.id}">📷 ${T('Take "after" photo & confirm cash received', '拍施工后照片，并确认已收现金')}</button>`;
    } else {
      h += `<button class="btn primary" data-act="p-finish" data-id="${o.id}">📷 ${T('Take "after" photo & finish job', '拍施工后照片，提交完工')}</button>`;
    }
  }
  if (mine && ['pending_confirm', 'completed', 'disputed'].includes(o.status)) {
    h += `<div class="card"><div class="lawn-pair">${lawn('before', beforeL())}${lawn('after', afterL())}</div></div>`;
  }
  if (mine && o.status === 'pending_confirm') h += `<div class="note info">⏳ ${T('Waiting for the customer to confirm. Auto-confirms in 48 hours.', '等待业主确认，48 小时不操作自动确认。')}</div>`;
  if (mine && o.status === 'disputed') h += `<div class="note err">${T('The customer reported a problem. Support will review photos & GPS logs and contact you.', '业主反馈了问题，客服会核查照片和 GPS 记录后联系你。')}</div>`;
  if (mine && o.status === 'completed') {
    h += `<div class="card"><div class="b" style="margin-bottom:6px">${T('Earnings', '收入明细')}</div>
      <div class="kv"><span>${T('Job price', '订单价格')}</span><span>${money(o.price)}</span></div>
      <div class="kv"><span>${T(`Platform fee (${pct}%)`, `平台服务费（${pct}%）`)}</span><span>−${money(fee)}</span></div>
      ${o.tip ? `<div class="kv"><span>${T('Tip', '小费')}</span><span>+${money(o.tip)}</span></div>` : ''}
      <hr><div class="kv"><span>${o.pay === 'cash' ? T('Kept in cash', '已收现金') : T('Added to balance', '计入余额')}</span><span class="b">${money(o.pay === 'cash' ? o.price : o.price - fee + (o.tip || 0))}</span></div>
      ${o.rating ? `<div class="kv"><span>${T('Customer rating', '业主评分')}</span><span style="color:#f5b301">${'★'.repeat(o.rating)}</span></div>` : ''}</div>`;
  }
  return h;
}

function proWallet() {
  const w = S.wallet;
  return `<div class="wallet-hero"><div class="small" style="opacity:.8">${T('Available balance', '可提现余额')}</div><div class="amt">${money(w.balance)}</div>
      <button class="btn" data-act="p-cashout" ${w.balance <= 0 ? 'disabled' : ''}>${T('Cash out to bank •••• 6789', '提现到银行卡 •••• 6789')}</button></div>
    ${w.owed > 0 ? `<div class="card"><div class="row"><div><div class="b">${T('Cash-job fees owed', '现金单服务费欠款')}</div><div class="mut small">${w.owed > CASH_OWED_LIMIT ? T('Over $50 limit — cash jobs paused', '超过 $50 上限，已暂停接现金单') : T('Auto-deducted from future card earnings', '将从之后的刷卡收入中自动扣除')}</div></div><div class="b" style="color:var(--red)">${money(w.owed)}</div></div>
      <button class="btn ghost" data-act="p-payfees">${T('Pay now with debit card', '用借记卡立即支付')}</button></div>` : ''}
    <div class="pro-stats"><div><b>${w.jobs}</b><span>${T('Jobs done', '已完成')}</span></div><div><b>★ ${w.rating}</b><span>${T('Rating', '评分')}</span></div><div><b>${S.pro.strikes}</b><span>${T('Strikes (30d)', '30天违约')}</span></div></div>
    <div class="card"><div class="b" style="margin-bottom:4px">${T('Recent activity', '最近流水')}</div>
      ${w.tx.slice(0, 12).map(t => `<div class="tx"><span>${esc(txLabel(t))}</span><span class="${t.amt >= 0 ? 'plus' : 'minus'}">${t.amt >= 0 ? '+' : '−'}${money(Math.abs(t.amt))}</span></div>`).join('')}</div>
    <div class="note info">📄 ${T('Your 1099-K tax form will be available here in January.', '每年 1 月可在这里下载 1099-K 报税表。')}</div>`;
}

/* ---------------- money logic ---------------- */
function settle(o) {
  const w = S.wallet;
  const fee = o.price * FEE;
  w.jobs++;
  if (o.pay === 'card') {
    let net = o.price - fee;
    w.tx.unshift({ k: 'card', id: o.id, amt: net });
    if (w.owed > 0) {
      const d = Math.min(w.owed, net);
      w.owed -= d; net -= d;
      w.tx.unshift({ k: 'deduct', amt: -d });
    }
    w.balance += net;
  } else {
    w.tx.unshift({ k: 'cashfee', id: o.id, amt: -fee });
    const d = Math.min(w.balance, fee);
    w.balance -= d;
    w.owed += fee - d;
  }
}

function complete(o) {
  setStatus(o, 'completed');
  settle(o);
  toast('pro', T('Job completed', '订单已完成'), o.pay === 'cash'
    ? T(`#${o.id} confirmed. ${money(o.price * FEE)} fee charged to your account.`, `#${o.id} 已确认，服务费 ${money(o.price * FEE)} 已从账户扣除。`)
    : T(`#${o.id} confirmed. ${money(o.price * (1 - FEE))} added to your balance.`, `#${o.id} 已确认，${money(o.price * (1 - FEE))} 已计入余额。`));
}

/* ---------------- actions ---------------- */
const actions = {
  side: el => { document.body.dataset.show = el.dataset.side; },
  lang: () => { LANG = LANG === 'zh' ? 'en' : 'zh'; localStorage.setItem(LANG_KEY, LANG); },
  reset: () => { if (confirm(T('Reset all demo data?', '重置所有演示数据？'))) { S = initialState(); save(); render(); } },
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
      yard: f.yard, price: Number(f.price), pay: f.pay, date: f.date, window: f.window,
      notes: f.notes.trim(), gate: f.gate.trim(), dog: f.dog, status: 'open', pro: null, log: [{ st: 'open', t: Date.now() }],
    };
    S.orders.push(o);
    S.cust.form = newForm();
    S.cust.view = o.id;
    toast('customer', T('Job posted', '订单已发布'), o.pay === 'card'
      ? T(`${money(o.price)} charged to Visa 4242 and held until the job is done.`, `已从 Visa 4242 扣款 ${money(o.price)}，完工确认后才付给师傅。`)
      : T(`Pay ${money(o.price)} in cash to your pro after the job.`, `完工后当面付给师傅现金 ${money(o.price)}。`));
    if (S.pro.online) toast('pro', T('🔔 New job nearby', '🔔 附近有新订单'), `${money(o.price)} · ${mi(o.dist)} · ${o.pay === 'cash' ? T('Cash', '现金') : T('Card', '刷卡')} · ${fmtDate(o.date)}`);
  },
  'c-raise': el => {
    const o = byId(+el.dataset.id);
    o.price += +el.dataset.v;
    toast('customer', T('Price updated', '已加价'), T(`New price ${money(o.price)}. Re-sent to nearby pros.`, `新价格 ${money(o.price)}，已重新推送给附近师傅。`));
    if (S.pro.online) toast('pro', T('⬆ Price raised', '⬆ 订单加价'), T(`Job on ${o.street} is now ${money(o.price)}`, `${o.street} 的订单涨到了 ${money(o.price)}`));
  },
  'c-cancel': el => {
    const o = byId(+el.dataset.id);
    const msg = o.status === 'open'
      ? T('Cancel this order? You will get a full refund.', '确定取消订单？将全额退款。')
      : T('Cancel this order? Free if more than 24h before the visit; otherwise a $10 fee goes to the pro.', '确定取消订单？上门前 24 小时以上取消免费，否则需支付 $10 补偿师傅。');
    if (!confirm(msg)) return false;
    const hadPro = o.pro;
    setStatus(o, 'cancelled');
    toast('customer', T('Order cancelled', '订单已取消'), o.pay === 'card' ? T(`${money(o.price)} refunded to Visa 4242.`, `${money(o.price)} 已退回 Visa 4242。`) : T('No charge.', '不收取任何费用。'));
    if (hadPro) toast('pro', T('Job cancelled', '订单被取消'), T(`Customer cancelled job #${o.id}.`, `业主取消了订单 #${o.id}。`));
  },
  'c-confirm': el => { complete(byId(+el.dataset.id)); toast('customer', T('Thanks!', '谢谢！'), T('Job confirmed. Please rate your pro.', '已确认完工，请给师傅评价。')); },
  'c-dispute': el => {
    const o = byId(+el.dataset.id);
    if (!confirm(T('Report a problem with this job? Support will review it.', '确定反馈问题？客服会介入处理。'))) return false;
    setStatus(o, 'disputed');
    toast('pro', T('⚠ Dispute opened', '⚠ 业主发起纠纷'), T(`Customer reported a problem on job #${o.id}.`, `业主对订单 #${o.id} 反馈了问题。`));
  },
  'c-star': el => { const id = +el.dataset.id; const o = byId(id); S.cust.rate[id] = { ...(S.cust.rate[id] || { tip: o.pay === 'card' ? 5 : 0 }), stars: +el.dataset.v }; },
  'c-tip': el => { const id = +el.dataset.id; S.cust.rate[id] = { ...(S.cust.rate[id] || { stars: 5 }), tip: +el.dataset.v }; },
  'c-rate': el => {
    const o = byId(+el.dataset.id);
    const r = S.cust.rate[o.id] || { stars: 5, tip: o.pay === 'card' ? 5 : 0 };
    o.rating = r.stars; o.tip = o.pay === 'card' ? r.tip : 0;
    if (o.tip) { S.wallet.balance += o.tip; S.wallet.tx.unshift({ k: 'tip', id: o.id, amt: o.tip }); }
    toast('pro', T('⭐ New review', '⭐ 收到新评价'), T(`${'★'.repeat(o.rating)} from ${o.customer}${o.tip ? ` + ${money(o.tip)} tip` : ''}`, `${o.customer} 给了 ${'★'.repeat(o.rating)}${o.tip ? `，小费 ${money(o.tip)}` : ''}`));
  },
  'c-rebook': el => {
    const o = byId(+el.dataset.id);
    Object.assign(S.cust.form, { addr: ADDRESSES.find(a => a.full === o.full).id, area: o.area, yard: o.yard, price: String(o.price), pay: o.pay, notes: o.notes, gate: o.gate, dog: o.dog });
    S.cust.view = null; S.cust.tab = 'book';
  },

  'p-tab': el => { S.pro.tab = el.dataset.tab; S.pro.view = null; },
  'p-back': () => { S.pro.view = null; },
  'p-open': el => { S.pro.view = +el.dataset.id; },
  'p-online': () => { S.pro.online = !S.pro.online; },
  'p-filter': el => { S.pro.filter = el.dataset.v; },
  'p-accept': el => {
    const o = byId(+el.dataset.id);
    if (o.status !== 'open') { toast('pro', T('Too late', '来晚了'), T('Another pro already took this job.', '这一单已被其他师傅接走。')); return; }
    const c = conflict(o);
    if (c && !confirm(T(`This overlaps with job #${c.id} (${fmtDate(c.date)}, ${winL(c.window)}). Accept anyway?`, `和订单 #${c.id}（${fmtDate(c.date)} ${winL(c.window)}）时间冲突，仍然接单吗？`))) return false;
    o.pro = PRO_NAME;
    setStatus(o, 'accepted');
    S.pro.view = o.id;
    toast('pro', T('Job accepted ✓', '抢单成功 ✓'), T(`Full address & gate code unlocked for #${o.id}.`, `订单 #${o.id} 的详细地址和大门密码已解锁。`));
    if (o.mine) toast('customer', T('🎉 Your job was accepted', '🎉 你的订单已被接单'), T(`${PRO_NAME} (★4.9) will mow your lawn on ${fmtDate(o.date)}.`, `${PRO_NAME}（★4.9）将在 ${fmtDate(o.date)} 上门割草。`));
  },
  'p-cancel': el => {
    const o = byId(+el.dataset.id);
    if (!confirm(T('Cancel this job? It will go back to the job board and count as a strike (3 strikes in 30 days = paused).', '确定取消？订单会回到接单大厅，并记违约一次（30 天内 3 次将暂停接单）。'))) return false;
    o.pro = null;
    setStatus(o, 'open');
    S.pro.strikes++;
    S.pro.view = null;
    if (o.mine) toast('customer', T('Pro cancelled', '师傅取消了接单'), T(`We're finding you another pro for job #${o.id}.`, `正在为订单 #${o.id} 重新寻找师傅。`));
  },
  'p-arrive': el => {
    const o = byId(+el.dataset.id);
    setStatus(o, 'in_progress');
    toast('pro', T('Checked in ✓', '打卡成功 ✓'), T('GPS verified · Before photo uploaded.', 'GPS 已验证 · 施工前照片已上传。'));
    if (o.mine) toast('customer', T('Your pro has arrived', '师傅已到达'), T(`${PRO_NAME} checked in and started working.`, `${PRO_NAME} 已打卡并开始施工。`));
  },
  'p-finish': el => {
    const o = byId(+el.dataset.id);
    if (o.pay === 'cash') {
      const v = Number(document.getElementById('cash-amt').value);
      if (!(v > 0)) { toast('pro', T('Check amount', '请检查金额'), T('Enter the cash amount you received.', '请填写实收现金金额。')); return false; }
      o.cashReported = v;
    }
    setStatus(o, 'pending_confirm');
    toast('pro', T('Job submitted', '已提交完工'), T('After photo uploaded. Waiting for customer confirmation.', '施工后照片已上传，等待业主确认。'));
    if (o.mine) toast('customer', T('✅ Job done!', '✅ 割草完成！'), T('Check the before/after photos and confirm.', '请查看施工前后照片并确认。'));
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
    w.tx.unshift({ k: 'cashout', amt: -w.balance });
    toast('pro', T('Transfer started', '提现已发起'), T(`${money(w.balance)} → bank •••• 6789. Arrives in 1–3 business days.`, `${money(w.balance)} → 银行卡 •••• 6789，1–3 个工作日到账。`));
    w.balance = 0;
  },
  'p-payfees': () => {
    const w = S.wallet;
    toast('pro', T('Fees paid', '欠费已结清'), T(`${money(w.owed)} charged to debit card •••• 1122.`, `已从借记卡 •••• 1122 扣款 ${money(w.owed)}。`));
    w.owed = 0;
  },
};

function renderChrome() {
  document.documentElement.lang = T('en', 'zh-CN');
  document.getElementById('tb-name').textContent = T(' Prototype demo', ' 原型演示');
  document.getElementById('tb-sub').textContent = T(
    'Left: customer app. Right: pro app. Data is shared live. Try: customer posts → pro accepts → arrives → finishes → customer confirms & rates.',
    '左边是业主端，右边是师傅端，两边数据实时联动。试试：业主下单 → 师傅抢单 → 到达 → 完工 → 业主确认并评价');
  document.getElementById('lbl-customer').textContent = T('Customer App', '业主端 · Customer App');
  document.getElementById('lbl-pro').textContent = T('Pro App', '师傅端 · Pro App');
  document.getElementById('sw-customer').textContent = T('Customer', '业主端');
  document.getElementById('sw-pro').textContent = T('Pro', '师傅端');
  document.getElementById('btn-reset').textContent = T('Reset', '重置演示');
  document.getElementById('btn-lang').textContent = T('中文', 'EN');
}

function render() { renderChrome(); renderCustomer(); renderPro(); }

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
      const root = el.closest('#pro') ? '#pro' : '#customer';
      document.querySelector(root + ' .screen').scrollTop = 0;
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
