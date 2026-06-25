// public/executive2.js
function renderExecutive2(filteredData, rawData) {
  const container = document.getElementById('view-executive2');
  
  if (!filteredData || filteredData.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:50px; color:#999;">No data available. Please adjust filters or load data.</div>';
    return;
  }

  // Inject CSS if not exists to bypass browser cache issues for styles.css
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

  // 🚨 ล็อกรายชื่อ 9 ช่องทางหลักตามที่คุณเลือก
  const allowedChannels = ['Call', 'CRM', 'Facebook', 'Instagram', 'Lazada', 'Line', 'Other', 'Shopee', 'Tiktok'];

  function getExec2Group(row) {
    const getVal = window.getRowValue || ((r, keys) => r[keys[0]]);
    // ขยายการค้นหาหัวคอลัมน์ให้ครอบคลุมมากขึ้นเพื่อกันพลาด
    let rawCh = getVal(row, ['ช่องทาง', 'Channel', 'Platform', 'Marketplace', 'ช่องทางการขาย']);
    
    // ส่งเข้าฟังก์ชันกลางก่อน
    let ch = window.getNormalizedChannel ? window.getNormalizedChannel(rawCh) : '';
    if (!ch) ch = (rawCh || '').toString().trim();
    
    let lower = ch.toLowerCase();
    
    // ดักจับจับกลุ่มคำพ้องความหมายโดยไม่สนใจตัวพิมพ์เล็ก-ใหญ่ และรองรับภาษาไทย
    if (lower.includes('facebook') || lower.includes('fb') || lower.includes('เพจ')) return 'Facebook';
    if (lower.includes('line') || lower.includes('ไลน์')) return 'Line';
    if (lower.includes('call') || lower.includes('โทร') || lower.includes('tele')) return 'Call';
    if (lower.includes('crm')) return 'CRM';
    if (lower.includes('lazada') || lower.includes('ลาซาด้า')) return 'Lazada';
    if (lower.includes('shopee') || lower.includes('ช้อปปี้')) return 'Shopee';
    if (lower.includes('tiktok') || lower.includes('ติ๊กต๊อก') || lower.includes('tt')) return 'Tiktok';
    if (lower.includes('instagram') || lower.includes('ig')) return 'Instagram';
    if (lower.includes('website') || lower.includes('เว็บ')) return 'Website';
    
    return 'Other';
  }

  // Determine Channel first purchase dates globally (using ALL raw data)
  if (!window.chFirstPurchase) {
    window.chFirstPurchase = {};
    if (rawData && rawData.length > 0) {
      rawData.forEach(row => {
        if (window.isSaleOrder && !window.isSaleOrder(row)) return;
        const getVal = window.getRowValue || ((r, keys) => r[keys[0]]);
        const id = window.getCustomerUniqueId ? window.getCustomerUniqueId(row) : getVal(row, ['Customer ID', 'รหัสลูกค้า', 'Phone', 'phone']);
        const ch = getExec2Group(row);
        const dateStr = getVal(row, ['วันที่สร้าง', 'วันที่โอนเงิน', 'OrderDate', 'Date', 'วันที่']);
        if (!id || !dateStr) return;
        const d = parseD(dateStr);
        if (!d) return;
        const key = id + '_' + ch;
        if (!window.chFirstPurchase[key] || d.val < window.chFirstPurchase[key]) {
          window.chFirstPurchase[key] = d.val;
        }
      });
    }
  }
  const chFirstPurchase = window.chFirstPurchase;

  // Aggregate data by Channel for the CURRENTLY FILTERED data
  const agg = {};
  
  // ตั้งค่าเตรียมพื้นที่ให้กับทั้ง 9 ช่องทางหลักล่วงหน้า
  allowedChannels.forEach(ch => {
    agg[ch] = { 
      revenue: 0, 
      orders: 0, 
      uniqueBuyers: new Set(), 
      retainedBuyers: new Set(), 
      newGlobalBuyers: new Set(), 
      newToSubBuyers: new Set() // (คีย์เวิร์ดระบบภายในนับเป็น New-to-Channel)
    };
  });
  
  filteredData.forEach(row => {
    let ch = getExec2Group(row);
    if (!agg[ch]) ch = 'Other';
    
    const getVal = window.getRowValue || ((r, keys) => r[keys[0]]);
    const id = window.getCustomerUniqueId ? window.getCustomerUniqueId(row) : getVal(row, ['Customer ID', 'รหัสลูกค้า', 'Phone', 'phone']);
    const dateStr = getVal(row, ['วันที่สร้าง', 'วันที่โอนเงิน', 'OrderDate', 'Date', 'วันที่']);
    const revenueStr = getVal(row, ['ยอดขาย', 'ราคาสินค้ายังไม่รวมภาษี', 'Net Sales', 'Revenue', 'Amount', 'ยอดโอน']) || '0';
    
    // 🚨 สคริปต์ตรวจเช็กพิเศษ: เปิดหน้าจอ Inspect (F12) -> Console ดูว่ามีข้อมูลแชนเนลวิ่งเข้ามาไหม
    if (['CRM', 'Lazada', 'Shopee', 'Tiktok'].includes(ch)) {
       console.log(`[Exec2 Check] เจอแชนเนล ${ch}: ยอดเงินดิบ=${revenueStr}, ID=${id}, วันที่=${dateStr}`);
    }

    if (!id || !dateStr) return;
    const d = parseD(dateStr);
    if (!d) return;
    
    const rev = parseFloat((revenueStr || '0').toString().replace(/,/g, ''));
    agg[ch].revenue += isNaN(rev) ? 0 : rev;
    agg[ch].orders += 1;
    agg[ch].uniqueBuyers.add(id);

    // Global New vs Retained
    if (globalFirstPurchase && globalFirstPurchase[id]) {
      const firstDate = globalFirstPurchase[id];
      if (firstDate.val < d.val) {
        agg[ch].retainedBuyers.add(id);
      } else {
        agg[ch].newGlobalBuyers.add(id);
      }
    }

    // New-to-Channel (Migration) logic
    const key = id + '_' + ch;
    if (chFirstPurchase[key]) {
      if (chFirstPurchase[key] === d.val) {
        if (!agg[ch].newGlobalBuyers.has(id)) {
          agg[ch].newToSubBuyers.add(id);
        }
      }
    }
  });

  // Convert to array and calculate metrics
  const results = allowedChannels.map(ch => {
    const data = agg[ch];
    const buyers = data.uniqueBuyers.size;
    const newCust = data.newGlobalBuyers.size;
    const newToChannel = data.newToSubBuyers.size;
    
    const pctNew = buyers === 0 ? 0 : (newCust / buyers) * 100;
    const pctMig = buyers === 0 ? 0 : (newToChannel / buyers) * 100;
    
    // Categorization Logic
    let category = '';
    let categoryClass = '';
    let dotClass = '';
    
    const totalNewAndMig = pctNew + pctMig;
    
    if (buyers === 0) {
      category = 'No Data';
      categoryClass = 'badge-retention';
      dotClass = 'dot-retention';
    } else if (pctNew > 70) {
      category = 'Vanguard (ทัพหน้า)';
      categoryClass = 'badge-vanguard';
      dotClass = 'dot-vanguard';
    } else if (pctMig > 70) {
      category = 'Migration Hub';
      categoryClass = 'badge-migration';
      dotClass = 'dot-migration';
    } else if (totalNewAndMig < 30) {
      category = 'Cash Cow (เสือนอนกิน)';
      categoryClass = 'badge-cashcow';
      dotClass = 'dot-cashcow';
    } else {
      category = 'Retention Hub';
      categoryClass = 'badge-retention';
      dotClass = 'dot-retention';
    }

    return {
      channel: ch,
      revenue: data.revenue,
      buyers: buyers,
      newCust: newCust,
      newToSub: newToChannel,
      pctMig: pctMig,
      pctNew: pctNew,
      category: category,
      categoryClass: categoryClass,
      dotClass: dotClass
    };
  });

  // เรียงลำดับตารางตามยอดรายได้จากมากไปน้อย
  results.sort((a, b) => b.revenue - a.revenue);

  // Formatting helpers
  const fmtNum = (num) => (Number(num) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const fmtPct = (num) => (Number(num) || 0).toFixed(0) + '%';
  
  const currentMonthLabel = (window.filters && window.filters.Month !== 'All') 
    ? window.filters.Month 
    : 'All Months';

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
        <td>${fmtNum(r.revenue)}</td>
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
