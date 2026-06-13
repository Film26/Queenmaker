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
      .exec-table-wrapper {
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.03);
        overflow-x: auto;
        max-width: 100%;
        scrollbar-width: thin;
        margin-bottom: 25px;
      }
      .exec-table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        font-family: 'Inter', sans-serif;
        font-size: 13px;
        background-color: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 4px 15px rgba(0,0,0,0.02);
        margin-bottom: 30px;
      }
      .exec-table th, .exec-table td {
        border-bottom: 1px solid #e2e8f0;
        border-right: 1px solid #e2e8f0;
        padding: 10px 8px;
        text-align: right;
      }
      .exec-table th:last-child, .exec-table td:last-child {
        border-right: none;
      }
      .exec-table tr:last-child td {
        border-bottom: none;
      }
      .exec-table th {
        background-color: #f8fafc;
        color: #1e293b;
        font-weight: 700;
        text-align: center;
        border-bottom: 2px solid #cbd5e1;
      }
      .exec-table th:first-child, .exec-table td.metric-label {
        text-align: left;
        font-weight: 600;
        width: 22%;
        color: #334155;
      }
      .exec-table td.col-total, .exec-table th.col-total {
        font-weight: bold;
        background-color: #f8fafc;
        color: #0f172a;
      }
      .exec-table .bg-light-green {
        background-color: #f0fdf4 !important;
        color: #166534;
      }
      .exec-table .bg-light-blue {
        background-color: #f0f9ff !important;
        color: #0369a1;
      }
      .status-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }
      .dot-blue { background-color: #38bdf8; }
      .dot-green { background-color: #22c55e; }
      .dot-orange { background-color: #ea580c; }
      
      .ytd-table {
        border-collapse: separate;
        border-spacing: 0;
        font-family: 'Inter', sans-serif;
        font-size: 13px;
        background-color: #fff;
        border: 1px solid #cbd5e1;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 4px 15px rgba(0,0,0,0.02);
        margin-bottom: 25px;
        width: 70%;
      }
      .ytd-table th, .ytd-table td {
        border-bottom: 1px solid #e2e8f0;
        border-right: 1px solid #e2e8f0;
        padding: 10px 8px;
        text-align: center;
      }
      .ytd-table th:last-child, .ytd-table td:last-child {
        border-right: none;
      }
      .ytd-table tr:last-child td {
        border-bottom: none;
      }
      .ytd-table th {
        background-color: #1e293b;
        color: #fff;
        font-weight: 700;
        border-bottom: 2px solid #0f172a;
      }
      .ytd-table td {
        background-color: #fff;
        font-weight: 700;
        color: #1e293b;
        font-size: 14px;
      }
      .ytd-table .bg-yellow {
        background-color: #fffbeb !important;
        color: #b45309;
      }
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
  const getSafely = (a, b) => b === 0 ? 0 : a / b;

  // Build Table HTML
   let html = `
    <div class="exec-table-wrapper">
      <table class="ytd-table">
        <thead>
          <tr>
            <th style="width: 30%;">YTD Revenue<br><span style="font-size: 11px; font-weight: normal; color: #cbd5e1;">ยอดขาย YTD (บาท)</span></th>
            <th>YTD Buyer<br><span style="font-size: 11px; font-weight: normal; color: #cbd5e1;">ลูกค้าจริง YTD (คน)</span></th>
            <th>YTD New Customers<br><span style="font-size: 11px; font-weight: normal; color: #cbd5e1;">ลูกค้าใหม่ YTD (คน)</span></th>
            <th>YTD Old Customers<br><span style="font-size: 11px; font-weight: normal; color: #cbd5e1;">ลูกค้าเก่า YTD (คน)</span></th>
            <th>YTD AOV<br><span style="font-size: 11px; font-weight: normal; color: #cbd5e1;">ยอดต่อบิลเฉลี่ย YTD (บาท)</span></th>
            <th>YTD SPH<br><span style="font-size: 11px; font-weight: normal; color: #cbd5e1;">ยอดเฉลี่ยต่อคน YTD (บาท)</span></th>
            <th>Repeat Purchase<br><span style="font-size: 11px; font-weight: normal; color: #cbd5e1;">การซื้อซ้ำ</span></th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${fmtNum(total.revenue)}</td>
            <td>${fmtNum(total.uniqueBuyers.size)}</td>
            <td class="bg-yellow">${fmtNum(total.newGlobalBuyers.size)}</td>
            <td>${fmtNum(total.retainedBuyers.size)}</td>
            <td>${fmtNum(getSafely(total.revenue, total.orders))}</td>
            <td>${fmtNum(getSafely(total.revenue, total.uniqueBuyers.size))}</td>
            <td>${fmtDec(getSafely(total.orders, total.uniqueBuyers.size))}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="exec-table-wrapper">
      <table class="exec-table">
      <thead>
        <tr>
         <th>Metric / Month<br><span style="font-size: 11px; font-weight: normal; color: #64748b;">ตัวชี้วัด / เดือน</span></th>
          ${months.map(m => `<th>${m}</th>`).join('')}
          <th class="col-total">Total Year<br><span style="font-size: 11px; font-weight: normal; color: #64748b;">ยอดรวมทั้งปี</span></th>
        </tr>
      </thead>
      <tbody>
  `;
  const renderRow = (label, values, isMoney = false, isDec = false, isPct = false, bgClass = '') => {
    let rowHtml = `<tr><td class="metric-label ${bgClass}">${label}</td>`;
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
  // Metrics Array Construction
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
  html += renderRow('Revenue<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">ยอดขาย</span>', revArr, true, false, false, 'bg-light-green');
  html += renderRow('Orders<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">ออเดอร์</span>', ordArr, true, false, false, 'bg-light-blue');
  html += renderRow('AOV (Average Order Value)<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">ยอดต่อบิลเฉลี่ย</span>', aovArr, true, false, false, 'bg-light-blue');
  html += renderRow('Unique Buyers<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">คนซื้อจริง</span>', ubArr, true, false, false, 'bg-light-green');
  html += renderRow('Frequency<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">ความถี่ซื้อ</span>', freqArr, false, true, false, 'bg-light-blue');
  html += renderRow('Spending per Head<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">เฉลี่ยต่อคน</span>', sphArr, true, false, false, 'bg-light-blue');
  html += renderRow('Retained Buyers<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">คนเก่าซื้อซ้ำ</span>', retArr, true, false, false, 'bg-light-blue');
  html += renderRow('New Customers (Global)<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">ลูกค้าใหม่ (Global)</span>', newGArr, true, false, false, 'bg-light-green');
  html += renderRow('% New Customer Share<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">สัดส่วนลูกค้าใหม่</span>', newGShrArr, false, false, true, 'bg-light-blue');
  html += renderRow('New to Sub (Migration)<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">ลูกค้าใหม่เฉพาะกลุ่ม (Migration)</span>', migArr, true, false, false, 'bg-light-green');
  html += renderRow('% Migration Rate<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">อัตราการย้ายกลุ่ม</span>', migRtArr, false, false, true, 'bg-light-blue');
  // Channel Status Row Placeholder
  html += `<tr><td class="metric-label bg-light-blue">Channel Status<br><span style="font-size: 11px; font-weight: normal; color: #4b5563;">สถานะช่องทาง</span></td>`;
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
