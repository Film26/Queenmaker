// public/retention.js
function renderRetention(filteredData, rawData) {
  const container = document.getElementById('view-retention');
  
  // ป้องกันกรณีตัวแปรหลักไม่มีค่าเข้ามา
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

  // --- ฟังก์ชันอัจฉริยะสำหรับดักจับชื่อคอลัมน์ภาษาไทย/อังกฤษ (Fallback Mapping) ---
  const getFlexibleValue = (row, keys) => {
    for (let key of keys) {
      if (row[key] !== undefined && row[key] !== null) return row[key];
    }
    // ดักจับกรณีชื่อคอลัมน์เว้นวรรคไม่เท่ากัน หรือพิมพ์เล็ก-ใหญ่ต่างกัน
    for (let rKey in row) {
      const cleanRKey = rKey.replace(/\s+/g, '').toLowerCase();
      for (let key of keys) {
        const cleanKey = key.replace(/\s+/g, '').toLowerCase();
        if (cleanRKey === cleanKey && row[rKey] !== undefined) return row[rKey];
      }
    }
    return '';
  };

  // ตรวจสอบว่าเป็นออเดอร์ขายจริงหรือไม่
  const checkIsSaleOrder = (row) => {
    const status = getFlexibleValue(row, ['สถานะ', 'Status', 'สถานะออเดอร์', 'ประเภท']).toString().toLowerCase();
    if (status.includes('ยกเลิก') || status.includes('cancel') || status.includes('คืนสินค้า')) return false;
    return true;
  };

  // ดึงรหัสลูกค้าที่ไม่ซ้ำกัน
  const getCustId = (row) => {
    return getFlexibleValue(row, ['รหัสลูกค้า', 'Customer ID', 'เบอร์โทร', 'Phone', 'ชื่อลูกค้า', 'Customer Name', 'ID']);
  };

  // --- INITIALIZE GLOBAL STATES ---
  window.retentionActiveToggle = window.retentionActiveToggle || 'category';
  window.retentionSelectedMonth = window.retentionSelectedMonth || 'YTD';

  // --- 1. PREMIUM ENTREPRENEUR STYLES ---
  if (!document.getElementById('retention-entrepreneur-styles')) {
    const style = document.createElement('style');
    style.id = 'retention-entrepreneur-styles';
    style.innerHTML = `
      .biz-dashboard { font-family: 'Inter', 'Prompt', sans-serif; color: #0f172a; background-color: #f8fafc; padding: 5px; }
      .biz-header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: white; padding: 24px 30px; border-radius: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 10px 25px -5px rgba(15,23,42,0.1); }
      .biz-header-title h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
      .biz-header-title p { margin: 6px 0 0 0; font-size: 13px; color: #94a3b8; }
      .biz-control-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; gap: 15px; flex-wrap: wrap; }
      .biz-toggle-group { display: flex; background: #e2e8f0; padding: 4px; border-radius: 10px; }
      .biz-toggle-btn { border: none; background: transparent; padding: 8px 18px; font-size: 13px; font-weight: 600; color: #475569; border-radius: 8px; cursor: pointer; transition: all 0.2s ease; }
      .biz-toggle-btn.active { background: white; color: #0f172a; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.08); }
      .biz-dropdown { padding: 8px 16px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 13px; font-weight: 600; color: #334155; background: white; cursor: pointer; }
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
      .biz-main-grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 24px; margin-bottom: 24px; }
      @media (max-width: 1024px) { .biz-main-grid { grid-template-columns: 1fr; } }
      .biz-card { background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); }
      .biz-card-title { font-size: 16px; font-weight: 700; color: #0f172a; margin: 0 0 18px 0; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
      .biz-card-subtitle { font-size: 12px; font-weight: 400; color: #64748b; margin-top: 2px; }
      .biz-monthly-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 12px; }
      .biz-monthly-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 4px; }
      .biz-month-lbl { font-size: 11px; font-weight: 800; text-transform: uppercase; }
      .biz-month-prod { font-size: 13px; font-weight: 700; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .biz-month-qty { font-size: 11.5px; color: #475569; font-weight: 500; }
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
      .biz-table-wrapper { background: white; border: 1px solid #e2e8f0; border-radius: 16px; overflow-x: auto; margin-top: 24px; }
      .biz-table { width: 100%; border-collapse: collapse; text-align: left; }
      .biz-table th, .biz-table td { padding: 14px 18px; border-bottom: 1px solid #f1f5f9; }
      .biz-table th { background: #f8fafc; color: #475569; font-weight: 600; font-size: 12px; text-transform: uppercase; }
      .biz-status-pill { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 20px; font-size: 11.5px; font-weight: 600; }
      .pill-pass { color: #065f46; background: #d1fae5; }
      .pill-fail { color: #991b1b; background: #fee2e2; }
    `;
    document.head.appendChild(style);
  }

  // --- 2. DATE PARSING LOGIC WITH FALLBACK ---
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

  const parseOrderProducts = (row) => {
    const rawProd = getFlexibleValue(row, ['ชื่อสินค้า', 'Product', 'รายการขาย', 'Product Set', 'สินค้า']) || 'Other';
    if (!rawProd || rawProd === 'Other') return [{ name: 'Other', category: 'Other', qty: 1 }];
    
    const results = [];
    rawProd.split('|').forEach(part => {
      const sub = part.split('=');
      const name = sub[0].trim();
      let qty = 1;
      if (sub.length > 1) {
        const q = parseInt(sub[1].trim());
        if (!isNaN(q)) qty = q;
      }
      if (name) {
        let category = 'Other';
        const lower = name.toLowerCase();
        if (lower.includes('plus')) category = 'Plus';
        else if (lower.includes('gold')) category = 'Gold';
        else if (lower.includes('wiss')) category = 'Wiss';
        else if (lower.includes('kides') || lower.includes('kide')) category = 'Kides';
        else if (lower.includes('collagen')) category = 'Collagen';
        results.push({ name, category, qty });
      }
    });
    return results.length > 0 ? results : [{ name: 'Other', category: 'Other', qty: 1 }];
  };

  // --- 3. RETENTION DATA FILTERING ---
  // สร้างตารางซื้อครั้งแรก (First Purchase) อิงจาก rawData ทั้งระบบเพื่อความแม่นยำสูงสุด
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

  // คัดกรองออเดอร์ขายจริงที่มีเงินเข้าจริง
  const validSaleOrders = dataSrc.filter(row => {
    if (!checkIsSaleOrder(row)) return false;
    const revStr = getFlexibleValue(row, ['ยอดขาย', 'ยอดโอน', 'Revenue', 'จำนวนเงิน', 'ยอดเงิน']) || '0';
    const rev = parseFloat(revStr.toString().replace(/,/g, ''));
    return !isNaN(rev) && rev > 0;
  });

  // คัดกรองข้อมูลออเดอร์ของ "ลูกค้าเก่าที่กลับมาซื้อซ้ำ"
  const repeatOrders = validSaleOrders.filter(row => {
    const id = getCustId(row);
    const dateStr = getFlexibleValue(row, ['วันที่สร้าง', 'วันที่โอนเงิน', 'วันที่', 'Date']);
    if (!id || !dateStr) return false;
    const d = parseDateObj(dateStr);
    return d && localFirstPurchaseMap[id] && localFirstPurchaseMap[id].val < d.val;
  });

  // --- 4. DYNAMIC ACTIONS ---
  window.bizUpdateMonth = function(m) { window.retentionSelectedMonth = m; renderRetention(filteredData, rawData); };
  window.bizUpdateToggle = function(t) { window.retentionActiveToggle = t; renderRetention(filteredData, rawData); };

  const selMonth = window.retentionSelectedMonth;
  const activeToggle = window.retentionActiveToggle;

  // กรองออเดอร์ตามช่วงเวลาที่ผู้บริหารเลือก
  const currentPeriodRepeat = repeatOrders.filter(row => {
    if (selMonth === 'YTD') return true;
    const dateStr = getFlexibleValue(row, ['วันที่สร้าง', 'วันที่โอนเงิน', 'วันที่', 'Date']);
    const d = parseDateObj(dateStr);
    if (!d) return false;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[d.m - 1] === selMonth;
  });

  const totalActiveBuyersInPeriod = new Set();
  validSaleOrders.forEach(row => {
    const id = getCustId(row);
    const dateStr = getFlexibleValue(row, ['วันที่สร้าง', 'วันที่โอนเงิน', 'วันที่', 'Date']);
    const d = parseDateObj(dateStr);
    if (!id || !d) return;
    if (selMonth !== 'YTD') {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      if (months[d.m - 1] !== selMonth) return;
    }
    totalActiveBuyersInPeriod.add(id);
  });

  let totalRepeatRevenue = 0;
  const periodRepeatBuyers = new Set();
  
  currentPeriodRepeat.forEach(row => {
    const id = getCustId(row);
    if (id) periodRepeatBuyers.add(id);
    const revStr = getFlexibleValue(row, ['ยอดขาย', 'ยอดโอน', 'Revenue', 'จำนวนเงิน', 'ยอดเงิน']) || '0';
    const rev = parseFloat(revStr.toString().replace(/,/g, ''));
    if (!isNaN(rev)) totalRepeatRevenue += rev;
  });

  const totalRepeatOrdersCount = currentPeriodRepeat.length;
  const repeatBuyerSharePct = totalActiveBuyersInPeriod.size === 0 ? 0 : (periodRepeatBuyers.size / totalActiveBuyersInPeriod.size) * 100;

  // --- 5. PRODUCTS PROCESSING ---
  const productSummaryMap = {};
  const crossMonthProductTracker = {};
  for (let m = 1; m <= 12; m++) crossMonthProductTracker[m] = {};

  currentPeriodRepeat.forEach(row => {
    const revStr = getFlexibleValue(row, ['ยอดขาย', 'ยอดโอน', 'Revenue', 'จำนวนเงิน', 'ยอดเงิน']) || '0';
    const orderRev = parseFloat(revStr.toString().replace(/,/g, '')) || 0;
    
    const prods = parseOrderProducts(row);
    const sumQty = prods.reduce((acc, p) => acc + p.qty, 0) || 1;

    prods.forEach(p => {
      const distributedRev = orderRev * (p.qty / sumQty);
      const key = activeToggle === 'category' ? p.category : p.name;

      if (!productSummaryMap[key]) {
        productSummaryMap[key] = { key, count: 0, revenue: 0, category: p.category };
      }
      productSummaryMap[key].count += p.qty;
      productSummaryMap[key].revenue += distributedRev;
    });
  });

  repeatOrders.forEach(row => {
    const d = parseDateObj(getFlexibleValue(row, ['วันที่สร้าง', 'วันที่โอนเงิน', 'วันที่', 'Date']));
    if (!d || d.m < 1 || d.m > 12) return;
    const revStr = getFlexibleValue(row, ['ยอดขาย', 'ยอดโอน', 'Revenue', 'จำนวนเงิน', 'ยอดเงิน']) || '0';
    const orderRev = parseFloat(revStr.toString().replace(/,/g, '')) || 0;
    
    const prods = parseOrderProducts(row);
    const sumQty = prods.reduce((acc, p) => acc + p.qty, 0) || 1;

    prods.forEach(p => {
      const distributedRev = orderRev * (p.qty / sumQty);
      const key = activeToggle === 'category' ? p.category : p.name;
      if (!crossMonthProductTracker[d.m][key]) {
        crossMonthProductTracker[d.m][key] = { count: 0, revenue: 0 };
      }
      crossMonthProductTracker[d.m][key].count += p.qty;
      crossMonthProductTracker[d.m][key].revenue += distributedRev;
    });
  });

  const sortedProducts = Object.values(productSummaryMap).sort((a, b) => b.count - a.count);
  const topProductMaxCount = sortedProducts.length > 0 ? sortedProducts[0].count : 1;

  const monthNamesTh = { 1:'ม.ค.', 2:'ก.พ.', 3:'มี.ค.', 4:'เม.ย.', 5:'พ.ค.', 6:'มิ.ย.', 7:'ก.ค.', 8:'ส.ค.', 9:'ก.ย.', 10:'ต.ค.', 11:'พ.ย.', 12:'ธ.ค.' };
  const topProductsPerMonthList = [];
  for (let m = 1; m <= 12; m++) {
    const list = Object.keys(crossMonthProductTracker[m]).map(k => ({
      name: k, count: crossMonthProductTracker[m][k].count, category: activeToggle === 'category' ? k : (productSummaryMap[k] ? productSummaryMap[k].category : 'Other')
    })).sort((a,b) => b.count - a.count);
    topProductsPerMonthList.push({ monthNum: m, nameTh: monthNamesTh[m], topItem: list[0] || null });
  }

  // --- 6. CHANNELS PERFORMANCE KPI ---
  const bizChannels = ['Facebook', 'Line', 'Call', 'CRM', 'Other'];
  const channelDataStore = {};
  bizChannels.forEach(ch => { channelDataStore[ch] = { name: ch, count: 0, revenue: 0 }; });

  currentPeriodRepeat.forEach(row => {
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
    'Facebook': { targetOrders: 160, targetRev: 130000 },
    'Line': { targetOrders: 220, targetRev: 190000 },
    'Call': { targetOrders: 90, targetRev: 85000 },
    'CRM': { targetOrders: 400, targetRev: 500000 },
    'Other': { targetOrders: 10, targetRev: 10000 }
  };

  const getChannelColor = (ch) => ({ 'Facebook': '#38bdf8', 'Line': '#06c755', 'CRM': '#ea580c', 'Call': '#64748b', 'Other': '#94a3b8' }[ch] || '#94a3b8');
  const getProductColor = (cat) => ({ 'Plus': '#ea580c', 'Gold': '#d97706', 'Wiss': '#2563eb', 'Collagen': '#ec4899', 'Kides': '#059669', 'Other': '#64748b' }[cat] || '#ea580c');

  // --- 7. RENDER USER INTERFACE ---
  let html = `
    <div class="biz-dashboard">
      <div class="biz-header">
        <div class="biz-header-title">
          <h1>แดชบอร์ดกลยุทธ์การซื้อซ้ำและรักษารากฐานลูกค้า (Strategic Customer Retention & KPI Dashboard)</h1>
          <p>เครื่องมือวิเคราะห์พฤทีพพรรณลูกค้าเก่าเพื่อการตัดสินใจเชิงธุรกิจของผู้นำองค์กร</p>
        </div>
      </div>

      <div class="biz-control-bar">
        <div class="biz-toggle-group">
          <button class="biz-toggle-btn ${activeToggle === 'category' ? 'active' : ''}" onclick="window.bizUpdateToggle('category')">มุมมองกลุ่มแบรนด์สินค้า</button>
          <button class="biz-toggle-btn ${activeToggle === 'item' ? 'active' : ''}" onclick="window.bizUpdateToggle('item')">มุมมองรายแพ็กเกจย่อย</button>
        </div>
        <div>
          <span style="font-size:12.5px; font-weight:600; color:#475569; margin-right:8px;">เลือกรอบระยะเวลาประเมินผล:</span>
          <select class="biz-dropdown" onchange="window.bizUpdateMonth(this.value)">
            <option value="YTD" ${selMonth === 'YTD' ? 'selected' : ''}>ภาพรวมสะสมทั้งปี (YTD)</option>
            <option value="Jan" ${selMonth === 'Jan' ? 'selected' : ''}>มกราคม (Jan)</option>
            <option value="Feb" ${selMonth === 'Feb' ? 'selected' : ''}>กุมภาพันธ์ (Feb)</option>
            <option value="Mar" ${selMonth === 'Mar' ? 'selected' : ''}>มีนาคม (Mar)</option>
            <option value="Apr" ${selMonth === 'Apr' ? 'selected' : ''}>เมษายน (Apr)</option>
            <option value="May" ${selMonth === 'May' ? 'selected' : ''}>พฤษภาคม (May)</option>
            <option value="Jun" ${selMonth === 'Jun' ? 'selected' : ''}>มิถุนายน (Jun)</option>
          </select>
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

      <div class="biz-main-grid">
        <div>
          <div class="biz-card" style="margin-bottom:24px;">
            <div class="biz-card-title"><div>เทรนด์สินค้าซื้อซ้ำยอดนิยมรายเดือน <div class="biz-card-subtitle">แบรนด์สินค้าที่ดึงดูดลูกค้าเก่ากลับมาซื้อได้ดีที่สุด</div></div></div>
            <div class="biz-monthly-grid">
              ${topProductsPerMonthList.map(m => {
                if (m.topItem) {
                  return `<div class="biz-monthly-box"><span class="biz-month-lbl" style="color:${getProductColor(m.topItem.category)};">${m.nameTh}</span><span class="biz-month-prod" title="${m.topItem.name}">${m.topItem.name}</span><span class="biz-month-qty"><b>${m.topItem.count}</b> ชิ้นซ้ำ</span></div>`;
                }
                return `<div class="biz-monthly-box" style="opacity:0.4;"><span class="biz-month-lbl" style="color:#64748b;">${m.nameTh}</span><span class="biz-month-prod" style="font-style:italic; font-size:11px;">ไม่มีข้อมูลซ้ำ</span></div>`;
              }).join('')}
            </div>
          </div>

          <div class="biz-card">
            <div class="biz-card-title"><div>อันดับสินค้าที่ลูกค้าเก่าเลือกซื้อสูงสุดในรอบ (${selMonth})</div></div>
            <div class="biz-rank-list">
              ${sortedProducts.length === 0 ? '<div style="color:#94a3b8; text-align:center; padding:15px;">ไม่พบประวัติการซื้อสินค้าซ้ำในรอบนี้</div>' : sortedProducts.map((p, idx) => {
                const pct = (p.count / topProductMaxCount) * 100;
                return `
                  <div class="biz-rank-item">
                    <div style="display:flex; align-items:center; flex-grow:1; min-width:0;">
                      <div class="biz-rank-badge ${idx<3?'rank-'+(idx+1):''}">${idx+1}</div>
                      <div class="biz-rank-meta"><span class="biz-rank-name">${p.key}</span><div class="biz-progress-bg"><div class="biz-progress-bar" style="width:${pct}%; background-color:${getProductColor(p.category)};"></div></div></div>
                    </div>
                    <div class="biz-rank-vals"><span class="biz-val-m">${p.count} ชิ้น</span><span class="biz-val-s">฿${Math.round(p.revenue).toLocaleString()}</span></div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>

        <div class="biz-card">
          <div class="biz-card-title"><div>ประสิทธิภาพช่องทางปิดการขายลูกค้าเก่า</div></div>
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

      <div class="biz-card">
        <div class="biz-card-title">ตารางตรวจสอบผลสัมฤทธิ์ทางการตลาดเทียบเป้าหมาย (Retention KPI Matrix)</div>
        <div class="biz-table-wrapper">
          <table class="biz-table">
            <thead>
              <tr>
                <th>ช่องทาง</th><th>รายได้จริง (Act)</th><th>เป้ารายได้ (Plan)</th><th>จำนวนออเดอร์</th><th>เป้าออเดอร์</th><th>ส่วนต่างเป้า</th><th>KPI %</th><th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              ${bizChannels.map(ch => {
                const act = channelDataStore[ch];
                const planBase = bizTargetPlans[ch];
                const planCount = selMonth === 'YTD' ? planBase.targetOrders : Math.round(planBase.targetOrders / 6);
                const planRev = selMonth === 'YTD' ? planBase.targetRev : Math.round(planBase.targetRev / 6);
                const diffOrders = act.count - planCount;
                const achRate = planRev === 0 ? 0 : (act.revenue / planRev) * 100;
                return `
                  <tr>
                    <td style="font-weight:600;">${ch}</td>
                    <td style="font-weight:700; color:#059669;">฿${Math.round(act.revenue).toLocaleString()}</td>
                    <td>฿${planRev.toLocaleString()}</td>
                    <td>${act.count} ครั้ง</td>
                    <td>${planCount} ครั้ง</td>
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
    </div>
  `;

  container.innerHTML = html;
}
