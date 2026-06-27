// public/retention.js
function renderRetention(filteredData, rawData) {
  const container = document.getElementById('view-retention');
  
  // ยึดหลักแหล่งข้อมูลหลักผูกผันกับตัวกรองของระบบแดชบอร์ดหลัก
  const dataSrc = (filteredData && filteredData.length > 0) ? filteredData : [];

  if (!dataSrc || dataSrc.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:50px; color:#999;">ไม่พบข้อมูลสั่งซื้อซ้ำ กรุณาปรับ Filter หรือโหลดไฟล์ข้อมูลใหม่อีกครั้ง</div>';
    return;
  }

  // กำหนดสเตตัสการเก็บค่า Dropdown และปุ่ม Toggle ของแถบแบรนด์/แพ็กเกจสินค้า
  window.retentionActiveToggle = window.retentionActiveToggle || 'category';
  window.retentionSelectedMonth = window.retentionSelectedMonth || 'YTD';

  // 1. Inject CSS Styles สำหรับปรับปรุงหน้าตา KPI Dashboard ให้เรียบร้อย
  if (!document.getElementById('retention-kpi-master-styles')) {
    const style = document.createElement('style');
    style.id = 'retention-kpi-master-styles';
    style.innerHTML = `
      .retention-container { font-family: 'Inter', 'Outfit', sans-serif; color: #1e293b; background-color: #f8fafc; }
      .retention-header {
        background: linear-gradient(135deg, #0b2240 0%, #1e293b 100%); color: white;
        padding: 22px 28px; border-radius: 12px; margin-bottom: 20px;
        display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 15px rgba(0,0,0,0.05);
      }
      .retention-header-text h2 { margin: 0; font-size: 20px; font-weight: 700; }
      .retention-header-text p { margin: 4px 0 0 0; font-size: 12.5px; color: #cbd5e1; }
      
      .retention-ctrl-bar { display: flex; justify-content: space-between; align-items: center; gap: 15px; margin-bottom: 20px; flex-wrap: wrap; }
      .retention-toggle-container { display: flex; background: #e2e8f0; padding: 4px; border-radius: 8px; width: fit-content; }
      .retention-toggle-btn {
        border: none; background: transparent; padding: 7px 16px; font-size: 12.5px;
        font-weight: 600; color: #475569; border-radius: 6px; cursor: pointer; transition: all 0.2s ease;
      }
      .retention-toggle-btn.active { background: white; color: #0b2240; box-shadow: 0 2px 5px rgba(0,0,0,0.08); }
      
      .kpi-month-select { padding: 7px 14px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 13px; font-weight: 500; color: #334155; background: #fff; cursor: pointer; }

      .retention-kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 20px; }
      .retention-kpi-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; display: flex; align-items: center; justify-content: space-between; }
      .retention-kpi-lbl { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; }
      .retention-kpi-val { font-size: 22px; font-weight: 700; color: #0f172a; margin-top: 4px; }
      .retention-kpi-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 16px; }

      .retention-layout-grid { display: grid; grid-template-columns: 1.6fr 1fr; gap: 20px; margin-bottom: 20px; }
      @media (max-width: 1024px) { .retention-layout-grid { grid-template-columns: 1fr; } }
      
      .retention-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
      .retention-card h3 { font-size: 15px; font-weight: 700; color: #1e293b; margin: 0 0 15px 0; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
      .retention-card-subtitle { font-size: 11px; font-weight: normal; color: #64748b; margin-top: 2px; }

      .monthly-prod-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
      .monthly-prod-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 4px; }
      .month-name-lbl { font-size: 11px; font-weight: 800; text-transform: uppercase; }
      .month-prod-name { font-size: 13px; font-weight: 700; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      
      .rank-list { display: flex; flex-direction: column; gap: 12px; }
      .rank-item { display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px solid #f8fafc; }
      .rank-number { width: 24px; height: 24px; border-radius: 50%; background: #e2e8f0; color: #475569; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
      .rank-number.top-1 { background: #fdf1e6; color: #d95f1d; }
      .rank-number.top-2 { background: #eff6ff; color: #2563eb; }
      .rank-number.top-3 { background: #ecfdf5; color: #059669; }
      .rank-name { font-size: 13px; font-weight: 600; color: #1e293b; }
      .rank-progress-container { width: 100%; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; margin-top: 4px; }
      .rank-progress-bar { height: 100%; border-radius: 3px; }
      .rank-values { text-align: right; display: flex; flex-direction: column; }
      .rank-val-primary { font-size: 13px; font-weight: 700; color: #0f172a; }
      .rank-val-secondary { font-size: 11px; color: #64748b; }

      .kpi-table-wrapper { background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; overflow-x: auto; margin-top: 20px; }
      .kpi-perf-table { width: 100%; border-collapse: collapse; }
      .kpi-perf-table th, .kpi-perf-table td { padding: 10px 14px; text-align: left; border-bottom: 1px solid #f1f5f9; }
      .kpi-perf-table th { background: #f8fafc; color: #475569; font-weight: 600; font-size: 12px; white-space: nowrap; }
      .kpi-perf-table td { font-size: 13px; color: #334155; }
      .status-tag { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
      .tag-pass { color: #065f46; background: #d1fae5; }
      .tag-fail { color: #991b1b; background: #fee2e2; }
    `;
    document.head.appendChild(style);
  }

  // 2. ข้อมูลตัวแปรจำลองสเกลวันเวลาและแปลงรูปแบบวันที่ให้มีเสถียรภาพ
  const parseD = (dateStr) => {
    if (!dateStr) return null;
    const datePart = dateStr.toString().trim().split(' ')[0];
    let parts = datePart.split('-');
    if (parts.length < 3) parts = datePart.split('/');
    if (parts.length >= 3) {
      let p0 = parseInt(parts[0], 10);
      let p1 = parseInt(parts[1], 10);
      let p2 = parseInt(parts[2], 10);
      let y = p0 > 1000 ? p0 : p2;
      let m = p1;
      let d = p0 > 1000 ? p2 : p0;
      if (y < 2000) y += 2000;
      if (y > 2500) y -= 543;
      return { y, m, d, val: y * 10000 + m * 100 + d };
    }
    return null;
  };

  const parseProductsFromRow = (row) => {
    const rawProd = window.getRowValue(row, ['ชื่อสินค้า', 'Product', 'รายการขาย', 'Product Set']) || 'Other';
    if (!rawProd || rawProd === 'Other') {
      return [{ rawName: 'Other', cleanName: 'Other', category: 'Other', qty: 1 }];
    }
    const products = [];
    const parts = rawProd.split('|');
    parts.forEach(part => {
      const subParts = part.split('=');
      const rawName = subParts[0].trim();
      let qty = 1;
      if (subParts.length > 1) {
        const parsedQty = parseInt(subParts[1].trim());
        if (!isNaN(parsedQty)) qty = parsedQty;
      }
      if (rawName) {
        let category = 'Other';
        const nameLower = rawName.toLowerCase();
        if (nameLower.includes('plus')) category = 'Plus';
        else if (nameLower.includes('gold')) category = 'Gold';
        else if (nameLower.includes('wiss')) category = 'Wiss';
        else if (nameLower.includes('kides') || nameLower.includes('kide')) category = 'Kides';
        else if (nameLower.includes('collagen') || nameLower.includes('callagen')) category = 'Collagen';
        
        products.push({ rawName, cleanName: rawName, category, qty });
      }
    });
    return products.length > 0 ? products : [{ rawName: 'Other', cleanName: 'Other', category: 'Other', qty: 1 }];
  };

  const firstPurchaseMap = typeof globalFirstPurchase !== 'undefined' ? globalFirstPurchase : {};

  // กรองเฉพาะคำสั่งซื้อสเตตัสเสร็จสมบูรณ์ และมียอดโอนเงินจริง > 0 เท่านั้น
  const saleOrders = dataSrc.filter(row => {
    if (!window.isSaleOrder(row)) return false;
    const revStr = window.getRowValue(row, ['ยอดขาย', 'ราคาสินค้ายังไม่รวมภาษี', 'ยอดโอน']) || '0';
    const rev = parseFloat(revStr.toString().replace(/,/g, ''));
    return !isNaN(rev) && rev > 0;
  });

  // แยกประเภหาคำสั่งซื้อซ้ำซ้อน (Repeat Orders) จากฐานประวัติการซื้อครั้งแรก
  const repeatOrders = saleOrders.filter(row => {
    const id = window.getCustomerUniqueId(row);
    const dateStr = window.getRowValue(row, ['วันที่สร้าง', 'วันที่โอนเงิน', 'วันที่']);
    if (!id || !dateStr) return false;
    const d = parseD(dateStr);
    if (!d) return false;
    const firstDate = firstPurchaseMap[id];
    return firstDate && firstDate.val < d.val;
  });

  // --- LOGIC INTERACTIVE RE-RENDER ---
  window.changeRetentionMonthFilter = function(monthVal) {
    window.retentionSelectedMonth = monthVal;
    renderRetention(filteredData, rawData);
  };

  window.setRetentionToggle = function(type) {
    window.retentionActiveToggle = type;
    renderRetention(filteredData, rawData);
  };

  // --- คำนวณสถิติตามเงื่อนไข Dropdown เดือนที่เลือก ---
  const activeMonth = window.retentionSelectedMonth;
  
  const filteredRepeatOrders = repeatOrders.filter(row => {
    if (activeMonth === 'YTD') return true;
    const dateStr = window.getRowValue(row, ['วันที่สร้าง', 'วันที่โอนเงิน']);
    const d = parseD(dateStr);
    if (!d) return false;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return monthNames[d.m - 1] === activeMonth;
  });

  // คำนวณยอดรวมกล่อง KPI บอร์ดด้านบน
  let repeatRevenue = 0;
  const repeatBuyers = new Set();
  const activeUniqueBuyers = new Set();

  // หาลูกค้าทั้งหมดที่แอคทีฟในรอบเดือนนั้น ๆ เพื่อทำเปอร์เซ็นต์ส่วนแบ่งแชร์
  saleOrders.forEach(row => {
    const id = window.getCustomerUniqueId(row);
    const dateStr = window.getRowValue(row, ['วันที่สร้าง', 'วันที่โอนเงิน']);
    const d = parseD(dateStr);
    if (!id || !d) return;
    if (activeMonth !== 'YTD') {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      if (monthNames[d.m - 1] !== activeMonth) return;
    }
    activeUniqueBuyers.add(id);
  });

  filteredRepeatOrders.forEach(row => {
    const id = window.getCustomerUniqueId(row);
    if (id) repeatBuyers.add(id);
    const revStr = window.getRowValue(row, ['ยอดขาย', 'ยอดโอน']) || '0';
    const rev = parseFloat(revStr.toString().replace(/,/g, ''));
    if (!isNaN(rev)) repeatRevenue += rev;
  });

  const repeatCount = filteredRepeatOrders.length;
  const repeatBuyerPct = activeUniqueBuyers.size === 0 ? 0 : (repeatBuyers.size / activeUniqueBuyers.size) * 100;

  // จัดอันดับสินค้าซื้อซ้ำรายปี (YTD) และรายเดือน
  const annualProdMap = {};
  const monthlyProdMap = {};
  for (let m = 1; m <= 12; m++) monthlyProdMap[m] = {};

  // เติมเต็มอาร์เรย์จัดอันดับผลิตภัณฑ์
  filteredRepeatOrders.forEach(row => {
    const dateStr = window.getRowValue(row, ['วันที่สร้าง', 'วันที่โอนเงิน']);
    const d = parseD(dateStr);
    if (!d || d.m < 1 || d.m > 12) return;

    const parsedProds = parseProductsFromRow(row);
    const totalQty = parsedProds.reduce((sum, p) => sum + p.qty, 0) || 1;
    const revStr = window.getRowValue(row, ['ยอดขาย', 'ยอดโอน']) || '0';
    const orderRev = parseFloat(revStr.toString().replace(/,/g, '')) || 0;

    parsedProds.forEach(p => {
      const pRevenue = orderRev * (p.qty / totalQty);
      const groupName = window.retentionActiveToggle === 'category' ? p.category : p.cleanName;

      if (!annualProdMap[groupName]) {
        annualProdMap[groupName] = { name: groupName, count: 0, revenue: 0, category: p.category };
      }
      annualProdMap[groupName].count += p.qty;
      annualProdMap[groupName].revenue += pRevenue;
    });
  });

  // ทำแผนที่สรุปรายเดือนย่อยของปีเก็บไว้โชว์กล่องตาราง
  repeatOrders.forEach(row => {
    const dateStr = window.getRowValue(row, ['วันที่สร้าง', 'วันที่โอนเงิน']);
    const d = parseD(dateStr);
    if (!d || d.m < 1 || d.m > 12) return;
    const parsedProds = parseProductsFromRow(row);
    const totalQty = parsedProds.reduce((sum, p) => sum + p.qty, 0) || 1;
    const revStr = window.getRowValue(row, ['ยอดขาย', 'ยอดโอน']) || '0';
    const orderRev = parseFloat(revStr.toString().replace(/,/g, '')) || 0;

    parsedProds.forEach(p => {
      const pRevenue = orderRev * (p.qty / totalQty);
      const groupName = window.retentionActiveToggle === 'category' ? p.category : p.cleanName;
      if (!monthlyProdMap[d.m][groupName]) {
        monthlyProdMap[d.m][groupName] = { count: 0, revenue: 0 };
      }
      monthlyProdMap[d.m][groupName].count += p.qty;
      monthlyProdMap[d.m][groupName].revenue += pRevenue;
    });
  });

  const rankedProducts = Object.values(annualProdMap).sort((a, b) => b.count - a.count);
  const maxProductCount = rankedProducts.length > 0 ? rankedProducts[0].count : 1;

  const thaiMonths = { 1: 'มกราคม', 2: 'กุมภาพันธ์', 3: 'มีนาคม', 4: 'เมษายน', 5: 'พฤษภาคม', 6: 'มิถุนายน', 7: 'กรกฎาคม', 8: 'สิงหาคม', 9: 'กันยายน', 10: 'ตุลาคม', 11: 'พฤศจิกายน', 12: 'ธันวาคม' };
  const monthlyTopProducts = [];
  for (let m = 1; m <= 12; m++) {
    const prods = Object.keys(monthlyProdMap[m]).map(name => ({
      name, count: monthlyProdMap[m][name].count, revenue: monthlyProdMap[m][name].revenue,
      category: window.retentionActiveToggle === 'category' ? name : (annualProdMap[name] ? annualProdMap[name].category : 'Other')
    }));
    if (prods.length > 0) {
      prods.sort((a, b) => b.count - a.count);
      monthlyTopProducts.push({ month: m, monthName: thaiMonths[m], topProduct: prods[0] });
    } else {
      monthlyTopProducts.push({ month: m, monthName: thaiMonths[m], topProduct: null });
    }
  }

  // คำนวณแยกตามช่องทางจำหน่าย (Channels) สำหรับสร้างตาราง KPI ท้ายบิล
  const channelMap = {};
  const allowedChannels = ['Facebook', 'Line', 'Call', 'CRM', 'Other'];
  allowedChannels.forEach(ch => { channelMap[ch] = { name: ch, count: 0, revenue: 0 }; });

  filteredRepeatOrders.forEach(row => {
    let rawCh = window.getRowValue(row, ['ช่องทาง', 'Channel']) || 'Other';
    let channel = 'Other';
    const chLower = rawCh.toString().toLowerCase();
    if (chLower.includes('facebook') || chLower === 'fb') channel = 'Facebook';
    else if (chLower.includes('line')) channel = 'Line';
    else if (chLower.includes('crm')) channel = 'CRM';
    else if (chLower.includes('call') || chLower.includes('phone')) channel = 'Call';

    const revStr = window.getRowValue(row, ['ยอดขาย', 'ยอดโอน']) || '0';
    const rev = parseFloat(revStr.toString().replace(/,/g, ''));
    
    channelMap[channel].count++;
    if (!isNaN(rev)) channelMap[channel].revenue += rev;
  });

  const rankedChannels = Object.values(channelMap).sort((a, b) => b.revenue - a.revenue);
  const maxChannelRevenue = rankedChannels.length > 0 ? rankedChannels[0].revenue : 1;

  // Mock Target Base Plans สำหรับฝั่งการรักษาลูกค้าเก่า (Retention Customer Plan)
  const retentionPlans = {
    'Facebook': { planCount: 150, planRev: 120000 },
    'Line': { planCount: 200, planRev: 180000 },
    'Call': { planCount: 100, planRev: 90000 },
    'CRM': { planCount: 350, planRev: 450000 },
    'Other': { planCount: 10, planRev: 8000 }
  };

  const getChannelColor = (ch) => {
    const colors = { 'Facebook': '#38bdf8', 'Line': '#06c755', 'CRM': '#d95f1d', 'Other': '#9ca3af', 'Call': '#71717a' };
    return colors[ch] || '#9ca3af';
  };
  const getProductColor = (prod) => {
    const colors = { 'Plus': '#ea580c', 'Gold': '#d97706', 'Wiss': '#2563eb', 'Collagen': '#ec4899', 'Kides': '#059669', 'Other': '#64748b' };
    return colors[prod] || '#d95f1d';
  };

  // 6. Build โครงสร้างหน้าจอ HTML ทั้งหน้าใหม่
  let html = `
    <div class="retention-container">
      <div class="retention-header">
        <div class="retention-header-text">
          <h2>ระบบวิเคราะห์อัตราการรักษาลูกค้าและตัวชี้วัดความซ้ำ (Retention & Customer KPI Insights)</h2>
          <p>รายงานตรวจสอบประสิทธิภาพงานบริการลูกค้าเก่า การซื้อซ้ำ และการตรวจวัดผลสำเร็จเทียบ KPI รายช่องทาง</p>
        </div>
      </div>

      <div class="retention-ctrl-bar">
        <div class="retention-toggle-container">
          <button class="retention-toggle-btn ${window.retentionActiveToggle === 'category' ? 'active' : ''}" onclick="window.setRetentionToggle('category')">
            ตามกลุ่มสินค้า (Product Brand)
          </button>
          <button class="retention-toggle-btn ${window.retentionActiveToggle === 'item' ? 'active' : ''}" onclick="window.setRetentionToggle('item')">
            ตามรายการสินค้า/แพ็กเกจ (Product Package)
          </button>
        </div>

        <select class="kpi-month-select" id="retention-month-dropdown" onchange="window.changeRetentionMonthFilter(this.value)">
          <option value="YTD" ${activeMonth === 'YTD' ? 'selected' : ''}>YTD (รวมสะสมทุกเดือน)</option>
          <option value="Jan" ${activeMonth === 'Jan' ? 'selected' : ''}>January</option>
          <option value="Feb" ${activeMonth === 'Feb' ? 'selected' : ''}>February</option>
          <option value="Mar" ${activeMonth === 'Mar' ? 'selected' : ''}>March</option>
          <option value="Apr" ${activeMonth === 'Apr' ? 'selected' : ''}>April</option>
          <option value="May" ${activeMonth === 'May' ? 'selected' : ''}>May</option>
          <option value="Jun" ${activeMonth === 'Jun' ? 'selected' : ''}>June</option>
        </select>
      </div>

      <div class="retention-kpi-grid">
        <div class="retention-kpi-card">
          <div class="retention-kpi-info">
            <span class="retention-kpi-lbl">Repeat Revenue</span>
            <span class="retention-kpi-val">฿${Math.round(repeatRevenue).toLocaleString()}</span>
          </div>
          <div class="retention-kpi-icon" style="color:#059669; background:#ecfdf5;">
            <i class="fas fa-dollar-sign"></i>
          </div>
        </div>
        <div class="retention-kpi-card">
          <div class="retention-kpi-info">
            <span class="retention-kpi-lbl">Repeat Orders</span>
            <span class="retention-kpi-val">${repeatCount.toLocaleString()} ออเดอร์</span>
          </div>
          <div class="retention-kpi-icon" style="color:#2563eb; background:#eff6ff;">
            <i class="fas fa-shopping-bag"></i>
          </div>
        </div>
        <div class="retention-kpi-card">
          <div class="retention-kpi-info">
            <span class="retention-kpi-lbl">Repeat Buyers</span>
            <span class="retention-kpi-val">${repeatBuyers.size.toLocaleString()} ราย</span>
          </div>
          <div class="retention-kpi-icon" style="color:#8b5cf6; background:#f5f3ff;">
            <i class="fas fa-users"></i>
          </div>
        </div>
        <div class="retention-kpi-card">
          <div class="retention-kpi-info">
            <span class="retention-kpi-lbl">Repeat Buyer Share</span>
            <span class="retention-kpi-val">${repeatBuyerPct.toFixed(1)}%</span>
          </div>
          <div class="retention-kpi-icon" style="color:#ea580c; background:#fdf1e6;">
            <i class="fas fa-chart-pie"></i>
          </div>
        </div>
      </div>

      <div class="retention-layout-grid">
        <div>
          <div class="retention-card">
            <h3>
              <div>อันดับสินค้าซื้อซ้ำสูงสุดรายเดือน <div class="retention-card-subtitle">แบรนด์ที่ลูกค้ากลับมาซื้อซ้ำแยกตามเดือนจริงประจำปี</div></div>
              <i class="fas fa-calendar-alt" style="color: #d95f1d;"></i>
            </h3>
            <div class="monthly-prod-grid">
              ${monthlyTopProducts.map(m => {
                if (m.topProduct) {
                  const barColor = getProductColor(m.topProduct.category);
                  return `
                    <div class="monthly-prod-box">
                      <span class="month-name-lbl" style="color: ${barColor};">${m.monthName}</span>
                      <span class="month-prod-name" title="${m.topProduct.name}">${m.topProduct.name}</span>
                      <span class="month-prod-stat"><b>${m.topProduct.count.toLocaleString()}</b> ชิ้นซ้ำ</span>
                    </div>
                  `;
                } else {
                  return `
                    <div class="monthly-prod-box" style="opacity: 0.5;">
                      <span class="month-name-lbl" style="color:#64748b;">${m.monthName}</span>
                      <span class="month-prod-name" style="font-style:italic; font-size:11px; color:#999;">ไม่มีข้อมูลซื้อซ้ำ</span>
                    </div>
                  `;
                }
              }).join('')}
            </div>
          </div>

          <div class="retention-card">
            <h3>
              <div>อันดับสินค้าซื้อซ้ำสูงสุดประจำรอบ (${activeMonth}) <div class="retention-card-subtitle">ลำดับสินค้าที่มีสัดส่วนปริมาณชิ้นการซื้อซ้ำมากที่สุด</div></div>
              <i class="fas fa-medal" style="color: #f59e0b;"></i>
            </h3>
            <div class="rank-list">
              ${rankedProducts.length === 0 ? '<div style="color:#999; text-align:center; font-style:italic; padding:15px;">ไม่มีการสั่งซื้อซ้ำในผลิตภัณฑ์รอบนี้</div>' : rankedProducts.map((p, index) => {
                const pct = (p.count / maxProductCount) * 100;
                const topClass = index === 0 ? 'top-1' : index === 1 ? 'top-2' : index === 2 ? 'top-3' : '';
                return `
                  <div class="rank-item">
                    <div class="rank-item-info">
                      <div class="rank-number ${topClass}">${index + 1}</div>
                      <div class="rank-details">
                        <span class="rank-name">${p.name}</span>
                        <div class="rank-progress-container"><div class="rank-progress-bar" style="width: ${pct}%; background-color: ${getProductColor(p.category)};"></div></div>
                      </div>
                    </div>
                    <div class="rank-values">
                      <span class="rank-val-primary">${p.count.toLocaleString()} ชิ้นซ้ำ</span>
                      <span class="rank-val-secondary">฿${Math.round(p.revenue).toLocaleString()}</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>

        <div class="retention-card">
          <h3>
            <div>อันดับช่องทางสั่งซื้อซ้ำ (Channels) <div class="retention-card-subtitle">เรียงตามช่องทางบริการที่สร้างเม็ดเงินซ้ำสูงสุด</div></div>
            <i class="fas fa-chart-bar" style="color: #2563eb;"></i>
          </h3>
          <div class="rank-list">
            ${rankedChannels.map((c, index) => {
              const pct = (c.revenue / maxChannelRevenue) * 100;
              const topClass = index === 0 ? 'top-1' : index === 1 ? 'top-2' : index === 2 ? 'top-3' : '';
              return `
                <div class="rank-item">
                  <div class="rank-item-info">
                    <div class="rank-number ${topClass}">${index + 1}</div>
                    <div class="rank-details">
                      <span class="rank-name">${c.name}</span>
                      <div class="rank-progress-container"><div class="rank-progress-bar" style="width: ${pct}%; background-color: ${getChannelColor(c.name)};"></div></div>
                    </div>
                  </div>
                  <div class="rank-values">
                    <span class="rank-val-primary">฿${Math.round(c.revenue).toLocaleString()}</span>
                    <span class="rank-val-secondary">${c.count} ออเดอร์</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>

      <div class="retention-card" style="margin-top: 25px;">
        <h3 style="border-bottom:none; margin-bottom:5px;">ตารางวิเคราะห์ผลสัมฤทธิ์ KPI ลูกค้าเก่าซื้อซ้ำ (Old Customer KPI Progress)</h3>
        <p style="font-size:12px; color:#64748b; margin:0 0 15px 0;">ตารางแสดงความก้าวหน้าและเปรียบเทียบสถิติเป้าหมายจริง (Actual) ปะทะแผนการตลาดประจำไตรมาส (Target Plan)</p>
        
        <div class="kpi-table-wrapper">
          <table class="kpi-perf-table">
            <thead>
              <tr>
                <th>ช่องทางจำหน่าย</th>
                <th>ยอดขายโอนจริง (Act)</th>
                <th>เป้ายอดขายเก่า (Plan)</th>
                <th>จำนวนออเดอร์ (Act)</th>
                <th>เป้าออเดอร์เก่า (Plan)</th>
                <th>Diff ออเดอร์</th>
                <th>KPI Achieved (%)</th>
                <th>ประเมินสเตตัส</th>
              </tr>
            </thead>
            <tbody>
    `;

  allowedChannels.forEach(ch => {
    const act = channelMap[ch];
    // ดึงค่าแผนการตลาด หากเลือกแบบเจาะลึกรายเดือน ให้สเกลหาร 6 เพื่อประมาณเฉลี่ยค่าเป้าหมายที่ยุติธรรม
    const plan = retentionPlans[ch];
    const planCount = activeMonth === 'YTD' ? plan.planCount : Math.round(plan.planCount / 6);
    const planRev = activeMonth === 'YTD' ? plan.planRev : Math.round(plan.planRev / 6);
    
    const diffOrders = act.count - planCount;
    const achRate = planRev === 0 ? 0 : (act.revenue / planRev) * 100;
    const isPass = achRate >= 100;

    html += `
      <tr>
        <td style="font-weight:600; color:#0f172a;">${ch}</td>
        <td style="font-weight:600; color:#059669;">฿${Math.round(act.revenue).toLocaleString()}</td>
        <td style="color:#64748b;">฿${planRev.toLocaleString()}</td>
        <td>${act.count}</td>
        <td style="color:#64748b;">${planCount}</td>
        <td style="font-weight:600; color:${diffOrders >= 0 ? '#10b981' : '#ef4444'}">${diffOrders >= 0 ? '+' : ''}${diffOrders}</td>
        <td style="font-weight:700;">${achRate.toFixed(1)}%</td>
        <td>
          <span class="status-tag ${isPass ? 'tag-pass' : 'tag-fail'}">
            ${isPass ? '▲ ผ่านเป้าครบรอบ' : '▼ ต่ำกว่าเป้า'}
          </span>
        </td>
      </tr>
    `;
  });

  html += `
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
}
