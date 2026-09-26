// public/ai-analytics.js
//
// AI Analytics tab - deterministic, rule-based business insights computed entirely from real
// numbers in filteredData/rawData (no external LLM call, no API cost). Layout/wording mirrors the
// team's other "Holista Sales & Finance" dashboard (อ่านสถานการณ์ / ทีม Ads ควรทำ / ตารางช่องทางจำหน่าย)
// per the reference screenshots, adapted to Queenmaker's own sub-channel data.
// Every sales/order number below goes through window.calculateMetrics(rows) - the project's single
// Calculation Layer (see the comment above calculateMetrics() in dashboard.html) - never
// re-implemented locally, so this tab can never drift from Overview/Executive/Migration's numbers.

function renderAiAnalytics(filteredData, rawData) {
  const container = document.getElementById('view-ai-analytics');
  if (!container) return;

  if (!filteredData || filteredData.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:50px; color:#999;">No data available. Please adjust filters or load data.</div>';
    return;
  }

  if (!document.getElementById('ai-analytics-styles')) {
    const style = document.createElement('style');
    style.id = 'ai-analytics-styles';
    style.innerHTML = `
      .ai-section-title { font-size: 20px; font-weight: 700; color: #1e293b; margin: 0 0 4px; }
      .ai-section-sub { font-size: 12.5px; color: #94a3b8; margin: 0 0 20px; }

      .ai-kpi-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; margin-bottom: 22px; }
      .ai-kpi-card { background: #fff; border: 1px solid #eee0d5; border-radius: 14px; padding: 16px 18px; box-shadow: 0 4px 15px rgba(0,0,0,0.03); }
      .ai-kpi-label { font-size: 12px; color: #94a3b8; margin-bottom: 8px; }
      .ai-kpi-value { font-size: 21px; font-weight: 800; color: #1e293b; margin-bottom: 4px; }
      .ai-kpi-change { font-size: 12.5px; font-weight: 700; margin-bottom: 6px; }
      .ai-kpi-sub { font-size: 11px; color: #94a3b8; line-height: 1.5; }
      @media (max-width: 1200px) { .ai-kpi-row { grid-template-columns: repeat(3, 1fr); } }
      @media (max-width: 700px) { .ai-kpi-row { grid-template-columns: repeat(2, 1fr); } }

      .ai-block { background: #fff; border: 1px solid #eee0d5; border-radius: 16px; padding: 20px 22px; box-shadow: 0 4px 15px rgba(0,0,0,0.03); margin-bottom: 20px; }
      .ai-block-head { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
      .ai-block-head .ai-icon { font-size: 17px; }
      .ai-block-head h3 { margin: 0; font-size: 15px; font-weight: 700; color: #1e293b; }
      .ai-block p { font-size: 13.5px; line-height: 1.8; color: #334155; margin: 0 0 10px; }
      .ai-block p:last-child { margin-bottom: 0; }
      .ai-highlight { font-weight: 700; color: #d95f1d; }
      .ai-up { color: #16a34a; font-weight: 700; }
      .ai-down { color: #dc2626; font-weight: 700; }
      .ai-empty-note { font-size: 13px; color: #94a3b8; font-style: italic; margin: 0; }

      .ai-action-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
      .ai-action-list li { font-size: 13.5px; line-height: 1.7; color: #334155; padding-left: 20px; position: relative; }
      .ai-action-list li::before { content: '•'; position: absolute; left: 4px; color: #d95f1d; font-weight: 700; }

      .ai-table-sub { font-size: 12px; color: #94a3b8; margin: -8px 0 14px; }
      .ai-table-wrap { overflow-x: auto; }
      table.ai-table { width: 100%; border-collapse: collapse; font-size: 12.5px; white-space: nowrap; }
      table.ai-table th { text-align: right; font-size: 11.5px; font-weight: 700; color: #fff; background: #1e293b; padding: 9px 12px; }
      table.ai-table th:first-child, table.ai-table td:first-child { text-align: left; }
      table.ai-table td { padding: 9px 12px; border-bottom: 1px solid #f1f1ee; color: #1e293b; text-align: right; }
      table.ai-table tr:last-child td { border-bottom: none; }
      .ai-status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; vertical-align: middle; }
      .ai-smallbase-pill {
        display: inline-block; font-size: 10px; font-weight: 700; color: #92400e; background: #fffbeb;
        border: 1px solid #fde68a; border-radius: 8px; padding: 1px 6px; margin-left: 6px; vertical-align: middle;
      }
      .ai-pct { font-weight: 700; }
      .ai-pct.up { color: #16a34a; }
      .ai-pct.down { color: #dc2626; }
      .ai-pct.flat { color: #94a3b8; }

      .ai-legend { font-size: 11px; color: #6b7280; line-height: 1.9; margin-top: 14px; padding-top: 12px; border-top: 1px solid #f1f1ee; }
      .ai-legend b { color: #475569; }
      .ai-legend .ai-legend-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin: 0 4px 0 10px; vertical-align: middle; }
      .ai-legend .ai-legend-dot:first-child { margin-left: 0; }
    `;
    document.head.appendChild(style);
  }

  // ---- shared helpers (same defensive window.X-or-fallback pattern as executive.js/Migration.js) ----
  const getVal = window.getRowValue || ((r, keys) => r[keys[0]]);
  const getRowDate = (row) => window.getRowDateStr ? window.getRowDateStr(row) : getVal(row, ['วันที่โอนเงิน', 'วันที่สร้าง', 'OrderDate', 'Date', 'วันที่']);
  const getSubChannel = (row) => window.getNormalizedSubChannel ? window.getNormalizedSubChannel(row) : 'Other';
  const calcMetrics = window.calculateMetrics || ((rows) => {
    let totalSales = 0; (rows || []).forEach(r => { totalSales += (parseFloat((getVal(r, ['ราคาขาย','ยอดขาย','Amount']) || '0').toString().replace(/,/g, '')) || 0); });
    return { totalSales, totalOrders: (rows || []).length };
  });

  const parseD = (dateStr) => {
    if (!dateStr) return null;
    if (window.parseDate) {
      const p = window.parseDate(dateStr);
      if (!p) return null;
      return { y: p.y, m: p.m, d: p.d, str: p.str, dateKey: `${p.str}-${String(p.d).padStart(2, '0')}` };
    }
    const parts = dateStr.toString().split(' ')[0].split('/');
    if (parts.length < 3) return null;
    let y = parseInt(parts[2]), m = parseInt(parts[1]), d = parseInt(parts[0]);
    if (y < 2000) y += 2000;
    return { y, m, d, str: `${y}-${String(m).padStart(2, '0')}`, dateKey: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
  };

  const fmtMoney = (n) => '฿' + Math.round(n || 0).toLocaleString('en-US');
  const fmtNum = (n) => Math.round(n || 0).toLocaleString('en-US');
  const fmtPct = (n) => (n === null || n === undefined || !isFinite(n)) ? '-' : (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  const arrowPct = (n) => {
    if (n === null || n === undefined || !isFinite(n)) return '<span class="ai-pct flat">-</span>';
    const cls = n > 0 ? 'up' : (n < 0 ? 'down' : 'flat');
    const arrow = n > 0 ? '▲' : (n < 0 ? '▼' : '—');
    return `<span class="ai-pct ${cls}">${arrow} ${fmtPct(n)}</span>`;
  };
  const thaiMonthShort = { '01': 'ม.ค.', '02': 'ก.พ.', '03': 'มี.ค.', '04': 'เม.ย.', '05': 'พ.ค.', '06': 'มิ.ย.', '07': 'ก.ค.', '08': 'ส.ค.', '09': 'ก.ย.', '10': 'ต.ค.', '11': 'พ.ย.', '12': 'ธ.ค.' };
  const monthLabel = (mStr) => {
    if (!mStr) return '-';
    const [y, mm] = mStr.split('-');
    if (typeof thaiMonths !== 'undefined' && thaiMonths[mm]) return `${thaiMonths[mm]} ${y}`;
    return `${mm}/${y}`;
  };
  const monthLabelShort = (mStr) => { const [y, mm] = mStr.split('-'); return `${thaiMonthShort[mm] || mm} ${y}`; };
  const monthOffset = (monthStr, delta) => {
    const [y, m] = monthStr.split('-').map(Number);
    const dt = new Date(y, m - 1 + delta, 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  };
  const shiftDate = (dateKey, deltaDays) => {
    const [y, m, d] = dateKey.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + deltaDays);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  };
  const shortDate = (dateKey) => { const [, m, d] = dateKey.split('-'); return `${d}/${m}`; };

  // ==================================================================================
  // 1) แยกแถวข้อมูล (filteredData) เป็น bucket รายวัน / รายวัน-ต่อ-ช่องทาง สำหรับคำนวณ MTD/Pace/WoW
  //    ทุกยอดขาย/ออเดอร์ยังคงผ่าน window.calculateMetrics(rows) เหมือนเดิม แค่แบ่ง rows ก่อนส่งเข้าไป
  // ==================================================================================
  const dayRows = {};    // dateKey (YYYY-MM-DD) -> rows[]
  const dayChRows = {};  // dateKey -> subChannel -> rows[]

  filteredData.forEach(row => {
    const d = parseD(getRowDate(row));
    if (!d) return;
    const dk = d.dateKey;
    if (!dayRows[dk]) dayRows[dk] = [];
    dayRows[dk].push(row);

    const sc = getSubChannel(row);
    if (!dayChRows[dk]) dayChRows[dk] = {};
    if (!dayChRows[dk][sc]) dayChRows[dk][sc] = [];
    dayChRows[dk][sc].push(row);
  });

  const dateKeys = Object.keys(dayRows).sort();
  if (dateKeys.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:50px; color:#999;">ไม่พบวันที่ที่อ่านค่าได้ในข้อมูลที่กรองอยู่นี้</div>';
    return;
  }

  const latestKey = dateKeys[dateKeys.length - 1];
  const [latestY, latestM, latestD] = latestKey.split('-').map(Number);
  const currentMonthStr = `${latestY}-${String(latestM).padStart(2, '0')}`;
  const daysElapsed = latestD;
  const daysInMonth = new Date(latestY, latestM, 0).getDate(); // วันที่ 0 ของเดือนถัดไป = วันสุดท้ายของเดือนนี้
  const prevMonthStr = monthOffset(currentMonthStr, -1);
  const prev2MonthStr = monthOffset(currentMonthStr, -2);
  const prev3MonthStr = monthOffset(currentMonthStr, -3);

  // รวมแถวของเดือน monthStr เฉพาะวันที่ <= dayLimit (ใช้ทำ "ช่วงเดียวกัน" ให้เทียบวันต่อวันอย่างเป็นธรรม)
  // dayLimit = null คือทั้งเดือน (ใช้กับยอดเดือนก่อนหน้าแบบเต็มเดือน สำหรับเทียบกับยอดพยากรณ์สิ้นเดือน)
  function sumForMonth(monthStr, dayLimit, channel) {
    let rows = [];
    dateKeys.forEach(dk => {
      if (!dk.startsWith(monthStr)) return;
      if (dayLimit !== null && parseInt(dk.slice(8, 10), 10) > dayLimit) return;
      const bucket = channel ? (dayChRows[dk] || {})[channel] : dayRows[dk];
      if (bucket) rows = rows.concat(bucket);
    });
    return calcMetrics(rows);
  }
  function sumForDateRange(startKey, endKey, channel) {
    let rows = [];
    dateKeys.forEach(dk => {
      if (dk < startKey || dk > endKey) return;
      const bucket = channel ? (dayChRows[dk] || {})[channel] : dayRows[dk];
      if (bucket) rows = rows.concat(bucket);
    });
    return calcMetrics(rows);
  }
  function monthHasChannelData(monthStr, channel) {
    return dateKeys.some(dk => dk.startsWith(monthStr) && (!channel || (dayChRows[dk] || {})[channel]));
  }
  // ค่าเฉลี่ยยอดขาย "ช่วงเดียวกัน" ของ 3 เดือนก่อนหน้า - เฉลี่ยเฉพาะเดือนที่มีข้อมูลจริง (ข้อมูลเพิ่งเริ่มเก็บไม่ถึง
  // 3 เดือนก็ยังคำนวณได้จากเดือนที่มีอยู่ แทนที่จะคืนค่า null ไปเลย)
  function avg3Same(channel) {
    const months = [prevMonthStr, prev2MonthStr, prev3MonthStr].filter(ms => monthHasChannelData(ms, channel));
    if (months.length === 0) return null;
    const total = months.reduce((a, ms) => a + sumForMonth(ms, daysElapsed, channel).totalSales, 0);
    return { avg: total / months.length, monthsUsed: months.length };
  }

  const last7Start = shiftDate(latestKey, -6);
  const prev7End = shiftDate(latestKey, -7);
  const prev7Start = shiftDate(latestKey, -13);

  // ==================================================================================
  // 2) ตัวเลขภาพรวม (การ์ดบนสุด 5 ใบ)
  // ==================================================================================
  const mtdM = sumForMonth(currentMonthStr, daysElapsed, null);
  const prevSameM = sumForMonth(prevMonthStr, daysElapsed, null);
  const prevFullM = sumForMonth(prevMonthStr, null, null);
  const avg3 = avg3Same(null);
  const last7M = sumForDateRange(last7Start, latestKey, null);
  const prev7M = sumForDateRange(prev7Start, prev7End, null);
  const latestDayM = sumForDateRange(latestKey, latestKey, null);

  const pace = prevSameM.totalSales > 0 ? ((mtdM.totalSales - prevSameM.totalSales) / prevSameM.totalSales) * 100 : null;
  const vs3mo = (avg3 && avg3.avg > 0) ? ((mtdM.totalSales - avg3.avg) / avg3.avg) * 100 : null;
  const forecast = daysElapsed > 0 ? (mtdM.totalSales / daysElapsed) * daysInMonth : 0;
  const forecastVsPrevFull = prevFullM.totalSales > 0 ? ((forecast - prevFullM.totalSales) / prevFullM.totalSales) * 100 : null;
  const wow = prev7M.totalSales > 0 ? ((last7M.totalSales - prev7M.totalSales) / prev7M.totalSales) * 100 : null;

  const kpiHtml = `
    <div class="ai-kpi-row">
      <div class="ai-kpi-card">
        <div class="ai-kpi-label">ยอดสะสมเดือนนี้ (MTD)</div>
        <div class="ai-kpi-value">${fmtMoney(mtdM.totalSales)}</div>
        <div class="ai-kpi-sub">เฉลี่ย ${fmtMoney(mtdM.totalSales / daysElapsed)} /วัน · ${fmtNum(mtdM.totalOrders)} ออเดอร์</div>
      </div>
      <div class="ai-kpi-card">
        <div class="ai-kpi-label">เทียบ ${monthLabelShort(prevMonthStr)} ช่วงเดียวกัน</div>
        <div class="ai-kpi-change">${arrowPct(pace)}</div>
        <div class="ai-kpi-sub">เดือนก่อน ${fmtMoney(prevSameM.totalSales)} · ${fmtNum(prevSameM.totalOrders)} ออเดอร์</div>
      </div>
      <div class="ai-kpi-card">
        <div class="ai-kpi-label">เทียบค่าเฉลี่ย ${avg3 ? avg3.monthsUsed : 3} เดือนก่อน</div>
        <div class="ai-kpi-change">${arrowPct(vs3mo)}</div>
        <div class="ai-kpi-sub">${avg3 ? `ค่าเฉลี่ยช่วงเดียวกัน ${fmtMoney(avg3.avg)}` : 'ยังไม่มีข้อมูลเดือนก่อนหน้าพอเทียบ'}</div>
      </div>
      <div class="ai-kpi-card">
        <div class="ai-kpi-label">คาดการณ์สิ้นเดือน</div>
        <div class="ai-kpi-value">${fmtMoney(forecast)}</div>
        <div class="ai-kpi-sub">${forecastVsPrevFull !== null ? `${fmtPct(forecastVsPrevFull)} เทียบ ${monthLabelShort(prevMonthStr)} ทั้งเดือน (${fmtMoney(prevFullM.totalSales)})` : `เทียบ ${monthLabelShort(prevMonthStr)} ทั้งเดือนยังไม่ได้ (ไม่มีข้อมูล)`}</div>
      </div>
      <div class="ai-kpi-card">
        <div class="ai-kpi-label">7 วันล่าสุด</div>
        <div class="ai-kpi-value" style="color:#16a34a;">${fmtMoney(last7M.totalSales)}</div>
        <div class="ai-kpi-sub">${wow !== null ? `${fmtPct(wow)} เทียบ 7 วันก่อนหน้า (${fmtMoney(prev7M.totalSales)})` : 'ยังไม่มี 7 วันก่อนหน้าให้เทียบ'} · ปิดที่ ${fmtMoney(latestDayM.totalSales)}</div>
      </div>
    </div>
  `;

  // ==================================================================================
  // 3) ตัวเลขรายช่องทาง (ตารางล่าง + narrative/action list ด้านบน)
  // ==================================================================================
  const SMALL_BASE_THRESHOLD = 10000; // บาท - ต่ำกว่านี้ %จะเหวี่ยงง่ายจาก noise ของฐานเล็ก (ดู legend "ฐานเล็ก")

  const allChannels = new Set();
  filteredData.forEach(row => { const sc = getSubChannel(row); if (sc) allChannels.add(sc); });

  const channelRows = Array.from(allChannels).map(sc => {
    const mtd = sumForMonth(currentMonthStr, daysElapsed, sc);
    const prevSame = sumForMonth(prevMonthStr, daysElapsed, sc);
    const avg3c = avg3Same(sc);
    const last7 = sumForDateRange(last7Start, latestKey, sc);
    const prev7 = sumForDateRange(prev7Start, prev7End, sc);

    const cPace = prevSame.totalSales > 0 ? ((mtd.totalSales - prevSame.totalSales) / prevSame.totalSales) * 100 : null;
    const cVs3mo = (avg3c && avg3c.avg > 0) ? ((mtd.totalSales - avg3c.avg) / avg3c.avg) * 100 : null;
    const cWow = prev7.totalSales > 0 ? ((last7.totalSales - prev7.totalSales) / prev7.totalSales) * 100 : null;
    const cForecast = daysElapsed > 0 ? (mtd.totalSales / daysElapsed) * daysInMonth : 0;
    const isSmallBase = Math.max(mtd.totalSales, prevSame.totalSales) < SMALL_BASE_THRESHOLD;

    return { subChannel: sc, mtd: mtd.totalSales, prevSame: prevSame.totalSales, pace: cPace, vs3mo: cVs3mo, last7: last7.totalSales, wow: cWow, forecast: cForecast, isSmallBase };
  });

  const totalMtdAllChannels = channelRows.reduce((a, c) => a + c.mtd, 0);
  channelRows.forEach(c => { c.share = totalMtdAllChannels > 0 ? (c.mtd / totalMtdAllChannels) * 100 : 0; });

  // เกณฑ์สถานะ (สี/ป้าย) - ปรับจากหน้าอ้างอิง Holista Sales & Finance Dashboard: ช่องทางฐานเล็กใช้แค่ Pace/
  // vs 3 เดือน ตัดสินสี (WoW ของฐานเล็กเหวี่ยงง่ายเกินกว่าจะเชื่อได้) ส่วนช่องทางฐานปกติเช็ค Pace+WoW ร่วมกัน
  function computeStatus(c) {
    if (c.isSmallBase) {
      if (c.pace !== null && c.pace <= -20) return 'down';
      if (c.vs3mo !== null && c.vs3mo <= -20) return 'down';
      if (c.pace !== null && c.pace >= 10) return 'up';
      return 'flat';
    }
    const paceUp = c.pace !== null && c.pace >= 10;
    const wowBad = c.wow !== null && c.wow <= -25;
    if (paceUp && wowBad) return 'watch';
    if ((c.vs3mo !== null && c.vs3mo <= -20) || (wowBad && !paceUp)) return 'down';
    if (paceUp && (c.wow === null || c.wow > -10)) return 'up';
    return 'flat';
  }
  const STATUS_META = {
    down: { color: '#dc2626', label: 'ตก' },
    watch: { color: '#f59e0b', label: 'เฝ้าระวัง' },
    up: { color: '#16a34a', label: 'โต' },
    flat: { color: '#94a3b8', label: 'ทรงตัว' }
  };
  channelRows.forEach(c => { c.status = computeStatus(c); });
  channelRows.sort((a, b) => b.mtd - a.mtd);

  // ---- "ช่องทางที่ต้องจับตา": เดือนยังบวกดี (Pace >= 10%) แต่ 7 วันล่าสุดร่วงแรง (WoW <= -25%) ----
  // เช็คจากตัวเลขดิบตรงๆ (ไม่สนใจว่าสีจุดจะถูกลดทอนเป็นเขียวเพราะฐานเล็กหรือไม่) เพราะนี่คือคำเตือนล่วงหน้า
  // แยกจากสีสถานะในตาราง
  const watchList = channelRows
    .filter(c => c.pace !== null && c.pace >= 10 && c.wow !== null && c.wow <= -25)
    .sort((a, b) => a.wow - b.wow);

  // ---- ช่องทางที่เม็ดเงินหายไปมากที่สุดเทียบเดือนก่อนหน้า (ไม่สนสถานะสี ใช้บาทที่หายไปจริงเรียงลำดับ) ----
  const decliners = channelRows
    .filter(c => c.prevSame > 0 && c.mtd < c.prevSame)
    .map(c => Object.assign({}, c, { lost: c.prevSame - c.mtd }))
    .sort((a, b) => b.lost - a.lost)
    .slice(0, 3);

  // ==================================================================================
  // 4) "อ่านสถานการณ์" - narrative
  // ==================================================================================
  const situationParas = [];
  situationParas.push(
    `ยอดสะสมเดือน <span class="ai-highlight">${monthLabel(currentMonthStr)}</span> ถึงวันที่ ${daysElapsed} อยู่ที่ ${fmtMoney(mtdM.totalSales)} บาท` +
    (pace !== null ? ` ${pace >= 0 ? 'สูง' : 'ต่ำ'}กว่าช่วงเดียวกันของ ${monthLabelShort(prevMonthStr)} อยู่ <span class="${pace >= 0 ? 'ai-up' : 'ai-down'}">${fmtPct(pace)}</span>` : '') +
    (vs3mo !== null ? ` และ${vs3mo >= 0 ? 'สูง' : 'ต่ำ'}กว่าค่าเฉลี่ย ${avg3.monthsUsed} เดือนก่อนหน้า <span class="${vs3mo >= 0 ? 'ai-up' : 'ai-down'}">${fmtPct(vs3mo)}</span>` : '') +
    `. ถ้าอัตราต่อวันคงระดับนี้ไปจนจบเดือน คาดว่าจะจบที่ราว <span class="ai-highlight">${fmtMoney(forecast)}</span> บาท` +
    (forecastVsPrevFull !== null ? ` คิดเป็น ${fmtPct(forecastVsPrevFull)} เทียบ ${monthLabelShort(prevMonthStr)} ทั้งเดือน` : '')
  );

  situationParas.push(
    `ในระยะสั้น 7 วันล่าสุด (${shortDate(last7Start)}-${shortDate(latestKey)}) ทำ ${fmtMoney(last7M.totalSales)} บาท` +
    (wow !== null ? ` <span class="${wow >= 0 ? 'ai-up' : 'ai-down'}">${fmtPct(wow)}</span> เทียบ 7 วันก่อนหน้า (${fmtMoney(prev7M.totalSales)})` : '') +
    ` ปิดที่ ${fmtMoney(latestDayM.totalSales)} บาท`
  );

  if (watchList.length > 0) {
    const names = watchList.map(c => `${c.subChannel} (เดือน ${fmtPct(c.pace)} แต่ 7 วันล่าสุด ${fmtPct(c.wow)})`).join(', ');
    situationParas.push(
      `ช่องทางที่ต้องจับตาที่สุดคือ ${names}. ภาพรวมทั้งเดือนยังดี แต่โมเมนตัมช่วงสัปดาห์ล่าสุดร่วงแรง เป็นสัญญาณล่วงหน้าว่าอาจชะลอตัวลง ถ้าไม่รีบดูอาจกระทบยอดเดือนถัดไป`
    );
  }

  if (decliners.length > 0) {
    const parts = decliners.map(c => `${c.subChannel} หายไป ${fmtMoney(c.lost)} บาท (${fmtPct(c.pace)})${c.isSmallBase ? ' [ฐานเล็ก]' : ''}`).join('; ');
    situationParas.push(`เรียงตามเม็ดเงินที่หายไปเทียบเดือนก่อนหน้า: ${parts}`);
  }

  const situationHtml = situationParas.map(p => `<p>${p}</p>`).join('');

  // ==================================================================================
  // 5) "ทีม Ads ควรทำ" - action items
  // ==================================================================================
  const actionItems = [];
  watchList.forEach(c => {
    actionItems.push(`เช็ค <b>${c.subChannel}</b> ด่วน — 7 วันล่าสุดร่วง ${Math.abs(c.wow).toFixed(1)}% ทั้งที่ทั้งเดือนยังบวกอยู่ ${fmtPct(c.pace)} ดูว่าแอดหยุดยิง งบตัน หรือครีเอทีฟล้า`);
  });
  const fixList = channelRows
    .filter(c => c.status === 'down' && c.prevSame > 0 && c.mtd < c.prevSame)
    .sort((a, b) => (b.prevSame - b.mtd) - (a.prevSame - a.mtd))
    .slice(0, 3);
  fixList.forEach(c => {
    const lost = c.prevSame - c.mtd;
    const wowText = c.wow === null ? 'ยังไม่มีข้อมูล 7 วันก่อนหน้าเทียบ' : (c.wow >= 0 ? `7 วันล่าสุดเริ่มฟื้นตัว (${fmtPct(c.wow)})` : `7 วันล่าสุดยังไม่ฟื้น (${fmtPct(c.wow)})`);
    actionItems.push(`แก้ <b>${c.subChannel}</b> — หายไป ${fmtMoney(lost)} บาทเทียบเดือนก่อนหน้า (${fmtPct(c.pace)}) และ ${wowText} ควรเกาะติดทั้งรายเดือนและรายสัปดาห์`);
  });

  const actionHtml = actionItems.length > 0
    ? `<ul class="ai-action-list">${actionItems.map(a => `<li>${a}</li>`).join('')}</ul>`
    : '<p class="ai-empty-note">ยังไม่พบช่องทางที่ต้องรีบดำเนินการตามเกณฑ์ที่ตั้งไว้ในช่วงข้อมูลที่กรองอยู่นี้</p>';

  // ==================================================================================
  // 6) ตารางช่องทางจำหน่าย
  // ==================================================================================
  const tableRowsHtml = channelRows.map(c => {
    const meta = STATUS_META[c.status] || STATUS_META.flat;
    return `
      <tr>
        <td><span class="ai-status-dot" style="background:${meta.color}" title="${meta.label}"></span>${c.subChannel}${c.isSmallBase ? '<span class="ai-smallbase-pill">ฐานเล็ก</span>' : ''}</td>
        <td>${fmtMoney(c.mtd)}</td>
        <td>${fmtMoney(c.prevSame)}</td>
        <td>${arrowPct(c.pace)}</td>
        <td>${arrowPct(c.vs3mo)}</td>
        <td>${c.share.toFixed(1)}%</td>
        <td>${fmtMoney(c.last7)}</td>
        <td>${arrowPct(c.wow)}</td>
        <td>${fmtMoney(c.forecast)}</td>
      </tr>
    `;
  }).join('');

  const tableHtml = `
    <div class="ai-table-sub">เรียงตามยอดสะสมเดือนนี้</div>
    <div class="ai-table-wrap">
      <table class="ai-table">
        <thead>
          <tr>
            <th>ช่องทาง</th>
            <th>MTD</th>
            <th>${monthLabelShort(prevMonthStr)} ช่วงเดียวกัน</th>
            <th>Pace</th>
            <th>vs เฉลี่ย 3 ด.</th>
            <th>สัดส่วน</th>
            <th>7 วันล่าสุด</th>
            <th>WoW</th>
            <th>คาดสิ้นเดือน</th>
          </tr>
        </thead>
        <tbody>${tableRowsHtml}</tbody>
      </table>
    </div>
    <div class="ai-legend">
      <div>
        <b>เกณฑ์สถานะ:</b>
        <span class="ai-legend-dot" style="background:${STATUS_META.down.color}"></span>ตก: เดือนนี้ต่ำกว่าค่าเฉลี่ย 3 เดือน 20% ขึ้นไป หรือ 7 วันล่าสุดร่วง 25%ขึ้นไป (โดยเดือนยังไม่บวกแรงพอ)
        <span class="ai-legend-dot" style="background:${STATUS_META.watch.color}"></span>เฝ้าระวัง: เดือนขยับ 10%+ แต่ 7 วันล่าสุดร่วง 25%+
        <span class="ai-legend-dot" style="background:${STATUS_META.up.color}"></span>โต: เดือนบวก 10%+ และ 7 วันล่าสุดไม่ร่วงเกิน 10%
        <span class="ai-legend-dot" style="background:${STATUS_META.flat.color}"></span>ทรงตัว: นอกเหนือจากนี้ (ช่องทางฐานเล็กใช้ Pace/vs 3 เดือนอย่างเดียวตัดสิน เพราะ WoW เหวี่ยงง่ายเกินไป)
      </div>
      <div>
        <b>อ่านคอลัมน์:</b> Pace = ยอดสะสมเดือนนี้เทียบกับช่วงเดียวกัน (นับถึงวันเดียวกัน) ของเดือนก่อนหน้า บอกว่าเดือนนี้กำลังเร็วหรือช้ากว่าเดือนก่อน ·
        vs เฉลี่ย 3 ด. = เทียบกับค่าเฉลี่ยช่วงเดียวกันของสูงสุด 3 เดือนก่อนหน้า ใช้คัดกรองเดือนที่แรง/อ่อนผิดปกติจาก Pace เดือนเดียว ·
        WoW = ยอด 7 วันล่าสุดเทียบ 7 วันก่อนหน้า บอกโมเมนตัมล่าสุด · คาดสิ้นเดือน = ยอดเฉลี่ยต่อวันของเดือนนี้ คูณจำนวนวันทั้งเดือน ·
        ฐานเล็ก = ยอดสะสมน้อย (ต่ำกว่า ${fmtMoney(SMALL_BASE_THRESHOLD)} บาท) เปอร์เซ็นต์เหวี่ยงง่าย อย่าตัดสินใจจาก % อย่างเดียว
      </div>
    </div>
  `;

  // ==================================================================================
  // render
  // ==================================================================================
  container.innerHTML = `
    <div class="ai-section-title">AI Analytics</div>
    <div class="ai-section-sub">วิเคราะห์อัตโนมัติจากข้อมูลที่กรองอยู่ในขณะนี้ - คำนวณจากตัวเลขจริงทั้งหมด ไม่มีการเดา (ข้อมูลล่าสุดถึงวันที่ ${latestD}/${latestM}/${latestY})</div>
    ${kpiHtml}
    <div class="ai-block">
      <div class="ai-block-head"><span class="ai-icon">🔍</span><h3>อ่านสถานการณ์</h3></div>
      ${situationHtml}
    </div>
    <div class="ai-block">
      <div class="ai-block-head"><span class="ai-icon">🎯</span><h3>ทีม Ads ควรทำ</h3></div>
      ${actionHtml}
    </div>
    <div class="ai-block">
      <div class="ai-block-head"><span class="ai-icon">🛒</span><h3>ช่องทางจำหน่าย</h3></div>
      ${tableHtml}
    </div>
  `;
}

window.renderAiAnalytics = renderAiAnalytics;
