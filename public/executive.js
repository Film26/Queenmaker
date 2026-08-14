// public/executive.js
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
      .exec-section-title-row {
        display: flex;
        align-items: center;
        gap: 14px;
        margin: 26px 0 14px 2px;
      }
      .exec-section-icon {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        background: #dbeafe;
        color: #1e3a8a;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        flex-shrink: 0;
      }
      .exec-section-title-lg {
        margin: 0;
        font-size: 24px;
        font-weight: 800;
        color: #0f172a;
      }
      .exec-section-title-lg span {
        font-size: 14px;
        font-weight: 500;
        color: #64748b;
        margin-left: 8px;
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
        background: #f3f8fe;
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
        background-color: #f3f8fe;
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
      .exec-table td {
        border-bottom: 1px solid #e1ecfa;
        border-right: 1px solid #e1ecfa;
      }
      .exec-table th:last-child, .exec-table td:last-child {
        border-right: none;
      }
      .exec-table tr:last-child td {
        border-bottom: none;
      }
      .exec-table th {
        background-color: #1e3a8a;
        color: #ffffff;
        font-weight: 700;
        text-align: center;
        border-bottom: 2px solid #16305f;
        border-right: 1px solid rgba(255,255,255,0.15);
      }
      .exec-table th:first-child, .exec-table td.metric-label {
        text-align: left;
        font-weight: 700;
        width: 15%;
      }
      .exec-table th:first-child {
        color: #ffffff;
      }
      .exec-table td.metric-label {
        color: #0f2c66;
      }
      .exec-table td.col-total, .exec-table th.col-total {
        font-weight: 800;
        background-color: #e3edfb;
        color: #0f2c66;
      }
      .exec-table thead th.col-total {
        background-color: #1e3a8a;
        color: #ffffff;
      }
      .exec-table tbody tr:nth-child(even) td:not(.col-total):not(.metric-label) {
        background-color: #fbfdff;
      }
      /* Revenue through Channel Status: single light-blue background across the whole row. */
      .exec-table .group-sales,
      .exec-table .group-customer,
      .exec-table .group-mix,
      .exec-table .group-growth,
      .exec-table .row-channel-status {
        background-color: #f5fafe !important;
      }
      .exec-table .group-sales td,
      .exec-table .group-customer td,
      .exec-table .group-mix td,
      .exec-table .group-growth td,
      .exec-table .row-channel-status td {
        background-color: #f5fafe !important;
      }
      /* แถวลำดับ 1-5 (Revenue...Frequency) พื้นเทาอ่อน / แถวลำดับ 6-12 (All Customer...% Old Customer)
         พื้นเข้มขึ้น ตามที่พี่มาร์ทคอมเมนต์ไว้ - ต้องอยู่หลัง .group-* ด้านบนเพื่อให้ชนะ (source order, !important เท่ากัน) */
      .exec-table .exec-tier-light,
      .exec-table .exec-tier-light td {
        background-color: #f1f5f9 !important;
      }
      .exec-table .exec-tier-dark,
      .exec-table .exec-tier-dark td {
        background-color: #e2e8f0 !important;
      }
      .channel-status-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-weight: 600;
      }
      .channel-status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        display: inline-block;
        flex-shrink: 0;
      }
      .cs-dot-vanguard { background: #2684ff; }
      .cs-dot-migration { background: #13ce66; }
      .cs-dot-retention { background: #ff9900; }
      .cs-dot-cashcow { background: #ff4949; }
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
      .exec-table-footnote {
        display: flex;
        align-items: center;
        gap: 8px;
        background: #eff6ff;
        color: #475569;
        font-size: 12px;
        padding: 10px 16px;
        border-radius: 10px;
        margin-top: 10px;
      }
      .exec-table-footnote i { color: #2563eb; }
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
  // Month filter is applied here as a point-in-time cutoff, mirroring the YTD-cutoff convention
  // already used by the Overview tab in dashboard.html (renderDashboard(): ytdSales/ytdBuyers only
  // sum months <= the selected month). Without this, these "YTD ..." cards always summed all 12
  // months regardless of the Month filter.
  // ใช้ window.execFilters (Filter แยกต่างหากของหน้า Executive เอง) ไม่ใช่ window.filters ที่หน้า
  // Overview/Cohort/Migration/Retention ใช้ร่วมกัน - สองหน้านี้ไม่ยุ่งกันแล้ว
  const monthCutoff = (window.execFilters && window.execFilters.Month) ? window.execFilters.Month : null;
  const withinCutoff = (d) => !monthCutoff || `${d.y}-${String(d.m).padStart(2, '0')}` <= monthCutoff;

  // Determine global first purchase dates if not already available globally
  // We use the global `globalFirstPurchase` from dashboard.html which is already calculated correctly!
  // First pass: Calculate first purchase date within the CURRENT filtered context (for Migration)
  const filterContextFirstPurchase = {};
  filteredData.forEach(row => {
    const getVal = window.getRowValue || ((r, keys) => r[keys[0]]);
    const id = window.getCustomerUniqueId ? window.getCustomerUniqueId(row) : getVal(row, ['Customer ID', 'รหัสลูกค้า', 'Phone', 'phone']);
    const dateStr = getVal(row, ['วันที่โอนเงิน', 'วันที่สร้าง', 'OrderDate', 'Date', 'วันที่']);
    if (!id || !dateStr) return;
    const d = parseD(dateStr);
    if (!d || !withinCutoff(d)) return;
    if (!filterContextFirstPurchase[id] || d.val < filterContextFirstPurchase[id]) {
      filterContextFirstPurchase[id] = d.val;
    }
  });
  // Aggregate data by month
  filteredData.forEach(row => {
    const getVal = window.getRowValue || ((r, keys) => r[keys[0]]);
    const id = window.getCustomerUniqueId ? window.getCustomerUniqueId(row) : getVal(row, ['Customer ID', 'รหัสลูกค้า', 'Phone', 'phone']);
    const dateStr = getVal(row, ['วันที่โอนเงิน', 'วันที่สร้าง', 'OrderDate', 'Date', 'วันที่']);
    const revenueStr = getVal(row, ['ราคาขาย', 'ราคารวม', 'ยอดรวม', 'ราคาสุทธิ', 'ยอดขาย', 'ราคาสินค้ายังไม่รวมภาษี', 'Net Sales', 'Revenue', 'Amount', 'ยอดโอน']);

    if (!id || !dateStr) return;
    const d = parseD(dateStr);
    if (!d || !withinCutoff(d)) return;

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
  // All Customer (ลูกค้าสะสม): ผลรวมสะสมของลูกค้าที่เคยซื้อนับจาก ม.ค. ถึงเดือนนั้นๆ "ภายในปีที่เลือก" เท่านั้น
  // (รีเซ็ตทุกต้นปี ตามที่ตกลงกันไว้) ใช้ union ของ agg[m].uniqueBuyers ไล่สะสมทีละเดือน
  const cumAllCustArr = [];
  const cumulativeCustomerSet = new Set();
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

    agg[m].uniqueBuyers.forEach(id => cumulativeCustomerSet.add(id));
    cumAllCustArr.push(cumulativeCustomerSet.size);
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
  // ยอดรวมทั้งปีของ "ลูกค้าสะสม" คือยอดสะสม ณ สิ้นปี ซึ่งเท่ากับ uT อยู่แล้ว (union ของทุกเดือน)
  cumAllCustArr.push(cumulativeCustomerSet.size);

  // %Active customer = ลูกค้าที่ซื้อในเดือนนั้น (Active) หารด้วยลูกค้าสะสม ณ เดือนนั้น
  const activePctArr = ubArr.map((u, i) => getSafely(u, cumAllCustArr[i]));
  // % Old Customer = ลูกค้าเก่าที่ซื้อในเดือนนั้น หารด้วยลูกค้าทั้งหมดที่ซื้อในเดือนนั้น (= 100% - % New Customer Share)
  const oldPctArr = ubArr.map((u, i) => getSafely(retArr[i], u));

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
    { label: 'YTD Buyer', sub: 'ลูกค้าจริง YTD (คน)', value: fmtNum(total.uniqueBuyers.size), arr: ubArr, color: '#334155', labelColor: '#0f172a' },
    { label: 'New Customers', sub: 'ลูกค้าใหม่ YTD (คน)', value: fmtNum(total.newGlobalBuyers.size), arr: newGArr, color: '#00BCD4', labelColor: '#0e7490' },
    { label: 'Old Customers', sub: 'ลูกค้าเก่า YTD (คน)', value: fmtNum(total.retainedBuyers.size), arr: retArr, color: '#334155', labelColor: '#0f172a' },
    { label: 'YTD AOV', sub: 'ยอดต่อบิลเฉลี่ย (บาท)', value: fmtMoney(getSafely(total.revenue, total.orders)), arr: aovArr, color: '#65A30D', labelColor: '#3f6212' },
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

  // ---- Build CRM Report Table ----
  let html = `
    <div class="exec-section-title">YTD Overview<span>ภาพรวมยอดขายสะสม</span></div>
    ${kpiHtml}
    <div class="exec-section-title-row">
      <span class="exec-section-icon"><i class="fas fa-chart-column"></i></span>
      <div class="exec-section-title exec-section-title-lg">CRM Report<span>รายงาน CRM</span></div>
    </div>
    <div class="exec-table-wrapper">
      <table class="exec-table">
      <thead>
        <tr>
         <th>Metric / Month<br><span style="font-size: 11px; font-weight: normal; color: #ffffff;">ตัวชี้วัด / เดือน</span></th>
          ${months.map(m => `<th>${m}</th>`).join('')}
          <th class="col-total">Total Year<br><span style="font-size: 11px; font-weight: normal; color: #ffffff;">ยอดรวมทั้งปี</span></th>
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
  // แถวที่ยังไม่มีเงื่อนไขให้แสดง (ดูเงื่อนไข showMigrationRows ด้านล่าง) - โชว์แค่โครงแถว/ป้ายชื่อ
  // ค่าในทุกช่องเป็น "-" ล้วน ไม่มีการคำนวณใดๆ
  const renderBlankRow = (label, bgClass = '') => {
    let rowHtml = `<tr class="${bgClass}"><td class="metric-label">${label}</td>`;
    for (let m = 1; m <= 12; m++) rowHtml += `<td>-</td>`;
    rowHtml += `<td class="col-total">-</td></tr>`;
    return rowHtml;
  };
  // ลำดับแถวและสีพื้นตามที่พี่มาร์ทคอมเมนต์ไว้: ลำดับ 1-5 (Revenue...Frequency) = พื้นเทาอ่อน,
  // ลำดับ 6-12 (All Customer...% Old Customer) = พื้นเข้มขึ้น (สีเดิมของกลุ่มนี้), ลำดับ 13-15 (Migration group)
  // = โชว์เฉพาะตอนที่ผู้ใช้กดเลือก Filter ของหน้า Executive เองครบทั้ง 4 ตัว (Year/Channel/SubChannel/Admin)
  // แล้วเท่านั้น (ดู execFiltersTouched ที่ dashboard.html) ถ้ายังไม่กดเลือกครบ ปล่อยว่างไว้ (ดู showMigrationRows)
  // 1
  html += renderRow('Revenue<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">ยอดขาย </span>', revArr, true, false, false, 'group-sales exec-tier-light');
  // 2
  html += renderRow('Orders<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">ออเดอร์</span>', ordArr, true, false, false, 'group-sales exec-tier-light');
  // 3
  html += renderRow('AOV (Average Order Value)<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">ยอดต่อบิลเฉลี่ย </span>', aovArr, true, false, false, 'group-sales exec-tier-light');
  // 4
  html += renderRow('SPH (Spending per Head)<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">ยอดเฉลี่ยต่อหัว </span>', sphArr, true, false, false, 'group-sales exec-tier-light');
  // 5
  html += renderRow('Frequency<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">ความถี่ซื้อ </span>', freqArr, false, true, false, 'group-customer exec-tier-light');
  // 6
  html += renderRow('All Customer<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">ลูกค้าสะสม</span>', cumAllCustArr, true, false, false, 'group-customer exec-tier-dark');
  // 7
  html += renderRow('Buyers<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">ลูกค้าที่ซื้อในเดือน</span>', ubArr, true, false, false, 'group-customer exec-tier-dark');
  // 8
  html += renderRow('%Active customer<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">% ลูกค้าที่ Active</span>', activePctArr, false, false, true, 'group-customer exec-tier-dark');
  // 9
  html += renderRow('New Customers (Global)<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">ลูกค้าใหม่ (Global)</span>', newGArr, true, false, false, 'group-mix exec-tier-dark');
  // 10
  html += renderRow('Old Customers Retained Buyers<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">ลูกค้าเก่าซื้อซ้ำ </span>', retArr, true, false, false, 'group-mix exec-tier-dark');
  // 11
  html += renderRow('% New Customer Share<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">% ลูกค้าใหม่</span>', newGShrArr, false, false, true, 'group-mix exec-tier-dark');
  // 12
  html += renderRow('% Old Customer<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">% ลูกค้าเก่า</span>', oldPctArr, false, false, true, 'group-mix exec-tier-dark');

  // 13-15 โชว์เฉพาะตอนที่ผู้ใช้กดเลือก Filter ของหน้า Executive เอง (ไม่ใช่ค่าที่ auto-select ให้ตอนเปิดหน้า)
  // ครบทั้ง 4 ตัว (Year/Channel/SubChannel/Admin) แล้วเท่านั้น - ก่อนหน้านั้นปล่อยว่างไว้
  const touched = window.execFiltersTouched;
  const showMigrationRows = !!(touched && touched.Year && touched.Channel && touched.SubChannel && touched.Admin);

  if (showMigrationRows) {
    // 13-14: แถว New to Sub (Migration) / % Migration Rate
    html += renderRow('New to Sub (Migration)<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">ลูกค้าใหม่เฉพาะกลุ่ม (Migration)</span>', migArr, true, false, false, 'group-growth exec-tier-dark');
    html += renderRow('% Migration Rate<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">อัตราการย้ายกลุ่ม</span>', migRtArr, false, false, true, 'group-growth exec-tier-dark');

    // Channel Status: classify each month (and Total Year) using the same Vanguard / Migration /
    // Retention / Cash Cow thresholds as executive2.js's Strategic Meaning table, applied to the
    // whole dataset for that month instead of per sub-channel.
    const classifyChannelStatus = (pctNew, pctMig) => {
      if (pctNew > 70) return { label: 'Vanguard', dot: 'cs-dot-vanguard' };
      if (pctMig > 70) return { label: 'Migration', dot: 'cs-dot-migration' };
      if (pctNew + pctMig < 30) return { label: 'Cash Cow', dot: 'cs-dot-cashcow' };
      return { label: 'Retention', dot: 'cs-dot-retention' };
    };
    const channelStatusCell = (idx) => {
      if (!ubArr[idx]) return '<td>-</td>';
      const { label, dot } = classifyChannelStatus(newGShrArr[idx] * 100, migRtArr[idx] * 100);
      return `<td><span class="channel-status-badge"><span class="channel-status-dot ${dot}"></span>${label}</span></td>`;
    };
    let channelStatusRow = `<tr class="row-channel-status exec-tier-dark"><td class="metric-label">Channel Status<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">สถานะช่องทาง</span></td>`;
    for (let m = 1; m <= 12; m++) channelStatusRow += channelStatusCell(m - 1);
    channelStatusRow += channelStatusCell(12).replace('<td>', '<td class="col-total">');
    channelStatusRow += '</tr>';
    html += channelStatusRow;
  } else {
    html += renderBlankRow('New to Sub (Migration)<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">ลูกค้าใหม่เฉพาะกลุ่ม (Migration)</span>', 'group-growth exec-tier-dark');
    html += renderBlankRow('% Migration Rate<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">อัตราการย้ายกลุ่ม</span>', 'group-growth exec-tier-dark');
    html += renderBlankRow('Channel Status<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">สถานะช่องทาง</span>', 'row-channel-status exec-tier-dark');
  }

  html += `</tbody></table></div>`;
  html += `<div class="exec-table-footnote"><i class="fas fa-circle-info"></i> หมายเหตุ: ตัวเลขทั้งหมดเป็นผลรวมในแต่ละเดือน ยอดรวมทั้งปีอาจมีความคลาดเคลื่อนจากการปัดเศษ</div>`;
  container.innerHTML = html;
}
