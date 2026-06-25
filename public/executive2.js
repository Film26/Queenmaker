// public/executive2.js
function renderExecutive2(filteredData, rawData) {
  const container = document.getElementById('view-executive2');
  
  // เลือกแหล่งข้อมูลที่สมบูรณ์ที่สุด
  const dataSrc = (rawData && rawData.length > 0) ? rawData : (filteredData || []);

  if (!dataSrc || dataSrc.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:50px; color:#999;">No data available. Please adjust filters or load data.</div>';
    return;
  }

  // Inject CSS if not exists
  if (!document.getElementById('exec2-styles')) {
    const style = document.createElement('style');
    style.id = 'exec2-styles';
    style.innerHTML = `
      .exec2-cards { display: flex; flex-wrap: wrap; gap: 15px; margin-bottom: 30px; }
      .exec2-card {
        flex: 1; min-width: 200px; background: #fff; border-radius: 8px; padding: 15px;
        box-shadow: 0 4px 10px rgba(0,0,0,0.05); display: flex; align-items: center;
      }
      .exec2-card.vanguard { border-left: 4px solid #2684ff; }
      .exec2-card.migration { border-left: 4px solid #13ce66; }
      .exec2-card.retention { border-left: 4px solid #ff9900; }
      .exec2-card.cashcow { border-left: 4px solid #ff4949; }

      .exec2-card-dot {
        width: 18px; height: 18px; border-radius: 50%; margin-right: 15px; flex-shrink: 0;
        box-shadow: inset 0 2px 4px rgba(0,0,0,0.2), 0 2px 4px rgba(0,0,0,0.1);
      }
      .dot-vanguard { background: linear-gradient(135deg, #4ea3ff, #2684ff); }
      .dot-migration { background: linear-gradient(135deg, #42e88a, #13ce66); }
      .dot-retention { background: linear-gradient(135deg, #ffb732, #ff9900); }
      .dot-cashcow { background: linear-gradient(135deg, #ff7272, #ff4949); }

      .exec2-card-text { display: flex; flex-direction: column; }
      .exec2-card-title { font-weight: 700; font-size: 14px; color: #333; }
      .exec2-card-sub { font-size: 11px; color: #888; margin-top: 4px; }

      .exec2-table-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
      .exec2-table-header h3 { margin: 0; font-size: 16px; color: #222; }
      .month-label { font-size: 14px; font-weight: 700; color: #d95f1d; }

      .exec2-table-wrapper {
        background: #fff; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.03); overflow-x: auto;
      }
      .exec2-table {
        width: 100%; border-collapse: collapse; font-family: 'Inter', sans-serif;
      }
      .exec2-table th, .exec2-table td { padding: 15px 20px; text-align: left; border-bottom: 1px solid #f2f2f2; }
      .exec2-table th { color: #777; font-weight: 600; font-size: 13px; background: #fff; white-space: nowrap; }
      .exec2-table td { color: #333; font-size: 14px; font-weight: 500; }
      .exec2-table tr:hover td { background-color: #fafafa; }
      .exec2-table tr:last-child td { border-bottom: none; }

      .exec2-badge {
        display: inline-flex; align-items: center; padding: 6px 12px;
        border-radius: 20px; font-size: 12px; font-weight: 700; border: 1px solid transparent;
      }
      .badge-vanguard { color: #2684ff; background: #ebf3ff; border-color: #b3d4ff; }
      .badge-migration { color: #13ce66; background: #e7fbf0; border-color: #a3f3c9; }
      .badge-retention { color: #ff9900; background: #fff8eb; border-color: #ffd699; }
      .badge-cashcow { color: #ff4949; background: #ffebeb; border-color: #ffb3b3; }
      .badge-dot { width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; box-shadow: inset 0 1px 2px rgba(0,0,0,0.1); }
    `;
    document.head.appendChild(style);
  }

  // ฟังก์ชันกลางดึงค่าหัวคอลัมน์
  function getFlexibleValue(row, keysArray) {
    if (!row) return '';
    const rowKeys = Object.keys(row);
    for (let targetKey of keysArray) {
      const cleanTarget = targetKey.toLowerCase().replace(/[\s_\-]+/g, '');
      for (let rKey of rowKeys) {
        const cleanRowKey = rKey.toLowerCase().replace(/[\s_\-]+/g, '');
        if (cleanRowKey === cleanTarget) return row[rKey];
      }
    }
    return '';
  }

  // ฟังก์ชันจัดกลุ่มแชนเนล
  function getExec2Group(row) {
    let rawCh = getFlexibleValue(row, ['ช่องทาง', 'channel', 'platform']);
    let chStr = (rawCh || '').toString().trim().toLowerCase();
    
    if (chStr.includes('line') || chStr.includes('ไลน์')) return 'Line';
    if (chStr.includes('phone') || chStr.includes('call') || chStr.includes('โทร')) return 'Call';
    if (chStr.includes('tiktok') || chStr.includes('tt')) return 'Tiktok';
    if (chStr.includes('lazada')) return 'Lazada';
    if (chStr.includes('shopee')) return 'Shopee';
    if (chStr.includes('facebook') || chStr === 'fb') return 'Facebook';
    if (chStr.includes('crm')) return 'CRM';
    if (chStr.includes('instagram') || chStr === 'ig') return 'Instagram';
    
    return 'Other';
  }

  // ฟังก์ชันแปลงวันที่
  const parseD = (dateStr) => {
    if (!dateStr) return null;
    const datePart = dateStr.toString().trim().split(' ')[0];
    let parts = datePart.split('/');
    if (parts.length < 3) parts = datePart.split('-');
    
    if (parts.length >= 3) {
      let p0 = parseInt(parts[0], 10);
      let p1 = parseInt(parts[1], 10);
      let p2 = parseInt(parts[2], 10);
      if (isNaN(p0) || isNaN(p1) || isNaN(p2)) return null;
      let y, m, d;
      if (p0 > 1000) { y = p0; m = p1; d = p2; } 
      else if (p2 > 1000) { d = p0; m = p1; y = p2; } 
      else { d = p0; m = p1; y = p2; if (y < 2000) y += 2000; }
      if (y > 2500) y -= 543;
      return { y, m, d, val: y * 10000 + m * 100 + d, monthNum: m, str: `${y}-${m.toString().padStart(2, '0')}` };
    }
    return null;
  };

  // ตรวจสอบออเดอร์
  function isLocalSaleOrder(row) {
    if (!row) return false;
    let revenueStr = getFlexibleValue(row, ['ยอดโอน', 'ราคารวม', 'ยอดขาย', 'ราคาสุทธิ']);
    let revenue = parseFloat((revenueStr || '0').toString().replace(/,/g, '').trim());
    return (!isNaN(revenue) && revenue > 0);
  }

  function getLocalCustomerId(row) {
    let addr = getFlexibleValue(row, ['ที่อยู่ (ลูกค้า)', 'ที่อยู่', 'address']);
    if (addr) return addr.toString().toLowerCase().replace(/[\s\r\n\t\-,\.\/\\_]+/g, '');
    let cid = getFlexibleValue(row, ['รหัสลูกค้า', 'customerid', 'phone', 'Phone']);
    return cid ? cid.toString().trim() : '';
  }

  // 1. ตรวจสอบประวัติซื้อครั้งแรก
  const localGlobalFirstPurchase = {};
  const localChFirstPurchase = {};

  dataSrc.forEach(row => {
    if (!isLocalSaleOrder(row)) return;
    const id = getLocalCustomerId(row);
    const dateStr = getFlexibleValue(row, ['วันที่โอนเงิน', 'วันที่สร้าง', 'orderdate', 'date', 'วันที่']);
    if (!id || !dateStr) return;
    const d = parseD(dateStr);
    if (!d) return;

    if (!localGlobalFirstPurchase[id] || d.val < localGlobalFirstPurchase[id]) {
      localGlobalFirstPurchase[id] = d.val;
    }
    const ch = getExec2Group(row);
    const chKey = id + '_' + ch;
    if (!localChFirstPurchase[chKey] || d.val < localChFirstPurchase[chKey]) {
      localChFirstPurchase[chKey] = d.val;
    }
  });

  // 2. เตรียมโครงสร้าง 9 แชนเนล
  const allowedChannels = ['Call', 'CRM', 'Facebook', 'Instagram', 'Lazada', 'Line', 'Other', 'Shopee', 'Tiktok'];
  const agg = {};
  allowedChannels.forEach(ch => {
    agg[ch] = { revenue: 0, orders: 0, uniqueBuyers: new Set(), retainedBuyers: new Set(), newGlobalBuyers: new Set(), newToSubBuyers: new Set() };
  });

  // 3. คำนวณรายได้โดยปลดล็อก Filter วันที่ออกไปเพื่อให้ประมวลผลได้ทันที
  dataSrc.forEach(row => {
    if (!isLocalSaleOrder(row)) return;
    
    const dateStr = getFlexibleValue(row, ['วันที่โอนเงิน', 'วันที่สร้าง', 'orderdate', 'date', 'วันที่']);
    if (!dateStr) return;
    const d = parseD(dateStr);
    if (!d) return;

    const ch = getExec2Group(row);
    const id = getLocalCustomerId(row);
    const revenueStr = getFlexibleValue(row, ['ยอดโอน', 'ราคารวม', 'ยอดขาย']);
    const rev = parseFloat((revenueStr || '0').toString().replace(/,/g, '').trim()) || 0;

    let targetCh = agg[ch] ? ch : 'Other';
    
    agg[targetCh].revenue += rev;
    agg[targetCh].orders += 1;
    if (id) agg[targetCh].uniqueBuyers.add(id);

    if (id) {
      if (localGlobalFirstPurchase[id] && localGlobalFirstPurchase[id] < d.val) {
        agg[targetCh].retainedBuyers.add(id);
      } else {
        agg[targetCh].newGlobalBuyers.add(id);
      }

      const chKey = id + '_' + targetCh;
      if (localChFirstPurchase[chKey] === d.val) {
        if (!agg[targetCh].newGlobalBuyers.has(id)) {
          agg[targetCh].newToSubBuyers.add(id);
        }
      }
    }
  });

  // 4. สรุปผลลัพธ์เพื่อนำไปจัดเกณฑ์
  const results = allowedChannels.map(ch => {
    const data = agg[ch];
    const buyers = data.uniqueBuyers.size;
    const newCust = data.newGlobalBuyers.size;
    const newToChannel = data.newToSubBuyers.size;
    
    const pctNew = buyers === 0 ? 0 : (newCust / buyers) * 100;
    const pctMig = buyers === 0 ? 0 : (newToChannel / buyers) * 100;
    
    let category = ''; let categoryClass = ''; let dotClass = '';
    const totalNewAndMig = pctNew + pctMig;
    
    if (buyers === 0) {
      category = 'Retention Hub'; categoryClass = 'badge-retention'; dotClass = 'dot-retention';
    } else if (pctNew > 70) {
      category = 'Vanguard (ทัพหน้า)'; categoryClass = 'badge-vanguard'; dotClass = 'dot-vanguard';
    } else if (pctMig > 70) {
      category = 'Migration Hub'; categoryClass = 'badge-migration'; dotClass = 'dot-migration';
    } else if (totalNewAndMig < 30) {
      category = 'Cash Cow (เสือนอนกิน)'; categoryClass = 'badge-cashcow'; dotClass = 'dot-cashcow';
    } else {
      category = 'Retention Hub'; categoryClass = 'badge-retention'; dotClass = 'dot-retention';
    }

    return {
      channel: ch, revenue: data.revenue, buyers: buyers, newCust: newCust,
      newToSub: newToChannel, pctMig: pctMig, pctNew: pctNew,
      category: category, categoryClass: categoryClass, dotClass: dotClass
    };
  });

  // เรียงลำดับตามยอดขายสูงสุด
  results.sort((a, b) => b.revenue - a.revenue);

  const fmtNum = (num) => (Number(num) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const fmtPct = (num) => (Number(num) || 0).toFixed(0) + '%';
  const currentMonthLabel = "All Available Months Data";

  // 5. พ่น HTML ออกแดชบอร์ด
  let html = `
    <div class="exec2-cards">
      <div class="exec2-card vanguard">
        <div class="exec2-card-dot dot-vanguard"></div>
        <div class="exec2-card-text">
          <span class="exec2-card-title">Vanguard (ทัพหน้า)</span>
          <span class="exec2-card-sub">หาคนใหม่เก่งมาก (>70%)</span>
        </div>
      </div>
      <div class="exec2-card migration">
        <div class="exec2-card-dot dot-migration"></div>
        <div class="exec2-card-text">
          <span class="exec2-card-title">Migration Hub</span>
          <span class="exec2-card-sub">จุดรับแขกเก่า (>70%)</span>
        </div>
      </div>
      <div class="exec2-card retention">
        <div class="exec2-card-dot dot-retention"></div>
        <div class="exec2-card-text">
          <span class="exec2-card-title">Retention Hub</span>
          <span class="exec2-card-sub">ถังเก็บลูกค้า (>30%)</span>
        </div>
      </div>
      <div class="exec2-card cashcow">
        <div class="exec2-card-dot dot-cashcow"></div>
        <div class="exec2-card-text">
          <span class="exec2-card-title">Cash Cow</span>
          <span class="exec2-card-sub">เสือนอนกิน (<30%)</span>
        </div>
      </div>
    </div>

    <div class="exec2-table-header">
      <h3>ความหมายเชิงกลยุทธ์ (Strategic Meaning)</h3>
      <span class="month-label">${currentMonthLabel}</span>
    </div>

    <div class="exec2-table-wrapper">
      <table class="exec2-table">
        <thead>
          <tr>
            <th>Channel</th>
            <th>Revenue</th>
            <th>Buyers</th>
            <th>New Customers</th>
            <th>New-to-Channel</th>
            <th>% Migration</th>
            <th>% New Share</th>
            <th>Category</th>
          </tr>
        </thead>
        <tbody>
  `;

  results.forEach(r => {
    html += `
      <tr>
        <td style="font-weight: 700;">${r.channel}</td>
        <td style="color: #2c3e50; font-weight: bold;">฿${fmtNum(r.revenue)}</td>
        <td>${fmtNum(r.buyers)}</td>
        <td>${fmtNum(r.newCust)}</td>
        <td>${fmtNum(r.newToSub)}</td>
        <td>${fmtPct(r.pctMig)}</td>
        <td>${fmtPct(r.pctNew)}</td>
        <td>
          <span class="exec2-badge ${r.categoryClass}">
            <span class="badge-dot ${r.dotClass}"></span>
            ${r.category}
          </span>
        </td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;
}
