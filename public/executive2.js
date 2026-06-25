// public/executive2.js
function renderExecutive2(filteredData, rawData) {
  const container = document.getElementById('view-executive2');
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

  function extractValueByKeys(row, possibleKeys) {
    if (!row) return '';
    const keys = Object.keys(row);
    for (let pKey of possibleKeys) {
      const cleanPKey = pKey.toLowerCase().replace(/[\s_\-]+/g, '');
      for (let k of keys) {
        if (k.toLowerCase().replace(/[\s_\-]+/g, '') === cleanPKey) return row[k];
      }
    }
    return '';
  }

  function extractRevenue(row) {
    let rawVal = extractValueByKeys(row, ['ยอดโอน', 'ยอดขาย', 'ราคารวม', 'ราคาสุทธิ', 'revenue']);
    if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
      let parsed = parseFloat(rawVal.toString().replace(/,/g, '').trim());
      if (!isNaN(parsed)) return parsed;
    }
    return 0;
  }

  function getExec2Group(row) {
    let rawCh = extractValueByKeys(row, ['ช่องทาง', 'channel', 'platform']);
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

  function getLocalCustomerId(row) {
    let cid = extractValueByKeys(row, ['รหัสลูกค้า', 'customerid', 'customer id', 'รหัสลูกค้า (ลูกค้า) ไม่ใช้']);
    if (cid) return cid.toString().trim();
    let phone = extractValueByKeys(row, ['phone', 'เบอร์โทร']);
    if (phone) return phone.toString().trim();
    let addr = extractValueByKeys(row, ['ที่อยู่ (ลูกค้า)', 'ที่อยู่']);
    return addr ? addr.toString().toLowerCase().replace(/[\s\r\n\t\-,\.\/\\_]+/g, '') : '';
  }

  const parseD = (dateStr) => {
    if (!dateStr) return null;
    const datePart = dateStr.toString().trim().split(' ')[0];
    let parts = datePart.split('-');
    if (parts.length < 3) parts = datePart.split('/');
    if (parts.length >= 3) {
      let p0 = parseInt(parts[0], 10);
      let p1 = parseInt(parts[1], 10);
      let p2 = parseInt(parts[2], 10);
      if (isNaN(p0) || isNaN(p1) || isNaN(p2)) return null;
      let y, m, d;
      if (p0 > 1000) { y = p0; m = p1; d = p2; } 
      else { d = p0; m = p1; y = p2; if (y < 2000) y += 2000; }
      if (y > 2500) y -= 543;
      return { y, m, d, val: y * 10000 + m * 100 + d, monthNum: m };
    }
    return null;
  };

  // 1. คำนวณหา วันที่ซื้อครั้งแรก ของลูกค้าแต่ละรายในไฟล์จริง
  const customerFirstDates = {};      // วันแรกสุดที่ลูกค้าเคยซื้อในชีวิต
  const customerChannelFirstDates = {}; // วันแรกสุดที่ลูกค้าเคยซื้อในช่องทางนั้น ๆ

  dataSrc.forEach(row => {
    const id = getLocalCustomerId(row);
    if (!id) return;
    const dateStr = extractValueByKeys(row, ['วันที่โอนเงิน', 'วันที่สร้าง', 'orderdate', 'date', 'วันที่']);
    const d = parseD(dateStr);
    if (!d) return;

    // หาประวัติวันแรกของระดับแบรนด์
    if (!customerFirstDates[id] || d.val < customerFirstDates[id]) {
      customerFirstDates[id] = d.val;
    }

    // หาประวัติวันแรกของระดับแชนเนล
    const ch = getExec2Group(row);
    const chKey = `${id}_${ch}`;
    if (!customerChannelFirstDates[chKey] || d.val < customerChannelFirstDates[chKey]) {
      customerChannelFirstDates[chKey] = d.val;
    }
  });

  // 2. ตั้งถังเก็บสถิติแยกแชนเนล
  const allowedChannels = ['Call', 'CRM', 'Facebook', 'Instagram', 'Lazada', 'Line', 'Other', 'Shopee', 'Tiktok'];
  const agg = {};
  allowedChannels.forEach(ch => {
    agg[ch] = { revenue: 0, buyers: new Set(), newCustCount: 0, migrationCount: 0 };
  });

  // 3. เริ่มสแกนจริงเพื่อหาว่าพฤติกรรมลูกค้าเป็นแบบไหน
  dataSrc.forEach(row => {
    const rev = extractRevenue(row);
    const ch = getExec2Group(row);
    const id = getLocalCustomerId(row);
    const dateStr = extractValueByKeys(row, ['วันที่โอนเงิน', 'วันที่สร้าง', 'orderdate', 'date', 'วันที่']);
    const d = parseD(dateStr);

    let targetCh = agg[ch] ? ch : 'Other';
    agg[targetCh].revenue += rev;
    if (id) agg[targetCh].buyers.add(id);

    if (id && d) {
      const globalFirst = customerFirstDates[id];
      const chFirst = customerChannelFirstDates[`${id}_${targetCh}`];

      // ลูกค้าใหม่แท้ (วันแรกที่ซื้อตรงกับวันในบิลนี้พอดี)
      if (globalFirst === d.val) {
        agg[targetCh].newCustCount += 1;
      } 
      // ลูกค้าเก่า แต่พึ่งย้ายค่ายมาซื้อช่องทางนี้ครั้งแรก (Migration)
      else if (chFirst === d.val) {
        agg[targetCh].migrationCount += 1;
      }
    }
  });

  // 4. แปลงผลลัพธ์เข้า Matrix ตัดเกรดกลยุทธ์ตามสัดส่วนจริง
  const results = allowedChannels.map(ch => {
    const data = agg[ch];
    const buyersCount = data.buyers.size;
    
    // คำนวณ % จริงจากพฤติกรรมในฐานข้อมูล
    const pctNew = buyersCount === 0 ? 0 : (data.newCustCount / buyersCount) * 100;
    const pctMig = buyersCount === 0 ? 0 : (data.migrationCount / buyersCount) * 100;
    const totalShare = pctNew + pctMig;

    let category = ''; let categoryClass = ''; let dotClass = '';
    
    if (buyersCount === 0 || data.revenue === 0) {
      category = 'Retention Hub'; categoryClass = 'badge-retention'; dotClass = 'dot-retention';
    } else if (pctNew > 50) { // ปรับเกณฑ์ทัพหน้าให้ไวขึ้นเล็กน้อยตามธรรมชาติไฟล์จริง
      category = 'Vanguard (ทัพหน้า)'; categoryClass = 'badge-vanguard'; dotClass = 'dot-vanguard';
    } else if (pctMig > 40) {
      category = 'Migration Hub'; categoryClass = 'badge-migration'; dotClass = 'dot-migration';
    } else if (totalShare < 25) {
      category = 'Cash Cow (เสือนอนกิน)'; categoryClass = 'badge-cashcow'; dotClass = 'dot-cashcow';
    } else {
      category = 'Retention Hub'; categoryClass = 'badge-retention'; dotClass = 'dot-retention';
    }

    return {
      channel: ch, revenue: data.revenue, buyers: buyersCount, 
      newCust: data.newCustCount, newToSub: data.migrationCount, 
      pctMig: pctMig, pctNew: pctNew,
      category: category, categoryClass: categoryClass, dotClass: dotClass
    };
  });

  results.sort((a, b) => b.revenue - a.revenue);

  const fmtNum = (num) => (Number(num) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const fmtPct = (num) => (Number(num) || 0).toFixed(0) + '%';

  let html = `
    <div class="exec2-cards">
      <div class="exec2-card vanguard">
        <div class="exec2-card-dot dot-vanguard"></div>
        <div class="exec2-card-text">
          <span class="exec2-card-title">Vanguard (ทัพหน้า)</span>
          <span class="exec2-card-sub">หาคนใหม่เก่งมาก (>50%)</span>
        </div>
      </div>
      <div class="exec2-card migration">
        <div class="exec2-card-dot dot-migration"></div>
        <div class="exec2-card-text">
          <span class="exec2-card-title">Migration Hub</span>
          <span class="exec2-card-sub">จุดรับแขกเก่า (>40%)</span>
        </div>
      </div>
      <div class="exec2-card retention">
        <div class="exec2-card-dot dot-retention"></div>
        <div class="exec2-card-text">
          <span class="exec2-card-title">Retention Hub</span>
          <span class="exec2-card-sub">ถังเก็บลูกค้า</span>
        </div>
      </div>
      <div class="exec2-card cashcow">
        <div class="exec2-card-dot dot-cashcow"></div>
        <div class="exec2-card-text">
          <span class="exec2-card-title">Cash Cow</span>
          <span class="exec2-card-sub">เสือนอนกิน (<25%)</span>
        </div>
      </div>
    </div>

    <div class="exec2-table-header">
      <h3>ความหมายเชิงกลยุทธ์ (Strategic Meaning)</h3>
      <span class="month-label">Real-time Data Assessment</span>
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
