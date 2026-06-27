// public/retention.jsฃ
function renderRetention(filteredData, rawData) {
  const container = document.getElementById('view-retention');
  const dataSrc = (filteredData && filteredData.length > 0) ? filteredData : [];

  if (!dataSrc || dataSrc.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:60px 20px; color:#64748b; font-family:'Prompt',sans-serif; background: white; border-radius:16px; border:1px dashed #cbd5e1; margin: 20px;">
        <span style="font-size: 40px; display:block; margin-bottom:15px;">📊</span>
        <b style="font-size:16px; color:#0f172a; display:block; margin-bottom:5px;">ไม่พบข้อมูลสำหรับการวิเคราะห์ประสิทธิภาพ</b>
        <p style="font-size:13px; color:#94a3b8; margin:0 auto; max-width:400px;">กรุณาตรวจสอบว่าได้ทำการอัปโหลดไฟล์ข้อมูลยอดขาย และตรวจสอบระบบคัดกรองวันที่ (Filter) ด้านบนเรียบร้อยแล้ว</p>
      </div>
    `;
    return;
  }

  // --- ฟังก์ชันดักจับชื่อคอลัมน์ภาษาไทย/อังกฤษ ยืดหยุ่นตามไฟล์ดิบ ---
  const getFlexibleValue = (row, keys) => {
    for (let key of keys) {
      if (row[key] !== undefined && row[key] !== null) return row[key];
    }
    for (let rKey in row) {
      const cleanRKey = rKey.replace(/\s+/g, '').toLowerCase();
      for (let key of keys) {
        const cleanKey = key.replace(/\s+/g, '').toLowerCase();
        if (cleanRKey === cleanKey && row[rKey] !== undefined) return row[rKey];
      }
    }
    return '';
  };

  const checkIsSaleOrder = (row) => {
    const status = getFlexibleValue(row, ['สถานะ', 'Status', 'สถานะออเดอร์', 'ประเภท']).toString().toLowerCase();
    if (status.includes('ยกเลิก') || status.includes('cancel') || status.includes('คืนสินค้า')) return false;
    return true;
  };

  const getCustId = (row) => {
    return getFlexibleValue(row, ['รหัสลูกค้า', 'Customer ID', 'เบอร์โทร', 'Phone', 'ชื่อลูกค้า', 'Customer Name', 'ID']);
  };

  // --- 1. PREMIUM ENTREPRENEUR STYLES ---
  if (!document.getElementById('retention-entrepreneur-styles')) {
    const style = document.createElement('style');
    style.id = 'retention-entrepreneur-styles';
    style.innerHTML = `
      .biz-dashboard { font-family: 'Inter', 'Prompt', sans-serif; color: #0f172a; background-color: #f8fafc; padding: 5px; }
      .biz-header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: white; padding: 24px 30px; border-radius: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 10px 25px -5px rgba(15,23,42,0.1); }
      .biz-header-title h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
      .biz-header-title p { margin: 6px 0 0 0; font-size: 13px; color: #94a3b8; }
      .biz-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; margin-bottom: 24px; }
      .biz-kpi-card { background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 22px; display: flex; align-items: center; justify-content: space-between; position: relative; overflow: hidden; }
      .biz-kpi-card::before { content:''; position:absolute; top:0; left:0; width:4px; height:100%; background: #cbd5e1; }
      .biz-kpi-card.card-revenue::before { background: #10b981; }
      .biz-kpi-card.card-orders::before { background: #3b82f6; }
      .biz-kpi-card.card-buyers::before { background: #8b5cf6; }
      .biz-kpi-card.card-share::before { background: #f59e0b; }
      .biz-kpi-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
      .biz-kpi-value { font-size: 26px; font-weight: 700; color: #0f172a; margin: 6px 0 2px 0; }
      .biz-kpi-desc { font-size: 11.5px; color: #94a3b8; font-weight: 500; }
      .biz-kpi-icon { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 18px; }
      
      .report-summary-box { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-bottom: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); }
      .report-summary-title { font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
      .report-summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
      .report-formula-card { padding: 16px; border-radius: 12px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 8px; background: #f8fafc; }
      .report-formula-header { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; }
      .report-formula-det { font-size: 13px; color: #334155; font-weight: 500; margin: 0; padding-left: 18px; }

      .biz-main-grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 24px; margin-bottom: 24px; }
      @media (max-width: 1024px) { .biz-main-grid { grid-template-columns: 1fr; } }
      .biz-card { background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); }
      .biz-card-title { font-size: 16px; font-weight: 700; color: #0f172a; margin: 0 0 18px 0; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
      .biz-card-subtitle { font-size: 12px; font-weight: 400; color: #64748b; margin-top: 2px; }
      
      .biz-chart-container { display: flex; align-items: flex-end; justify-content: flex-start; height: 180px; padding: 20px 15px 10px 15px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; margin-top: 15px; gap: 16px; overflow-x: auto; }
      .biz-chart-bar-wrapper { display: flex; flex-direction: column; align-items: center; min-width: 45px; flex: 1; height: 100%; justify-content: flex-end; }
      .biz-chart-bar { width: 100%; max-width: 32px; border-radius: 6px 6px 0 0; background: #3b82f6; transition: height 0.4s ease; position: relative; cursor: pointer; }
      .biz-chart-bar:hover .biz-chart-tooltip { display: block; }
      .biz-chart-tooltip { display: none; position: absolute; top: -35px; left: 50%; transform: translateX(-50%); background: #0f172a; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; white-space: nowrap; z-index: 10; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
      .biz-chart-label { font-size: 11px; font-weight: 600; color: #64748b; margin-top: 8px; text-align: center; }

      .biz-rank-list { display: flex; flex-direction: column; gap: 14px; }
      .biz-rank-item { display: flex; align-items: center; justify-content: space-between; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9; }
      .biz-rank-badge { width: 26px; height: 26px; border-radius: 50%; background: #e2e8f0; color: #475569; font-size: 11.5px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
      .biz-rank-badge.rank-1 { background: #fef3c7; color: #d97706; }
      .biz-rank-badge.rank-2 { background: #dbeafe; color: #2563eb; }
      .biz-rank-badge.rank-3 { background: #d1fae5; color: #059669; }
      .biz-rank-meta { display: flex; flex-direction: column; flex-grow: 1; margin-left: 12px; min-width: 0; }
      .biz-rank-name { font-size: 13px; font-weight: 600; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .biz-progress-bg { width: 100%; height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden; margin-top: 5px; }
      .biz-progress-bar { height: 100%; border-radius: 3px; }
      .biz-rank-vals { text-align: right; margin-left: 15px; flex-shrink: 0; }
      .biz-val-m { font-size: 13px; font-weight: 700; color: #0f172a; }
      .biz-val-s { font-size: 11px; color: #64748b; }
      
      .biz-table-wrapper { background: white; border: 1px solid #e2e8f0; border-radius: 16px; overflow-x: auto; }
      .biz-table { width: 100%; border-collapse: collapse; text-align: left; }
      .biz-table th, .biz-table td { padding: 14px 18px; border-bottom: 1px solid #f1f5f9; }
      .biz-table th { background: #f8fafc; color: #475569; font-weight: 600; font-size: 12px; text-transform: uppercase; }
      .biz-status-pill { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 20px; font-size: 11.5px; font-weight: 600; }
      .pill-pass { color: #065f46; background: #d1fae5; }
      .pill-fail { color: #991b1b; background: #fee2e2; }
    `;
    document.head.appendChild(style);
  }

  // --- 2. DATE PARSING LOGIC ---
  const parseDateObj = (dateStr) => {
    if (!dateStr) return null;
    const clean = dateStr.toString().trim().split(' ')[0];
    let parts = clean.split('-');
    if (parts.length < 3) parts = clean.split('/');
    if (parts.length >= 3) {
      let p0 = parseInt(parts[0], 10), p1 = parseInt(parts[1], 10), p2 = parseInt(parts[2], 10);
      let y = p0 > 1000 ? p0 : p2, m = p1, d = p0 > 1000 ? p2 : p0;
      if (y < 2000) y += 2000;
      if (y > 2500) y -= 543;
      return { y, m, d, val: y * 10000 + m * 100 + d };
    }
    return null;
  };

  // --- 3. HIGH-ACCURACY PARSER CONFIG ---
  const FORMULA_MAP = {
    plus: ['PLUS', 'พลัส'],
    gold: ['GOLD', 'โกลด์'],
    wiss: ['WISS', 'วิสส์'],
    kides: ['KIDES', 'คิดส์'],
    collagen: ['COLLAGEN', 'คลอลาเจน', 'คอลลาเจน']
  };

  const parseProductItemToFlatList = (productString) => {
    if (!productString) return [];
    const items = productString.split('|');
    const results = [];

    items.forEach(item => {
      if (!item.includes('=')) return;
      let [name, quantityStr] = item.split('=');
      let orderQty = parseInt(quantityStr) || 0;
      let nameUpper = name.toUpperCase().trim();

      let targetFormula = null;
      for (const [formula, keywords] of Object.entries(FORMULA_MAP)) {
        if (keywords.some(k => nameUpper.includes(k))) {
          targetFormula = formula;
          break;
        }
      }
      
      if (!targetFormula) return; 

      let isSachet = nameUpper.includes('ซอง') || nameUpper.includes('แบบซอง') || nameUpper.includes('SACHET');
      let calculatedQty = orderQty;

      const boxMatch = nameUpper.match(/(\d+)\s*กล่อง/);
      if (boxMatch) {
        calculatedQty = parseInt(boxMatch[1]) * orderQty;
      }
      if (nameUpper.includes('1แถม1')) {
        calculatedQty = 2 * orderQty;
      }

      // บังคับการแสดงผลกลุ่มเป็นชื่อสูตรหลัก (Category) เท่านั้น
      let displayKey = targetFormula.toUpperCase();

      results.push({
        formula: targetFormula,
        isSachet: isSachet,
        qty: calculatedQty,
        key: displayKey
      });
    });

    return results;
  };

  // --- 4. RETENTION CORE DATA FILTERING ---
  const localFirstPurchaseMap = {};
  rawData.forEach(row => {
    if (!checkIsSaleOrder(row)) return;
    const id = getCustId(row);
    const dateStr = getFlexibleValue(row, ['วันที่สร้าง', 'วันที่โอนเงิน', 'วันที่', 'Date']);
    if (!id || !dateStr) return;
    const d = parseDateObj(dateStr);
    if (!d) return;
    if (!localFirstPurchaseMap[id] || d.val < localFirstPurchaseMap[id].val) {
      localFirstPurchaseMap[id] = d;
    }
  });

  const validSaleOrders = dataSrc.filter(row => {
    if (!checkIsSaleOrder(row)) return false;
    const revStr = getFlexibleValue(row, ['ยอดขาย', 'ยอดโอน', 'Revenue', 'จำนวนเงิน', 'ยอดเงิน']) || '0';
    const rev = parseFloat(revStr.toString().replace(/,/g, ''));
    return !isNaN(rev) && rev > 0;
  });

  const repeatOrders = validSaleOrders.filter(row => {
    const id = getCustId(row);
    const dateStr = getFlexibleValue(row, ['วันที่สร้าง', 'วันที่โอนเงิน', 'วันที่', 'Date']);
    if (!id || !dateStr) return false;
    const d = parseDateObj(dateStr);
    return d && localFirstPurchaseMap[id] && localFirstPurchaseMap[id].val < d.val;
  });

  const totalActiveBuyersInPeriod = new Set();
  validSaleOrders.forEach(row => {
    const id = getCustId(row);
    if (id) totalActiveBuyersInPeriod.add(id);
  });

  let totalRepeatRevenue = 0;
  const periodRepeatBuyers = new Set();
  
  repeatOrders.forEach(row => {
    const id = getCustId(row);
    if (id) periodRepeatBuyers.add(id);
    const revStr = getFlexibleValue(row, ['ยอดขาย', 'ยอดโอน', 'Revenue', 'จำนวนเงิน', 'ยอดเงิน']) || '0';
    const rev = parseFloat(revStr.toString().replace(/,/g, ''));
    if (!isNaN(rev)) totalRepeatRevenue += rev;
  });

  const totalRepeatOrdersCount = repeatOrders.length;
  const repeatBuyerSharePct = totalActiveBuyersInPeriod.size === 0 ? 0 : (periodRepeatBuyers.size / totalActiveBuyersInPeriod.size) * 100;

  // --- 5. CALCULATE REPORT SUMMARY & MONTHLY BARS ---
  const finalReportSummary = {
    plus: { boxes: 0, sachets: 0 },
    gold: { boxes: 0, sachets: 0 },
    wiss: { boxes: 0, sachets: 0 },
    kides: { boxes: 0, sachets: 0 },
    collagen: { boxes: 0, sachets: 0 }
  };

  const productSummaryMap = {};
  const dynamicMonthlyMap = {};
  const monthsArr = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  repeatOrders.forEach(row => {
    const revStr = getFlexibleValue(row, ['ยอดขาย', 'ยอดโอน', 'Revenue', 'จำนวนเงิน', 'ยอดเงิน']) || '0';
    const orderRev = parseFloat(revStr.toString().replace(/,/g, '')) || 0;
    
    const dateStr = getFlexibleValue(row, ['วันที่สร้าง', 'วันที่โอนเงิน', 'วันที่', 'Date']);
    const d = parseDateObj(dateStr);
    let mLabel = "Unknown";
    if (d && d.m >= 1 && d.m <= 12) {
      mLabel = monthsArr[d.m - 1];
    }
    
    const salesData = getFlexibleValue(row, ['รายการขาย', 'ชื่อสินค้า', 'Product', 'Product Set', 'สินค้า']) || '';
    const parsedItems = parseProductItemToFlatList(salesData);
    const totalItemsInOrder = parsedItems.reduce((acc, p) => acc + p.qty, 0) || 1;

    parsedItems.forEach(p => {
      if (finalReportSummary[p.formula]) {
        if (p.isSachet) {
          finalReportSummary[p.formula].sachets += p.qty;
        } else {
          finalReportSummary[p.formula].boxes += p.qty;
        }
      }

      const distributedRev = orderRev * (p.qty / totalItemsInOrder);
      if (!productSummaryMap[p.key]) {
        productSummaryMap[p.key] = { key: p.key, count: 0, revenue: 0, formula: p.formula };
      }
      productSummaryMap[p.key].count += p.qty;
      productSummaryMap[p.key].revenue += distributedRev;

      if (mLabel !== "Unknown") {
        if (!dynamicMonthlyMap[mLabel]) dynamicMonthlyMap[mLabel] = 0;
        dynamicMonthlyMap[mLabel] += p.qty;
      }
    });
  });

  const sortedProducts = Object.values(productSummaryMap).sort((a, b) => b.count - a.count);
  const topProductMaxCount = sortedProducts.length > 0 ? sortedProducts[0].count : 1;

  const sortedChartMonths = Object.keys(dynamicMonthlyMap).sort((a, b) => monthsArr.indexOf(a) - monthsArr.indexOf(b));
  const maxMonthlyQtyVal = Math.max(...Object.values(dynamicMonthlyMap)) || 1;

  // --- 6. CHANNELS KPI PROCESSING ---
  const bizChannels = ['Facebook', 'Line', 'Call', 'CRM', 'Other'];
  const channelDataStore = {};
  bizChannels.forEach(ch => { channelDataStore[ch] = { name: ch, count: 0, revenue: 0 }; });

  repeatOrders.forEach(row => {
    let rawCh = getFlexibleValue(row, ['ช่องทาง', 'Channel', 'ช่องทางการขาย', 'Platform']) || 'Other';
    let normCh = 'Other';
    const low = rawCh.toString().toLowerCase();
    if (low.includes('facebook') || low === 'fb' || low.includes('เพจ')) normCh = 'Facebook';
    else if (low.includes('line') || low.includes('ไลน์')) normCh = 'Line';
    else if (low.includes('crm') || low.includes('ระบบ')) normCh = 'CRM';
    else if (low.includes('call') || low.includes('phone') || low.includes('โทร')) normCh = 'Call';

    const revStr = getFlexibleValue(row, ['ยอดขาย', 'ยอดโอน', 'Revenue', 'จำนวนเงิน', 'ยอดเงิน']) || '0';
    const rev = parseFloat(revStr.toString().replace(/,/g, ''));
    
    channelDataStore[normCh].count++;
    if (!isNaN(rev)) channelDataStore[normCh].revenue += rev;
  });

  const sortedChannels = Object.values(channelDataStore).sort((a,b) => b.revenue - a.revenue);
  const maxChannelRevVal = sortedChannels.length > 0 ? sortedChannels[0].revenue : 1;

  const bizTargetPlans = {
    'Facebook': { targetOrders: Math.max(Math.round(totalRepeatOrdersCount * 0.15), 5), targetRev: Math.round(totalRepeatRevenue * 0.15) },
    'Line': { targetOrders: Math.max(Math.round(totalRepeatOrdersCount * 0.20), 8), targetRev: Math.round(totalRepeatRevenue * 0.20) },
    'Call': { targetOrders: Math.max(Math.round(totalRepeatOrdersCount * 0.08), 3), targetRev: Math.round(totalRepeatRevenue * 0.08) },
    'CRM': { targetOrders: Math.max(Math.round(totalRepeatOrdersCount * 0.55), 15), targetRev: Math.round(totalRepeatRevenue * 0.55) },
    'Other': { targetOrders: Math.max(Math.round(totalRepeatOrdersCount * 0.02), 1), targetRev: Math.round(totalRepeatRevenue * 0.02) }
  };

  const getChannelColor = (ch) => ({ 'Facebook': '#38bdf8', 'Line': '#06c755', 'CRM': '#ea580c', 'Call': '#64748b', 'Other': '#94a3b8' }[ch] || '#94a3b8');
  const getFormulaColor = (f) => ({ 'plus': '#10b981', 'gold': '#eab308', 'wiss': '#3b82f6', 'kides': '#f97316', 'collagen': '#ef4444' }[f] || '#64748b');

  // --- 7. BUILD DASHBOARD TEMPLATE ---
  let html = `
    <div class="biz-dashboard">
      <div class="biz-header">
        <div class="biz-header-title">
          แดชบอร์ดกลยุทธ์การซื้อซ้ำและรักษารากฐานลูกค้า (Strategic Customer Retention Dashboard)
        </div>
      </div>

      <div class="biz-kpi-grid">
        <div class="biz-kpi-card card-revenue">
          <div><div class="biz-kpi-label">รายได้จากการซื้อซ้ำ</div><div class="biz-kpi-value">฿${Math.round(totalRepeatRevenue).toLocaleString()}</div><div class="biz-kpi-desc">กระแสเงินสดหลักจากฐานลูกค้าเดิม</div></div>
          <div class="biz-kpi-icon" style="color:#10b981; background:#d1fae5;">💵</div>
        </div>
        <div class="biz-kpi-card card-orders">
          <div><div class="biz-kpi-label">จำนวนออเดอร์ซ้ำ</div><div class="biz-kpi-value">${totalRepeatOrdersCount.toLocaleString()} ครั้ง</div><div class="biz-kpi-desc">ปริมาณความถี่ในการซื้อซ้ำ</div></div>
          <div class="biz-kpi-icon" style="color:#3b82f6; background:#dbeafe;">🛒</div>
        </div>
        <div class="biz-kpi-card card-buyers">
          <div><div class="biz-kpi-label">จำนวนลูกค้าที่ซื้อซ้ำ</div><div class="biz-kpi-value">${periodRepeatBuyers.size.toLocaleString()} ราย</div><div class="biz-kpi-desc">จำนวนลูกค้า Loyalty</div></div>
          <div class="biz-kpi-icon" style="color:#8b5cf6; background:#f5f3ff;">👤</div>
        </div>
        <div class="biz-kpi-card card-share">
          <div><div class="biz-kpi-label">สัดส่วนลูกค้าซื้อซ้ำ</div><div class="biz-kpi-value">${repeatBuyerSharePct.toFixed(1)}%</div><div class="biz-kpi-desc">สัดส่วนเทียบกับลูกค้าทั้งหมด</div></div>
          <div class="biz-kpi-icon" style="color:#f59e0b; background:#fef3c7;">📊</div>
        </div>
      </div>

      <!-- 📋 SECTION 1: สรุปผลรายงานยอดขายเวอร์ชันความแม่นยำสูง (กล่อง VS ซองแยก) -->
      <div class="report-summary-box">
        <div class="report-summary-title">
          <span>📊 ผลรายงานสรุปปริมาณผลิตภัณฑ์จากการซื้อซ้ำในรอบเวลาที่เลือก</span>
        </div>
        <div class="report-summary-grid">
          <div class="report-formula-card" style="border-left: 4px solid #10b981;">
            <div class="report-formula-header" style="color:#10b981;">🟢 สูตร Plus</div>
            <p class="report-formula-det">📦 กล่อง: <b>${finalReportSummary.plus.boxes.toLocaleString()}</b> กล่อง</p>
            <p class="report-formula-det">✉️ ซองแยก: <b>${finalReportSummary.plus.sachets.toLocaleString()}</b> ซอง</p>
          </div>
          <div class="report-formula-card" style="border-left: 4px solid #eab308;">
            <div class="report-formula-header" style="color:#eab308;">🟡 สูตร Gold</div>
            <p class="report-formula-det">📦 กล่อง: <b>${finalReportSummary.gold.boxes.toLocaleString()}</b> กล่อง</p>
            <p class="report-formula-det">✉️ ซองแยก: <b>${finalReportSummary.gold.sachets.toLocaleString()}</b> ซอง</p>
          </div>
          <div class="report-formula-card" style="border-left: 4px solid #3b82f6;">
            <div class="report-formula-header" style="color:#3b82f6;">🔵 สูตร Wiss</div>
            <p class="report-formula-det">📦 กล่อง: <b>${finalReportSummary.wiss.boxes.toLocaleString()}</b> กล่อง</p>
            <p class="report-formula-det">✉️ ซองแยก: <b>${finalReportSummary.wiss.sachets.toLocaleString()}</b> ซอง</p>
          </div>
          <div class="report-formula-card" style="border-left: 4px solid #f97316;">
            <div class="report-formula-header" style="color:#f97316;">🟠 สูตร Kides</div>
            <p class="report-formula-det">📦 กล่อง: <b>${finalReportSummary.kides.boxes.toLocaleString()}</b> กล่อง</p>
            <p class="report-formula-det">✉️ ซองแยก: <b>${finalReportSummary.kides.sachets.toLocaleString()}</b> ซอง</p>
          </div>
          <div class="report-formula-card" style="border-left: 4px solid #ef4444;">
            <div class="report-formula-header" style="color:#ef4444;">🔴 สูตร Collagen</div>
            <p class="report-formula-det">📦 กล่อง: <b>${finalReportSummary.collagen.boxes.toLocaleString()}</b> กล่อง</p>
            <p class="report-formula-det">✉️ ซองแยก: <b>${finalReportSummary.collagen.sachets.toLocaleString()}</b> ซอง</p>
          </div>
        </div>
      </div>

      <!-- 📈 SECTION 2: ตารางตรวจสอบผลสัมฤทธิ์ทางการตลาดเทียบเป้าหมาย (KPI Matrix) -->
      <div class="biz-card" style="margin-bottom:24px;">
        <div class="biz-card-title">ตารางตรวจสอบผลสัมฤทธิ์ทางการตลาดเทียบเป้าหมาย (Retention KPI Matrix)</div>
        <div class="biz-table-wrapper">
          <table class="biz-table">
            <thead>
              <tr>
                <th>ช่องทางปิดการขาย</th><th>รายได้จริง (Actual)</th><th>เป้ารายได้ (Plan)</th><th>จำนวนออเดอร์</th><th>เป้าออเดอร์</th><th>ส่วนต่างออเดอร์</th><th>KPI %</th><th>ประเมินสถานะ</th>
              </tr>
            </thead>
            <tbody>
              ${bizChannels.map(ch => {
                const act = channelDataStore[ch];
                const planBase = bizTargetPlans[ch];
                const diffOrders = act.count - planBase.targetOrders;
                const achRate = planBase.targetRev === 0 ? 0 : (act.revenue / planBase.targetRev) * 100;
                return `
                  <tr>
                    <td style="font-weight:600;">${ch}</td>
                    <td style="font-weight:700; color:#059669;">฿${Math.round(act.revenue).toLocaleString()}</td>
                    <td>฿${planBase.targetRev.toLocaleString()}</td>
                    <td>${act.count} ครั้ง</td>
                    <td>${planBase.targetOrders} ครั้ง</td>
                    <td style="font-weight:600; color:${diffOrders >= 0 ? '#10b981' : '#ef4444'}">${diffOrders >= 0 ? '+' + diffOrders : diffOrders}</td>
                    <td style="font-weight:700;">${achRate.toFixed(1)}%</td>
                    <td><span class="biz-status-pill ${achRate >= 100 ? 'pill-pass' : 'pill-fail'}">${achRate >= 100 ? '▲ ทะลุเป้า' : '▼ ต่ำกว่าเป้า'}</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="biz-main-grid">
        <div>
          <!-- 📊 SECTION 3: กราฟแท่งแสดงปริมาณสินค้าซื้อซ้ำเปรียบเทียบในแต่ละเดือน -->
          <div class="biz-card" style="margin-bottom:24px;">
            <div class="biz-card-title">
              <div>กราฟแท่งเปรียบเทียบปริมาณสินค้าซื้อซ้ำในแต่ละเดือน (Monthly Product Unit Vol.)
                <div class="biz-card-subtitle">แท่งกราฟจะปรากฏและเปรียบเทียบตามช่วงเดือนที่ถูกกรองมาจาก Filter หลักด้านบนอัตโนมัติ</div>
              </div>
            </div>
            <div class="biz-chart-container">
              ${sortedChartMonths.length === 0 
                ? '<div style="color:#94a3b8; text-align:center; width:100%; padding:40px 0;">โปรดระบุช่วงวันที่ที่กว้างขึ้นที่ Filter ด้านบน เพื่อเปรียบเทียบแนวโน้มรายเดือน</div>' 
                : sortedChartMonths.map(mKey => {
                    const qty = dynamicMonthlyMap[mKey];
                    const heightPct = maxMonthlyQtyVal > 0 ? (qty / maxMonthlyQtyVal) * 100 : 0;
                    return `
                      <div class="biz-chart-bar-wrapper">
                        <div class="biz-chart-bar" style="height:${Math.max(heightPct, 8)}%; background-color:#3b82f6;">
                          <div class="biz-chart-tooltip">${mKey}: ${qty.toLocaleString()} ชิ้น</div>
                        </div>
                        <div class="biz-chart-label" style="color:#0f172a; font-weight:700;">${mKey}</div>
                      </div>
                    `;
                  }).join('')
              }
            </div>
          </div>

          <div class="biz-card">
            <div class="biz-card-title"><div>อันดับยอดจำหน่ายสูตรสินค้าที่ลูกค้าเก่าเลือกซื้อสูงสุด</div></div>
            <div class="biz-rank-list">
              ${sortedProducts.length === 0 ? '<div style="color:#94a3b8; text-align:center; padding:15px;">ไม่พบประวัติการซื้อสินค้าซ้ำในช่วงเวลานี้</div>' : sortedProducts.map((p, idx) => {
                const pct = (p.count / topProductMaxCount) * 100;
                return `
                  <div class="biz-rank-item">
                    <div style="display:flex; align-items:center; flex-grow:1; min-width:0;">
                      <div class="biz-rank-badge ${idx<3?'rank-'+(idx+1):''}">${idx+1}</div>
                      <div class="biz-rank-meta"><span class="biz-rank-name">สูตร ${p.key}</span><div class="biz-progress-bg"><div class="biz-progress-bar" style="width:${pct}%; background-color:${getFormulaColor(p.formula)};"></div></div></div>
                    </div>
                    <div class="biz-rank-vals"><span class="biz-val-m">${p.count.toLocaleString()} ชิ้น</span><span class="biz-val-s">฿${Math.round(p.revenue).toLocaleString()}</span></div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>

        <div class="biz-card">
          <div class="biz-card-title"><div>ประสิทธิภาพช่องทางปิดการขายลูกค้าเก่า (เรียงตามรายได้จริง)</div></div>
          <div class="biz-rank-list">
            ${sortedChannels.map((c, idx) => {
              const pct = (c.revenue / maxChannelRevVal) * 100;
              return `
                <div class="biz-rank-item">
                  <div style="display:flex; align-items:center; flex-grow:1; min-width:0;">
                    <div class="biz-rank-badge ${idx<3?'rank-'+(idx+1):''}">${idx+1}</div>
                    <div class="biz-rank-meta"><span class="biz-rank-name">${c.name}</span><div class="biz-progress-bg"><div class="biz-progress-bar" style="width:${pct}%; background-color:${getChannelColor(c.name)};"></div></div></div>
                  </div>
                  <div class="biz-rank-vals"><span class="biz-val-m">฿${Math.round(c.revenue).toLocaleString()}</span><span class="biz-val-s">${c.count} ออเดอร์</span></div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
}
