// public/retention.js
// Retention Analytics — ported from the standalone "Retention Dashboard.html" prototype into the
// real Queenmaker app. Reuses the app's own row-normalization helpers (getNormalizedProduct,
// getNormalizedAdmin, getNormalizedChannel, getCustomerUniqueId, parseDate, isSaleOrder, ...) instead
// of the prototype's own pre-indexed HOLISTA_DATA format, so it works directly on real imported rows.
//
// This page is intentionally a standalone form, independent of the app's shared top filter bar
// (Group/Year/Month/Channel/SubChannel/Product/SubProduct/Admin) — it shows everything imported via its
// own "Import Data for Retention" button (see dashboard.html's retentionRawData/ingestRetentionRows),
// filtered only by isSaleOrder. Earlier this reused the shared filter bar/selections, but that data is
// often a different time range than whatever the shared filters happened to be set to on another tab,
// which made freshly-imported Retention data look like it "didn't process" (silently filtered out).

const AT_RISK_DAYS = 60;
const RET_MONTH_SHORT_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const RET_VIEWS = [
  { id: 'overview', t: 'ภาพรวม' },
  { id: 'matrix', t: 'สินค้า × ช่องทาง' },
  { id: 'ltv', t: 'LTV' },
  { id: 'churn', t: 'เสี่ยงหาย / Churn' },
  { id: 'affinity', t: 'สินค้าที่ซื้อต่อ' },
  { id: 'migration', t: 'ข้ามกลุ่ม & ช่องทาง' },
  { id: 'admin', t: 'ประสิทธิภาพแอดมิน' },
  { id: 'discount', t: 'พึ่งพาส่วนลด' }
];

// ===================== row accessors (bound to the app's own normalization helpers) =====================
function retCustId(row) { return window.getCustomerUniqueId(row); }
function retProdName(row) { return window.getNormalizedProduct(row); }
function retGroupName(row) { return window.getNormalizedGroup(row); }
function retChanName(row) { return window.getNormalizedChannel(window.getRowValue(row, ['ช่องทาง', 'Channel']), row); }
function retSubChanName(row) { return window.getNormalizedSubChannel ? window.getNormalizedSubChannel(row) : 'Other'; }
function retAdminName(row) { const a = window.getNormalizedAdmin(row); return a === 'Unknown' ? null : a; }
function retParsedDate(row) { return window.parseDate(window.getRowDateStr(row)); }
function retDayNum(row) { const d = retParsedDate(row); return d ? Math.floor(Date.UTC(d.y, d.m - 1, d.d) / 86400000) : null; }
function retMonthKey(row) { const d = retParsedDate(row); return d ? d.str : null; }
function retRevenue(row) { return window.getRowRevenueOrZero(row); }
// ไม่มีคอลัมน์ส่วนลดมาตรฐานในระบบหลัก (ไม่มี helper กลางให้ใช้) - อ่านตรงจากหัวคอลัมน์ที่เป็นไปได้เอง
// เฉพาะในไฟล์นี้ ถ้าไม่พบคอลัมน์เลยจะถือว่าไม่มีส่วนลด (หน้า Discount Dependency จะโชว์ 0% แทนที่จะพัง)
function retHasDiscount(row) {
  const a = window.getRowValue(row, ['ส่วนลดท้ายบิล', 'ส่วนลดรวม', 'Discount', 'ส่วนลด']);
  const b = window.getRowValue(row, ['ส่วนลดต่อหน่วย', 'Discount Per Unit', 'ส่วนลดสินค้า']);
  const n = (s) => parseFloat((s || '').toString().replace(/[^0-9.\-]/g, '')) || 0;
  return n(a) > 0 || n(b) > 0;
}
function retMonthLabel(mk) {
  if (!mk) return '-';
  const [y, m] = mk.split('-');
  return RET_MONTH_SHORT_TH[(+m) - 1] + ' ' + y;
}

// ===================== formatting =====================
function fmtPct(x) { return ((x || 0) * 100).toFixed(1) + '%'; }
function fmtDays(x) { return x == null ? '—' : Math.round(x) + ' วัน'; }
function fmtNum(x) { return (x || 0).toLocaleString(); }
function fmtBaht(x) { return '฿' + Math.round(x || 0).toLocaleString(); }
function retAvg(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }
function retMedian(a) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function retPctile(a, p) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }

// ===================== shared metric primitives (all take a `rows` array of real row objects) =====================
function retFreqStats(daySet) {
  const d = [...daySet].sort((a, b) => a - b);
  if (d.length < 2) return null;
  let sum = 0; for (let i = 1; i < d.length; i++) sum += d[i] - d[i - 1];
  return sum / (d.length - 1);
}
// product -> customerId -> Set(dayNum)
function retCustProdDays(rows) {
  const m = new Map();
  for (const r of rows) {
    const c = retCustId(r); if (!c) continue;
    const day = retDayNum(r); if (day == null) continue;
    const pn = retProdName(r);
    let cm = m.get(pn); if (!cm) { cm = new Map(); m.set(pn, cm); }
    let s = cm.get(c); if (!s) { s = new Set(); cm.set(c, s); }
    s.add(day);
  }
  return m;
}
function retProductMetrics(rows) {
  const m = retCustProdDays(rows); const out = [];
  for (const [pn, cm] of m) {
    let buyers = 0, repeaters = 0, gapSum = 0, gapN = 0, orders = 0;
    for (const [c, s] of cm) {
      buyers++; orders += s.size;
      if (s.size >= 2) { repeaters++; const g = retFreqStats(s); if (g != null) { gapSum += g; gapN++; } }
    }
    out.push({ product: pn, buyers, repeaters, repeatRate: buyers ? repeaters / buyers : 0, freq: gapN ? gapSum / gapN : null, orders });
  }
  const rev = {}; for (const r of rows) { const pn = retProdName(r); rev[pn] = (rev[pn] || 0) + retRevenue(r); }
  out.forEach(o => o.revenue = rev[o.product] || 0);
  return out.sort((a, b) => b.buyers - a.buyers);
}
function retOverall(rows) {
  const cm = new Map(); let revenue = 0; const occ = new Set();
  let maxDay = -1;
  for (const r of rows) {
    const day = retDayNum(r);
    if (day != null && day > maxDay) maxDay = day;
    revenue += retRevenue(r);
    const c = retCustId(r); if (!c || day == null) continue;
    let s = cm.get(c); if (!s) { s = new Set(); cm.set(c, s); } s.add(day);
    occ.add(c + '|' + day);
  }
  let repeaters = 0, gapSum = 0, gapN = 0, atrisk = 0;
  for (const [c, s] of cm) {
    if (s.size >= 2) {
      repeaters++; const g = retFreqStats(s); if (g != null) { gapSum += g; gapN++; }
      const last = Math.max(...s); if (maxDay - last > AT_RISK_DAYS) atrisk++;
    }
  }
  return { customers: cm.size, orders: occ.size, revenue, repeatRate: cm.size ? repeaters / cm.size : 0, avgFreq: gapN ? gapSum / gapN : null, atrisk };
}
// customerId -> sorted [{day, mk, chan, sub, adm, groups:Set, prods:Set, disc, sales}] — one entry per
// customer+day "occasion" (multiple product rows on the same day/customer collapse into one occasion,
// same unit the rest of the app already uses for "ครั้งที่ซื้อ")
function retTimelines(rows) {
  const byC = new Map();
  for (const r of rows) {
    const c = retCustId(r); if (!c) continue;
    const day = retDayNum(r); if (day == null) continue;
    let dm = byC.get(c); if (!dm) { dm = new Map(); byC.set(c, dm); }
    let o = dm.get(day);
    if (!o) { o = { day, mk: retMonthKey(r), chan: retChanName(r), sub: retSubChanName(r), adm: retAdminName(r), groups: new Set(), prods: new Set(), disc: 0, sales: 0 }; dm.set(day, o); }
    o.groups.add(retGroupName(r)); o.prods.add(retProdName(r)); o.sales += retRevenue(r);
    if (retHasDiscount(r)) o.disc = 1;
  }
  const out = new Map();
  for (const [c, dm] of byC) out.set(c, [...dm.values()].sort((a, b) => a.day - b.day));
  return out;
}
function retProductNames(rows) {
  const s = new Set(); rows.forEach(r => s.add(retProdName(r))); return [...s].sort();
}
// monthKeys: sorted ["YYYY-MM", ...] present in the current scope
function retMonthlyReturn(rows, monthKeys) {
  const idx = new Map(monthKeys.map((k, i) => [k, i]));
  const monthAct = monthKeys.map(() => new Set());
  const monthRet = monthKeys.map(() => new Set());
  const byCP = new Map();
  for (const r of rows) {
    const c = retCustId(r); if (!c) continue;
    const mk = retMonthKey(r); if (!mk) continue;
    const k = c + '|' + retProdName(r);
    const cur = byCP.get(k); if (cur === undefined || mk < cur) byCP.set(k, mk);
  }
  for (const r of rows) {
    const c = retCustId(r); if (!c) continue;
    const mk = retMonthKey(r); const i = idx.get(mk); if (i === undefined) continue;
    const k = c + '|' + retProdName(r); const fm = byCP.get(k);
    monthAct[i].add(c);
    if (mk > fm) monthRet[i].add(c);
  }
  return monthAct.map((s, i) => ({ act: s.size, ret: monthRet[i].size, rate: s.size ? monthRet[i].size / s.size : 0 }));
}
// returns { monthKey: {size, off:[...]} } — off[k] = ลูกค้าที่ยังกลับมาซื้อในเดือนที่ fm+k (ตัด offset สูงสุด
// ไว้ที่ 11 เดือน กันตารางกว้างเกินไปเวลามีข้อมูลหลายปี)
function retCohort(rows, monthKeys) {
  const first = new Map(), monthsByC = new Map();
  for (const r of rows) {
    const c = retCustId(r); if (!c) continue;
    const mk = retMonthKey(r); if (!mk) continue;
    if (!first.has(c) || mk < first.get(c)) first.set(c, mk);
    let s = monthsByC.get(c); if (!s) { s = new Set(); monthsByC.set(c, s); } s.add(mk);
  }
  const idx = new Map(monthKeys.map((k, i) => [k, i]));
  const maxOffset = Math.max(0, Math.min(11, monthKeys.length - 1));
  const coh = {};
  monthKeys.forEach(mk => { coh[mk] = { size: 0, off: Array(maxOffset + 1).fill(0) }; });
  for (const [c, fm] of first) {
    if (!coh[fm]) continue;
    coh[fm].size++;
    const s = monthsByC.get(c), fi = idx.get(fm);
    for (let k = 0; k <= maxOffset; k++) {
      const ti = fi + k; if (ti >= monthKeys.length) break;
      if (s.has(monthKeys[ti])) coh[fm].off[k]++;
    }
  }
  return { coh, maxOffset };
}
function retChannelSwitch(rows, dim) {
  const tl = retTimelines(rows); const mat = {}; let stay = 0, switchN = 0, total = 0;
  for (const [c, occ] of tl) {
    if (occ.length < 2) continue;
    const f = dim === 'sub' ? occ[0].sub : occ[0].chan;
    const s = dim === 'sub' ? occ[1].sub : occ[1].chan;
    total++;
    if (f === s) stay++; else switchN++;
    let mm = mat[f]; if (!mm) { mm = {}; mat[f] = mm; } mm[s] = (mm[s] || 0) + 1;
  }
  return { mat, stay, switchN, total };
}

// ===================== charts =====================
let retCharts = {};
function retDestroyCharts() { for (const k in retCharts) retCharts[k].destroy(); retCharts = {}; }
function retDrawLine(id, labels, datasets, unit) {
  if (retCharts[id]) retCharts[id].destroy();
  const el = document.getElementById(id); if (!el) return;
  retCharts[id] = new Chart(el, {
    type: 'line', data: { labels, datasets },
    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { labels: { color: '#64748b' } } },
      scales: { x: { ticks: { color: '#64748b' }, grid: { color: '#f1f5f9' } },
        y: { ticks: { color: '#64748b', callback: v => v + (unit || '') }, grid: { color: '#f1f5f9' }, beginAtZero: true } } }
  });
}
function retDrawBar(id, labels, data, label, color, unit) {
  if (retCharts[id]) retCharts[id].destroy();
  const el = document.getElementById(id); if (!el) return;
  retCharts[id] = new Chart(el, {
    type: 'bar', data: { labels, datasets: [{ label, data, backgroundColor: color || '#1e293b' }] },
    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { labels: { color: '#64748b' } } },
      scales: { x: { ticks: { color: '#64748b' }, grid: { color: '#f1f5f9' } },
        y: { ticks: { color: '#64748b', callback: v => v + (unit || '') }, grid: { color: '#f1f5f9' }, beginAtZero: true } } }
  });
}
function retHeatColor(v) {
  const a = Math.max(0, Math.min(1, v));
  const r = Math.round(241 - (241 - 30) * a), g = Math.round(245 - (245 - 58) * a), b = Math.round(249 - (249 - 138) * a);
  return `rgb(${r},${g},${b})`;
}
function retHeatText(v) { return v > 0.45 ? '#fff' : '#1e293b'; }
function retInsightPanel(why, pts) {
  return `<div class="ret-panel ret-full ret-insight">
    <div class="ret-tag">Summary</div>
    <div class="ret-why">${why}</div>
    <ul class="ret-pts">${pts.filter(Boolean).map(p => `<li>${p}</li>`).join('')}</ul>
  </div>`;
}

// ===================== styles =====================
function retInjectStyles() {
  if (document.getElementById('retention-styles')) return;
  const style = document.createElement('style');
  style.id = 'retention-styles';
  style.textContent = `
    .retention-container { font-family: 'Inter','Outfit',sans-serif; color:#1e293b; }
    .retention-header { background: linear-gradient(135deg, #0b2240 0%, #1e293b 100%); color:#fff; padding:25px 30px; border-radius:16px; margin-bottom:18px; box-shadow:0 10px 20px rgba(0,0,0,0.05); }
    .retention-header-text h2 { margin:0; font-size:24px; font-weight:700; letter-spacing:.3px; }
    .retention-header-text p { margin:6px 0 0; font-size:13.5px; color:#cbd5e1; }
    .ret-scope-note { font-size:12px; color:#64748b; background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:10px 14px; margin-bottom:18px; }

    .ret-subnav { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:18px; }
    .ret-pill { padding:8px 16px; border-radius:10px; cursor:pointer; background:#f1f5f9; color:#64748b; font-weight:600; font-size:13px; border:1px solid #e2e8f0; }
    .ret-pill.active { background:#1e293b; color:#fff; border-color:#1e293b; }
    .ret-pill:hover { border-color:#1e293b; }

    .retention-kpi-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:16px; margin-bottom:18px; }
    @media (max-width:1200px) { .retention-kpi-grid { grid-template-columns:repeat(3,1fr); } }
    @media (max-width:700px) { .retention-kpi-grid { grid-template-columns:repeat(2,1fr); } }
    .retention-kpi-card { background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:18px 20px; box-shadow:0 4px 15px rgba(0,0,0,0.02); }
    .retention-kpi-lbl { font-size:10.5px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.4px; }
    .retention-kpi-val { font-size:24px; font-weight:700; margin-top:6px; color:#0f172a; }
    .retention-kpi-val.good { color:#198754; } .retention-kpi-val.warn { color:#b9791a; } .retention-kpi-val.bad { color:#dc3545; }
    .retention-kpi-d { font-size:11px; color:#94a3b8; margin-top:4px; }

    .ret-panel { background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:22px; margin-bottom:20px; }
    .ret-panel h3 { font-size:15px; margin:0 0 4px; font-weight:700; color:#1e293b; }
    .ret-hint { font-size:11.5px; color:#94a3b8; margin-bottom:14px; }
    .ret-full { grid-column:1/-1; }
    .ret-grid2 { display:grid; grid-template-columns:1.3fr 1fr; gap:18px; }
    .ret-grid2b { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
    @media (max-width:1024px) { .ret-grid2, .ret-grid2b { grid-template-columns:1fr; } }
    .ret-scroll { overflow-x:auto; }

    .ret-insight { border-left:5px solid #d95f1d; background:#fdf8f3; }
    .ret-tag { display:inline-block; font-size:10.5px; font-weight:700; letter-spacing:.3px; color:#d95f1d; background:#fdf1e6; border-radius:5px; padding:2px 8px; margin-bottom:8px; }
    .ret-why { font-size:13px; color:#1e293b; line-height:1.65; margin-bottom:10px; }
    .ret-pts { margin:0; padding-left:18px; }
    .ret-pts li { font-size:13px; color:#1e293b; line-height:1.65; margin:6px 0; }
    .ret-pts b { color:#0f172a; }

    .ret-table { width:100%; border-collapse:collapse; font-size:12.5px; }
    .ret-table th, .ret-table td { padding:8px 10px; text-align:right; border-bottom:1px solid #f1f5f9; white-space:nowrap; }
    .ret-table th:first-child, .ret-table td:first-child { text-align:left; }
    .ret-table th { color:#64748b; font-weight:600; cursor:pointer; user-select:none; font-size:11px; text-transform:uppercase; letter-spacing:.3px; }
    .ret-table tbody tr:hover { background:#f8fafc; }
    .ret-heat td { text-align:center; font-weight:600; border:1px solid #fff; }
    .ret-bar { height:6px; border-radius:4px; background:#f1f5f9; overflow:hidden; min-width:60px; display:inline-block; vertical-align:middle; }
    .ret-bar > i { display:block; height:100%; background:#d95f1d; }
    .ret-best { outline:2px solid #198754; outline-offset:-2px; border-radius:6px; }
    .ret-muted { color:#94a3b8; }

    .ret-thr { display:flex; gap:8px; margin-bottom:14px; align-items:center; flex-wrap:wrap; }
    .ret-tbtn { padding:6px 14px; border-radius:8px; border:1px solid #e2e8f0; background:#f1f5f9; color:#64748b; cursor:pointer; font-weight:600; font-size:12.5px; }
    .ret-tbtn.active { background:#1e293b; color:#fff; border-color:#1e293b; }

    .ret-flow { display:flex; gap:14px; flex-wrap:wrap; margin-top:4px; }
    .ret-flowcard { flex:1; min-width:220px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:18px; }
    .ret-flowcard .big { font-size:28px; font-weight:700; color:#1e293b; }
    .ret-flowcard .big.good { color:#198754; } .ret-flowcard .big.warn { color:#b9791a; }
    .ret-flowcard .lbl { font-size:12px; color:#64748b; margin-top:6px; line-height:1.45; }

    .ret-pill-tag { display:inline-block; padding:3px 9px; border-radius:20px; font-size:11px; font-weight:600; background:#f1f5f9; color:#1e293b; margin:2px; }
  `;
  document.head.appendChild(style);
}

// ===================== view dispatch =====================
function retRenderView(el, rows, ctx) {
  retDestroyCharts();
  const fn = { overview: retViewOverview, matrix: retViewMatrix, ltv: retViewLTV, churn: retViewChurn,
    affinity: retViewAffinity, migration: retViewMigration, admin: retViewAdmin, discount: retViewDiscount }[window.RET.view];
  fn(el, rows, ctx);
}

// ============ 1. OVERVIEW ============
function retViewOverview(el, rows, ctx) {
  const monthKeys = ctx.monthKeys;
  el.innerHTML = `
  <div class="ret-panel ret-full">
    <h3>แนวโน้ม Retention รายเดือน</h3>
    <div class="ret-hint">% ของลูกค้าที่ซื้อในเดือนนั้นซึ่งเป็น "ลูกค้าเก่า" (เคยซื้อสินค้าเดิมมาก่อน) — ยิ่งสูง = กลับมาซื้อซ้ำเยอะ</div>
    <canvas id="ret-trendChart" style="max-height:280px"></canvas>
  </div>
  <div class="ret-grid2">
    <div class="ret-panel">
      <h3>Purchase Frequency &amp; Repeat Rate ต่อสินค้า</h3>
      <div class="ret-hint">รอบซื้อซ้ำเฉลี่ย (วัน) = ตัวชี้วัดหลัก ยิ่งน้อยยิ่งซื้อถี่ · คลิกหัวคอลัมน์เพื่อเรียง</div>
      <div class="ret-scroll"><table class="ret-table" id="ret-prodTable"></table></div>
    </div>
    <div class="ret-panel">
      <h3>Cohort Retention Curve</h3>
      <div class="ret-hint">% ลูกค้าที่ยังกลับมาซื้อ ในเดือนที่ 1,2,3… นับจากเดือนที่ซื้อครั้งแรก</div>
      <canvas id="ret-cohortChart" style="max-height:200px"></canvas>
      <div class="ret-scroll" style="margin-top:12px"><table class="ret-table ret-heat" id="ret-cohortTable"></table></div>
    </div>
  </div>`;
  // trend
  const allSeries = retMonthlyReturn(rows, monthKeys);
  const datasets = [{ label: 'ทุกช่องทาง', data: allSeries.map(x => +(x.rate * 100).toFixed(1)),
    borderColor: '#1e293b', backgroundColor: 'rgba(30,41,59,.10)', tension: .3, fill: true, pointRadius: 3 }];
  retDrawLine('ret-trendChart', monthKeys.map(retMonthLabel), datasets, '%');
  // products table
  const m = retProductMetrics(rows);
  const t = document.getElementById('ret-prodTable');
  const head = `<thead><tr><th data-s="product">สินค้า</th><th data-s="buyers">ลูกค้า</th>
    <th data-s="repeatRate">Repeat</th><th data-s="freq">รอบซื้อซ้ำ</th><th data-s="orders">ครั้งซื้อ</th><th data-s="revenue">ยอดขาย</th></tr></thead>`;
  const draw = () => {
    const maxRate = Math.max(.0001, ...m.map(x => x.repeatRate));
    t.innerHTML = head + '<tbody>' + m.map(x => `<tr><td>${x.product}</td><td>${fmtNum(x.buyers)}</td>
      <td><span class="ret-bar"><i style="width:${x.repeatRate / maxRate * 100}%"></i></span> ${fmtPct(x.repeatRate)}</td>
      <td>${fmtDays(x.freq)}</td><td>${fmtNum(x.orders)}</td><td>${fmtBaht(x.revenue)}</td></tr>`).join('') + '</tbody>';
    t.querySelectorAll('th').forEach(th => th.onclick = () => { const s = th.dataset.s;
      m.sort((a, b) => typeof a[s] === 'string' ? a[s].localeCompare(b[s]) : (b[s] || 0) - (a[s] || 0)); draw(); });
  };
  draw();
  // cohort
  const { coh, maxOffset } = retCohort(rows, monthKeys);
  let chead = '<thead><tr><th>Cohort</th><th>ราย</th>';
  for (let k = 0; k <= maxOffset; k++) chead += `<th>M${k}</th>`;
  chead += '</tr></thead>';
  let cbody = '';
  const curve = Array(maxOffset + 1).fill(0), curveN = Array(maxOffset + 1).fill(0);
  monthKeys.forEach(mk => {
    const c = coh[mk]; if (!c.size) return;
    cbody += `<tr><td style="background:#fff;color:#1e293b">${retMonthLabel(mk)}</td><td style="background:#fff;color:#64748b">${c.size}</td>`;
    for (let k = 0; k <= maxOffset; k++) {
      const v = c.off[k] / c.size;
      if (k > 0) { curve[k] += c.off[k]; curveN[k] += c.size; }
      cbody += `<td style="background:${retHeatColor(v)};color:${retHeatText(v)}">${k === 0 ? c.size : (v * 100).toFixed(0) + '%'}</td>`;
    }
    cbody += '</tr>';
  });
  document.getElementById('ret-cohortTable').innerHTML = chead + '<tbody>' + cbody + '</tbody>';
  const avgc = curve.map((s, i) => i === 0 ? 100 : (curveN[i] ? +(s / curveN[i] * 100).toFixed(1) : 0));
  avgc[0] = 100;
  retDrawLine('ret-cohortChart', avgc.map((_, i) => 'M' + i),
    [{ label: '% ลูกค้าที่ยังกลับมาซื้อ', data: avgc, borderColor: '#198754', backgroundColor: 'rgba(25,135,84,.12)', tension: .3, fill: true, pointRadius: 3 }], '%');
  // insight
  const totB = m.reduce((s, x) => s + x.buyers, 0);
  const wRepeat = totB ? m.reduce((s, x) => s + x.repeatRate * x.buyers, 0) / totB : 0;
  const fs = m.filter(x => x.buyers >= 10 && x.freq != null).sort((a, b) => a.freq - b.freq);
  const bestF = fs[0], worstF = fs[fs.length - 1];
  const ser = retMonthlyReturn(rows, monthKeys).filter(x => x.act > 0);
  const eAvg = ser.slice(0, 3).reduce((s, x) => s + x.rate, 0) / (Math.min(3, ser.length) || 1);
  const lAvg = ser.slice(-3).reduce((s, x) => s + x.rate, 0) / (Math.min(3, ser.length) || 1);
  const trendTxt = lAvg > eAvg * 1.05 ? '<b>ดีขึ้น</b>' : lAvg < eAvg * 0.95 ? '<b>แย่ลง</b>' : 'ทรงตัว';
  el.insertAdjacentHTML('beforeend', retInsightPanel(
    'หน้านี้ตอบคำถามหลัก: "ลูกค้ากลับมาซื้อซ้ำดีแค่ไหน" — ตัวชี้วัดหัวใจคือ <b>Purchase Frequency (รอบซื้อซ้ำเป็นวัน)</b> ยิ่งสั้นยิ่งดี เพราะกำไรจริงมาจากการซื้อซ้ำ ไม่ใช่การขายครั้งแรก',
    [
      bestF && `สินค้าที่ลูกค้ากลับมาซื้อ<b>ถี่ที่สุด</b>: <b>${bestF.product}</b> ~${fmtDays(bestF.freq)} (${fmtNum(bestF.buyers)} คน)`,
      worstF && bestF !== worstF && `ซื้อซ้ำ<b>ช้าที่สุด</b>: <b>${worstF.product}</b> ~${fmtDays(worstF.freq)} — ควรหาสาเหตุว่าทำไมลูกค้าไม่กลับมา`,
      `Repeat rate เฉลี่ย (ถ่วงตามจำนวนลูกค้า) ~<b>${fmtPct(wRepeat)}</b> — ส่วนที่เหลือคือลูกค้าซื้อครั้งเดียวแล้วหาย`,
      `แนวโน้มการกลับมาซื้อซ้ำรายเดือนช่วงหลังเทียบช่วงต้น: ${trendTxt}`,
      'Cohort curve: เส้นที่ลาดชันเร็วแปลว่ารั่วเร็ว ต้องรีบ follow-up ช่วงเดือนแรก'
    ]
  ));
}

// ============ 2. MATRIX ============
function retViewMatrix(el, rows, ctx) {
  const dim = window.RET.matrixDim;
  const dimTxt = dim === 'chan' ? 'ช่องทาง' : 'ช่องทางย่อย';
  el.innerHTML = `<div class="ret-panel ret-full">
    <h3>เปรียบเทียบ Repeat Rate : สินค้า × ${dimTxt}</h3>
    <div class="ret-hint">กรอบเขียว = ${dimTxt}ที่ดีที่สุดของสินค้านั้น (เฉพาะที่มีลูกค้า ≥ 5 คน)</div>
    <div class="ret-thr" id="ret-matrixDim"></div>
    <div class="ret-scroll"><table class="ret-table ret-heat" id="ret-matrixTable"></table></div></div>`;
  document.getElementById('ret-matrixDim').innerHTML = 'เปรียบเทียบตาม: ' +
    [['chan', 'ช่องทาง (Channel)'], ['sub', 'ช่องทางย่อย (SubChannel)']].map(([v, t]) =>
      `<span class="ret-tbtn ${v === dim ? 'active' : ''}" data-d="${v}">${t}</span>`).join('');
  document.querySelectorAll('#ret-matrixDim .ret-tbtn').forEach(b => b.onclick = () => { window.RET.matrixDim = b.dataset.d; ctx.rerender(); });
  const names = retProductNames(rows);
  const base = ctx.scoped();
  const getDim = dim === 'chan' ? retChanName : retSubChanName;
  const cols = [...new Set(base.map(getDim))].sort();
  const data = {}; names.forEach(n => data[n] = {});
  cols.forEach(ci => {
    const sub = base.filter(r => getDim(r) === ci);
    retProductMetrics(sub).forEach(x => { if (data[x.product]) data[x.product][ci] = { rate: x.repeatRate, buyers: x.buyers }; });
  });
  let head = `<thead><tr><th>สินค้า \\ ${dimTxt}</th>`;
  cols.forEach(ci => head += `<th>${ci}</th>`);
  head += '</tr></thead>';
  let body = '';
  names.forEach(n => {
    let best = -1, bestRate = -1;
    cols.forEach(ci => { const d = data[n][ci]; if (d && d.buyers >= 5 && d.rate > bestRate) { bestRate = d.rate; best = ci; } });
    if (!cols.some(ci => data[n][ci] && data[n][ci].buyers > 0)) return;
    body += `<tr><td>${n}</td>`;
    cols.forEach(ci => {
      const d = data[n][ci];
      if (!d || d.buyers === 0) { body += `<td class="ret-muted">—</td>`; return; }
      const cls = ci === best ? 'class="ret-best"' : '';
      body += `<td ${cls} title="${d.buyers} ลูกค้า">${fmtPct(d.rate)}<br><span class="ret-muted" style="font-size:10px">n=${d.buyers}</span></td>`;
    });
    body += '</tr>';
  });
  document.getElementById('ret-matrixTable').innerHTML = head + '<tbody>' + body + '</tbody>';
  let topCell = null;
  names.forEach(n => cols.forEach(ci => { const d = data[n][ci]; if (d && d.buyers >= 5 && (!topCell || d.rate > topCell.rate)) topCell = { product: n, col: ci, rate: d.rate, buyers: d.buyers }; }));
  const colScore = [];
  cols.forEach(ci => { let sr = 0, sb = 0; names.forEach(n => { const d = data[n][ci]; if (d && d.buyers >= 5) { sr += d.rate * d.buyers; sb += d.buyers; } }); if (sb >= 10) colScore.push({ col: ci, rate: sr / sb, buyers: sb }); });
  colScore.sort((a, b) => b.rate - a.rate);
  const bC = colScore[0], wC = colScore[colScore.length - 1];
  el.insertAdjacentHTML('beforeend', retInsightPanel(
    `ตารางนี้บอกว่า<b>สินค้าแต่ละตัวซื้อซ้ำดีใน${dimTxt}ไหน</b> ใช้เลือกว่าจะดัน SKU ไหนผ่าน${dimTxt}ไหน (เฉพาะกลุ่มที่มีลูกค้า ≥ 5 คน จึงเชื่อถือได้)`,
    [
      topCell && `คู่ที่ซื้อซ้ำดีที่สุด: <b>${topCell.product}</b> ผ่าน <b>${topCell.col}</b> ที่ ${fmtPct(topCell.rate)} (n=${topCell.buyers})`,
      bC && `${dimTxt}ที่ทำให้ลูกค้ากลับมาซื้อซ้ำดีสุดโดยรวม: <b>${bC.col}</b> (~${fmtPct(bC.rate)})`,
      wC && bC !== wC && `อ่อนสุด: <b>${wC.col}</b> (~${fmtPct(wC.rate)}) — ควรดู follow-up หลังการขาย`,
      'ช่อง "—" = ลูกค้าน้อยเกินสรุป อย่าตีความ'
    ]
  ));
}

// ============ 3. LTV ============
function retViewLTV(el, rows) {
  const tl = retTimelines(rows);
  const rev = []; const groupRev = {}; const bothRev = [];
  const byCount = { one: [], two: [], three: [] };
  for (const [c, occ] of tl) {
    const total = occ.reduce((s, o) => s + o.sales, 0); rev.push(total);
    const gs = new Set(); occ.forEach(o => o.groups.forEach(g => gs.add(g)));
    if (gs.has('Holista') && gs.has('Kides')) bothRev.push(total);
    gs.forEach(g => { if (!groupRev[g]) groupRev[g] = []; groupRev[g].push(total); });
    if (occ.length === 1) byCount.one.push(total); else if (occ.length === 2) byCount.two.push(total); else byCount.three.push(total);
  }
  const n = tl.size;
  const avgLTV = retAvg(rev), medLTV = retMedian(rev), top10 = retPctile(rev, 0.9);
  const avgOrders = n ? [...tl.values()].reduce((s, o) => s + o.length, 0) / n : 0;
  el.innerHTML = `
  <div class="retention-kpi-grid">
    <div class="retention-kpi-card"><div class="retention-kpi-lbl">LTV เฉลี่ย / ลูกค้า</div><div class="retention-kpi-val">${fmtBaht(avgLTV)}</div><div class="retention-kpi-d">ยอดซื้อสะสมเฉลี่ยต่อคน</div></div>
    <div class="retention-kpi-card"><div class="retention-kpi-lbl">LTV มัธยฐาน</div><div class="retention-kpi-val">${fmtBaht(medLTV)}</div><div class="retention-kpi-d">ค่ากลาง (ตัดค่าสุดโต่ง)</div></div>
    <div class="retention-kpi-card"><div class="retention-kpi-lbl">Top 10% เริ่มที่</div><div class="retention-kpi-val good">${fmtBaht(top10)}</div><div class="retention-kpi-d">ลูกค้ามูลค่าสูง</div></div>
    <div class="retention-kpi-card"><div class="retention-kpi-lbl">ครั้งซื้อเฉลี่ย / คน</div><div class="retention-kpi-val">${avgOrders.toFixed(2)}</div><div class="retention-kpi-d">occasions ต่อลูกค้า</div></div>
    <div class="retention-kpi-card"><div class="retention-kpi-lbl">ลูกค้าทั้งหมด</div><div class="retention-kpi-val">${fmtNum(n)}</div><div class="retention-kpi-d">ในขอบเขตที่กรอง</div></div>
  </div>
  <div class="ret-grid2b">
    <div class="ret-panel"><h3>LTV ตามจำนวนครั้งที่ซื้อ</h3>
      <div class="ret-hint">ลูกค้าที่ซื้อบ่อยสร้างมูลค่าต่างกันแค่ไหน — เหตุผลที่ต้องดัน repeat</div>
      <div class="ret-scroll"><table class="ret-table" id="ret-ltvCount"></table></div></div>
    <div class="ret-panel"><h3>LTV ตามกลุ่มสินค้า</h3>
      <div class="ret-hint">ลูกค้าที่ซื้อข้ามกลุ่ม (Kides+Holista) มักมีมูลค่าสูงสุด</div>
      <div class="ret-scroll"><table class="ret-table" id="ret-ltvGroup"></table></div></div>
  </div>
  <div class="ret-panel ret-full"><h3>การกระจายของ LTV</h3>
    <div class="ret-hint">จำนวนลูกค้าในแต่ละช่วงยอดซื้อสะสม</div>
    <canvas id="ret-ltvHist" style="max-height:260px"></canvas></div>`;
  const seg = (lbl, a) => `<tr><td>${lbl}</td><td>${fmtNum(a.length)}</td><td>${fmtBaht(retAvg(a))}</td><td>${fmtBaht(retMedian(a))}</td><td>${fmtBaht(a.reduce((s, x) => s + x, 0))}</td></tr>`;
  document.getElementById('ret-ltvCount').innerHTML =
    `<thead><tr><th>กลุ่ม</th><th>ลูกค้า</th><th>LTV เฉลี่ย</th><th>มัธยฐาน</th><th>รวม</th></tr></thead><tbody>` +
    seg('ซื้อครั้งเดียว', byCount.one) + seg('ซื้อ 2 ครั้ง', byCount.two) + seg('ซื้อ 3 ครั้งขึ้นไป', byCount.three) + `</tbody>`;
  document.getElementById('ret-ltvGroup').innerHTML =
    `<thead><tr><th>กลุ่ม</th><th>ลูกค้า</th><th>LTV เฉลี่ย</th><th>มัธยฐาน</th><th>รวม</th></tr></thead><tbody>` +
    Object.keys(groupRev).sort().map(g => seg(g, groupRev[g])).join('') + seg('ซื้อทั้งสองกลุ่ม', bothRev) + `</tbody>`;
  const edges = [0, 500, 1000, 2000, 3000, 5000, 10000, Infinity];
  const labels = ['<500', '500–1K', '1–2K', '2–3K', '3–5K', '5–10K', '10K+'];
  const counts = Array(labels.length).fill(0);
  rev.forEach(v => { for (let i = 0; i < edges.length - 1; i++) { if (v < edges[i + 1]) { counts[i]++; break; } } });
  retDrawBar('ret-ltvHist', labels, counts, 'จำนวนลูกค้า', '#1e293b', '');
  const sum = rev.reduce((s, x) => s + x, 0);
  const sortedRev = [...rev].sort((a, b) => a - b);
  const t10n = Math.max(1, Math.ceil(n * 0.1));
  const t10share = sum ? sortedRev.slice(-t10n).reduce((s, x) => s + x, 0) / sum : 0;
  const oneAvg = retAvg(byCount.one), repAvg = retAvg(byCount.two.concat(byCount.three));
  const mult = oneAvg ? repAvg / oneAvg : 0;
  const bothAvg = retAvg(bothRev);
  const oneShare = n ? byCount.one.length / n : 0;
  el.insertAdjacentHTML('beforeend', retInsightPanel(
    'LTV (มูลค่ารวมที่ลูกค้าหนึ่งคนจ่ายตลอดการเป็นลูกค้า) ใช้กำหนด<b>เพดานงบค่าโฆษณาหาลูกค้าใหม่ (CAC)</b> และบอกว่าควรทุ่มดูแลใคร',
    [
      `ดู<b>มัธยฐาน (${fmtBaht(medLTV)}) มากกว่าค่าเฉลี่ย (${fmtBaht(avgLTV)})</b> เพราะการกระจายเบ้ — ลูกค้าหัวกะทิไม่กี่คนลากค่าเฉลี่ยขึ้น`,
      `ลูกค้า <b>Top 10% สร้างรายได้ ~${fmtPct(t10share)}</b> ของทั้งหมด — ควรมีระบบดูแล VIP แยก`,
      mult > 1 && `ลูกค้าซื้อซ้ำมีค่ามากกว่าซื้อครั้งเดียว <b>~${mult.toFixed(1)} เท่า</b> (${fmtBaht(repAvg)} vs ${fmtBaht(oneAvg)}) — ดันซื้อครั้งที่สองคือคันโยกเพิ่ม LTV ที่ง่ายสุด`,
      oneShare > 0 && `ตอนนี้ลูกค้าซื้อครั้งเดียวแล้วหายมีถึง <b>${fmtPct(oneShare)}</b> — ช่องว่างที่ยังเก็บเกี่ยวได้มาก`,
      bothRev.length > 0 && `ลูกค้าที่<b>ซื้อข้ามกลุ่ม</b> มี LTV เฉลี่ย ${fmtBaht(bothAvg)} สูงกว่าค่าเฉลี่ยทั่วไปชัดเจน — cross-sell ข้ามกลุ่มคือเครื่องยกระดับ LTV ที่ทรงพลัง`
    ]
  ));
}

// ============ 4. CHURN ============
function retRecencyStats(rows, thr) {
  const tl = retTimelines(rows); let maxDay = -1;
  for (const r of rows) { const d = retDayNum(r); if (d != null && d > maxDay) maxDay = d; }
  const buckets = [0, 0, 0, 0]; let atrisk = 0, churned = 0; const list = [];
  for (const [c, occ] of tl) {
    const last = occ[occ.length - 1].day; const rec = maxDay - last;
    const ltv = occ.reduce((s, o) => s + o.sales, 0);
    if (rec <= 30) buckets[0]++; else if (rec <= 60) buckets[1]++; else if (rec <= 90) buckets[2]++; else buckets[3]++;
    if (rec > thr) { churned++; if (occ.length >= 2) atrisk++; list.push({ c, rec, ltv, orders: occ.length }); }
  }
  list.sort((a, b) => b.ltv - a.ltv);
  return { maxDay, buckets, atrisk, churned, n: tl.size, top: list.slice(0, 25) };
}
function retViewChurn(el, rows, ctx) {
  el.innerHTML = `
  <div class="ret-panel ret-full">
    <h3>Churn / ลูกค้าเสี่ยงหาย</h3>
    <div class="ret-hint">เลือกเกณฑ์ "เงียบกี่วันถือว่าเสี่ยง" — นับจากวันซื้อล่าสุดเทียบวันล่าสุดในชุดข้อมูล</div>
    <div class="ret-thr" id="ret-thrBar"></div>
    <div class="retention-kpi-grid" id="ret-churnCards"></div>
    <div class="ret-grid2">
      <div class="ret-panel" style="margin:0"><h3>การกระจายตาม Recency</h3>
        <div class="ret-hint">ลูกค้าเงียบไปนานแค่ไหนแล้ว</div>
        <canvas id="ret-recChart" style="max-height:220px"></canvas></div>
      <div class="ret-panel" style="margin:0"><h3>Top ลูกค้าเสี่ยงหาย (ตามมูลค่า)</h3>
        <div class="ret-hint">ควรโทร/ยิงแคมเปญดึงกลับก่อน — เรียงตาม LTV</div>
        <div class="ret-scroll" style="max-height:300px"><table class="ret-table" id="ret-churnTop"></table></div></div>
    </div>
  </div>
  <div id="ret-churnInsight"></div>`;
  const draw = () => {
    document.getElementById('ret-thrBar').innerHTML = 'เกณฑ์: ' + [30, 45, 60, 90].map(t =>
      `<span class="ret-tbtn ${t === window.RET.churnThr ? 'active' : ''}" data-t="${t}">${t} วัน</span>`).join('');
    document.querySelectorAll('#ret-thrBar .ret-tbtn').forEach(b => b.onclick = () => { window.RET.churnThr = +b.dataset.t; draw(); });
    const s = retRecencyStats(rows, window.RET.churnThr);
    document.getElementById('ret-churnCards').innerHTML = [
      { k: 'ลูกค้าเสี่ยง/หาย', v: fmtNum(s.churned), cls: 'bad', d: `เงียบเกิน ${window.RET.churnThr} วัน` },
      { k: '% ของลูกค้าทั้งหมด', v: fmtPct(s.n ? s.churned / s.n : 0), cls: 'bad', d: `จาก ${fmtNum(s.n)} คน` },
      { k: 'เคยซื้อซ้ำแต่หาย', v: fmtNum(s.atrisk), cls: 'warn', d: 'ลูกค้าประจำที่กำลังหลุด' },
      { k: 'ยังใช้งาน (≤30 วัน)', v: fmtNum(s.buckets[0]), cls: 'good', d: 'ซื้อล่าสุดไม่นาน' }
    ].map(x => `<div class="retention-kpi-card"><div class="retention-kpi-lbl">${x.k}</div><div class="retention-kpi-val ${x.cls}">${x.v}</div><div class="retention-kpi-d">${x.d}</div></div>`).join('');
    retDrawBar('ret-recChart', ['0–30 วัน', '31–60', '61–90', '90+ วัน'], s.buckets, 'จำนวนลูกค้า', '#1e293b', '');
    document.getElementById('ret-churnTop').innerHTML =
      `<thead><tr><th>ลูกค้า</th><th>เงียบ (วัน)</th><th>ครั้งซื้อ</th><th>LTV</th></tr></thead><tbody>` +
      s.top.map(x => `<tr><td>#${x.c.slice(-6)}</td><td>${x.rec}</td><td>${x.orders}</td><td>${fmtBaht(x.ltv)}</td></tr>`).join('') + `</tbody>`;
    const topLTV = s.top.reduce((a, x) => a + x.ltv, 0);
    document.getElementById('ret-churnInsight').innerHTML = retInsightPanel(
      `Churn วัดว่าลูกค้า<b>เงียบหายไปแล้วแค่ไหน</b> — การรู้ "ใครกำลังจะหลุด" ก่อนที่เขาจะหายจริง ทำให้ยิงแคมเปญดึงกลับได้ทัน (ที่เกณฑ์ปัจจุบัน <b>เงียบเกิน ${window.RET.churnThr} วัน</b> = เสี่ยง)`,
      [
        `ตอนนี้ <b>${fmtNum(s.churned)} คน (${fmtPct(s.n ? s.churned / s.n : 0)})</b> เข้าเกณฑ์เสี่ยง/หาย — ปรับเกณฑ์วันด้านบนเพื่อดูความไวต่างกัน`,
        `ในนั้นมี <b>${fmtNum(s.atrisk)} คนที่เคยซื้อซ้ำแล้ว</b> แต่กำลังหลุด — กลุ่มนี้ "คุ้มดึงกลับที่สุด"`,
        `ตาราง Top เสี่ยงเรียงตามมูลค่า: 25 คนบนสุดรวม LTV ~<b>${fmtBaht(topLTV)}</b> — เริ่มโทร/ยิงแคมเปญจากหัวตารางให้ผลตอบแทนสูงสุด`,
        `ลูกค้ายัง active (ซื้อใน 30 วัน) มี <b>${fmtNum(s.buckets[0])}</b> คน — ส่วนที่เลยไปทาง 90+ วันคือกลุ่มที่แทบกู้ไม่กลับแล้ว`
      ]
    );
  };
  draw();
}

// ============ 5. AFFINITY ============
function retViewAffinity(el, rows) {
  const tl = retTimelines(rows);
  const trans = new Map(); const starters = new Map();
  for (const [c, occ] of tl) {
    const seen = new Map();
    for (const o of occ) for (const p of o.prods) if (!seen.has(p)) seen.set(p, o.day);
    const seq = [...seen.entries()].sort((a, b) => a[1] - b[1]).map(e => e[0]);
    for (let i = 0; i < seq.length - 1; i++) {
      const A = seq[i], B = seq[i + 1];
      let mm = trans.get(A); if (!mm) { mm = new Map(); trans.set(A, mm); } mm.set(B, (mm.get(B) || 0) + 1);
      starters.set(A, (starters.get(A) || 0) + 1);
    }
  }
  const names = retProductNames(rows).filter(n => trans.has(n));
  let body = '';
  names.sort((a, b) => (starters.get(b) || 0) - (starters.get(a) || 0)).forEach(A => {
    const mm = trans.get(A); const tot = starters.get(A) || 1;
    const nexts = [...mm.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const cells = nexts.map(([B, ct]) => `<span class="ret-pill-tag">${B} · ${fmtPct(ct / tot)} <span class="ret-muted">(${ct})</span></span>`).join(' ');
    body += `<tr><td>${A}</td><td class="ret-muted">${fmtNum(tot)}</td><td style="text-align:left">${cells || '<span class="ret-muted">—</span>'}</td></tr>`;
  });
  el.innerHTML = `<div class="ret-panel ret-full">
    <h3>สินค้าที่ลูกค้าซื้อ "ต่อ" (Next-Best Product)</h3>
    <div class="ret-hint">ลูกค้าที่ซื้อสินค้า A เป็นหลัก ครั้งถัดไปมักไปซื้ออะไร — ใช้ออกแบบ cross-sell / bundle</div>
    <div class="ret-scroll"><table class="ret-table"><thead><tr><th>ซื้อสินค้านี้</th><th>ลูกค้าที่ซื้อต่อ</th><th style="text-align:left">สินค้าถัดไปยอดนิยม (Top 3)</th></tr></thead><tbody>${body || '<tr><td colspan=3 class="ret-muted">ไม่พบลำดับการซื้อต่อในขอบเขตนี้</td></tr>'}</tbody></table></div>
  </div>`;
  const topA = names[0]; let topLine = '', secondLine = '';
  if (topA) { const mm = trans.get(topA); const tot = starters.get(topA) || 1; const nx = [...mm.entries()].sort((a, b) => b[1] - a[1])[0];
    topLine = `สินค้าที่มีลูกค้าซื้อต่อมากสุด: ลูกค้า <b>${topA}</b> ครั้งถัดไปมักไป <b>${nx[0]}</b> (${fmtPct(nx[1] / tot)} ของ ${fmtNum(tot)} คน) — คู่นี้เหมาะทำ bundle`; }
  if (names[1]) { const A = names[1]; const mm = trans.get(A); const tot = starters.get(A) || 1; const nx = [...mm.entries()].sort((a, b) => b[1] - a[1])[0];
    secondLine = `รองลงมา: <b>${A}</b> → <b>${nx[0]}</b> (${fmtPct(nx[1] / tot)})`; }
  el.insertAdjacentHTML('beforeend', retInsightPanel(
    'หน้านี้ดูว่า<b>ซื้อ A แล้วมักไปซื้อ B อะไรต่อ</b> เรียงตามลำดับเวลาจริงของลูกค้า — ใช้ออกแบบ cross-sell, จัดชุด bundle, และสคริปต์แนะนำสินค้าชิ้นถัดไปให้ถูกตัว',
    [topLine, secondLine, 'เปอร์เซ็นต์สูง = เส้นทางการซื้อที่เกิดเองตามธรรมชาติ ควรเร่งด้วยโปรโมชันจับคู่', 'ถ้าสินค้าตัวหนึ่งไม่มีสินค้าต่อที่ชัด แปลว่าลูกค้าซื้อแล้วจบ — โอกาสสร้าง bundle ใหม่']
  ));
}

// ============ 6. MIGRATION ============
function retViewMigration(el, rows) {
  const tl = retTimelines(rows);
  let startK = 0, startH = 0, startBoth = 0, kThenH = 0, hThenK = 0;
  for (const [c, occ] of tl) {
    const fg = occ[0].groups; const all = new Set(); occ.forEach(o => o.groups.forEach(g => all.add(g)));
    const sk = fg.has('Kides'), sh = fg.has('Holista');
    if (sk && sh) startBoth++;
    else if (sk) { startK++; if (all.has('Holista')) kThenH++; }
    else if (sh) { startH++; if (all.has('Kides')) hThenK++; }
  }
  const sdim = window.RET.switchDim, sdimTxt = sdim === 'chan' ? 'ช่องทาง' : 'ช่องทางย่อย';
  const cs = retChannelSwitch(rows, sdim);
  const cols = Object.keys(cs.mat).sort();
  let head = `<thead><tr><th>${sdimTxt}แรก \\ ${sdimTxt}ถัดไป</th>`;
  cols.forEach(ci => head += `<th>${ci}</th>`);
  head += '</tr></thead>';
  let mbody = '';
  cols.forEach(fi => {
    const row = cs.mat[fi]; const tot = Object.values(row).reduce((s, x) => s + x, 0); if (!tot) return;
    mbody += `<tr><td>${fi}</td>`;
    cols.forEach(si => { const v = (row[si] || 0) / tot;
      mbody += row[si] ? `<td style="background:${retHeatColor(v)};color:${retHeatText(v)}">${(v * 100).toFixed(0)}%<br><span style="font-size:10px">(${row[si]})</span></td>` : `<td class="ret-muted">—</td>`; });
    mbody += '</tr>';
  });
  el.innerHTML = `
  <div class="ret-panel ret-full"><h3>การย้ายข้ามกลุ่มสินค้า (Kides ↔ Holista)</h3>
    <div class="ret-hint">ลูกค้าเริ่มจากกลุ่มหนึ่งแล้วไปซื้ออีกกลุ่มกี่ %</div>
    <div class="ret-flow">
      <div class="ret-flowcard"><div class="big">${fmtPct(startK ? kThenH / startK : 0)}</div>
        <div class="lbl">ของลูกค้าที่<b>เริ่มจาก Kides</b> (${fmtNum(startK)} คน) ต่อมาซื้อ <b>Holista</b> (${fmtNum(kThenH)} คน)</div></div>
      <div class="ret-flowcard"><div class="big">${fmtPct(startH ? hThenK / startH : 0)}</div>
        <div class="lbl">ของลูกค้าที่<b>เริ่มจาก Holista</b> (${fmtNum(startH)} คน) ต่อมาซื้อ <b>Kides</b> (${fmtNum(hThenK)} คน)</div></div>
      <div class="ret-flowcard"><div class="big">${fmtNum(startBoth)}</div>
        <div class="lbl">ลูกค้าที่ซื้อ<b>ทั้งสองกลุ่มตั้งแต่ครั้งแรก</b></div></div>
    </div>
  </div>
  <div class="ret-panel ret-full"><h3>การสลับช่องทาง (ครั้งแรก → ครั้งที่สอง)</h3>
    <div class="ret-hint">ลูกค้าที่ซื้อครั้งที่สอง อยู่${sdimTxt}เดิมหรือย้าย · แถว=${sdimTxt}แรก, คอลัมน์=${sdimTxt}ถัดไป</div>
    <div class="ret-thr" id="ret-switchDim"></div>
    <div class="ret-flow" style="margin-bottom:14px">
      <div class="ret-flowcard"><div class="big good">${fmtPct(cs.total ? cs.stay / cs.total : 0)}</div><div class="lbl">ซื้อครั้งที่สอง<b>${sdimTxt}เดิม</b> (${fmtNum(cs.stay)}/${fmtNum(cs.total)})</div></div>
      <div class="ret-flowcard"><div class="big warn">${fmtPct(cs.total ? cs.switchN / cs.total : 0)}</div><div class="lbl">ซื้อครั้งที่สอง<b>ย้าย${sdimTxt}</b> (${fmtNum(cs.switchN)})</div></div>
    </div>
    <div class="ret-scroll"><table class="ret-table ret-heat">${head}<tbody>${mbody || '<tr><td class="ret-muted">ข้อมูลไม่พอ</td></tr>'}</tbody></table></div>
  </div>`;
  document.getElementById('ret-switchDim').innerHTML = 'เปรียบเทียบตาม: ' +
    [['chan', 'ช่องทาง (Channel)'], ['sub', 'ช่องทางย่อย (SubChannel)']].map(([v, t]) =>
      `<span class="ret-tbtn ${v === sdim ? 'active' : ''}" data-d="${v}">${t}</span>`).join('');
  document.querySelectorAll('#ret-switchDim .ret-tbtn').forEach(b => b.onclick = () => { window.RET.switchDim = b.dataset.d; ctx.rerender(); });
  el.insertAdjacentHTML('beforeend', retInsightPanel(
    `หน้านี้มีสองเรื่อง: (1) ลูกค้า<b>ย้ายข้ามกลุ่มสินค้า</b> (Kides ↔ Holista) มากแค่ไหน และ (2) ซื้อครั้งที่สอง<b>อยู่${sdimTxt}เดิมหรือย้าย</b>`,
    [
      `ลูกค้าที่เริ่มจาก <b>Kides</b> ต่อมาซื้อ Holista: ${fmtPct(startK ? kThenH / startK : 0)} · เริ่มจาก <b>Holista</b> ต่อมาซื้อ Kides: ${fmtPct(startH ? hThenK / startH : 0)}`,
      startBoth != null && `มี <b>${fmtNum(startBoth)} คน</b> ที่ซื้อทั้งสองกลุ่มตั้งแต่ครั้งแรก — กลุ่มมูลค่าสูง ควรต่อยอดเป็น persona หลัก`,
      ((startK && kThenH / startK < 0.1) || (startH && hThenK / startH < 0.1)) ? 'การข้ามกลุ่มยังต่ำมาก = โอกาสโตที่ยังไม่ถูกแตะ ลองแคมเปญแนะนำกลุ่มสินค้าอีกฝั่งให้ลูกค้าเดิม' : 'การข้ามกลุ่มเริ่มเกิดขึ้น ควรเร่งด้วยโปรจับคู่ข้ามกลุ่ม',
      `ตารางสลับ${sdimTxt}: ลูกค้าที่ซื้อครั้งที่สอง<b>ส่วนใหญ่อยู่${sdimTxt}เดิม ${fmtPct(cs.total ? cs.stay / cs.total : 0)}</b>`
    ]
  ));
}

// ============ 7. ADMIN ============
function retViewAdmin(el, rows) {
  const byA = new Map();
  for (const r of rows) { const a = retAdminName(r); if (!a) continue; let arr = byA.get(a); if (!arr) { arr = []; byA.set(a, arr); } arr.push(r); }
  let m = [];
  for (const [a, rs] of byA) { const ov = retOverall(rs);
    m.push({ admin: a, customers: ov.customers, orders: ov.orders, repeatRate: ov.repeatRate, freq: ov.avgFreq, revenue: ov.revenue, ltv: ov.customers ? ov.revenue / ov.customers : 0 }); }
  el.innerHTML = `<div class="ret-panel ret-full">
    <h3>ประสิทธิภาพการรักษาลูกค้า แยกตามแอดมิน</h3>
    <div class="ret-hint">แอดมินคนไหนทำให้ลูกค้ากลับมาซื้อซ้ำดี · คลิกหัวคอลัมน์เพื่อเรียง</div>
    <div class="ret-scroll"><table class="ret-table" id="ret-admTable"></table></div></div>`;
  const t = document.getElementById('ret-admTable');
  const head = `<thead><tr><th data-s="admin">แอดมิน</th><th data-s="customers">ลูกค้า</th>
    <th data-s="orders">ครั้งซื้อ</th><th data-s="repeatRate">Repeat</th><th data-s="freq">รอบซื้อซ้ำ</th>
    <th data-s="revenue">ยอดขาย</th><th data-s="ltv">LTV/คน</th></tr></thead>`;
  const draw = () => {
    const maxR = Math.max(.0001, ...m.map(x => x.repeatRate));
    t.innerHTML = head + '<tbody>' + m.map(x => `<tr><td>${x.admin}</td><td>${fmtNum(x.customers)}</td>
      <td>${fmtNum(x.orders)}</td>
      <td><span class="ret-bar"><i style="width:${x.repeatRate / maxR * 100}%"></i></span> ${fmtPct(x.repeatRate)}</td>
      <td>${fmtDays(x.freq)}</td><td>${fmtBaht(x.revenue)}</td><td>${fmtBaht(x.ltv)}</td></tr>`).join('') + '</tbody>';
    t.querySelectorAll('th').forEach(th => th.onclick = () => { const s = th.dataset.s;
      m.sort((a, b) => typeof a[s] === 'string' ? a[s].localeCompare(b[s]) : (b[s] || 0) - (a[s] || 0)); draw(); });
  };
  m.sort((a, b) => b.revenue - a.revenue); draw();
  const elig = m.filter(x => x.customers >= 20);
  const byRep = [...elig].sort((a, b) => b.repeatRate - a.repeatRate);
  const bestR = byRep[0], worstR = byRep[byRep.length - 1];
  const byLtv = [...m].sort((a, b) => b.ltv - a.ltv)[0];
  el.insertAdjacentHTML('beforeend', retInsightPanel(
    'หน้านี้วัดว่า<b>แอดมิน/ทีม CRM คนไหนรักษาลูกค้าได้ดี</b> ไม่ใช่แค่ปิดยอดได้เยอะ — คนที่ทำให้ลูกค้ากลับมาซื้อซ้ำและ LTV สูง คือคนที่สร้างมูลค่าระยะยาวจริง',
    [
      bestR && `Repeat rate ดีสุด (ลูกค้า ≥20 คน): <b>${bestR.admin}</b> ที่ ${fmtPct(bestR.repeatRate)} — ควรถอดวิธีทำงานมาเป็นสคริปต์กลาง`,
      worstR && bestR !== worstR && `ต่ำสุด: <b>${worstR.admin}</b> ที่ ${fmtPct(worstR.repeatRate)} — อาจเน้นปิดการขายครั้งเดียว ยังไม่ได้ตาม follow-up`,
      byLtv && `LTV ต่อลูกค้าสูงสุด: <b>${byLtv.admin}</b> (${fmtBaht(byLtv.ltv)}/คน) — ได้ลูกค้าคุณภาพ ไม่ใช่แค่จำนวน`,
      'ระวังเทียบแอดมินที่ลูกค้าน้อยเกิน (<20 คน) เพราะตัวเลขแกว่ง'
    ]
  ));
}

// ============ 8. DISCOUNT ============
function retViewDiscount(el, rows) {
  const tl = retTimelines(rows);
  const mk = () => ({ cust: 0, repeat: 0, gapSum: 0, gapN: 0, rev: 0 });
  const dep = mk(), full = mk(); const acqDisc = { n: 0, rep: 0 }, acqFull = { n: 0, rep: 0 };
  let discOcc = 0, totOcc = 0;
  for (const [c, occ] of tl) {
    const dn = occ.filter(o => o.disc).length; totOcc += occ.length; discOcc += dn;
    const seg = (dn / occ.length) > 0.5 ? dep : full;
    seg.cust++; seg.rev += occ.reduce((s, o) => s + o.sales, 0);
    if (occ.length >= 2) { seg.repeat++; const g = retFreqStats(new Set(occ.map(o => o.day))); if (g != null) { seg.gapSum += g; seg.gapN++; } }
    const acq = occ[0].disc ? acqDisc : acqFull; acq.n++; if (occ.length >= 2) acq.rep++;
  }
  const line = (lbl, s) => `<tr><td>${lbl}</td><td>${fmtNum(s.cust)}</td>
    <td>${fmtPct(s.cust ? s.repeat / s.cust : 0)}</td><td>${fmtDays(s.gapN ? s.gapSum / s.gapN : null)}</td>
    <td>${fmtBaht(s.cust ? s.rev / s.cust : 0)}</td></tr>`;
  el.innerHTML = `
  <div class="retention-kpi-grid" style="grid-template-columns:repeat(3,1fr)">
    <div class="retention-kpi-card"><div class="retention-kpi-lbl">สัดส่วนครั้งซื้อที่มีส่วนลด</div><div class="retention-kpi-val warn">${fmtPct(totOcc ? discOcc / totOcc : 0)}</div><div class="retention-kpi-d">${fmtNum(discOcc)}/${fmtNum(totOcc)} occasions</div></div>
    <div class="retention-kpi-card"><div class="retention-kpi-lbl">ลูกค้าพึ่งส่วนลด</div><div class="retention-kpi-val bad">${fmtNum(dep.cust)}</div><div class="retention-kpi-d">>50% ของครั้งซื้อมีส่วนลด</div></div>
    <div class="retention-kpi-card"><div class="retention-kpi-lbl">ลูกค้าซื้อเต็มราคาเป็นหลัก</div><div class="retention-kpi-val good">${fmtNum(full.cust)}</div><div class="retention-kpi-d">≤50% ของครั้งซื้อมีส่วนลด</div></div>
  </div>
  <div class="ret-grid2b">
    <div class="ret-panel"><h3>พฤติกรรมซื้อซ้ำ: พึ่งส่วนลด vs เต็มราคา</h3>
      <div class="ret-hint">ส่วนลดช่วยให้ลูกค้ากลับมาซื้อซ้ำจริงไหม หรือได้แค่ยอดครั้งเดียว</div>
      <div class="ret-scroll"><table class="ret-table"><thead><tr><th>กลุ่มลูกค้า</th><th>ลูกค้า</th><th>Repeat</th><th>รอบซื้อซ้ำ</th><th>LTV/คน</th></tr></thead>
        <tbody>${line('พึ่งส่วนลด (>50%)', dep)}${line('เต็มราคาเป็นหลัก', full)}</tbody></table></div></div>
    <div class="ret-panel"><h3>ลูกค้าที่ "ได้มาด้วยส่วนลด" ซื้อซ้ำไหม</h3>
      <div class="ret-hint">เทียบ repeat rate ตามว่าออเดอร์แรกมีส่วนลดหรือไม่</div>
      <div class="ret-scroll"><table class="ret-table"><thead><tr><th>ออเดอร์แรก</th><th>ลูกค้า</th><th>ซื้อซ้ำ ≥2 ครั้ง</th><th>Repeat Rate</th></tr></thead>
        <tbody>
          <tr><td>มีส่วนลด</td><td>${fmtNum(acqDisc.n)}</td><td>${fmtNum(acqDisc.rep)}</td><td>${fmtPct(acqDisc.n ? acqDisc.rep / acqDisc.n : 0)}</td></tr>
          <tr><td>ไม่มีส่วนลด</td><td>${fmtNum(acqFull.n)}</td><td>${fmtNum(acqFull.rep)}</td><td>${fmtPct(acqFull.n ? acqFull.rep / acqFull.n : 0)}</td></tr>
        </tbody></table></div></div>
  </div>`;
  const depRep = dep.cust ? dep.repeat / dep.cust : 0, fullRep = full.cust ? full.repeat / full.cust : 0;
  const acqDiscR = acqDisc.n ? acqDisc.rep / acqDisc.n : 0, acqFullR = acqFull.n ? acqFull.rep / acqFull.n : 0;
  const depLtv = dep.cust ? dep.rev / dep.cust : 0, fullLtv = full.cust ? full.rev / full.cust : 0;
  const helps = acqDiscR >= acqFullR * 0.95;
  el.insertAdjacentHTML('beforeend', retInsightPanel(
    'หน้านี้ตอบว่า<b>ส่วนลดสร้างลูกค้าประจำ หรือแค่ซื้อตอนลดแล้วหาย</b> — ถ้าลดแล้วไม่เพิ่มการซื้อซ้ำ เท่ากับจ่ายเงินซื้อยอดครั้งเดียวที่กำไรบางลง (หมายเหตุ: หน้านี้อ่านส่วนลดจากคอลัมน์ "ส่วนลดท้ายบิล"/"ส่วนลดต่อหน่วย" ถ้าไฟล์นำเข้าไม่มีคอลัมน์นี้ ตัวเลขจะเป็น 0% ทั้งหมด)',
    [
      `ลูกค้า<b>เต็มราคาเป็นหลัก</b> ซื้อซ้ำ ${fmtPct(fullRep)} / LTV ${fmtBaht(fullLtv)} เทียบ<b>พึ่งส่วนลด</b> ${fmtPct(depRep)} / LTV ${fmtBaht(depLtv)}`,
      fullRep > depRep ? 'ลูกค้าเต็มราคาซื้อซ้ำดีกว่า = ส่วนลดดึงคนที่ภักดีต่อ "ราคา" ไม่ใช่ "แบรนด์" — ใช้ส่วนลดอย่างระวัง อย่าหว่าน' : 'กลุ่มพึ่งส่วนลดซื้อซ้ำไม่แพ้กลุ่มเต็มราคา — ส่วนลดใช้เป็นเครื่องมือสร้างนิสัยซื้อซ้ำได้ แต่ต้องคุมต้นทุน',
      `ลูกค้าที่<b>ได้มาด้วยส่วนลด</b>ครั้งแรกกลับมาซื้อซ้ำ ${fmtPct(acqDiscR)} เทียบได้มาแบบเต็มราคา ${fmtPct(acqFullR)} — ${helps ? 'ส่วนลดเปิดการขายแรกได้ผลพอใช้' : '<b>สัญญาณเตือน: ลูกค้าโปรหายเยอะกว่า</b> ควรลดการใช้ส่วนลดหาลูกค้าใหม่'}`,
      `ตอนนี้ ${fmtPct(totOcc ? discOcc / totOcc : 0)} ของครั้งซื้อมีส่วนลด — เฝ้าดูไม่ให้พุ่งจนกลายเป็นว่าลูกค้ารอแต่ช่วงลด`
    ]
  ));
}

// ===================== main entry (called by dashboard.html whenever filters/data change) =====================
function renderRetention(filteredData, rawData) {
  const container = document.getElementById('view-retention');
  if (!container) return;
  window.RET = window.RET || { view: 'overview', churnThr: 60, matrixDim: 'chan', switchDim: 'chan' };
  window.RET._filteredData = filteredData;
  window.RET._rawData = rawData;

  if (!filteredData || filteredData.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:50px; color:#999;">ยังไม่มีข้อมูลสำหรับ Retention — กดปุ่ม "Import Data for Retention" มุมขวาบนเพื่อนำเข้าไฟล์</div>';
    return;
  }
  retInjectStyles();

  // ไม่ยึด Filter บนสุดของแอป (Group/Year/Month/Channel/SubChannel/Product/Admin) อีกต่อไป - หน้า Retention
  // เป็นฟอร์ม/ชุดข้อมูลของตัวเอง แสดงทุกแถวที่ Import เข้ามา (กรองแค่ isSaleOrder กันแถวที่ไม่ใช่ยอดขายจริงปนมา)
  // เหตุผล: ข้อมูลที่ Import เฉพาะหน้านี้มักเป็นคนละช่วงเวลา/ชุดกับข้อมูลหลัก พอยึด Filter เดิม (เช่น Year ที่เลือก
  // ค้างจากแท็บอื่น) ข้อมูลที่เพิ่ง Import จะถูกกรองออกจนดูเหมือน "ไม่ประมวลผล" ทั้งที่จริงมีข้อมูลอยู่
  const rows = filteredData.filter(r => window.isSaleOrder(r));

  function scoped() { return rows; }
  function rerender() { renderRetention(window.RET._filteredData, window.RET._rawData); }
  const ctx = { scoped, rerender, monthKeys: [...new Set(rows.map(retMonthKey).filter(Boolean))].sort() };

  const ov = retOverall(rows);

  container.innerHTML = `
    <div class="retention-container">
      <div class="retention-header">
        <div class="retention-header-text">
          <h2>Retention Analytics</h2>
          <p>สถิติการซื้อซ้ำ, LTV, Churn, Cross-sell และประสิทธิภาพแอดมิน — คำนวณจากข้อมูลที่ Import เข้าหน้านี้ทั้งหมด (ไม่ขึ้นกับ Filter บนสุดของแอป)</p>
        </div>
      </div>
      <div class="ret-scope-note">กำลังวิเคราะห์ <b>${fmtNum(rows.length)}</b> รายการ</div>
      <div class="retention-kpi-grid">
        <div class="retention-kpi-card"><div class="retention-kpi-lbl">ลูกค้า (ราย)</div><div class="retention-kpi-val">${fmtNum(ov.customers)}</div><div class="retention-kpi-d">มีข้อมูลระบุตัวตน</div></div>
        <div class="retention-kpi-card"><div class="retention-kpi-lbl">ครั้งที่ซื้อ (occasions)</div><div class="retention-kpi-val">${fmtNum(ov.orders)}</div><div class="retention-kpi-d">ลูกค้า × วันที่ไม่ซ้ำ</div></div>
        <div class="retention-kpi-card"><div class="retention-kpi-lbl">Repeat Rate (รวม)</div><div class="retention-kpi-val ${ov.repeatRate >= .3 ? 'good' : ov.repeatRate >= .15 ? 'warn' : 'bad'}">${fmtPct(ov.repeatRate)}</div><div class="retention-kpi-d">ลูกค้าที่ซื้อ ≥ 2 ครั้ง</div></div>
        <div class="retention-kpi-card"><div class="retention-kpi-lbl">รอบซื้อซ้ำเฉลี่ย</div><div class="retention-kpi-val">${fmtDays(ov.avgFreq)}</div><div class="retention-kpi-d">Purchase Frequency (หลัก)</div></div>
        <div class="retention-kpi-card"><div class="retention-kpi-lbl">ลูกค้าเสี่ยงหาย</div><div class="retention-kpi-val bad">${fmtNum(ov.atrisk)}</div><div class="retention-kpi-d">เงียบเกิน ${AT_RISK_DAYS} วัน</div></div>
      </div>
      <div class="ret-subnav" id="ret-subnav"></div>
      <div id="ret-view"></div>
    </div>`;

  document.getElementById('ret-subnav').innerHTML = RET_VIEWS.map(v =>
    `<div class="ret-pill ${v.id === window.RET.view ? 'active' : ''}" data-v="${v.id}">${v.t}</div>`).join('');
  document.querySelectorAll('#ret-subnav .ret-pill').forEach(p => p.onclick = () => { window.RET.view = p.dataset.v; rerender(); });

  retRenderView(document.getElementById('ret-view'), rows, ctx);
}
