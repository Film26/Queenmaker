// public/membership.js
// หน้า MEMBERSHIP (เมนูด้านซ้าย) - จัดระดับสมาชิกจาก "ยอดซื้อสะสมทุกปี" ของลูกค้าแต่ละคนในข้อมูลหลักที่นำเข้า (rawData)
// ไม่มีฐานข้อมูลสมาชิกแยก: ทุกตัวเลขคำนวณจากออเดอร์จริงทุกครั้งที่เปิดหน้า/ข้อมูลอัปเดต (ข้อมูลของ Sales Admin
// ถูกกรองมาจากเซิร์ฟเวอร์แล้ว จึงเห็นเฉพาะลูกค้าของตัวเองเหมือนหน้าอื่น)
// เกณฑ์ระดับตรงกับ LTV tier ของ InsightHub (25k / 12k / 4.5k) แก้ได้ที่ MEMBERSHIP_TIERS ด้านล่างที่เดียว
// สถานะความเคลื่อนไหวนับจาก "วันที่ล่าสุดในข้อมูล" ไม่ใช่วันนี้ ตัวเลขจึงไม่เปลี่ยนเองถ้าข้อมูลไม่ได้อัปเดต

const MEMBERSHIP_TIERS = [
  { id: 'platinum', name: 'Platinum', th: 'ลูกค้าระดับสูงสุด', min: 25000, color: '#1e293b', fg: '#1e293b', onBar: '#ffffff', soft: '#e2e8f0', icon: 'fa-crown' },
  { id: 'gold', name: 'Gold', th: 'ลูกค้าประจำยอดสูง', min: 12000, color: '#d95f1d', fg: '#c2410c', onBar: '#ffffff', soft: '#fdebdf', icon: 'fa-medal' },
  { id: 'silver', name: 'Silver', th: 'ลูกค้าประจำ', min: 4500, color: '#64748b', fg: '#475569', onBar: '#ffffff', soft: '#eef2f6', icon: 'fa-award' },
  { id: 'member', name: 'Member', th: 'สมาชิกทั่วไป', min: 0, color: '#cbd5e1', fg: '#64748b', onBar: '#334155', soft: '#f1f5f9', icon: 'fa-user' }
];
// วันนับจากซื้อครั้งล่าสุด (เทียบกับวันที่ล่าสุดในข้อมูล)
const MEMBERSHIP_STATUS = [
  { id: 'active', label: 'Active', th: 'ซื้อภายใน 90 วัน', maxDays: 90, color: '#15803d', bg: '#dcfce7', icon: 'fa-circle-check' },
  { id: 'risk', label: 'เสี่ยงหาย', th: '91-180 วัน', maxDays: 180, color: '#b45309', bg: '#fef3c7', icon: 'fa-triangle-exclamation' },
  { id: 'inactive', label: 'ไม่เคลื่อนไหว', th: 'เกิน 180 วัน', maxDays: Infinity, color: '#64748b', bg: '#f1f5f9', icon: 'fa-moon' }
];
const MEMBERSHIP_PAGE_SIZE = 20;
// ลูกค้าที่ยอดสะสมถึง 80% ของเกณฑ์ระดับถัดไปแล้ว = "ใกล้เลื่อนระดับ"
const MEMBERSHIP_NEAR_UPGRADE = 0.8;

const memState = { search: '', tier: 'all', sort: 'spend', page: 1 };
let memCache = { src: null, data: null };

function memEsc(v) {
  return String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const memMoney = (v) => '฿' + Math.round(v || 0).toLocaleString('th-TH');
const memCompact = (v) => (typeof formatCompactCurrency === 'function' ? formatCompactCurrency(v, 1) : memMoney(v));
const memTierOf = (spend) => MEMBERSHIP_TIERS.find(t => spend >= t.min) || MEMBERSHIP_TIERS[MEMBERSHIP_TIERS.length - 1];
const memStatusOf = (days) => MEMBERSHIP_STATUS.find(s => days <= s.maxDays);
function memMaskPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length < 7) return d ? d : '-';
  return d.slice(0, 3) + '-xxx-' + d.slice(-4);
}
function memDateText(d) {
  if (!d) return '-';
  const th = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return d.d + ' ' + th[d.m - 1] + ' ' + d.y;
}

// รวมออเดอร์เป็นรายลูกค้า: ยอดซื้อสะสม, จำนวนออเดอร์ (ไม่นับเลขออเดอร์ซ้ำ), ซื้อครั้งแรก/ล่าสุด, ช่องทางที่ซื้อบ่อยสุด
function buildMembershipData() {
  const rows = window.rawData || (typeof rawData !== 'undefined' ? rawData : []);
  if (memCache.src === rows && memCache.data) return memCache.data;
  const hasOrderCol = typeof getOrderIdColumnKey === 'function' && !!getOrderIdColumnKey();
  const byId = new Map();
  let latestVal = 0, latest = null;
  rows.forEach(row => {
    if (typeof isSaleOrder === 'function' && !isSaleOrder(row)) return;
    const id = getCustomerUniqueId(row);
    if (!id) return;
    let c = byId.get(id);
    if (!c) {
      c = { id, name: '', phone: '', spend: 0, orders: 0, orderIds: new Set(), first: null, last: null, channels: {} };
      byId.set(id, c);
    }
    if (!c.name) c.name = String(getRowValue(row, ['CustomerName', 'Customer Name', 'ชื่อ (ลูกค้า)', 'ชื่อลูกค้า', 'ชื่อ']) || '').trim();
    if (!c.phone) c.phone = String(getRowValue(row, ['Phone', 'phone', 'เบอร์โทร (ลูกค้า)', 'เบอร์โทร', 'เบอร์']) || '').trim();
    c.spend += getRowRevenueOrZero(row);
    if (hasOrderCol) {
      const oid = getOrderId(row);
      if (!oid || !c.orderIds.has(oid)) { c.orders++; if (oid) c.orderIds.add(oid); }
    } else {
      c.orders++;
    }
    const d = parseDate(window.getRowDateStr(row));
    if (d) {
      const val = d.y * 10000 + d.m * 100 + d.d;
      const dd = { y: d.y, m: d.m, d: d.d, val };
      if (!c.first || val < c.first.val) c.first = dd;
      if (!c.last || val > c.last.val) c.last = dd;
      if (val > latestVal) { latestVal = val; latest = dd; }
    }
    const ch = typeof getNormalizedChannel === 'function' ? getNormalizedChannel(getRowValue(row, ['ช่องทาง', 'Channel']), row) : '';
    if (ch) c.channels[ch] = (c.channels[ch] || 0) + 1;
  });

  const toTime = (d) => d ? Date.UTC(d.y, d.m - 1, d.d) : null;
  const latestTime = toTime(latest);
  const members = Array.from(byId.values()).map(c => {
    const tier = memTierOf(c.spend);
    const tierIdx = MEMBERSHIP_TIERS.indexOf(tier);
    const next = tierIdx > 0 ? MEMBERSHIP_TIERS[tierIdx - 1] : null;
    const days = c.last && latestTime !== null ? Math.round((latestTime - toTime(c.last)) / 86400000) : Infinity;
    const topChannel = Object.keys(c.channels).sort((a, b) => c.channels[b] - c.channels[a])[0] || '-';
    return {
      id: c.id, name: c.name || '(ไม่มีชื่อ)', phone: c.phone, spend: c.spend, orders: c.orders,
      aov: c.orders ? c.spend / c.orders : 0, first: c.first, last: c.last, days,
      tier, next, toNext: next ? Math.max(0, next.min - c.spend) : 0,
      status: memStatusOf(days), topChannel
    };
  });

  const tiers = MEMBERSHIP_TIERS.map(t => {
    const list = members.filter(m => m.tier === t);
    return { tier: t, count: list.length, spend: list.reduce((a, m) => a + m.spend, 0), active: list.filter(m => m.status.id === 'active').length };
  });
  const totalSpend = members.reduce((a, m) => a + m.spend, 0);
  const nearUpgrade = members
    .filter(m => m.next && m.spend >= m.next.min * MEMBERSHIP_NEAR_UPGRADE)
    .sort((a, b) => a.toNext - b.toNext);
  const data = { members, tiers, totalSpend, latest, nearUpgrade };
  memCache = { src: rows, data };
  return data;
}

function memInjectStyles() {
  if (document.getElementById('membership-styles')) return;
  const style = document.createElement('style');
  style.id = 'membership-styles';
  style.textContent = `
    #view-membership { font-family: 'Inter', sans-serif; color: #1e293b; }
    .mem-hero { background: #1e293b; color: #fff; border-radius: 18px; padding: 26px 30px; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 20px; align-items: flex-end; margin-bottom: 22px; position: relative; overflow: hidden; }
    .mem-hero::after { content: ''; position: absolute; right: -60px; top: -60px; width: 220px; height: 220px; border-radius: 50%; background: radial-gradient(circle, rgba(217,95,29,0.35), rgba(217,95,29,0) 70%); pointer-events: none; }
    .mem-hero-title { display: flex; align-items: center; gap: 14px; }
    .mem-hero-icon { width: 48px; height: 48px; border-radius: 14px; background: #d95f1d; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
    .mem-hero h2 { margin: 0; font-family: 'Outfit', 'Inter', sans-serif; font-size: 24px; font-weight: 800; letter-spacing: 0.5px; }
    .mem-hero p { margin: 4px 0 0; font-size: 12.5px; color: #94a3b8; }
    .mem-hero-stats { display: flex; flex-wrap: wrap; gap: 10px 30px; position: relative; z-index: 1; }
    .mem-hero-stat span { display: block; font-size: 11px; color: #94a3b8; letter-spacing: 0.3px; margin-bottom: 3px; }
    .mem-hero-stat b { font-family: 'Outfit', 'Inter', sans-serif; font-size: 22px; font-weight: 800; }
    .mem-hero-stat b small { font-size: 12px; font-weight: 600; color: #cbd5e1; margin-left: 4px; }

    .mem-tier-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-bottom: 22px; }
    @media (max-width: 1200px) { .mem-tier-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 600px) { .mem-tier-grid { grid-template-columns: 1fr; } }
    .mem-tier-card { background: #fff; border: 1px solid #eef2f7; border-radius: 16px; padding: 18px 20px; cursor: pointer; transition: box-shadow .2s, border-color .2s, transform .2s; box-shadow: 0 1px 2px rgba(15,23,42,0.04); position: relative; text-align: left; font: inherit; color: inherit; }
    .mem-tier-card:hover { box-shadow: 0 10px 24px rgba(15,23,42,0.08); transform: translateY(-1px); }
    .mem-tier-card.selected { border-color: var(--tier); box-shadow: 0 0 0 2px var(--tier) inset; }
    .mem-tier-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
    .mem-tier-badge { width: 36px; height: 36px; border-radius: 10px; background: var(--tier-soft); color: var(--tier-fg); display: flex; align-items: center; justify-content: center; font-size: 15px; }
    .mem-tier-name { font-family: 'Outfit', 'Inter', sans-serif; font-size: 16px; font-weight: 800; color: #1e293b; }
    .mem-tier-rule { font-size: 11.5px; color: #64748b; }
    .mem-tier-count { font-family: 'Outfit', 'Inter', sans-serif; font-size: 28px; font-weight: 800; color: #0f172a; line-height: 1; }
    .mem-tier-count small { font-size: 12.5px; font-weight: 600; color: #64748b; margin-left: 4px; font-family: 'Inter', sans-serif; }
    .mem-tier-meta { display: flex; justify-content: space-between; font-size: 12px; color: #64748b; margin-top: 12px; }
    .mem-tier-meta b { color: #1e293b; }
    .mem-tier-bar { height: 6px; border-radius: 3px; background: #f1f5f9; margin-top: 8px; overflow: hidden; }
    .mem-tier-bar i { display: block; height: 100%; border-radius: 3px; background: var(--tier); }

    .mem-panels { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 16px; margin-bottom: 22px; }
    @media (max-width: 1000px) { .mem-panels { grid-template-columns: 1fr; } }
    .mem-panel { background: #fff; border: 1px solid #eef2f7; border-radius: 16px; padding: 20px 22px; box-shadow: 0 1px 2px rgba(15,23,42,0.04); min-width: 0; }
    .mem-panel-title { font-size: 14.5px; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 8px; margin: 0 0 4px; }
    .mem-panel-title::before { content: ''; width: 4px; height: 16px; border-radius: 2px; background: #d95f1d; }
    .mem-panel-sub { font-size: 12px; color: #64748b; margin: 0 0 16px 12px; }
    .mem-mix-row { margin-bottom: 16px; }
    .mem-mix-label { display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 6px; }
    .mem-mix-bar { display: flex; height: 26px; border-radius: 8px; overflow: hidden; gap: 2px; background: #fff; }
    .mem-mix-bar span { display: flex; align-items: center; justify-content: center; color: #fff; font-size: 11px; font-weight: 700; min-width: 0; white-space: nowrap; overflow: hidden; }
    .mem-legend { display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 12px; color: #475569; margin-top: 4px; }
    .mem-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
    .mem-insight { margin-top: 14px; background: #f8fafc; border-radius: 10px; padding: 10px 14px; font-size: 12.5px; color: #475569; line-height: 1.6; }
    .mem-insight b { color: #1e293b; }

    .mem-up-list { display: flex; flex-direction: column; gap: 10px; max-height: 250px; overflow-y: auto; padding-right: 4px; }
    .mem-up-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; padding: 10px 12px; border-radius: 10px; background: #f8fafc; }
    .mem-up-name { font-size: 13px; font-weight: 600; color: #1e293b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .mem-up-need { font-size: 12px; font-weight: 700; color: #d95f1d; white-space: nowrap; }
    .mem-up-progress { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; font-size: 11px; color: #64748b; }
    .mem-up-progress .bar { flex: 1; height: 5px; border-radius: 3px; background: #e2e8f0; overflow: hidden; }
    .mem-up-progress .bar i { display: block; height: 100%; background: #d95f1d; border-radius: 3px; }
    .mem-empty { font-size: 12.5px; color: #94a3b8; text-align: center; padding: 30px 10px; }

    .mem-table-card { background: #fff; border: 1px solid #eef2f7; border-radius: 16px; box-shadow: 0 1px 2px rgba(15,23,42,0.04); overflow: hidden; }
    .mem-toolbar { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; justify-content: space-between; padding: 18px 22px 14px; }
    .mem-toolbar-left { display: flex; flex-direction: column; gap: 2px; }
    .mem-toolbar-right { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .mem-search { position: relative; }
    .mem-search i { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 12px; }
    .mem-search input { padding: 8px 12px 8px 32px; border: 1px solid #e2e8f0; border-radius: 999px; font: inherit; font-size: 12.5px; width: 220px; max-width: 60vw; outline: none; background: #f8fafc; }
    .mem-search input:focus { border-color: #1e293b; background: #fff; }
    .mem-chip { border: 1px solid #e2e8f0; background: #fff; color: #475569; border-radius: 999px; padding: 6px 12px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
    .mem-chip.active { background: #1e293b; border-color: #1e293b; color: #fff; }
    .mem-select { border: 1px solid #e2e8f0; border-radius: 999px; padding: 7px 12px; font: inherit; font-size: 12px; font-weight: 600; color: #1e293b; background: #fff; cursor: pointer; }
    .mem-table-wrap { overflow-x: auto; }
    .mem-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 860px; }
    .mem-table th { text-align: left; font-size: 11.5px; font-weight: 700; color: #64748b; background: #f8fafc; padding: 10px 14px; border-top: 1px solid #eef2f7; border-bottom: 1px solid #eef2f7; white-space: nowrap; }
    .mem-table th.num, .mem-table td.num { text-align: right; }
    .mem-table td { padding: 12px 14px; border-bottom: 1px solid #f1f5f9; color: #334155; white-space: nowrap; }
    .mem-table tbody tr:hover td { background: #fbfcfe; }
    .mem-cust { display: flex; align-items: center; gap: 10px; }
    .mem-avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--tier-soft); color: var(--tier-fg); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; flex-shrink: 0; }
    .mem-cust-name { font-weight: 600; color: #1e293b; max-width: 230px; overflow: hidden; text-overflow: ellipsis; }
    .mem-cust-phone { font-size: 11.5px; color: #94a3b8; }
    .mem-tier-pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 700; background: var(--tier-soft); color: var(--tier-fg); }
    .mem-status { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px; font-size: 11.5px; font-weight: 600; }
    .mem-next { font-size: 11.5px; color: #64748b; }
    .mem-pager { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; padding: 12px 22px 16px; font-size: 12px; color: #64748b; }
    .mem-pager-btns { display: flex; gap: 6px; }
    .mem-pager button { border: 1px solid #e2e8f0; background: #fff; border-radius: 8px; padding: 6px 12px; font: inherit; font-size: 12px; font-weight: 600; color: #1e293b; cursor: pointer; }
    .mem-pager button:disabled { opacity: .4; cursor: default; }
    .mem-note { font-size: 11.5px; color: #94a3b8; margin: 14px 2px 0; display: flex; gap: 6px; align-items: flex-start; }
  `;
  document.head.appendChild(style);
}

// --tier = สีแท่ง/กรอบ, --tier-fg = สีตัวอักษร/ไอคอน (Member สีอ่อนมาก จึงใช้ตัวอักษรเข้มกว่าแยกต่างหาก)
const memTierVars = (t) => `--tier:${t.color}; --tier-soft:${t.soft}; --tier-fg:${t.fg};`;

function renderMembership() {
  const container = document.getElementById('view-membership');
  if (!container) return;
  memInjectStyles();
  const rows = window.rawData || (typeof rawData !== 'undefined' ? rawData : []);
  if (!rows.length) {
    container.innerHTML = `<div class="mem-hero"><div class="mem-hero-title"><div class="mem-hero-icon"><i class="fas fa-user-tag"></i></div><div><h2>MEMBERSHIP</h2><p>ระดับสมาชิกจากยอดซื้อสะสมของลูกค้า</p></div></div></div>
      <div class="mem-panel"><div class="mem-empty"><i class="fas fa-inbox" style="font-size:28px; display:block; margin-bottom:10px; color:#cbd5e1;"></i>ยังไม่มีข้อมูล หน้านี้ใช้ข้อมูลหลัก (Import data : CRM) ที่นำเข้าไว้</div></div>`;
    return;
  }
  const data = buildMembershipData();
  const total = data.members.length;
  const activeCount = data.members.filter(m => m.status.id === 'active').length;
  const avgSpend = total ? data.totalSpend / total : 0;
  const pct = (n, d) => d ? Math.round((n / d) * 100) : 0;

  const tierCards = data.tiers.map((t, i) => {
    const prev = i > 0 ? MEMBERSHIP_TIERS[i - 1] : null;
    const rule = prev ? `ยอดสะสม ${memMoney(t.tier.min)} - ${memMoney(prev.min - 1)}` : `ยอดสะสม ${memMoney(t.tier.min)} ขึ้นไป`;
    return `
      <button type="button" class="mem-tier-card${memState.tier === t.tier.id ? ' selected' : ''}" style="${memTierVars(t.tier)}" onclick="memSetTier('${t.tier.id}')" title="ดูรายชื่อสมาชิกระดับ ${t.tier.name}">
        <div class="mem-tier-head">
          <div class="mem-tier-badge"><i class="fas ${t.tier.icon}"></i></div>
          <div><div class="mem-tier-name">${t.tier.name}</div><div class="mem-tier-rule">${t.tier.min > 0 ? rule : 'ยอดสะสมต่ำกว่า ' + memMoney(MEMBERSHIP_TIERS[i - 1].min)}</div></div>
        </div>
        <div class="mem-tier-count">${t.count.toLocaleString('th-TH')}<small>คน · ${pct(t.count, total)}%</small></div>
        <div class="mem-tier-meta"><span>ยอดขาย <b>${memCompact(t.spend)}</b></span><span>Active <b>${pct(t.active, t.count)}%</b></span></div>
        <div class="mem-tier-bar"><i style="width:${pct(t.spend, data.totalSpend)}%"></i></div>
      </button>`;
  }).join('');

  // แถบสัดส่วน 100%: จำนวนสมาชิก เทียบกับ ยอดขาย ของแต่ละระดับ (เห็นทันทีว่ากลุ่มเล็กสร้างยอดเท่าไร)
  const mixBar = (key) => `<div class="mem-mix-bar">${data.tiers.filter(t => t[key] > 0).map(t => {
    const p = (t[key] / (key === 'count' ? total : data.totalSpend)) * 100;
    return `<span style="width:${p}%; background:${t.tier.color}; color:${t.tier.onBar};" title="${t.tier.name}: ${p.toFixed(1)}%">${p >= 8 ? Math.round(p) + '%' : ''}</span>`;
  }).join('')}</div>`;
  const top = data.tiers.slice(0, 2);
  const topCount = top.reduce((a, t) => a + t.count, 0), topSpend = top.reduce((a, t) => a + t.spend, 0);

  const upList = data.nearUpgrade.length ? data.nearUpgrade.slice(0, 30).map(m => `
      <div class="mem-up-item">
        <div class="mem-up-name" title="${memEsc(m.name)}">${memEsc(m.name)} <span class="mem-tier-pill" style="${memTierVars(m.tier)} margin-left:6px;">${m.tier.name} → ${m.next.name}</span></div>
        <div class="mem-up-need">อีก ${memMoney(m.toNext)}</div>
        <div class="mem-up-progress"><div class="bar"><i style="width:${Math.min(100, (m.spend / m.next.min) * 100)}%"></i></div>${memMoney(m.spend)} / ${memMoney(m.next.min)}</div>
      </div>`).join('') : '<div class="mem-empty">ยังไม่มีลูกค้าที่ใกล้เลื่อนระดับ</div>';

  const tierChips = [{ id: 'all', name: 'ทั้งหมด' }].concat(MEMBERSHIP_TIERS).map(t =>
    `<button type="button" class="mem-chip${memState.tier === t.id ? ' active' : ''}" onclick="memSetTier('${t.id}')">${t.name}</button>`).join('');

  container.innerHTML = `
    <div class="mem-hero">
      <div class="mem-hero-title">
        <div class="mem-hero-icon"><i class="fas fa-user-tag"></i></div>
        <div><h2>MEMBERSHIP</h2><p>ระดับสมาชิกจากยอดซื้อสะสมทุกปีของลูกค้าแต่ละคน · ข้อมูลถึง ${memDateText(data.latest)}</p></div>
      </div>
      <div class="mem-hero-stats">
        <div class="mem-hero-stat"><span>สมาชิกทั้งหมด</span><b>${total.toLocaleString('th-TH')}<small>คน</small></b></div>
        <div class="mem-hero-stat"><span>Active (90 วัน)</span><b>${activeCount.toLocaleString('th-TH')}<small>${pct(activeCount, total)}%</small></b></div>
        <div class="mem-hero-stat"><span>ยอดซื้อสะสม</span><b>${memCompact(data.totalSpend)}</b></div>
        <div class="mem-hero-stat"><span>ยอดเฉลี่ยต่อสมาชิก</span><b>${memCompact(avgSpend)}</b></div>
      </div>
    </div>

    <div class="mem-tier-grid">${tierCards}</div>

    <div class="mem-panels">
      <div class="mem-panel">
        <div class="mem-panel-title">สัดส่วนสมาชิก vs ยอดขาย</div>
        <p class="mem-panel-sub">แต่ละระดับมีสมาชิกกี่ % และสร้างยอดขายกี่ % ของทั้งหมด</p>
        <div class="mem-mix-row"><div class="mem-mix-label"><span>จำนวนสมาชิก</span><span>${total.toLocaleString('th-TH')} คน</span></div>${mixBar('count')}</div>
        <div class="mem-mix-row"><div class="mem-mix-label"><span>ยอดขาย</span><span>${memMoney(data.totalSpend)}</span></div>${mixBar('spend')}</div>
        <div class="mem-legend">${MEMBERSHIP_TIERS.map(t => `<span><i style="background:${t.color}"></i>${t.name}</span>`).join('')}</div>
        <div class="mem-insight"><i class="fas fa-lightbulb" style="color:#d95f1d; margin-right:6px;"></i>สมาชิก <b>Platinum + Gold</b> มี <b>${pct(topCount, total)}%</b> ของสมาชิกทั้งหมด แต่สร้างยอดขาย <b>${pct(topSpend, data.totalSpend)}%</b></div>
      </div>
      <div class="mem-panel">
        <div class="mem-panel-title">ใกล้เลื่อนระดับ</div>
        <p class="mem-panel-sub">ยอดสะสมถึง ${Math.round(MEMBERSHIP_NEAR_UPGRADE * 100)}% ของเกณฑ์ระดับถัดไปแล้ว (${data.nearUpgrade.length.toLocaleString('th-TH')} คน) เหมาะกับการกระตุ้นให้ซื้อเพิ่ม</p>
        <div class="mem-up-list">${upList}</div>
      </div>
    </div>

    <div class="mem-table-card">
      <div class="mem-toolbar">
        <div class="mem-toolbar-left"><div class="mem-panel-title">รายชื่อสมาชิก</div><span id="mem-count" style="font-size:12px; color:#64748b; margin-left:12px;"></span></div>
        <div class="mem-toolbar-right">
          <div class="mem-search"><i class="fas fa-magnifying-glass"></i><input id="mem-search" type="search" placeholder="ค้นหาชื่อหรือเบอร์โทร" value="${memEsc(memState.search)}" oninput="memSetSearch(this.value)" aria-label="ค้นหาสมาชิก"></div>
          ${tierChips}
          <select class="mem-select" onchange="memSetSort(this.value)" aria-label="เรียงตาม">
            <option value="spend"${memState.sort === 'spend' ? ' selected' : ''}>เรียง: ยอดซื้อสะสม</option>
            <option value="orders"${memState.sort === 'orders' ? ' selected' : ''}>เรียง: จำนวนออเดอร์</option>
            <option value="recent"${memState.sort === 'recent' ? ' selected' : ''}>เรียง: ซื้อล่าสุด</option>
            <option value="next"${memState.sort === 'next' ? ' selected' : ''}>เรียง: ใกล้เลื่อนระดับ</option>
          </select>
        </div>
      </div>
      <div class="mem-table-wrap"><table class="mem-table">
        <thead><tr><th>ลูกค้า</th><th>ระดับ</th><th class="num">ยอดซื้อสะสม</th><th class="num">ออเดอร์</th><th class="num">ยอดต่อบิล</th><th>ซื้อล่าสุด</th><th>สถานะ</th><th>ช่องทางหลัก</th><th>ระดับถัดไป</th></tr></thead>
        <tbody id="mem-tbody"></tbody>
      </table></div>
      <div class="mem-pager" id="mem-pager"></div>
    </div>
    <p class="mem-note"><i class="fas fa-circle-info"></i><span>ระดับคิดจากยอดซื้อสะสมทุกปีในข้อมูลหลักที่นำเข้า · สถานะ Active / เสี่ยงหาย / ไม่เคลื่อนไหว นับจากวันที่ซื้อล่าสุดเทียบกับวันที่ล่าสุดในข้อมูล (${memDateText(data.latest)}) · เบอร์โทรแสดงแบบปิดบางส่วน</span></p>
  `;
  memRenderTable();
}

function memFilteredMembers() {
  const data = buildMembershipData();
  const q = memState.search.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, '');
  let list = data.members.filter(m => {
    if (memState.tier !== 'all' && m.tier.id !== memState.tier) return false;
    if (!q) return true;
    return m.name.toLowerCase().includes(q) || (qDigits.length >= 3 && String(m.phone).replace(/\D/g, '').includes(qDigits));
  });
  const lastVal = (m) => m.last ? m.last.val : 0;
  const sorters = {
    spend: (a, b) => b.spend - a.spend,
    orders: (a, b) => b.orders - a.orders || b.spend - a.spend,
    recent: (a, b) => lastVal(b) - lastVal(a),
    next: (a, b) => (a.next ? a.toNext : Infinity) - (b.next ? b.toNext : Infinity)
  };
  return list.sort(sorters[memState.sort] || sorters.spend);
}

function memRenderTable() {
  const tbody = document.getElementById('mem-tbody');
  if (!tbody) return;
  const list = memFilteredMembers();
  const pages = Math.max(1, Math.ceil(list.length / MEMBERSHIP_PAGE_SIZE));
  if (memState.page > pages) memState.page = pages;
  const start = (memState.page - 1) * MEMBERSHIP_PAGE_SIZE;
  const pageRows = list.slice(start, start + MEMBERSHIP_PAGE_SIZE);
  tbody.innerHTML = pageRows.length ? pageRows.map(m => `
    <tr>
      <td><div class="mem-cust"><div class="mem-avatar" style="${memTierVars(m.tier)}">${memEsc(m.name.trim().charAt(0) || '?')}</div><div><div class="mem-cust-name" title="${memEsc(m.name)}">${memEsc(m.name)}</div><div class="mem-cust-phone">${memEsc(memMaskPhone(m.phone))}</div></div></div></td>
      <td><span class="mem-tier-pill" style="${memTierVars(m.tier)}"><i class="fas ${m.tier.icon}"></i>${m.tier.name}</span></td>
      <td class="num"><b>${memMoney(m.spend)}</b></td>
      <td class="num">${m.orders.toLocaleString('th-TH')}</td>
      <td class="num">${memMoney(m.aov)}</td>
      <td>${memDateText(m.last)}</td>
      <td><span class="mem-status" style="color:${m.status.color}; background:${m.status.bg};" title="${m.status.th}"><i class="fas ${m.status.icon}"></i>${m.status.label}</span></td>
      <td>${memEsc(m.topChannel)}</td>
      <td class="mem-next">${m.next ? 'อีก ' + memMoney(m.toNext) + ' → ' + m.next.name : 'ระดับสูงสุด'}</td>
    </tr>`).join('') : '<tr><td colspan="9"><div class="mem-empty">ไม่พบสมาชิกตามที่ค้นหา</div></td></tr>';
  const countEl = document.getElementById('mem-count');
  if (countEl) countEl.textContent = list.length.toLocaleString('th-TH') + ' คน';
  const pager = document.getElementById('mem-pager');
  if (pager) {
    pager.innerHTML = `<span>แสดง ${list.length ? (start + 1).toLocaleString('th-TH') : 0}-${(start + pageRows.length).toLocaleString('th-TH')} จาก ${list.length.toLocaleString('th-TH')} คน</span>
      <div class="mem-pager-btns"><button type="button" onclick="memSetPage(${memState.page - 1})" ${memState.page <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i> ก่อนหน้า</button>
      <span style="align-self:center; padding:0 6px;">หน้า ${memState.page} / ${pages}</span>
      <button type="button" onclick="memSetPage(${memState.page + 1})" ${memState.page >= pages ? 'disabled' : ''}>ถัดไป <i class="fas fa-chevron-right"></i></button></div>`;
  }
}

function memSetTier(id) {
  memState.tier = memState.tier === id && id !== 'all' ? 'all' : id;
  memState.page = 1;
  renderMembership();
}
function memSetSearch(v) { memState.search = v; memState.page = 1; memRenderTable(); }
function memSetSort(v) { memState.sort = v; memState.page = 1; memRenderTable(); }
function memSetPage(p) { memState.page = p; memRenderTable(); }

// Export (EXPORT DATA ตอนอยู่หน้านี้): รายชื่อสมาชิกทั้งหมดตามตัวกรอง/ค้นหาที่เลือกอยู่ ไม่ใช่แค่หน้าที่แสดง
function getMembershipExportRows() {
  return memFilteredMembers().map(m => ({
    'ลูกค้า': m.name,
    'เบอร์โทร': m.phone,
    'ระดับ': m.tier.name,
    'ยอดซื้อสะสม': Math.round(m.spend * 100) / 100,
    'ออเดอร์': m.orders,
    'ยอดต่อบิล': Math.round(m.aov * 100) / 100,
    'ซื้อครั้งแรก': memDateText(m.first),
    'ซื้อล่าสุด': memDateText(m.last),
    'สถานะ': m.status.label,
    'ช่องทางหลัก': m.topChannel,
    'ระดับถัดไป': m.next ? m.next.name : '-',
    'ยอดที่ต้องซื้อเพิ่ม': m.next ? Math.round(m.toNext * 100) / 100 : 0
  }));
}

window.renderMembership = renderMembership;
window.getMembershipExportRows = getMembershipExportRows;
window.memSetTier = memSetTier; window.memSetSearch = memSetSearch; window.memSetSort = memSetSort; window.memSetPage = memSetPage;
