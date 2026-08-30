// public/ai-analytics.js
//
// AI Analytics tab - Phase 1: deterministic, rule-based business insights computed entirely
// from real numbers already in filteredData/rawData (no external LLM call, no API cost).
// Three sections: sales trend summary, problem-channel detection, next-month forecast.
// See C:\Users\Admin\.claude\plans\frolicking-sleeping-wombat.md for the full design rationale -
// a future phase may send the same computed summary to a real Claude API endpoint to turn these
// numbers into richer prose, but the numbers themselves must always come from this arithmetic,
// never from the model, so the page can never present a hallucinated figure as real.

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
      .ai-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 18px; margin-bottom: 24px; }
      .ai-card {
        background: #fff; border: 1px solid #eee0d5; border-radius: 16px; padding: 20px 22px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.03);
      }
      .ai-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
      .ai-card-head .ai-icon { font-size: 18px; }
      .ai-card-head h3 { margin: 0; font-size: 15px; font-weight: 700; color: #1e293b; }
      .ai-card p { font-size: 13.5px; line-height: 1.7; color: #334155; margin: 0 0 8px; }
      .ai-card p:last-child { margin-bottom: 0; }
      .ai-highlight { font-weight: 700; color: #d95f1d; }
      .ai-up { color: #16a34a; font-weight: 700; }
      .ai-down { color: #dc2626; font-weight: 700; }

      .ai-channel-list { display: flex; flex-direction: column; gap: 10px; }
      .ai-channel-item {
        border-radius: 10px; padding: 12px 14px; border-left: 4px solid #cbd5e1; background: #f8fafc;
      }
      .ai-channel-item.severity-high { border-left-color: #dc2626; background: #fef2f2; }
      .ai-channel-item.severity-medium { border-left-color: #f59e0b; background: #fffbeb; }
      .ai-channel-item .ai-channel-name { font-weight: 700; font-size: 13.5px; color: #1e293b; }
      .ai-channel-item .ai-channel-reason { font-size: 12.5px; color: #475569; margin-top: 3px; }
      .ai-channel-item .ai-channel-badge {
        display: inline-block; font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 10px;
        margin-left: 6px; vertical-align: middle;
      }
      .ai-sev-high .ai-channel-badge { background: #fee2e2; color: #b91c1c; }
      .ai-sev-medium .ai-channel-badge { background: #fef3c7; color: #b45309; }
      .ai-empty-note { font-size: 13px; color: #94a3b8; font-style: italic; }

      .ai-forecast-number { font-size: 30px; font-weight: 800; color: #1e293b; margin: 6px 0 2px; }
      .ai-forecast-range { font-size: 12.5px; color: #94a3b8; margin-bottom: 10px; }
      .ai-caveat {
        font-size: 11.5px; color: #6b7280; background: #fafafa; border: 1px solid #f0f0f0;
        border-radius: 8px; padding: 8px 12px; margin-top: 10px;
      }
    `;
    document.head.appendChild(style);
  }

  // ---- shared helpers (same defensive window.X-or-fallback pattern as executive.js/Migration.js) ----
  const getVal = window.getRowValue || ((r, keys) => r[keys[0]]);
  const parseD = (dateStr) => {
    if (!dateStr) return null;
    if (window.parseDate) {
      const parsed = window.parseDate(dateStr);
      if (parsed) return { y: parsed.y, m: parsed.m, str: parsed.str, val: parsed.y * 10000 + parsed.m * 100 + parsed.d };
    }
    const parts = dateStr.toString().split(' ')[0].split('/');
    if (parts.length < 3) return null;
    let y = parseInt(parts[2]), m = parseInt(parts[1]), d = parseInt(parts[0]);
    if (y < 2000) y += 2000;
    return { y, m, str: `${y}-${String(m).padStart(2, '0')}`, val: y * 10000 + m * 100 + d };
  };
  const getSubChannel = (row) => window.getNormalizedSubChannel ? window.getNormalizedSubChannel(row) : 'Other';
  const fmtMoney = (n) => '฿' + Math.round(n || 0).toLocaleString('en-US');
  const fmtPct = (n) => (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  const monthLabel = (mStr) => {
    if (!mStr) return '-';
    const [y, mm] = mStr.split('-');
    if (typeof thaiMonths !== 'undefined' && thaiMonths[mm]) return `${thaiMonths[mm]} ${y}`;
    return `${mm}/${y}`;
  };
  const addMonth = (mStr) => {
    const [y, m] = mStr.split('-').map(Number);
    let ny = y, nm = m + 1;
    if (nm > 12) { nm = 1; ny += 1; }
    return `${ny}-${String(nm).padStart(2, '0')}`;
  };

  // ---- local first-purchase-per-subchannel map, built fresh from ALL rawData every render ----
  // (kept local/self-contained rather than reused from window.scFirstPurchase in Migration.js, so this
  // tab never depends on the user having visited Migration first - see the plan's "duplicate, don't share" note)
  const scFirstPurchase = {};
  (rawData || []).forEach(row => {
    if (window.isSaleOrder && !window.isSaleOrder(row)) return;
    const id = window.getCustomerUniqueId ? window.getCustomerUniqueId(row) : getVal(row, ['Customer ID', 'รหัสลูกค้า', 'Phone', 'phone']);
    const dateStr = getVal(row, ['วันที่โอนเงิน', 'วันที่สร้าง', 'OrderDate', 'Date', 'วันที่']);
    if (!id || !dateStr) return;
    const d = parseD(dateStr);
    if (!d) return;
    const key = id + '_' + getSubChannel(row);
    if (!scFirstPurchase[key] || d.val < scFirstPurchase[key]) scFirstPurchase[key] = d.val;
  });

  // ---- 1. monthly aggregation (overall + per sub-channel) from filteredData ----
  const monthAgg = {};  // monthStr -> { revenue, orders, buyers:Set }
  const chAgg = {};     // monthStr -> subChannel -> { revenue, orders, buyers:Set, newG:Set, newSub:Set }

  filteredData.forEach(row => {
    const id = window.getCustomerUniqueId ? window.getCustomerUniqueId(row) : getVal(row, ['Customer ID', 'รหัสลูกค้า', 'Phone', 'phone']);
    const dateStr = getVal(row, ['วันที่โอนเงิน', 'วันที่สร้าง', 'OrderDate', 'Date', 'วันที่']);
    const revenueStr = getVal(row, ['ราคาขาย', 'ราคารวม', 'ยอดรวม', 'ราคาสุทธิ', 'ยอดขาย', 'ราคาสินค้ายังไม่รวมภาษี', 'Net Sales', 'Revenue', 'Amount', 'ยอดโอน']) || '0';
    if (!id || !dateStr) return;
    const d = parseD(dateStr);
    if (!d) return;
    const rev = parseFloat(revenueStr.toString().replace(/,/g, '')) || 0;
    const mStr = d.str;

    if (!monthAgg[mStr]) monthAgg[mStr] = { revenue: 0, orders: 0, buyers: new Set() };
    monthAgg[mStr].revenue += rev;
    monthAgg[mStr].orders += 1;
    monthAgg[mStr].buyers.add(id);

    const sc = getSubChannel(row);
    if (!chAgg[mStr]) chAgg[mStr] = {};
    if (!chAgg[mStr][sc]) chAgg[mStr][sc] = { revenue: 0, orders: 0, buyers: new Set(), newG: new Set(), newSub: new Set() };
    const c = chAgg[mStr][sc];
    c.revenue += rev;
    c.orders += 1;
    c.buyers.add(id);

    // ลูกค้าใหม่ระดับ Global: เดือนแรกที่ซื้อ (ของลูกค้าคนนั้น ในข้อมูลทั้งหมด) ตรงกับเดือนนี้
    if (typeof globalFirstPurchase !== 'undefined' && globalFirstPurchase[id] && globalFirstPurchase[id].monthStr === mStr) {
      c.newG.add(id);
    }
    // Migration (New-to-Sub): เดือนแรกที่ซื้อ "ในช่องทางนี้" ตรงกับเดือนนี้ แต่ไม่ใช่ลูกค้าใหม่ระดับ Global
    const scKey = id + '_' + sc;
    if (scFirstPurchase[scKey] === d.val && !c.newG.has(id)) c.newSub.add(id);
  });

  const monthKeys = Object.keys(monthAgg).sort();
  const revSeries = monthKeys.map(m => monthAgg[m].revenue);

  // ==================================================================================
  // a) สรุปเทรนด์ยอดขาย
  // ==================================================================================
  let trendHtml = '';
  if (monthKeys.length === 0) {
    trendHtml = '<p class="ai-empty-note">ยังไม่มีข้อมูลเพียงพอสำหรับสรุปเทรนด์</p>';
  } else {
    const n = monthKeys.length;
    const lastRev = revSeries[n - 1];
    const prevRev = n >= 2 ? revSeries[n - 2] : null;
    const momPct = (prevRev && prevRev > 0) ? ((lastRev - prevRev) / prevRev) * 100 : null;

    let bestIdx = 0, worstIdx = 0;
    revSeries.forEach((v, i) => { if (v > revSeries[bestIdx]) bestIdx = i; if (v < revSeries[worstIdx]) worstIdx = i; });

    const sentences = [];
    sentences.push(`เดือน <span class="ai-highlight">${monthLabel(monthKeys[n - 1])}</span> ทำยอดขาย ${fmtMoney(lastRev)} บาท`);
    if (momPct !== null) {
      const cls = momPct >= 0 ? 'ai-up' : 'ai-down';
      const arrow = momPct >= 0 ? '▲' : '▼';
      sentences.push(`เปลี่ยนแปลง <span class="${cls}">${arrow} ${fmtPct(momPct)}</span> เทียบกับเดือนก่อนหน้า (${monthLabel(monthKeys[n - 2])}: ${fmtMoney(prevRev)} บาท)`);
    }

    if (n >= 6) {
      const last3 = revSeries.slice(-3);
      const prev3 = revSeries.slice(-6, -3);
      const avgLast3 = last3.reduce((a, b) => a + b, 0) / 3;
      const avgPrev3 = prev3.reduce((a, b) => a + b, 0) / 3;
      const diffPct = avgPrev3 > 0 ? ((avgLast3 - avgPrev3) / avgPrev3) * 100 : null;
      if (diffPct !== null) {
        let dirText;
        if (diffPct > 5) dirText = `<span class="ai-up">เติบโตขึ้น ${fmtPct(diffPct)}</span>`;
        else if (diffPct < -5) dirText = `<span class="ai-down">หดตัวลง ${fmtPct(diffPct)}</span>`;
        else dirText = 'ค่อนข้างทรงตัว';
        sentences.push(`ยอดขายเฉลี่ย 3 เดือนล่าสุดเทียบกับ 3 เดือนก่อนหน้า: ${dirText}`);
      }
    }

    if (n >= 2 && (bestIdx !== n - 1 || worstIdx !== n - 1)) {
      sentences.push(`เดือนที่ทำยอดขายสูงสุดในช่วงนี้คือ <span class="ai-highlight">${monthLabel(monthKeys[bestIdx])}</span> (${fmtMoney(revSeries[bestIdx])} บาท) ส่วนเดือนที่ต่ำสุดคือ ${monthLabel(monthKeys[worstIdx])} (${fmtMoney(revSeries[worstIdx])} บาท)`);
    }

    trendHtml = sentences.map(s => `<p>${s}</p>`).join('');
  }

  // ==================================================================================
  // c) Channel ที่มีปัญหา
  // ==================================================================================
  const channelTotals = {};          // sc -> { revenue, orders, buyers:Set, newG:Set, newSub:Set }
  const channelMonthlyRevenue = {};  // sc -> { monthStr: revenue }

  monthKeys.forEach(mStr => {
    const chForMonth = chAgg[mStr] || {};
    Object.keys(chForMonth).forEach(sc => {
      const c = chForMonth[sc];
      if (!channelTotals[sc]) channelTotals[sc] = { revenue: 0, orders: 0, buyers: new Set(), newG: new Set(), newSub: new Set() };
      const t = channelTotals[sc];
      t.revenue += c.revenue;
      t.orders += c.orders;
      c.buyers.forEach(id => t.buyers.add(id));
      c.newG.forEach(id => t.newG.add(id));
      c.newSub.forEach(id => t.newSub.add(id));

      if (!channelMonthlyRevenue[sc]) channelMonthlyRevenue[sc] = {};
      channelMonthlyRevenue[sc][mStr] = c.revenue;
    });
  });

  // ตัดช่องทางที่มีออเดอร์น้อยเกินไปออกจากการเตือน กันสัญญาณเตือนที่มาจาก noise ของกลุ่มตัวอย่างเล็ก
  const MIN_ORDERS_TO_CONSIDER = 3;
  const latestOverallMonth = monthKeys[monthKeys.length - 1];

  const channelInsights = Object.keys(channelTotals).map(sc => {
    const t = channelTotals[sc];
    const buyers = t.buyers.size;
    const pctNew = buyers > 0 ? (t.newG.size / buyers) * 100 : 0;
    const pctMig = buyers > 0 ? (t.newSub.size / buyers) * 100 : 0;
    // เกณฑ์แบ่งกลุ่มเดียวกับ executive.js/Migration.js (Vanguard/Migration Hub/Retention Hub/Cash Cow)
    let category = 'Retention Hub';
    if (pctNew > 70) category = 'Vanguard';
    else if (pctMig > 70) category = 'Migration Hub';
    else if (pctNew + pctMig < 30) category = 'Cash Cow';

    const activeMonths = monthKeys.filter(m => channelMonthlyRevenue[sc][m] !== undefined);
    let momPct = null;
    if (activeMonths.length >= 2) {
      const latestRev = channelMonthlyRevenue[sc][activeMonths[activeMonths.length - 1]];
      const prevRev = channelMonthlyRevenue[sc][activeMonths[activeMonths.length - 2]];
      momPct = prevRev > 0 ? ((latestRev - prevRev) / prevRev) * 100 : null;
    }
    const hasLatestMonthData = channelMonthlyRevenue[sc][latestOverallMonth] !== undefined;

    return { subChannel: sc, revenue: t.revenue, orders: t.orders, buyers, pctNew, pctMig, category, momPct, hasLatestMonthData };
  });

  const problemChannels = channelInsights
    .filter(c => c.orders >= MIN_ORDERS_TO_CONSIDER)
    .map(c => {
      let severity = null, reason = '';
      if (!c.hasLatestMonthData && monthKeys.length >= 2) {
        severity = 'high';
        reason = `ไม่มียอดขายในเดือนล่าสุด (${monthLabel(latestOverallMonth)}) ทั้งที่เคยมีออเดอร์ในช่วงก่อนหน้า`;
      } else if (c.momPct !== null && c.momPct <= -25) {
        severity = 'high';
        reason = `ยอดขายลดลง ${fmtPct(c.momPct)} เทียบกับเดือนก่อนหน้า`;
      } else if (c.momPct !== null && c.momPct <= -10) {
        severity = 'medium';
        reason = `ยอดขายลดลง ${fmtPct(c.momPct)} เทียบกับเดือนก่อนหน้า`;
      } else if (c.category === 'Cash Cow' && c.momPct !== null && c.momPct < 0) {
        severity = 'medium';
        reason = `เป็นช่องทางหลักที่สร้างรายได้ (Cash Cow) แต่ยอดขายกำลังชะลอตัวลง ${fmtPct(c.momPct)}`;
      }
      return Object.assign({}, c, { severity, reason });
    })
    .filter(c => c.severity)
    .sort((a, b) => (a.severity === 'high' ? 0 : 1) - (b.severity === 'high' ? 0 : 1));

  let channelHtml;
  if (problemChannels.length === 0) {
    channelHtml = '<p class="ai-empty-note">ยังไม่พบช่องทางที่มีสัญญาณผิดปกติตามเกณฑ์ที่ตั้งไว้ในช่วงข้อมูลที่กรองอยู่นี้</p>';
  } else {
    channelHtml = '<div class="ai-channel-list">' + problemChannels.map(c => `
      <div class="ai-channel-item severity-${c.severity} ai-sev-${c.severity}">
        <span class="ai-channel-name">${c.subChannel}</span>
        <span class="ai-channel-badge">${c.severity === 'high' ? 'ควรรีบดู' : 'เฝ้าระวัง'}</span>
        <div class="ai-channel-reason">${c.reason} · ยอดรวมช่วงนี้ ${fmtMoney(c.revenue)} บาท (${c.orders} ออเดอร์) · ${c.category}</div>
      </div>
    `).join('') + '</div>';
  }

  // ==================================================================================
  // d) พยากรณ์เดือนถัดไป (least-squares linear regression บนยอดขายรายเดือน)
  // ==================================================================================
  let forecastHtml;
  if (monthKeys.length < 2) {
    forecastHtml = '<p class="ai-empty-note">ต้องมีข้อมูลอย่างน้อย 2 เดือนจึงจะพยากรณ์ได้</p>';
  } else {
    const pts = revSeries.slice(-6); // ใช้ไม่เกิน 6 เดือนล่าสุด
    const m = pts.length;
    const xs = pts.map((_, i) => i);
    const meanX = xs.reduce((a, b) => a + b, 0) / m;
    const meanY = pts.reduce((a, b) => a + b, 0) / m;
    let num = 0, den = 0;
    for (let i = 0; i < m; i++) { num += (xs[i] - meanX) * (pts[i] - meanY); den += (xs[i] - meanX) * (xs[i] - meanX); }
    const slope = den !== 0 ? num / den : 0;
    const intercept = meanY - slope * meanX;
    const nextX = m;
    const predicted = Math.max(0, slope * nextX + intercept);

    const residuals = pts.map((y, i) => y - (slope * xs[i] + intercept));
    const meanSqErr = residuals.reduce((a, b) => a + b * b, 0) / m;
    const stdev = Math.sqrt(meanSqErr);
    const low = Math.max(0, predicted - stdev);
    const high = predicted + stdev;
    const nextMonthKey = addMonth(latestOverallMonth);

    forecastHtml = `
      <div class="ai-forecast-number">${fmtMoney(predicted)} บาท</div>
      <div class="ai-forecast-range">ช่วงคาดการณ์: ${fmtMoney(low)} - ${fmtMoney(high)} บาท สำหรับเดือน <span class="ai-highlight">${monthLabel(nextMonthKey)}</span></div>
      <div class="ai-caveat">คำนวณจากแนวโน้มเชิงเส้น (linear regression) ของยอดขาย ${m} เดือนล่าสุด เป็นการประมาณจากอดีตเท่านั้น ไม่ใช่การรับประกันผลลัพธ์จริง ควรใช้ประกอบการตัดสินใจร่วมกับปัจจัยอื่น เช่น แคมเปญ/โปรโมชันที่วางแผนไว้</div>
    `;
  }

  // ==================================================================================
  // render
  // ==================================================================================
  container.innerHTML = `
    <div class="ai-section-title">AI Analytics</div>
    <div class="ai-section-sub">วิเคราะห์อัตโนมัติจากข้อมูลที่กรองอยู่ในขณะนี้ - คำนวณจากตัวเลขจริงทั้งหมด ไม่มีการเดา</div>
    <div class="ai-cards">
      <div class="ai-card">
        <div class="ai-card-head"><span class="ai-icon">📈</span><h3>สรุปเทรนด์ยอดขาย</h3></div>
        ${trendHtml}
      </div>
      <div class="ai-card">
        <div class="ai-card-head"><span class="ai-icon">⚠️</span><h3>Channel ที่มีปัญหา</h3></div>
        ${channelHtml}
      </div>
      <div class="ai-card">
        <div class="ai-card-head"><span class="ai-icon">🔮</span><h3>พยากรณ์เดือนถัดไป</h3></div>
        ${forecastHtml}
      </div>
    </div>
  `;
}

window.renderAiAnalytics = renderAiAnalytics;
