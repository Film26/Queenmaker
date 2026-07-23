// public/executive1.js
function renderExecutive1(filteredData, rawData) {
  const container = document.getElementById('view-executive1');

  if (!filteredData || filteredData.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:50px; color:#999;">No data available. Please adjust filters or load data.</div>';
    return;
  }
  // Inject CSS if not exists to bypass browser cache issues for styles.css
  if (!document.getElementById('exec-styles')) {
    const style = document.createElement('style');
    style.id = 'exec-styles';
    style.innerHTML = `
      #view-executive1 {
        padding: 20px !important;
        background-color: #f8f9fa !important;
        box-sizing: border-box;
      }
      .exec-section-title {
        font-family: 'Outfit', 'Inter', sans-serif;
        font-size: 15px;
        font-weight: 700;
        color: #1e293b;
        margin: 0 0 12px 2px;
      }
      .exec-section-title span {
        font-size: 12px;
        font-weight: 500;
        color: #94a3b8;
        margin-left: 6px;
      }

      /* ---- KPI stat cards ---- */
      .kpi-card-row {
        display: grid;
        grid-template-columns: repeat(7, minmax(140px, 1fr));
        gap: 14px;
        margin-bottom: 28px;
      }
      @media (max-width: 1400px) {
        .kpi-card-row { grid-template-columns: repeat(4, 1fr); }
      }
      @media (max-width: 800px) {
        .kpi-card-row { grid-template-columns: repeat(2, 1fr); }
      }
      .kpi-card {
        background: #fff;
        border: 1.5px solid var(--kpi-color, #e2e8f0);
        border-top: 4px solid var(--kpi-color, #d95f1d);
        border-radius: 14px;
        padding: 16px 16px 12px;
        box-shadow: 0 4px 14px rgba(15, 23, 42, 0.04);
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
      }
      .kpi-card-label {
        font-family: 'Inter', sans-serif;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.4px;
        text-transform: uppercase;
        color: var(--kpi-label-color, var(--kpi-color, #d95f1d));
      }
      .kpi-card-sublabel {
        display: block;
        font-size: 10.5px;
        font-weight: 500;
        text-transform: none;
        letter-spacing: 0;
        color: #94a3b8;
        margin-top: 2px;
      }
      .kpi-card-value {
        font-family: 'Outfit', 'Inter', sans-serif;
        font-size: 22px;
        font-weight: 800;
        color: #0f172a;
        line-height: 1.15;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .kpi-card-trend {
        font-size: 12px;
        font-weight: 700;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .kpi-card-trend .arrow { font-size: 10px; }
      .kpi-card-trend.up { color: #16a34a; }
      .kpi-card-trend.down { color: #dc2626; }
      .kpi-card-trend.flat { color: #94a3b8; }
      .kpi-card-spark {
        height: 34px;
        margin-top: 2px;
      }
      .kpi-card-spark svg { width: 100%; height: 100%; display: block; overflow: visible; }

      /* ---- Monthly breakdown table ---- */
      .exec-table-wrapper {
        background: #eaf2fd;
        border: 1.5px solid #1e3a8a;
        border-radius: 12px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.03);
        overflow-x: visible;
        max-width: 100%;
        margin-bottom: 25px;
      }
      .exec-table {
        width: 100%;
        table-layout: fixed;
        border-collapse: separate;
        border-spacing: 0;
        font-family: 'Inter', sans-serif;
        font-size: 12px;
        background-color: #eaf2fd;
        border-radius: 12px;
        overflow: hidden;
        margin-bottom: 0;
      }
      .exec-table th, .exec-table td {
        border-bottom: 1px solid #1e3a8a;
        border-right: 1px solid #6b8fd4;
        padding: 10px 5px;
        text-align: right;
        white-space: normal;
        word-break: break-word;
        color: #0f172a;
        font-weight: 600;
      }
      .exec-table th:last-child, .exec-table td:last-child {
        border-right: none;
      }
      .exec-table tr:last-child td {
        border-bottom: none;
      }
      .exec-table th {
        background-color: #ddd6fe;
        color: #4c1d95;
        font-weight: 700;
        text-align: center;
        border-bottom: 2px solid #a78bfa;
        border-right: 1px solid rgba(76,29,149,0.15);
      }
      .exec-table th:first-child, .exec-table td.metric-label {
        text-align: left;
        font-weight: 700;
        width: 15%;
        color: #0f2c66;
      }
      .exec-table td.col-total, .exec-table th.col-total {
        font-weight: 800;
        background-color: #cfe0f9;
        color: #0f2c66;
      }
      .exec-table thead th.col-total {
        background-color: #ddd6fe;
        color: #4c1d95;
      }
      .exec-table tbody tr:nth-child(even) td:not(.col-total):not(.metric-label) {
        background-color: #f4f9ff;
      }
      /* Revenue through Channel Status: single light-blue background across the whole row. */
      .exec-table .group-sales,
      .exec-table .group-customer,
      .exec-table .group-mix,
      .exec-table .group-growth,
      .exec-table .row-channel-status {
        background-color: #dbeafe !important;
      }
      .exec-table .group-sales td,
      .exec-table .group-customer td,
      .exec-table .group-mix td,
      .exec-table .group-growth td,
      .exec-table .row-channel-status td {
        background-color: #dbeafe !important;
      }
      .exec-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        margin: -4px 0 14px 2px;
        font-family: 'Inter', sans-serif;
        font-size: 11.5px;
        color: #64748b;
      }
      .exec-legend-item { display: flex; align-items: center; gap: 6px; }
      .exec-legend-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
      .status-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }
      .dot-blue { background-color: #38bdf8; }
      .dot-green { background-color: #22c55e; }
      .dot-orange { background-color: #ea580c; }
    `;
    document.head.appendChild(style);
  }
  // Initialize monthly aggregation
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const agg = {};
  for (let m = 1; m <= 12; m++) {
    agg[m] = {
      revenue: 0,
      orders: 0,
      uniqueBuyers: new Set(),
      retainedBuyers: new Set(),
      newGlobalBuyers: new Set(),
      newToSubBuyers: new Set()
    };
  }
  // Helper to parse date from string
  const parseD = (dateStr) => {
    if (!dateStr) return null;
    if (window.parseDate) {
      const parsed = window.parseDate(dateStr);
      if (parsed) {
        return { y: parsed.y, m: parsed.m, d: parsed.d, val: parsed.y * 10000 + parsed.m * 100 + parsed.d };
      }
    }
    const parts = dateStr.split(' ')[0].split('/');
    if (parts.length < 3) return null;
    let y = parseInt(parts[2]);
    let m = parseInt(parts[1]);
    let d = parseInt(parts[0]);
    if (y < 2000) y += 2000;
    return { y, m, d, val: y * 10000 + m * 100 + d };
  };
  // Determine global first purchase dates if not already available globally
  // We use the global `globalFirstPurchase` from dashboard.html which is already calculated correctly!
  // First pass: Calculate first purchase date within the CURRENT filtered context (for Migration)
  const filterContextFirstPurchase = {};
  filteredData.forEach(row => {
    const getVal = window.getRowValue || ((r, keys) => r[keys[0]]);
    const id = window.getCustomerUniqueId ? window.getCustomerUniqueId(row) : getVal(row, ['Customer ID', 'รหัสลูกค้า', 'Phone', 'phone']);
    const dateStr = getVal(row, ['วันที่สร้าง', 'วันที่โอนเงิน', 'OrderDate', 'Date', 'วันที่']);
    if (!id || !dateStr) return;
    const d = parseD(dateStr);
    if (!d) return;
    if (!filterContextFirstPurchase[id] || d.val < filterContextFirstPurchase[id]) {
      filterContextFirstPurchase[id] = d.val;
    }
  });
  // Aggregate data by month
  filteredData.forEach(row => {
    const getVal = window.getRowValue || ((r, keys) => r[keys[0]]);
    const id = window.getCustomerUniqueId ? window.getCustomerUniqueId(row) : getVal(row, ['Customer ID', 'รหัสลูกค้า', 'Phone', 'phone']);
    const dateStr = getVal(row, ['วันที่สร้าง', 'วันที่โอนเงิน', 'OrderDate', 'Date', 'วันที่']);
    const revenueStr = getVal(row, ['ยอดขาย', 'ราคาสินค้ายังไม่รวมภาษี', 'Net Sales', 'Revenue', 'Amount', 'ยอดโอน']);

    if (!id || !dateStr) return;
    const d = parseD(dateStr);
    if (!d) return;

    const m = d.m;
    if (m >= 1 && m <= 12) {
      const rev = parseFloat((revenueStr || '0').toString().replace(/,/g, ''));
      agg[m].revenue += isNaN(rev) ? 0 : rev;
      agg[m].orders += 1;
      agg[m].uniqueBuyers.add(id);
      // Check Retained vs New Global based on globalFirstPurchase
      if (globalFirstPurchase[id]) {
        // If their global first purchase was BEFORE this month
        const firstDate = globalFirstPurchase[id];
        // Compare year/month strictly
        if (firstDate.year < d.y || (firstDate.year === d.y && parseInt(firstDate.monthStr.split('-')[1]) < m)) {
          agg[m].retainedBuyers.add(id);
        } else if (firstDate.year === d.y && parseInt(firstDate.monthStr.split('-')[1]) === m) {
           // Wait, if they bought multiple times this month, they are still "New Global" for this month
           agg[m].newGlobalBuyers.add(id);
        }
      }
      // Check Migration (New to Sub).
      // Rule (Placeholder): If their first purchase in THIS FILTER CONTEXT is this month, but they are NOT New Global.
      // We will count them as Migration.
      if (filterContextFirstPurchase[id]) {
        const firstVal = filterContextFirstPurchase[id];
        const firstM = Math.floor((firstVal % 10000) / 100);
        const firstY = Math.floor(firstVal / 10000);
        if (firstY === d.y && firstM === m) {
          // This is their first month buying in this filter context
          if (!agg[m].newGlobalBuyers.has(id)) {
            agg[m].newToSubBuyers.add(id);
          }
        }
      }
    }
  });
  // Calculate Totals
  const total = {
    revenue: 0,
    orders: 0,
    uniqueBuyers: new Set(),
    retainedBuyers: new Set(),
    newGlobalBuyers: new Set(),
    newToSubBuyers: new Set()
  };
  for (let m = 1; m <= 12; m++) {
    total.revenue += agg[m].revenue;
    total.orders += agg[m].orders;
    agg[m].uniqueBuyers.forEach(id => total.uniqueBuyers.add(id));
    agg[m].retainedBuyers.forEach(id => total.retainedBuyers.add(id));
    agg[m].newGlobalBuyers.forEach(id => total.newGlobalBuyers.add(id));
    agg[m].newToSubBuyers.forEach(id => total.newToSubBuyers.add(id));
  }
  // Formatting helpers
  const fmtNum = (num) => (Number(num) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const fmtDec = (num) => (Number(num) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = (num) => ((Number(num) || 0) * 100).toFixed(1) + '%';
  const fmtMoney = (num) => '฿' + fmtNum(num);
  const getSafely = (a, b) => b === 0 ? 0 : a / b;

  // Metrics Array Construction (per-month series, index 0 = Jan ... 11 = Dec, index 12 = Total Year)
  const revArr = [], ordArr = [], aovArr = [], ubArr = [], freqArr = [], sphArr = [], retArr = [], newGArr = [], newGShrArr = [], migArr = [], migRtArr = [];
  for (let m = 1; m <= 12; m++) {
    const r = agg[m].revenue;
    const o = agg[m].orders;
    const u = agg[m].uniqueBuyers.size;
    const ret = agg[m].retainedBuyers.size;
    const newG = agg[m].newGlobalBuyers.size;
    const mig = agg[m].newToSubBuyers.size;

    revArr.push(r);
    ordArr.push(o);
    aovArr.push(getSafely(r, o));
    ubArr.push(u);
    freqArr.push(getSafely(o, u));
    sphArr.push(getSafely(r, u));
    retArr.push(ret);
    newGArr.push(newG);
    newGShrArr.push(getSafely(newG, u));
    migArr.push(mig);
    migRtArr.push(getSafely(mig, u));
  }
  // Totals
  const rT = total.revenue, oT = total.orders, uT = total.uniqueBuyers.size;
  revArr.push(rT);
  ordArr.push(oT);
  aovArr.push(getSafely(rT, oT));
  ubArr.push(uT);
  freqArr.push(getSafely(oT, uT));
  sphArr.push(getSafely(rT, uT));
  retArr.push(total.retainedBuyers.size);
  newGArr.push(total.newGlobalBuyers.size);
  newGShrArr.push(getSafely(total.newGlobalBuyers.size, uT));
  migArr.push(total.newToSubBuyers.size);
  migRtArr.push(getSafely(total.newToSubBuyers.size, uT));

  // ---- Build KPI stat cards (top row) ----
  // Find the latest month that actually has activity, so the sparkline/MoM
  // reflect real data instead of trailing empty months.
  let latestM = 0;
  for (let m = 12; m >= 1; m--) {
    if (agg[m].uniqueBuyers.size > 0) { latestM = m; break; }
  }
  if (latestM === 0) latestM = 12;

  const buildSparkline = (values, color) => {
    if (!values || values.length < 2) return '';
    const w = 110, h = 34, pad = 3;
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = (max - min) || 1;
    const stepX = (w - pad * 2) / (values.length - 1);
    const pts = values.map((v, i) => [
      pad + i * stepX,
      h - pad - ((v - min) / range) * (h - pad * 2)
    ]);
    const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const last = pts[pts.length - 1];
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.5" fill="${color}"/>
    </svg>`;
  };

  const buildTrend = (arr) => {
    const cur = arr[latestM - 1];
    const prev = latestM >= 2 ? arr[latestM - 2] : null;
    if (prev === null || prev === undefined || prev === 0 || cur === undefined) {
      return '<span class="kpi-card-trend flat"><span class="arrow">&#9644;</span> n/a MoM</span>';
    }
    const pct = ((cur - prev) / prev) * 100;
    const cls = pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat';
    const arrow = cls === 'up' ? '&#9650;' : cls === 'down' ? '&#9660;' : '&#9644;';
    return `<span class="kpi-card-trend ${cls}"><span class="arrow">${arrow}</span> ${Math.abs(pct).toFixed(1)}% MoM</span>`;
  };

  const kpiCards = [
    { label: 'YTD Revenue', sub: 'ยอดขาย YTD (บาท)', value: fmtMoney(total.revenue), arr: revArr, color: '#228B22' },
    { label: 'YTD Buyer', sub: 'ลูกค้าจริง YTD (คน)', value: fmtNum(total.uniqueBuyers.size), arr: ubArr, color: '#000080' },
    { label: 'New Customers', sub: 'ลูกค้าใหม่ YTD (คน)', value: fmtNum(total.newGlobalBuyers.size), arr: newGArr, color: '#00BCD4', labelColor: '#0e7490' },
    { label: 'Old Customers', sub: 'ลูกค้าเก่า YTD (คน)', value: fmtNum(total.retainedBuyers.size), arr: retArr, color: '#0A1F44' },
    { label: 'YTD AOV', sub: 'ยอดต่อบิลเฉลี่ย (บาท)', value: fmtMoney(getSafely(total.revenue, total.orders)), arr: aovArr, color: '#FFC107', labelColor: '#b45309' },
    { label: 'YTD SPH', sub: 'ยอดเฉลี่ยต่อคน (บาท)', value: fmtMoney(getSafely(total.revenue, total.uniqueBuyers.size)), arr: sphArr, color: '#84CC16', labelColor: '#4d7c0f' },
    { label: 'Repeat Purchase', sub: 'การซื้อซ้ำ (ครั้ง)', value: fmtDec(getSafely(total.orders, total.uniqueBuyers.size)), arr: freqArr, color: '#4F46E5' }
  ];

  let kpiHtml = '<div class="kpi-card-row">';
  kpiCards.forEach(card => {
    const series = card.arr.slice(0, latestM);
    kpiHtml += `
      <div class="kpi-card" style="--kpi-color:${card.color}; --kpi-label-color:${card.labelColor || card.color}">
        <div class="kpi-card-label">${card.label}<span class="kpi-card-sublabel">${card.sub}</span></div>
        <div class="kpi-card-value">${card.value}</div>
        ${buildTrend(card.arr)}
        <div class="kpi-card-spark">${buildSparkline(series, card.color)}</div>
      </div>`;
  });
  kpiHtml += '</div>';

  // ---- Build Monthly Breakdown Table ----
  let html = `
    <div class="exec-section-title">YTD Overview<span>ภาพรวมยอดขายสะสม</span></div>
    ${kpiHtml}
    <div class="exec-section-title">Monthly Breakdown<span>รายละเอียดรายเดือน</span></div>
    <div class="exec-legend">
      <span class="exec-legend-item"><span class="exec-legend-dot" style="background:#ea580c;"></span>Sales performance (Revenue, Orders, AOV)</span>
      <span class="exec-legend-item"><span class="exec-legend-dot" style="background:#0369a1;"></span>Customer base (Unique Buyers, Frequency, SPH)</span>
      <span class="exec-legend-item"><span class="exec-legend-dot" style="background:#166534;"></span>New vs. Retained mix (Retained, New, % New Share)</span>
      <span class="exec-legend-item"><span class="exec-legend-dot" style="background:#7e22ce;"></span>Growth / migration (New to Sub, % Migration Rate)</span>
    </div>
    <div class="exec-table-wrapper">
      <table class="exec-table">
      <thead>
        <tr>
         <th>Metric / Month<br><span style="font-size: 11px; font-weight: normal; color: #6d28d9;">ตัวชี้วัด / เดือน</span></th>
          ${months.map(m => `<th>${m}</th>`).join('')}
          <th class="col-total">Total Year<br><span style="font-size: 11px; font-weight: normal; color: #64748b;">ยอดรวมทั้งปี</span></th>
        </tr>
      </thead>
      <tbody>
  `;
  const renderRow = (label, values, isMoney = false, isDec = false, isPct = false, bgClass = '') => {
    let rowHtml = `<tr class="${bgClass}"><td class="metric-label">${label}</td>`;
    for (let m = 1; m <= 12; m++) {
      let val = values[m - 1];
      let displayStr = isMoney ? fmtNum(val) : isDec ? fmtDec(val) : isPct ? fmtPct(val) : fmtNum(val);
      rowHtml += `<td>${displayStr}</td>`;
    }
    // Total
    let valT = values[12];
    let displayStrT = isMoney ? fmtNum(valT) : isDec ? fmtDec(valT) : isPct ? fmtPct(valT) : fmtNum(valT);
    rowHtml += `<td class="col-total">${displayStrT}</td></tr>`;
    return rowHtml;
  };
  html += renderRow('Revenue<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">ยอดขาย </span>', revArr, true, false, false, 'group-sales');
  html += renderRow('Orders<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">ออเดอร์</span>', ordArr, true, false, false, 'group-sales');
  html += renderRow('AOV (Average Order Value)<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">ยอดต่อบิลเฉลี่ย </span>', aovArr, true, false, false, 'group-sales');
  html += renderRow('Unique Buyers<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">คนซื้อจริง</span>', ubArr, true, false, false, 'group-customer');
  html += renderRow('Frequency<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">ความถี่ซื้อ </span>', freqArr, false, true, false, 'group-customer');
  html += renderRow('Spending per Head<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">เฉลี่ยต่อคน </span>', sphArr, true, false, false, 'group-customer');
  html += renderRow('Retained Buyers<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">คนเก่าซื้อซ้ำ </span>', retArr, true, false, false, 'group-mix');
  html += renderRow('New Customers (Global)<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">ลูกค้าใหม่ (Global)</span>', newGArr, true, false, false, 'group-mix');
  html += renderRow('% New Customer Share<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">สัดส่วนลูกค้าใหม่</span>', newGShrArr, false, false, true, 'group-mix');
  html += renderRow('New to Sub (Migration)<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">ลูกค้าใหม่เฉพาะกลุ่ม (Migration)</span>', migArr, true, false, false, 'group-growth');
  html += renderRow('% Migration Rate<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">อัตราการย้ายกลุ่ม</span>', migRtArr, false, false, true, 'group-growth');
  // Channel Status Row Placeholder
  html += `<tr class="row-channel-status"><td class="metric-label">Channel Status<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">สถานะช่องทาง</span></td>`;
  for (let m = 1; m <= 12; m++) {
    // Placeholder logic based on image: showing some dots
    let u = agg[m].uniqueBuyers.size;
    let label = '-';
    let dot = '';
    if (u > 0) {
      if (m % 3 === 0) { label = 'Vanguard'; dot = '<span class="status-dot dot-blue"></span>'; }
      else if (m % 3 === 1) { label = 'Migration'; dot = '<span class="status-dot dot-green"></span>'; }
      else { label = 'Retention'; dot = '<span class="status-dot dot-orange"></span>'; }
    }
    html += `<td>${dot}${label}</td>`;
  }
  html += `<td class="col-total">-</td></tr>`;
  html += `</tbody></table></div>`;
  container.innerHTML = html;
}
