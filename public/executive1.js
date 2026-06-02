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
      .exec-table { width: 100%; border-collapse: collapse; font-family: 'Inter', sans-serif; font-size: 13px; background-color: #fff; border: 1px solid #ddd; }
      .exec-table th, .exec-table td { border: 1px solid #a6b5c9; padding: 8px 10px; text-align: right; }
      .exec-table th { background-color: #e6d1d9; color: #333; font-weight: 600; text-align: center; }
      .exec-table th:first-child, .exec-table td.metric-label { text-align: left; font-weight: 600; width: 20%; }
      .exec-table td.col-total, .exec-table th.col-total { font-weight: bold; }
      .exec-table .bg-light-green { background-color: #e2efe1 !important; }
      .exec-table .bg-light-blue { background-color: #e3f2fb !important; }
      .status-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; }
      .dot-blue { background-color: #4a86e8; }
      .dot-green { background-color: #57d48a; }
      .dot-orange { background-color: #fa9b50; }
      
      .ytd-table { border-collapse: collapse; font-family: 'Inter', sans-serif; font-size: 13px; background-color: #fff; border: 2px solid #666; margin-bottom: 20px; width: 60%; }
      .ytd-table th, .ytd-table td { border: 1px solid #999; padding: 8px 10px; text-align: center; }
      .ytd-table th { background-color: #0d3b66; color: #fff; font-weight: 600; }
      .ytd-table td { background-color: #f5f5f5; font-weight: bold; color: #333; }
      .ytd-table .bg-yellow { background-color: #fff500 !important; }
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
    const id = getVal(row, ['Customer ID', 'รหัสลูกค้า', 'Phone', 'phone']);
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
    const id = getVal(row, ['Customer ID', 'รหัสลูกค้า', 'Phone', 'phone']);
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
    <table class="ytd-table">
      <thead>
        <tr>
          <th style="width: 30%;">YTD Revenue</th>
          <th>YTD Buyer</th>
          <th>YTD New<br>Customers</th>
          <th>YTD Old<br>Customers</th>
          <th>YTD AOV</th>
          <th>YTD SPH</th>
          <th>Repeat<br>Purchase</th>
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
    <table class="exec-table">
      <thead>
        <tr>
         <th>Metric / Month</th>
          ${months.map(m => `<th>${m}</th>`).join('')}
          <th class="col-total">Total Year</th>
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
  html += renderRow('Revenue (ยอดขาย)', revArr, true, false, false, 'bg-light-green');
  html += renderRow('Orders (ออเดอร์)', ordArr, true, false, false, 'bg-light-blue');
  html += renderRow('AOV (ยอดต่อบิลเฉลี่ย)', aovArr, true, false, false, 'bg-light-blue');
  html += renderRow('Unique Buyers (คนซื้อจริง)', ubArr, true, false, false, 'bg-light-green');
  html += renderRow('Frequency (ความถี่ซื้อ)', freqArr, false, true, false, 'bg-light-blue');
  html += renderRow('Spending per Head (เฉลี่ยต่อคน)', sphArr, true, false, false, 'bg-light-blue');
  html += renderRow('Retained Buyers (คนเก่าซื้อซ้ำ)', retArr, true, false, false, 'bg-light-blue');
  html += renderRow('New Customers (Global)', newGArr, true, false, false, 'bg-light-green');
  html += renderRow('% New Customer Share', newGShrArr, false, false, true, 'bg-light-blue');
  html += renderRow('New to Sub (Migration)', migArr, true, false, false, 'bg-light-green');
  html += renderRow('% Migration Rate', migRtArr, false, false, true, 'bg-light-blue');
  // Channel Status Row Placeholder
  html += `<tr><td class="metric-label bg-light-blue">Channel Status</td>`;
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
  html += `</tbody></table>`;
  container.innerHTML = html;
}
