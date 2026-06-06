// public/retention.js

function renderRetention(filteredData, rawData) {
  const container = document.getElementById('view-retention');
  
  if (!filteredData || filteredData.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:50px; color:#999;">No data available. Please adjust filters or load data.</div>';
    return;
  }

  // Store active toggle state globally to persist across filter changes
  window.retentionActiveToggle = window.retentionActiveToggle || 'category';

  // 1. Inject CSS Styles
  if (!document.getElementById('retention-styles')) {
    const style = document.createElement('style');
    style.id = 'retention-styles';
    style.innerHTML = `
      .retention-container {
        font-family: 'Inter', 'Outfit', sans-serif;
        color: #1e293b;
        background-color: #f8fafc;
      }
      .retention-header {
        background: linear-gradient(135deg, #0b2240 0%, #1e293b 100%);
        color: white;
        padding: 25px 30px;
        border-radius: 16px;
        margin-bottom: 25px;
        box-shadow: 0 10px 20px rgba(0,0,0,0.05);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .retention-header-text h2 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px; }
      .retention-header-text p { margin: 6px 0 0 0; font-size: 13.5px; color: #cbd5e1; }
      
      .retention-toggle-container {
        display: flex;
        background: #e2e8f0;
        padding: 4px;
        border-radius: 10px;
        margin-bottom: 25px;
        width: fit-content;
        box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);
      }
      .retention-toggle-btn {
        border: none;
        background: transparent;
        padding: 8px 18px;
        font-size: 13px;
        font-weight: 600;
        color: #475569;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .retention-toggle-btn.active {
        background: white;
        color: #0b2240;
        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);
      }
      
      .retention-kpi-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 20px;
        margin-bottom: 25px;
      }
      @media (max-width: 1024px) {
        .retention-kpi-grid { grid-template-columns: repeat(2, 1fr); }
      }
      @media (max-width: 600px) {
        .retention-kpi-grid { grid-template-columns: 1fr; }
      }
      
      .retention-kpi-card {
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        padding: 22px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.02);
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: transform 0.2s, box-shadow 0.2s;
      }
      .retention-kpi-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 20px rgba(0,0,0,0.06);
      }
      .retention-kpi-info { display: flex; flex-direction: column; gap: 4px; }
      .retention-kpi-lbl { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
      .retention-kpi-val { font-size: 26px; font-weight: 700; color: #0f172a; }
      .retention-kpi-icon {
        width: 46px; height: 46px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 18px;
      }
      
      .retention-layout-grid {
        display: grid;
        grid-template-columns: 1.6fr 1fr;
        gap: 24px;
        margin-bottom: 30px;
      }
      @media (max-width: 1024px) {
        .retention-layout-grid { grid-template-columns: 1fr; }
      }
      
      .retention-card {
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        padding: 25px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.02);
        margin-bottom: 24px;
      }
      .retention-card h3 {
        font-size: 16px; font-weight: 700; color: #1e293b; margin: 0 0 20px 0; border-bottom: 1px solid #f1f5f9; padding-bottom: 14px;
        display: flex; justify-content: space-between; align-items: center;
      }
      .retention-card-subtitle { font-size: 11.5px; font-weight: normal; color: #64748b; margin-top: 4px; text-transform: none; }
      
      /* Monthly product grid */
      .monthly-prod-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
      }
      @media (max-width: 768px) {
        .monthly-prod-grid { grid-template-columns: repeat(2, 1fr); }
      }
      @media (max-width: 480px) {
        .monthly-prod-grid { grid-template-columns: 1fr; }
      }
      .monthly-prod-box {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        padding: 18px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        transition: all 0.2s ease;
      }
      .monthly-prod-box:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 12px rgba(0,0,0,0.04);
        border-color: #cbd5e1;
        background: white;
      }
      .month-name-lbl { font-size: 11px; font-weight: 800; color: #d95f1d; text-transform: uppercase; letter-spacing: 0.5px; }
      .month-prod-name { font-size: 13.5px; font-weight: 700; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .month-prod-stat { font-size: 11px; color: #64748b; font-weight: 500; display: flex; align-items: center; gap: 4px; }
      
      /* Lists and rankings styling */
      .rank-list { display: flex; flex-direction: column; gap: 16px; }
      .rank-item { display: flex; align-items: center; justify-content: space-between; padding-bottom: 14px; border-bottom: 1px solid #f8fafc; }
      .rank-item:last-child { border-bottom: none; padding-bottom: 0; }
      .rank-item-info { display: flex; align-items: center; gap: 14px; flex-grow: 1; min-width: 0; }
      .rank-number {
        width: 26px; height: 26px; border-radius: 50%; background: #e2e8f0; color: #475569; font-size: 12px; font-weight: 700;
        display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      }
      .rank-number.top-1 { background: #fdf1e6; color: #d95f1d; }
      .rank-number.top-2 { background: #eff6ff; color: #2563eb; }
      .rank-number.top-3 { background: #ecfdf5; color: #059669; }
      
      .rank-details { display: flex; flex-direction: column; gap: 4px; flex-grow: 1; min-width: 0; }
      .rank-name { font-size: 13.5px; font-weight: 700; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .rank-progress-container { width: 100%; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; margin-top: 4px; }
      .rank-progress-bar { height: 100%; border-radius: 4px; transition: width 0.6s ease; }
      
      .rank-values { text-align: right; flex-shrink: 0; display: flex; flex-direction: column; gap: 2px; padding-left: 15px; }
      .rank-val-primary { font-size: 13.5px; font-weight: 700; color: #0f172a; }
      .rank-val-secondary { font-size: 11.5px; color: #64748b; font-weight: 500; }
    `;
    document.head.appendChild(style);
  }

  // 2. Helper to parse date from string
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

  // Helper to parse individual products and quantities from the order string
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
        // Clean name (remove trailing spaces, quantities)
        let cleanName = rawName;
        
        // Category normalization
        let category = 'Other';
        const nameLower = rawName.toLowerCase();
        if (nameLower.includes('plus')) category = 'Plus';
        else if (nameLower.includes('gold')) category = 'Gold';
        else if (nameLower.includes('wiss')) category = 'Wiss';
        else if (nameLower.includes('kides') || nameLower.includes('kide')) category = 'Kides';
        else if (nameLower.includes('collagen') || nameLower.includes('callagen')) category = 'Collagen';
        
        products.push({ rawName, cleanName, category, qty });
      }
    });
    
    if (products.length === 0) {
      products.push({ rawName: 'Other', cleanName: 'Other', category: 'Other', qty: 1 });
    }
    return products;
  };

  // Safe global first purchase resolution
  const firstPurchaseMap = typeof globalFirstPurchase !== 'undefined' ? globalFirstPurchase : {};

  // 3. Process data
  const saleOrders = filteredData.filter(row => window.isSaleOrder(row));
  const uniqueBuyers = new Set();
  saleOrders.forEach(row => {
    const id = window.getCustomerUniqueId(row);
    if (id) uniqueBuyers.add(id);
  });

  // Identify Repeat Purchases
  const repeatOrders = saleOrders.filter(row => {
    const id = window.getCustomerUniqueId(row);
    const dateStr = window.getRowValue(row, ['วันที่สร้าง', 'วันที่โอนเงิน', 'OrderDate', 'Date', 'วันที่']);
    if (!id || !dateStr) return false;
    const d = parseD(dateStr);
    if (!d) return false;
    const firstDate = firstPurchaseMap[id];
    return firstDate && firstDate.val < d.val;
  });

  // Calculate repeat metrics
  let repeatRevenue = 0;
  const repeatBuyers = new Set();
  
  repeatOrders.forEach(row => {
    const id = window.getCustomerUniqueId(row);
    if (id) repeatBuyers.add(id);
    const revStr = window.getRowValue(row, ['ยอดขาย', 'ราคาสินค้ายังไม่รวมภาษี', 'Net Sales', 'Revenue', 'Amount', 'ยอดโอน']) || '0';
    const rev = parseFloat(revStr.replace(/,/g, ''));
    if (!isNaN(rev)) repeatRevenue += rev;
  });

  const repeatCount = repeatOrders.length;
  const totalCount = saleOrders.length;
  
  const repeatBuyerPct = uniqueBuyers.size === 0 ? 0 : (repeatBuyers.size / uniqueBuyers.size) * 100;
  const repeatRate = uniqueBuyers.size === 0 ? 0 : (totalCount / uniqueBuyers.size);

  // 4. Group repeat purchases by Product
  const annualProdMap = {};
  const monthlyProdMap = {}; // 1-12 -> { prodName -> { count, revenue } }
  for (let m = 1; m <= 12; m++) {
    monthlyProdMap[m] = {};
  }

  repeatOrders.forEach(row => {
    const dateStr = window.getRowValue(row, ['วันที่สร้าง', 'วันที่โอนเงิน', 'OrderDate', 'Date', 'วันที่']);
    if (!dateStr) return;
    const d = parseD(dateStr);
    if (!d || d.m < 1 || d.m > 12) return;
    
    // Parse individual products and split revenue proportionally
    const parsedProds = parseProductsFromRow(row);
    const totalQty = parsedProds.reduce((sum, p) => sum + p.qty, 0) || 1;
    
    const revStr = window.getRowValue(row, ['ยอดขาย', 'ราคาสินค้ายังไม่รวมภาษี', 'Net Sales', 'Revenue', 'Amount', 'ยอดโอน']) || '0';
    const orderRev = parseFloat(revStr.replace(/,/g, '')) || 0;

    parsedProds.forEach(p => {
      const pRevenue = orderRev * (p.qty / totalQty);
      const groupName = window.retentionActiveToggle === 'category' ? p.category : p.cleanName;

      // YTD Grouping
      if (!annualProdMap[groupName]) {
        annualProdMap[groupName] = { name: groupName, count: 0, revenue: 0, category: p.category };
      }
      annualProdMap[groupName].count += p.qty;
      annualProdMap[groupName].revenue += pRevenue;

      // Monthly Grouping
      if (!monthlyProdMap[d.m][groupName]) {
        monthlyProdMap[d.m][groupName] = { count: 0, revenue: 0 };
      }
      monthlyProdMap[d.m][groupName].count += p.qty;
      monthlyProdMap[d.m][groupName].revenue += pRevenue;
    });
  });

  const rankedProducts = Object.values(annualProdMap).sort((a, b) => b.count - a.count);
  const maxProductCount = rankedProducts.length > 0 ? rankedProducts[0].count : 1;

  const thaiMonths = {
    1: 'มกราคม', 2: 'กุมภาพันธ์', 3: 'มีนาคม', 4: 'เมษายน',
    5: 'พฤษภาคม', 6: 'มิถุนายน', 7: 'กรกฎาคม', 8: 'สิงหาคม',
    9: 'กันยายน', 10: 'ตุลาคม', 11: 'พฤศจิกายน', 12: 'ธันวาคม'
  };

  const monthlyTopProducts = [];
  for (let m = 1; m <= 12; m++) {
    const prods = Object.keys(monthlyProdMap[m]).map(name => ({
      name,
      count: monthlyProdMap[m][name].count,
      revenue: monthlyProdMap[m][name].revenue,
      category: window.retentionActiveToggle === 'category' ? name : (annualProdMap[name] ? annualProdMap[name].category : 'Other')
    }));
    
    if (prods.length > 0) {
      prods.sort((a, b) => b.count - a.count);
      monthlyTopProducts.push({ month: m, monthName: thaiMonths[m], topProduct: prods[0] });
    } else {
      monthlyTopProducts.push({ month: m, monthName: thaiMonths[m], topProduct: null });
    }
  }

  // 5. Group repeat purchases by Channel
  const channelMap = {};
  repeatOrders.forEach(row => {
    let rawCh = window.getRowValue(row, ['ช่องทาง', 'Channel']) || 'Other';
    // Normalize channel name
    let channel = 'Other';
    const chLower = rawCh.toLowerCase();
    if (chLower.includes('facebook') || chLower === 'fb') channel = 'Facebook';
    else if (chLower.includes('line')) channel = 'Line';
    else if (chLower.includes('instagram') || chLower.includes('ig')) channel = 'Instagram';
    else if (chLower.includes('crm')) channel = 'CRM';
    else if (chLower.includes('tiktok')) channel = 'Tiktok';
    else if (chLower.includes('shopee')) channel = 'Shopee';
    else if (chLower.includes('lazada')) channel = 'Lazada';
    else if (chLower.includes('call')) channel = 'Call';

    const revStr = window.getRowValue(row, ['ยอดขาย', 'ราคาสินค้ายังไม่รวมภาษี', 'Net Sales', 'Revenue', 'Amount', 'ยอดโอน']) || '0';
    const rev = parseFloat(revStr.replace(/,/g, ''));

    if (!channelMap[channel]) {
      channelMap[channel] = { name: channel, count: 0, revenue: 0 };
    }
    channelMap[channel].count++;
    if (!isNaN(rev)) channelMap[channel].revenue += rev;
  });

  const rankedChannels = Object.values(channelMap).sort((a, b) => b.revenue - a.revenue);
  const maxChannelRevenue = rankedChannels.length > 0 ? rankedChannels[0].revenue : 1;

  // Channel color mapping helper
  const getChannelColor = (ch) => {
    const colors = {
      'Facebook': '#38bdf8', // light blue
      'Line': '#06c755',     // line green
      'Instagram': '#1e40af',// dark blue
      'CRM': '#d95f1d',      // theme orange
      'Other': '#9ca3af',    // grey
      'Tiktok': '#ff0050',   // tiktok red
      'Shopee': '#ff5722',   // shopee orange
      'Lazada': '#1a1446',   // lazada dark blue
      'Call': '#71717a'      // call grey
    };
    return colors[ch] || '#9ca3af';
  };

  // Product category color helper
  const getProductColor = (prod) => {
    const colors = {
      'Plus': '#ea580c',     // Theme Orange
      'Gold': '#d97706',     // Yellow-Gold
      'Wiss': '#2563eb',     // Blue
      'Collagen': '#ec4899', // Pink
      'Kides': '#059669',    // Emerald Green
      'Other': '#64748b'     // Slate Grey
    };
    return colors[prod] || '#d95f1d';
  };

  // Closure function for the toggle switcher
  window.setRetentionToggle = (type) => {
    window.retentionActiveToggle = type;
    renderRetention(filteredData, rawData);
  };

  // 6. Build Page HTML
  let html = `
    <div class="retention-container">
      <div class="retention-header">
        <div class="retention-header-text">
          <h2>Customer Retention Analysis</h2>
          <p>สถิติการสั่งซื้อซ้ำ การจัดอันดับสินค้าที่ลูกค้าซื้อซ้ำสูงสุด และช่องทางขายที่ทำยอดขายซ้ำได้มากที่สุด</p>
        </div>
      </div>

      <!-- Segment/Toggle Selection -->
      <div class="retention-toggle-container">
        <button class="retention-toggle-btn ${window.retentionActiveToggle === 'category' ? 'active' : ''}" onclick="window.setRetentionToggle('category')">
          ตามกลุ่มสินค้า (Product Brand)
        </button>
        <button class="retention-toggle-btn ${window.retentionActiveToggle === 'item' ? 'active' : ''}" onclick="window.setRetentionToggle('item')">
          ตามรายการสินค้า/แพ็กเกจ (Product Package)
        </button>
      </div>

      <!-- Summary KPI Grid -->
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
            <span class="retention-kpi-val">${repeatCount.toLocaleString()}</span>
          </div>
          <div class="retention-kpi-icon" style="color:#2563eb; background:#eff6ff;">
            <i class="fas fa-shopping-bag"></i>
          </div>
        </div>
        <div class="retention-kpi-card">
          <div class="retention-kpi-info">
            <span class="retention-kpi-lbl">Repeat Buyers</span>
            <span class="retention-kpi-val">${repeatBuyers.size.toLocaleString()}</span>
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

      <!-- Main Layout Grid -->
      <div class="retention-layout-grid">
        <!-- Left Column: Product Repeat Analysis -->
        <div>
          <!-- Monthly top products grid -->
          <div class="retention-card">
            <h3>
              <div>
                อันดับสินค้าซื้อซ้ำสูงสุดรายเดือน
                <div class="retention-card-subtitle">
                  แบรนด์หรือแพ็กเกจสินค้าที่ลูกค้าซื้อซ้ำมากที่สุดในแต่ละเดือน (${window.retentionActiveToggle === 'category' ? 'แบ่งตามกลุ่มแบรนด์' : 'แบ่งตามแพ็กเกจ'})
                </div>
              </div>
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
                      <span class="month-prod-stat">
                        <i class="fas fa-redo-alt" style="font-size:10px; color:${barColor}; margin-right:4px;"></i>
                        <b>${m.topProduct.count.toLocaleString()}</b> ชิ้นซ้ำ
                      </span>
                      <span class="month-prod-stat" style="font-size: 10px; color: #94a3b8;">
                        ยอดขาย: ฿${Math.round(m.topProduct.revenue).toLocaleString()}
                      </span>
                    </div>
                  `;
                } else {
                  return `
                    <div class="monthly-prod-box" style="opacity: 0.6;">
                      <span class="month-name-lbl" style="color:#64748b;">${m.monthName}</span>
                      <span class="month-prod-name" style="color:#999; font-style:italic;">ไม่มีการซื้อซ้ำ</span>
                      <span class="month-prod-stat">-</span>
                    </div>
                  `;
                }
              }).join('')}
            </div>
          </div>

          <!-- YTD Top Products List -->
          <div class="retention-card">
            <h3>
              <div>
                อันดับสินค้าซื้อซ้ำสูงสุดสะสมประจำปี (YTD)
                <div class="retention-card-subtitle">เรียงลำดับสินค้าที่มีสัดส่วนปริมาณลูกค้ากลับมาซื้อซ้ำมากที่สุด</div>
              </div>
              <i class="fas fa-medal" style="color: #f59e0b;"></i>
            </h3>
            <div class="rank-list">
              ${rankedProducts.length === 0 ? `
                <div style="text-align:center; padding: 20px; color:#999; font-style:italic;">ไม่มีข้อมูลการซื้อซ้ำในส่วนผลิตภัณฑ์</div>
              ` : rankedProducts.map((p, index) => {
                const pct = (p.count / maxProductCount) * 100;
                const topClass = index === 0 ? 'top-1' : index === 1 ? 'top-2' : index === 2 ? 'top-3' : '';
                const barColor = getProductColor(p.category);
                return `
                  <div class="rank-item">
                    <div class="rank-item-info">
                      <div class="rank-number ${topClass}">${index + 1}</div>
                      <div class="rank-details">
                        <span class="rank-name" title="${p.name}">${p.name}</span>
                        <div class="rank-progress-container">
                          <div class="rank-progress-bar" style="width: ${pct}%; background-color: ${barColor};"></div>
                        </div>
                      </div>
                    </div>
                    <div class="rank-values">
                      <span class="rank-val-primary">${p.count.toLocaleString()} ชิ้นซื้อซ้ำ</span>
                      <span class="rank-val-secondary">฿${Math.round(p.revenue).toLocaleString()}</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- Right Column: Channel Repeat Analysis -->
        <div class="retention-card">
          <h3>
            <div>
              จัดอันดับช่องทางสั่งซื้อซ้ำ (Channels)
              <div class="retention-card-subtitle">เรียงตามช่องทางที่ลูกค้ากลับมาซื้อซ้ำและทำรายได้สะสมสูงสุด</div>
            </div>
            <i class="fas fa-chart-bar" style="color: #2563eb;"></i>
          </h3>
          <div class="rank-list" style="margin-top: 10px;">
            ${rankedChannels.length === 0 ? `
              <div style="text-align:center; padding: 20px; color:#999; font-style:italic;">ไม่มีข้อมูลช่องทางการซื้อซ้ำ</div>
            ` : rankedChannels.map((c, index) => {
              const pct = (c.revenue / maxChannelRevenue) * 100;
              const topClass = index === 0 ? 'top-1' : index === 1 ? 'top-2' : index === 2 ? 'top-3' : '';
              const barColor = getChannelColor(c.name);
              return `
                <div class="rank-item">
                  <div class="rank-item-info">
                    <div class="rank-number ${topClass}">${index + 1}</div>
                    <div class="rank-details">
                      <span class="rank-name">${c.name}</span>
                      <div class="rank-progress-container">
                        <div class="rank-progress-bar" style="width: ${pct}%; background-color: ${barColor};"></div>
                      </div>
                    </div>
                  </div>
                  <div class="rank-values">
                    <span class="rank-val-primary">฿${Math.round(c.revenue).toLocaleString()}</span>
                    <span class="rank-val-secondary">${c.count.toLocaleString()} ออเดอร์ซื้อซ้ำ</span>
                  </div>
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
