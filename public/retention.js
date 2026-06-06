// public/retention.js

function renderRetention(filteredData, rawData) {
  const container = document.getElementById('view-retention');
  
  if (!filteredData || filteredData.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:50px; color:#999;">No data available. Please adjust filters or load data.</div>';
    return;
  }

  // 1. Inject CSS Styles
  if (!document.getElementById('retention-styles')) {
    const style = document.createElement('style');
    style.id = 'retention-styles';
    style.innerHTML = `
      .retention-container {
        font-family: 'Inter', 'Outfit', sans-serif;
        color: #334155;
      }
      .retention-header {
        background-color: #0b2240;
        color: white;
        padding: 20px 30px;
        border-radius: 12px;
        margin-bottom: 25px;
      }
      .retention-header h2 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.5px; }
      .retention-header p { margin: 5px 0 0 0; font-size: 13px; color: #94a3b8; }
      
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
        padding: 20px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.02);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .retention-kpi-info { display: flex; flex-direction: column; gap: 4px; }
      .retention-kpi-lbl { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
      .retention-kpi-val { font-size: 24px; font-weight: 700; color: #0f172a; }
      .retention-kpi-icon {
        width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px;
      }
      
      .retention-layout-grid {
        display: grid;
        grid-template-columns: 1.5fr 1fr;
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
        font-size: 16px; font-weight: 700; color: #1e293b; margin: 0 0 20px 0; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;
        display: flex; justify-content: space-between; align-items: center;
      }
      .retention-card-subtitle { font-size: 11px; font-weight: normal; color: #64748b; margin-top: 4px; text-transform: none; }
      
      /* Monthly product grid */
      .monthly-prod-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 15px;
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
        border-radius: 12px;
        padding: 15px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        transition: transform 0.2s, box-shadow 0.2s;
      }
      .monthly-prod-box:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 10px rgba(0,0,0,0.04);
        border-color: #cbd5e1;
      }
      .month-name-lbl { font-size: 12px; font-weight: 800; color: #d95f1d; text-transform: uppercase; }
      .month-prod-name { font-size: 13px; font-weight: 700; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .month-prod-stat { font-size: 11px; color: #64748b; font-weight: 500; }
      
      /* Lists and rankings styling */
      .rank-list { display: flex; flex-direction: column; gap: 15px; }
      .rank-item { display: flex; align-items: center; justify-content: space-between; padding-bottom: 12px; border-bottom: 1px solid #f8fafc; }
      .rank-item:last-child { border-bottom: none; padding-bottom: 0; }
      .rank-item-info { display: flex; align-items: center; gap: 12px; flex-grow: 1; min-width: 0; }
      .rank-number {
        width: 24px; height: 24px; border-radius: 50%; background: #e2e8f0; color: #475569; font-size: 11px; font-weight: 700;
        display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      }
      .rank-number.top-1 { background: #fdf1e6; color: #d95f1d; }
      .rank-number.top-2 { background: #eff6ff; color: #2563eb; }
      .rank-number.top-3 { background: #ecfdf5; color: #059669; }
      
      .rank-details { display: flex; flex-direction: column; gap: 2px; flex-grow: 1; min-width: 0; }
      .rank-name { font-size: 13px; font-weight: 700; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .rank-progress-container { width: 100%; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; margin-top: 4px; }
      .rank-progress-bar { height: 100%; border-radius: 3px; }
      
      .rank-values { text-align: right; flex-shrink: 0; display: flex; flex-direction: column; gap: 2px; padding-left: 15px; }
      .rank-val-primary { font-size: 13px; font-weight: 700; color: #0f172a; }
      .rank-val-secondary { font-size: 11px; color: #64748b; font-weight: 500; }
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
    const firstDate = globalFirstPurchase[id];
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
  
  const repeatRate = uniqueBuyers.size === 0 ? 0 : (totalCount / uniqueBuyers.size);
  const repeatBuyerPct = uniqueBuyers.size === 0 ? 0 : (repeatBuyers.size / uniqueBuyers.size) * 100;

  // 4. Group repeat purchases by Product
  // Overall Year Top Products
  const annualProdMap = {};
  repeatOrders.forEach(row => {
    const prod = window.getRowValue(row, ['ชื่อสินค้า', 'Product', 'รายการขาย', 'Product Set']) || 'Other';
    const revStr = window.getRowValue(row, ['ยอดขาย', 'ราคาสินค้ายังไม่รวมภาษี', 'Net Sales', 'Revenue', 'Amount', 'ยอดโอน']) || '0';
    const rev = parseFloat(revStr.replace(/,/g, ''));
    
    if (!annualProdMap[prod]) {
      annualProdMap[prod] = { name: prod, count: 0, revenue: 0 };
    }
    annualProdMap[prod].count++;
    if (!isNaN(rev)) annualProdMap[prod].revenue += rev;
  });

  const rankedProducts = Object.values(annualProdMap).sort((a, b) => b.count - a.count);
  const maxProductCount = rankedProducts.length > 0 ? rankedProducts[0].count : 1;

  // Monthly Top Repeat Products
  const monthlyProdMap = {}; // 1-12 -> { prodName -> { count, revenue } }
  for (let m = 1; m <= 12; m++) {
    monthlyProdMap[m] = {};
  }

  repeatOrders.forEach(row => {
    const dateStr = window.getRowValue(row, ['วันที่สร้าง', 'วันที่โอนเงิน', 'OrderDate', 'Date', 'วันที่']);
    if (!dateStr) return;
    const d = parseD(dateStr);
    if (!d || d.m < 1 || d.m > 12) return;
    
    const prod = window.getRowValue(row, ['ชื่อสินค้า', 'Product', 'รายการขาย', 'Product Set']) || 'Other';
    const revStr = window.getRowValue(row, ['ยอดขาย', 'ราคาสินค้ายังไม่รวมภาษี', 'Net Sales', 'Revenue', 'Amount', 'ยอดโอน']) || '0';
    const rev = parseFloat(revStr.replace(/,/g, ''));

    if (!monthlyProdMap[d.m][prod]) {
      monthlyProdMap[d.m][prod] = { count: 0, revenue: 0 };
    }
    monthlyProdMap[d.m][prod].count++;
    if (!isNaN(rev)) monthlyProdMap[d.m][prod].revenue += rev;
  });

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
      revenue: monthlyProdMap[m][name].revenue
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

  // 6. Build Page HTML
  let html = `
    <div class="retention-container">
      <div class="retention-header">
        <h2>Customer Retention Analysis</h2>
        <p>สถิติการสั่งซื้อซ้ำ การจัดอันดับสินค้าที่ยอดซื้อซ้ำสูงสุด และช่องทางที่ขับเคลื่อนการกลับมาซื้อซ้ำของลูกค้า</p>
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
                <div class="retention-card-subtitle">สินค้าอันดับ 1 ที่ลูกค้าซื้อซ้ำมากที่สุดในแต่ละเดือน</div>
              </div>
              <i class="fas fa-calendar-alt" style="color: #d95f1d;"></i>
            </h3>
            <div class="monthly-prod-grid">
              ${monthlyTopProducts.map(m => {
                if (m.topProduct) {
                  return `
                    <div class="monthly-prod-box">
                      <span class="month-name-lbl">${m.monthName}</span>
                      <span class="month-prod-name" title="${m.topProduct.name}">${m.topProduct.name}</span>
                      <span class="month-prod-stat">
                        <i class="fas fa-repeat" style="font-size:10px; margin-right:4px;"></i>
                        <b>${m.topProduct.count}</b> ซื้อซ้ำ (฿${Math.round(m.topProduct.revenue).toLocaleString()})
                      </span>
                    </div>
                  `;
                } else {
                  return `
                    <div class="monthly-prod-box" style="opacity: 0.6;">
                      <span class="month-name-lbl">${m.monthName}</span>
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
                อันดับสินค้าซื้อซ้ำสูงสุดรายปี (YTD)
                <div class="retention-card-subtitle">จัดอันดับผลิตภัณฑ์ตามจำนวนครั้งสั่งซื้อซ้ำสะสม</div>
              </div>
              <i class="fas fa-medal" style="color: #f59e0b;"></i>
            </h3>
            <div class="rank-list">
              ${rankedProducts.length === 0 ? `
                <div style="text-align:center; padding: 20px; color:#999; font-style:italic;">ไม่มีข้อมูลการซื้อซ้ำในส่วนผลิตภัณฑ์</div>
              ` : rankedProducts.slice(0, 5).map((p, index) => {
                const pct = (p.count / maxProductCount) * 100;
                const topClass = index === 0 ? 'top-1' : index === 1 ? 'top-2' : index === 2 ? 'top-3' : '';
                return `
                  <div class="rank-item">
                    <div class="rank-item-info">
                      <div class="rank-number ${topClass}">${index + 1}</div>
                      <div class="rank-details">
                        <span class="rank-name" title="${p.name}">${p.name}</span>
                        <div class="rank-progress-container">
                          <div class="rank-progress-bar" style="width: ${pct}%; background-color: #d95f1d;"></div>
                        </div>
                      </div>
                    </div>
                    <div class="rank-values">
                      <span class="rank-val-primary">${p.count.toLocaleString()} ออเดอร์ซื้อซ้ำ</span>
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
              <div class="retention-card-subtitle">เรียงลำดับช่องทางที่ทำยอดซื้อซ้ำได้มากที่สุด</div>
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
