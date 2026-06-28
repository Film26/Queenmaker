// public/executive2.js
function renderExecutive2(filteredData, rawData) {
  const container = document.getElementById('view-executive2');
  
  // ดึงแหล่งข้อมูลดิบหลัก
  const dataSrc = (rawData && rawData.length > 0) ? rawData : (filteredData || []);

  if (!dataSrc || dataSrc.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:50px; color:#999;">No data available. Please adjust filters or load data.</div>';
    return;
  }

  // Inject CSS ปรับแต่งดีไซน์
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

      .exec2-card-dot { width: 18px; height: 18px; border-radius: 50%; margin-right: 15px; flex-shrink: 0; }
      .dot-vanguard { background: #2684ff; }
      .dot-migration { background: #13ce66; }
      .dot-retention { background: #ff9900; }
      .dot-cashcow { background: #ff4949; }

      .exec2-card-text { display: flex; flex-direction: column; }
      .exec2-card-title { font-weight: 700; font-size: 13px; color: #333; }
      .exec2-card-sub { font-size: 11px; color: #888; margin-top: 4px; }

      .exec2-table-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
      .exec2-table-header h3 { margin: 0; font-size: 15px; color: #222; font-weight: 700; }
      .month-label { font-size: 13px; font-weight: 700; color: #d95f1d; }

      .exec2-table-wrapper { background: #fff; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.03); overflow-x: auto; }
      .exec2-table { width: 100%; border-collapse: collapse; font-family: 'Inter', sans-serif; }
      
      .exec2-table th, .exec2-table td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #f2f2f2; }
      .exec2-table th { color: #666; font-weight: 500; font-size: 13px; background: #fff; white-space: nowrap; }
      .exec2-table td { color: #333; font-size: 13px; font-weight: 400; }

      .exec2-badge { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
      .badge-vanguard { color: #2684ff; background: #ebf3ff; }
      .badge-migration { color: #13ce66; background: #e7fbf0; }
      .badge-retention { color: #ff9900; background: #fff8eb; }
      .badge-cashcow { color: #ff4949; background: #ffebeb; }
      .badge-dot { width: 6px; height: 6px; border-radius: 50%; margin-right: 5px; display: inline-block; }
    `;
    document.head.appendChild(style);
  }

  function getValue(row, keyName) {
    if (!row) return '';
    if (row[keyName] !== undefined && row[keyName] !== null) return row[keyName];
    const keys = Object.keys(row);
    for (let k of keys) {
      if (k.trim().toLowerCase() === keyName.trim().toLowerCase()) return row[k];
    }
    return '';
  }

  function extractRevenue(row) {
    let rawVal = getValue(row, 'Net Sales') || getValue(row, 'ยอดโอน') || getValue(row, 'ยอดขาย') || getValue(row, 'ราคาสินค้ายังไม่รวมภาษี');
    if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
      let parsed = parseFloat(rawVal.toString().replace(/,/g, '').trim());
      if (!isNaN(parsed)) return parsed;
    }
    return 0;
  }

  function getExec2Group(row) {
    let rawCh = (getValue(row, 'ช่องทาง') || getValue(row, 'Platform') || getValue(row, 'Channel') || getValue(row, 'Promotion') || '').toString().toUpperCase();
    let rawRemark = (getValue(row, 'Remark') || getValue(row, 'หมายเหตุ') || '').toString().toUpperCase();
    
    let chStr = `${rawCh} ${rawRemark}`.trim();
    
    // 💡 ค้นหาแบบ .includes ดักจับคำสั่งซื้อแพลตฟอร์ม แม้จะมีวันที่พ่วงท้ายมาก็ตาม
    if (chStr.includes('CRM')) return 'CRM';
    if (chStr.includes('SHOPEE') || chStr.includes('SHP') || chStr.includes('SP')) return 'Shopee';
    if (chStr.includes('LAZADA') || chStr.includes('LZD') || chStr.includes('LAZ')) return 'Lazada';
    if (chStr.includes('LINE')) return 'Line';
    if (chStr.includes('PHONE') || chStr.includes('CALL') || chStr.includes('โทร')) return 'Call';
    if (chStr.includes('TIKTOK') || chStr.includes('TT')) return 'Tiktok';
    if (chStr.includes('FACEBOOK') || chStr.includes('FB') || chStr.includes('เพจ')) return 'Facebook';
    if (chStr.includes('INSTAGRAM') || chStr.includes('IG')) return 'Instagram';
    
    return 'Other';
  }

  function getLocalCustomerId(row) {
    let cid = getValue(row, 'Customer ID') || getValue(row, 'Customer ID ');
    if (cid) return cid.toString().trim();
    let phone = getValue(row, 'Phone') || getValue(row, 'phone') || getValue(row, 'เบอร์โทร');
    if (phone) return phone.toString().trim();
    let name = getValue(row, 'CustomerName') || getValue(row, 'ชื่อลูกค้า');
    if (name) return name.toString().trim();
    return '';
  }

  // 💡 ปรับปรุงตัวถอดรหัสวันที่ (Date Parser) ให้ฉลาดขึ้น รองรับทั้ง ค.ศ. และ พ.ศ. (แบบ 2 หลัก เช่น /68)
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
      if (p0 > 1000) { 
        y = p0; m = p1; d = p2; 
      } else { 
        d = p0; m = p1; y = p2; 
        // ถ้าปีคริสต์ศักราชส่งมาเป็นเลข 2 หลัก เช่น 21 หรือ 25
        if (y < 100) {
          if (y >= 60) { // กรณีเป็น พ.ศ. สองหลักย่อ เช่น 68
            y += 2000 - 543; 
          } else {
            y += 2000;
          }
        }
      }
      if (y > 2500) y -= 543; // แปลง พ.ศ. เต็มให้เป็น ค.ศ.
      return { val: y * 10000 + m * 100 + d };
    }
    return null;
  };

  const customerFirstDates = {};
  const customerChannelFirstDates = {};

  dataSrc.forEach(row => {
    const rev = extractRevenue(row);
    if (rev <= 0) return;

    const id = getLocalCustomerId(row);
    if (!id) return;
    
    const dateStr = getValue(row, 'OrderDate') || getValue(row, 'OrderData') || getValue(row, 'วันที่โอนเงิน') || getValue(row, 'วันที่สร้าง');
    const d = parseD(dateStr);
    if (!d) return;

    if (!customerFirstDates[id] || d.val < customerFirstDates[id]) {
      customerFirstDates[id] = d.val;
    }
    const ch = getExec2Group(row);
    const chKey = `${id}_${ch}`;
    if (!customerChannelFirstDates[chKey] || d.val < customerChannelFirstDates[chKey]) {
      customerChannelFirstDates[chKey] = d.val;
    }
  });

  const allowedChannels = ['Call', 'CRM', 'Facebook', 'Instagram', 'Lazada', 'Line', 'Other', 'Shopee', 'Tiktok'];
  const agg = {};
  allowedChannels.forEach(ch => {
    agg[ch] = { revenue: 0, buyers: new Set(), newCustBuyers: new Set(), migrationBuyers: new Set() };
  });

  dataSrc.forEach(row => {
    const rev = extractRevenue(row);
    if (rev <= 0) return;

    const ch = getExec2Group(row);
    const id = getLocalCustomerId(row);
    const dateStr = getValue(row, 'OrderDate') || getValue(row, 'OrderData') || getValue(row, 'วันที่โอนเงิน') || getValue(row, 'วันที่สร้าง');
    const d = parseD(dateStr);

    let targetCh = agg[ch] ? ch : 'Other';
    
    agg[targetCh].revenue += rev;
    if (id) agg[targetCh].buyers.add(id);

    if (id && d) {
      const globalFirst = customerFirstDates[id];
      const chFirst = customerChannelFirstDates[`${id}_${targetCh}`];

      if (globalFirst === d.val) {
        agg[targetCh].newCustBuyers.add(id);
      } else if (chFirst === d.val) {
        agg[targetCh].migrationBuyers.add(id);
      }
    }
  });

  const results = allowedChannels.map(ch => {
    const data = agg[ch];
    const buyersCount = data.buyers.size;
    const newCustCount = data.newCustBuyers.size;
    const migrationCount = data.migrationBuyers.size;

    const pctNew = buyersCount === 0 ? 0 : (newCustCount / buyersCount) * 100;
    const pctMig = buyersCount === 0 ? 0 : (migrationCount / buyersCount) * 100;

    let category = ''; let categoryClass = ''; let dotClass = '';
    
    if (buyersCount === 0 || data.revenue === 0) {
      category = 'Cash Cow (เสือนอนกิน)'; categoryClass = 'badge-cashcow'; dotClass = 'dot-cashcow';
    } else if (pctNew > 70) {
      category = 'Vanguard (ทัพหน้า)'; categoryClass = 'badge-vanguard'; dotClass = 'dot-vanguard';
    } else if (pctMig > 70) {
      category = 'Migration Hub'; categoryClass = 'badge-migration'; dotClass = 'dot-migration';
    } else if (pctNew > 30) {
      category = 'Retention Hub'; categoryClass = 'badge-retention'; dotClass = 'dot-retention';
    } else {
      category = 'Cash Cow (เสือนอนกิน)'; categoryClass = 'badge-cashcow'; dotClass = 'dot-cashcow';
    }

    return {
      channel: ch, revenue: data.revenue, buyers: buyersCount, 
      newCust: newCustCount, newToSub: migrationCount, 
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
          <span class="exec2-card-sub">>70% หาคนใหม่เก่งมาก</span>
        </div>
      </div>
      <div class="exec2-card migration">
        <div class="exec2-card-dot dot-migration"></div>
        <div class="exec2-card-text">
          <span class="exec2-card-title">Migration Hub</span>
          <span class="exec2-card-sub">>70% จุดรับแขกเก่า</span>
        </div>
      </div>
      <div class="exec2-card retention">
        <div class="exec2-card-dot dot-retention"></div>
        <div class="exec2-card-text">
          <span class="exec2-card-title">Retention Hub</span>
          <span class="exec2-card-sub">>30% ถังเก็บลูกค้า</span>
        </div>
      </div>
      <div class="exec2-card cashcow">
        <div class="exec2-card-dot dot-cashcow"></div>
        <div class="exec2-card-text">
          <span class="exec2-card-title">Cash Cow</span>
          <span class="exec2-card-sub"><30% เสือนอนกิน</span>
        </div>
      </div>
    </div>

    <div class="exec2-table-header">
      <h3>ความหมายเชิงกลยุทธ์ (Strategic Meaning)</h3>
      <span class="month-label">All Months Data</span>
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
        <td style="font-weight: 600;">${r.channel}</td>
        <td style="color: #2c3e50; font-weight: 600;">฿${fmtNum(r.revenue)}</td>
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
