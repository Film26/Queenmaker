// public/executive1.js

function renderExecutive1(filteredData, rawData) {
  const container = document.getElementById('view-executive1');
  
  if (!filteredData || filteredData.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:50px; color:#999;">No data available. Please adjust filters or load data.</div>';
    return;
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
    const id = row['Customer ID'] || row['รหัสลูกค้า (ลูกค้า) ไม่ใช้'] || row['Phone'];
    const dateStr = row['วันที่สร้าง'] || row['วันที่โอนเงิน'];
    if (!id || !dateStr) return;
    const d = parseD(dateStr);
    if (!d) return;

    if (!filterContextFirstPurchase[id] || d.val < filterContextFirstPurchase[id]) {
      filterContextFirstPurchase[id] = d.val;
    }
  });

  // Aggregate data by month
  filteredData.forEach(row => {
    const id = row['Customer ID'] || row['รหัสลูกค้า (ลูกค้า) ไม่ใช้'] || row['Phone'];
    const dateStr = row['วันที่สร้าง'] || row['วันที่โอนเงิน'];
    const revenueStr = row['ยอดขาย'] || row['ราคาสินค้ายังไม่รวมภาษี'];
    
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
  const fmtNum = (num) => num.toLocaleString('en-US', { maximumFractionDigits: 0 });
  const fmtDec = (num) => (num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = (num) => ((num || 0) * 100).toFixed(1) + '%';
  const getSafely = (a, b) => b === 0 ? 0 : a / b;

  // Build Table HTML
  let html = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
      <h3 style="margin:0; font-size:18px; color:#333;">Executive 1 Overview</h3>
    </div>
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
  html += renderRow('Spending per Head (เฉลี่ยต่อคน)', sphArr, true, false, false, 'bg-light-green');
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
