// public/insighthub.js

if (!window.insightHubState) {
  window.insightHubState = {
    currentPage: 1,
    rowsPerPage: 50,
    searchTerm: "",
    sortColumn: "totalRevenue",
    sortAsc: false,
    filterLTV: "All",
    filterLoyalty: "All",
    filterSeg1: "All",
    filterSeg2: "All",
    filterAdminPriority: "All",
    filterAction: "All",
    // ระบบเก็บสถานะการเลือกติ๊กถูกของแต่ละคอลัมน์ (Excel Filter)
    excelFilters: {
      customerName: [],
      phone: [],
      daysSinceLast: [],
      lastProductStr: [],
      firstChannel: [],
      totalOrders: [],
      totalRevenue: []
    },
    // ระบบเก็บคำค้นหาที่พิมพ์พิมพ์ในแต่ละคอลัมน์
    excelSearchTerms: {
      customerName: "",
      phone: "",
      daysSinceLast: "",
      lastProductStr: "",
      firstChannel: "",
      totalOrders: "",
      totalRevenue: ""
    },
    selectedCustomerPhone: null,
    allCustomers: []
  };
}

// Product Refill Window Day lookup from Config_Product_Refill sheet
const productConfig = {
  "COLLAGEN = 3": 21,
  "COLLAGEN = 4": 28,
  "COLLAGEN = 6": 42,
  "COLLAGEN = 9": 63,
  "COLLAGEN = 50": 350,
  "GOLD = 2": 20,
  "GOLD = 3": 30,
  "GOLD = 6": 60,
  "GOLD = 9": 90,
  "GOLD=10": 100,
  "GOLD = 10": 100,
  "GOLD = 50": 500,
  "KIDES ORIGINAL = 3": 30,
  "KIDES ส้ม = 3": 30,
  "KIDES แตงโม = 3": 30,
  "KIDES ORIGINAL = 1": 10,
  "KIDES ส้ม = 1": 10,
  "KIDES แตงโม = 1": 10,
  "PLUS = 1": 10,
  "PLUS = 2": 20,
  "PLUS = 3": 15,
  "PLUS = 4": 20,
  "PLUS = 5": 25,
  "PLUS = 6": 30,
  "PLUS = 10": 50,
  "PLUS = 12": 60,
  "PLUS = 20": 100,
  "PLUS = 50": 250,
  "WISS = 2": 20,
  "WISS = 3": 30,
  "WISS = 4": 40,
  "WISS = 6": 60,
  "WISS = 9": 90,
  "WISS = 10": 100,
  "WISS = 50": 500
};

function getRefillDays(productStr) {
  if (!productStr) return 30;
  let normalized = productStr.toUpperCase().replace(/\s+/g, ' ').trim();
  for (let key in productConfig) {
    if (normalized.includes(key)) {
      return productConfig[key];
    }
  }
  if (normalized.includes("KIDES")) return 30;
  if (normalized.includes("PLUS")) return 20;
  if (normalized.includes("GOLD")) return 30;
  if (normalized.includes("WISS")) return 30;
  if (normalized.includes("COLLAGEN")) return 30;
  return 30;
}

function getInsightRowValue(row, possibleKeys) {
  if (!row) return '';
  const rowKeys = Object.keys(row);
  const cleanPossible = possibleKeys.map(k => k.toLowerCase().replace(/[^a-zA-Z0-9\u0e00-\u0e7f]/g, ''));
  for (let cp of cleanPossible) {
    for (let rk of rowKeys) {
      const cleanRk = rk.toLowerCase().replace(/[^a-zA-Z0-9\u0e00-\u0e7f]/g, '');
      if (cleanRk === cp || cleanRk.includes(cp)) {
        return (row[rk] || '').toString().trim();
      }
    }
  }
  return '';
}

function getInsightCustomerUniqueId(row) {
  const addr = getInsightRowValue(row, ['ที่อยู่ (ลูกค้า)', 'ที่อยู่', 'Address', 'address']);
  if (addr) {
    return addr.toString().toLowerCase().replace(/[\s\r\n\t\-,\.\/\\_]+/g, '');
  }
  const phone = getInsightRowValue(row, ['Phone', 'phone', 'เบอร์โทร', 'เบอร์']);
  if (phone && phone !== 'xxxxxxx') {
    return phone.toString().trim();
  }
  const custId = getInsightRowValue(row, ['Customer ID', 'รหัสลูกค้า']);
  if (custId) return custId.toString().trim();
  const name = getInsightRowValue(row, ['CustomerName', 'ชื่อลูกค้า', 'ชื่อ']);
  if (name) return name.toString().toLowerCase().trim();
  return '';
}

function parseInsightDate(dateStr) {
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
    if (p0 > 1000) {
      y = p0; m = p1; d = p2;
    } else if (p2 > 1000) {
      d = p0; m = p1; y = p2;
    } else {
      d = p0; m = p1; y = p2;
      if (y < 2000) y += 2000;
    }
    if (y > 2500) y -= 543;
    return new Date(y, m - 1, d);
  }
  return null;
}

function renderInsightHub(filteredData, rawData) {
  const targetData = (filteredData && filteredData.length > 0) ? filteredData : rawData;
  if (!targetData || targetData.length === 0) {
    const container = document.getElementById('view-insighthub');
    if (container) {
      container.innerHTML = '<div style="padding:40px; text-align:center; color:#666;">ไม่พบข้อมูลใน Insight Hub</div>';
    }
    return;
  }

  const customerMap = {};
  targetData.forEach(row => {
    const id = getInsightCustomerUniqueId(row);
    if (!id) return;

    const name = getInsightRowValue(row, ['CustomerName', 'ชื่อลูกค้า', 'ชื่อ']) || 'ไม่ระบุชื่อ';
    const phone = getInsightRowValue(row, ['Phone', 'phone', 'เบอร์โทร']) || 'xxxxxxx';
    const dateStr = getInsightRowValue(row, ['วันที่โอนเงิน', 'วันที่สร้าง', 'OrderDate', 'Date', 'วันที่']);
    const revenueStr = getInsightRowValue(row, ['ราคาขาย', 'ราคารวม', 'ยอดรวม', 'ราคาสุทธิ', 'ยอดขาย', 'Net Sales', 'Revenue', 'Amount', 'ยอดโอน']) || '0';
    const revenue = parseFloat(revenueStr.replace(/,/g, '')) || 0;
    
    let ch = getInsightRowValue(row, ['ช่องทาง', 'Channel']);
    if (!ch) ch = getInsightRowValue(row, ['หมายเหตุ', 'Remark']);
    let channel = 'Other';
    if (ch) {
      let lower = ch.toLowerCase();
      if (lower.includes('facebook') || lower.includes('fb')) channel = 'Facebook';
      else if (lower.includes('line')) channel = 'Line';
      else if (lower.includes('tiktok') || lower === 'tt') channel = 'Tiktok';
      else if (lower.includes('shopee') || lower === 'shp') channel = 'Shopee';
      else if (lower.includes('lazada') || lower === 'laz') channel = 'Lazada';
      else if (lower.includes('ig') || lower.includes('instagram')) channel = 'Instagram';
      else if (lower.includes('crm')) channel = 'CRM';
      else if (lower.includes('call') || lower.includes('โทร')) channel = 'Call';
    }

    const productStr = getInsightRowValue(row, ['ชื่อสินค้า', 'Product', 'รายการขาย', 'Product Set']);
    const orderDate = parseInsightDate(dateStr);

    if (!customerMap[id]) {
      customerMap[id] = {
        id: id,
        customerName: name,
        phone: phone,
        totalRevenue: 0,
        totalOrders: 0,
        firstDate: orderDate,
        firstChannel: channel,
        lastDate: orderDate,
        lastProductStr: productStr,
        allOrders: []
      };
    }

    const c = customerMap[id];
    c.totalRevenue += revenue;
    c.totalOrders += 1;
    c.allOrders.push({ date: orderDate, product: productStr, revenue: revenue });

    if (orderDate) {
      if (!c.firstDate || orderDate < c.firstDate) {
        c.firstDate = orderDate;
        c.firstChannel = channel;
      }
      if (!c.lastDate || orderDate > c.lastDate) {
        c.lastDate = orderDate;
        c.lastProductStr = productStr;
      }
    }
  });

  const today = new Date(2026, 6, 4);

  const calculatedCustomers = Object.values(customerMap).map(c => {
    let daysSinceLast = 999;
    if (c.lastDate) {
      const diffTime = Math.abs(today - c.lastDate);
      daysSinceLast = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    const refillWindow = getRefillDays(c.lastProductStr);
    let recencyStatus = "Active";
    let adminPriority = "Normal";
    let actionNeeded = "Follow Up ตามรอบปกติ";

    if (daysSinceLast > refillWindow * 2) {
      recencyStatus = "Churn";
      adminPriority = "High 🚨";
      actionNeeded = "ติดต่อเสนอบริการพิเศษด่วน";
    } else if (daysSinceLast > refillWindow) {
      recencyStatus = "Snooze";
      adminPriority = "Medium ⚠️";
      actionNeeded = "ส่งข้อความทักทายเตือนสินค้าหมด";
    }

    return {
      ...c,
      daysSinceLast: daysSinceLast,
      recencyStatus: recencyStatus,
      adminPriority: adminPriority,
      actionNeeded: actionNeeded,
      firstDateStr: c.firstDate ? c.firstDate.toLocaleDateString('th-TH') : '-',
      lastDateStr: c.lastDate ? c.lastDate.toLocaleDateString('th-TH') : '-'
    };
  });

  window.insightHubState.allCustomers = calculatedCustomers;
  buildInsightHubLayout();
}

// หน้าตาโครงสร้างหลัก (Header Dropdown ด้านบน) คงเดิมตามรูปที่ 1 100% ไม่เปลี่ยนรูปแบบ
function buildInsightHubLayout() {
  const container = document.getElementById('view-insighthub');
  if (!container) return;

  container.innerHTML = `
    <div class="insight-hub-container">
      <div class="insight-header">
        <div>
          <h2>Customer Insight Hub</h2>
          <p>วิเคราะห์และแบ่งกลุ่มพฤติกรรมลูกค้าสำหรับการทำ CRM เจาะลึก</p>
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
          <input type="text" id="insightGlobalSearch" placeholder="ค้นหาชื่อ, เบอร์โทร..." value="${window.insightHubState.searchTerm}" style="padding:6px 12px; font-size:13px; border:1px solid #ddd; border-radius:6px; width:200px;" />
          <button onclick="clearAllExcelFilters()" style="padding:6px 12px; font-size:13px; background:#f1f5f9; border:none; border-radius:6px; color:#475569; cursor:pointer; font-weight:500;">ล้างการกรองทั้งหมด</button>
        </div>
      </div>

      <div class="insight-filters" style="margin-bottom: 20px;">
        <div class="filter-group">
          <label>LTV Revenue</label>
          <select id="insFilterLTV" onchange="updateInsightFilter('filterLTV', this.value)">
            <option value="All" ${window.insightHubState.filterLTV==='All'?'selected':''}>ทั้งหมด</option>
            <option value="High" ${window.insightHubState.filterLTV==='High'?'selected':''}>High Value (฿5,000+)</option>
            <option value="Medium" ${window.insightHubState.filterLTV==='Medium'?'selected':''}>Medium Value (฿1,500-5,000)</option>
            <option value="Low" ${window.insightHubState.filterLTV==='Low'?'selected':''}>Low Value (< ฿1,500)</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Loyalty Segment</label>
          <select id="insFilterLoyalty" onchange="updateInsightFilter('filterLoyalty', this.value)">
            <option value="All" ${window.insightHubState.filterLoyalty==='All'?'selected':''}>ทั้งหมด</option>
            <option value="Loyal" ${window.insightHubState.filterLoyalty==='Loyal'?'selected':''}>ลูกค้าประจำ (3+ ออเดอร์)</option>
            <option value="Once" ${window.insightHubState.filterLoyalty==='Once'?'selected':''}>ซื้อครั้งเดียว</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Recency Segment</label>
          <select id="insFilterSeg1" onchange="updateInsightFilter('filterSeg1', this.value)">
            <option value="All" ${window.insightHubState.filterSeg1==='All'?'selected':''}>ทั้งหมด</option>
            <option value="Active" ${window.insightHubState.filterSeg1==='Active'?'selected':''}>Active (ตามรอบปกติ)</option>
            <option value="Snooze" ${window.insightHubState.filterSeg1==='Snooze'?'selected':''}>Snooze (เกินรอบเติม)</option>
            <option value="Churn" ${window.insightHubState.filterSeg1==='Churn'?'selected':''}>Churn (ขาดการติดต่อนาน)</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Admin Priority</label>
          <select id="insFilterAdmin" onchange="updateInsightFilter('filterAdminPriority', this.value)">
            <option value="All" ${window.insightHubState.filterAdminPriority==='All'?'selected':''}>ทั้งหมด</option>
            <option value="High" ${window.insightHubState.filterAdminPriority==='High'?'selected':''}>High 🚨</option>
            <option value="Medium" ${window.insightHubState.filterAdminPriority==='Medium'?'selected':''}>Medium ⚠️</option>
            <option value="Normal" ${window.insightHubState.filterAdminPriority==='Normal'?'selected':''}>Normal</option>
          </select>
        </div>
      </div>

      <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px; background:#fff;" id="excelTableContainer">
         </div>

      <div id="insightPagination" style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px; font-size: 13px; color: #64748b;"></div>
    </div>
    <div id="customerProfileModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.4); z-index:9999; justify-content:center; align-items:center;"></div>
  `;

  document.getElementById('insightGlobalSearch').addEventListener('input', (e) => {
    window.insightHubState.searchTerm = e.target.value;
    window.insightHubState.currentPage = 1;
    applyExcelFiltersAndRender();
  });

  applyExcelFiltersAndRender();
}

function updateInsightFilter(key, value) {
  window.insightHubState[key] = value;
  window.insightHubState.currentPage = 1;
  applyExcelFiltersAndRender();
}

function applyExcelFiltersAndRender() {
  let data = [...window.insightHubState.allCustomers];
  const state = window.insightHubState;

  // 1. คัดกรองจากตัวเลือก Dropdown เดิมด้านบน
  if (state.filterLTV !== "All") {
    if (state.filterLTV === "High") data = data.filter(c => c.totalRevenue >= 5000);
    else if (state.filterLTV === "Medium") data = data.filter(c => c.totalRevenue >= 1500 && c.totalRevenue < 5000);
    else if (state.filterLTV === "Low") data = data.filter(c => c.totalRevenue < 1500);
  }
  if (state.filterLoyalty !== "All") {
    if (state.filterLoyalty === "Loyal") data = data.filter(c => c.totalOrders >= 3);
    else if (state.filterLoyalty === "Once") data = data.filter(c => c.totalOrders === 1);
  }
  if (state.filterSeg1 !== "All") data = data.filter(c => c.recencyStatus === state.filterSeg1);
  if (state.filterAdminPriority !== "All") data = data.filter(c => c.adminPriority.includes(state.filterAdminPriority));

  // 2. คัดกรองจากการพิมพ์ Global Search ช่องหลัก
  if (state.searchTerm.trim() !== "") {
    const srch = state.searchTerm.toLowerCase();
    data = data.filter(c => 
      c.customerName.toLowerCase().includes(srch) ||
      c.phone.includes(srch) ||
      c.lastProductStr.toLowerCase().includes(srch) ||
      c.firstChannel.toLowerCase().includes(srch)
    );
  }

  // 3. คัดกรองจากปุ่มพิมพ์ค้นหาประจำคอลัมน์ (Excel Text Filter)
  Object.keys(state.excelSearchTerms).forEach(colKey => {
    const term = state.excelSearchTerms[colKey].trim().toLowerCase();
    if (term !== "") {
      data = data.filter(c => String(c[colKey]).toLowerCase().includes(term));
    }
  });

  // 4. คัดกรองจาก Checkbox รายตัวเลือกที่ติ๊กถูกในคอลัมน์ (Excel Checkbox Filter)
  Object.keys(state.excelFilters).forEach(colKey => {
    const selectedValues = state.excelFilters[colKey];
    if (selectedValues && selectedValues.length > 0) {
      data = data.filter(c => selectedValues.includes(String(c[colKey])));
    }
  });

  // 5. ระบบจัดเรียงลำดับ Sort ข้อมูล
  if (state.sortColumn) {
    data.sort((a, b) => {
      let valA = a[state.sortColumn];
      let valB = b[state.sortColumn];
      if (typeof valA === 'string') {
        return state.sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else {
        return state.sortAsc ? valA - valB : valB - valA;
      }
    });
  }

  const totalRows = data.length;
  const totalPages = Math.ceil(totalRows / state.rowsPerPage) || 1;
  if (state.currentPage > totalPages) state.currentPage = totalPages;
  const startIdx = (state.currentPage - 1) * state.rowsPerPage;
  const pageData = data.slice(startIdx, startIdx + state.rowsPerPage);

  renderExcelTable(pageData);
  renderInsightPaginationUI(totalRows, totalPages, startIdx, pageData.length);
}

// วาดตารางใหม่ให้เหลือเฉพาะ 7 คอลัมน์หลักตามรูปใบที่ 2 พร้อมฝังชุดปุ่มฟิลเตอร์
function renderExcelTable(pageData) {
  const container = document.getElementById('excelTableContainer');
  if (!container) return;

  // กำหนดคอลัมน์ให้เหลือแค่ 7 ตัวตรงตามรูปที่ 2 เป๊ะๆ
  const columns = [
    { key: "customerName", label: "ชื่อลูกค้า" },
    { key: "phone", label: "เบอร์โทรศัพท์" },
    { key: "daysSinceLast", label: "Days Since Last" },
    { key: "lastProductStr", label: "Last Product" },
    { key: "firstChannel", label: "First Channel" },
    { key: "totalOrders", label: "Total Orders" },
    { key: "totalRevenue", label: "LTV Revenue" }
  ];

  let html = `
    <table class="insight-table" style="width:100%; border-collapse:collapse; text-align:left; font-size:13px;">
      <thead>
        <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0;">
  `;

  columns.forEach(col => {
    // ตรวจสอบว่าคอลัมน์นี้มีการกรองค้างอยู่หรือไม่เพื่อแสดงสัญลักษณ์สีส้มไฮไลท์แบบแอคทีฟ
    const hasActiveFilter = window.insightHubState.excelFilters[col.key].length > 0 || window.insightHubState.excelSearchTerms[col.key] !== "";
    const filterColor = hasActiveFilter ? "#d95f1d" : "#94a3b8";
    
    html += `
      <th style="padding:12px 10px; color:#475569; font-weight:600; white-space:nowrap; border-right:1px solid #e2e8f0; position:relative; user-select:none;">
        <span onclick="toggleInsightSort('${col.key}')" style="cursor:pointer; margin-right:4px;">
          ${col.label} ${window.insightHubState.sortColumn === col.key ? (window.insightHubState.sortAsc ? '🔼' : '🔽') : ''}
        </span>
        <button onclick="toggleExcelDropdown(event, '${col.key}')" style="background:none; border:none; color:${filterColor}; cursor:pointer; font-size:11px; padding:2px; outline:none; transition:color 0.2s;">
          <i class="fas fa-filter"></i>
        </button>
        
        <div id="excelDrop-${col.key}" class="excel-filter-menu" style="display:none; position:absolute; top:36px; left:5px; background:#fff; border:1px solid #cbd5e1; box-shadow:0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05); border-radius:6px; z-index:9999; min-width:210px; max-height:280px; overflow-y:auto; padding:10px; font-weight:normal; text-align:left;">
        </div>
      </th>
    `;
  });

  html += `
        </tr>
      </thead>
      <tbody>
  `;

  if (pageData.length === 0) {
    html += `<tr><td colspan="${columns.length}" style="padding:30px; text-align:center; color:#94a3b8;">ไม่พบข้อมูลรายการที่ตรงตามตัวกรองคอลัมน์ของคุณ</td></tr>`;
  } else {
    pageData.forEach((c, idx) => {
      const rowBg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
      
      html += `
        <tr style="background:${rowBg}; border-bottom:1px solid #f1f5f9; cursor:pointer;" onclick="showCustomerDetailModal('${c.phone}')" class="insight-row-hover">
          <td style="padding:12px 10px; font-weight:600; color:#1e293b; border-right:1px solid #e2e8f0;">${c.customerName}</td>
          <td style="padding:12px 10px; color:#475569; border-right:1px solid #e2e8f0;">${c.phone}</td>
          <td style="padding:12px 10px; text-align:center; border-right:1px solid #e2e8f0; font-weight:500;">${c.daysSinceLast} วัน</td>
          <td style="padding:12px 10px; color:#475569; border-right:1px solid #e2e8f0; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${c.lastProductStr}">${c.lastProductStr || '-'}</td>
          <td style="padding:12px 10px; border-right:1px solid #e2e8f0; text-align:center;"><span style="background:#f1f5f9; color:#475569; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:500;">${c.firstChannel}</span></td>
          <td style="padding:12px 10px; text-align:center; border-right:1px solid #e2e8f0; font-weight:500;">${c.totalOrders}</td>
          <td style="padding:12px 10px; text-align:right; font-weight:700; color:#0f172a;">฿${c.totalRevenue.toLocaleString()}</td>
        </tr>
      `;
    });
  }

  html += `
      </tbody>
    </table>
  `;

  container.innerHTML = html;
}

// ฟังก์ชันสร้างป๊อปอัพตัวกรองที่มีช่องให้พิมพ์ค้นหา และมีเช็กบ็อกซ์ให้ติ๊กเลือกแบบโปรแกรม Excel
function toggleExcelDropdown(event, colKey) {
  event.stopPropagation();
  const menu = document.getElementById(`excelDrop-${colKey}`);
  if (!menu) return;

  const currentDisplay = menu.style.display;
  // ปิดป๊อปอัพตัวอื่นก่อนหน้าทั้งหมดเพื่อความสะอาดตา
  document.querySelectorAll('.excel-filter-menu').forEach(m => m.style.display = 'none');

  if (currentDisplay === 'none') {
    menu.style.display = 'block';

    // ดึงข้อมูลที่ไม่ซ้ำในคอลัมน์นั้นๆ มาจัดเตรียมเพื่อเป็นตัวเลือกติ๊กถูก
    const distinctValues = [...new Set(window.insightHubState.allCustomers.map(c => {
      let v = c[colKey];
      if (colKey === 'totalRevenue') return '฿' + (parseFloat(v) || 0).toLocaleString();
      if (colKey === 'daysSinceLast') return v + ' วัน';
      return String(v);
    }))].sort((a,b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}));

    const selectedValues = window.insightHubState.excelFilters[colKey];
    const currentSearch = window.insightHubState.excelSearchTerms[colKey];

    let menuHtml = `
      <div style="font-weight:700; font-size:12px; margin-bottom:6px; color:#1e293b; display:flex; justify-content:space-between;">
        <span>ตัวกรองคอลัมน์</span>
      </div>
      <div style="margin-bottom:8px;">
        <input type="text" placeholder="🔍 พิมพ์ค้นหาที่นี่..." value="${currentSearch}" 
          oninput="handleExcelSearchInput('${colKey}', this.value)" onclick="event.stopPropagation()"
          style="width:100%; padding:4px 8px; font-size:12px; border:1px solid #cbd5e1; border-radius:4px; box-sizing:border-box;" />
      </div>
      <div style="max-height:130px; overflow-y:auto; margin-bottom:8px; border:1px solid #f1f5f9; padding:4px; border-radius:4px;">
    `;

    distinctValues.forEach(displayVal => {
      // ดึงค่า Raw จริงเพื่อแมปเปรียบเทียบสถานะติ๊กเลือก
      let rawVal = displayVal;
      if (colKey === 'totalRevenue') rawVal = displayVal.replace(/[฿,]/g, '');
      if (colKey === 'daysSinceLast') rawVal = displayVal.replace(' วัน', '');

      const isChecked = selectedValues.includes(String(rawVal)) ? 'checked' : '';
      menuHtml += `
        <label style="display:flex; align-items:center; gap:6px; font-size:12px; padding:3px 2px; cursor:pointer; color:#475569; user-select:none;">
          <input type="checkbox" value="${rawVal}" ${isChecked} onchange="handleExcelCheckboxChange('${colKey}', this)" onclick="event.stopPropagation()" style="cursor:pointer; margin:0;" />
          <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${displayVal === '' || displayVal === 'undefined' ? '(ว่าง)' : displayVal}</span>
        </label>
      `;
    });

    menuHtml += `
      </div>
      <div style="display:flex; justify-content:space-between; gap:6px; border-top:1px solid #e2e8f0; padding-top:6px;">
        <button onclick="clearSpecificExcelFilter(event, '${colKey}')" style="background:none; border:none; color:#dc2626; font-size:11px; cursor:pointer; font-weight:500; padding:2px;">ล้างค่าคอลัมน์</button>
        <button onclick="closeExcelDropdown(event)" style="background:#d95f1d; border:none; color:#fff; font-size:11px; padding:3px 10px; border-radius:4px; cursor:pointer; font-weight:600;">ตกลง</button>
      </div>
    `;
    menu.innerHTML = menuHtml;
  }
}

function handleExcelSearchInput(colKey, value) {
  window.insightHubState.excelSearchTerms[colKey] = value;
  window.insightHubState.currentPage = 1;
  applyExcelFiltersAndRender();
}

function handleExcelCheckboxChange(colKey, checkbox) {
  const val = checkbox.value;
  let currentFilters = [...window.insightHubState.excelFilters[colKey]];

  if (checkbox.checked) {
    if (!currentFilters.includes(val)) currentFilters.push(val);
  } else {
    currentFilters = currentFilters.filter(item => item !== val);
  }

  window.insightHubState.excelFilters[colKey] = currentFilters;
  window.insightHubState.currentPage = 1;
  applyExcelFiltersAndRender();
}

function clearSpecificExcelFilter(event, colKey) {
  if (event) event.stopPropagation();
  window.insightHubState.excelFilters[colKey] = [];
  window.insightHubState.excelSearchTerms[colKey] = "";
  applyExcelFiltersAndRender();
  const menu = document.getElementById(`excelDrop-${colKey}`);
  if (menu) menu.style.display = 'none';
}

function clearAllExcelFilters() {
  window.insightHubState.searchTerm = "";
  const sInput = document.getElementById('insightGlobalSearch');
  if (sInput) sInput.value = "";
  
  Object.keys(window.insightHubState.excelFilters).forEach(k => {
    window.insightHubState.excelFilters[k] = [];
  });
  Object.keys(window.insightHubState.excelSearchTerms).forEach(k => {
    window.insightHubState.excelSearchTerms[k] = "";
  });
  window.insightHubState.currentPage = 1;
  applyExcelFiltersAndRender();
}

function closeExcelDropdown(event) {
  if (event) event.stopPropagation();
  document.querySelectorAll('.excel-filter-menu').forEach(m => m.style.display = 'none');
}

// เมื่อคลิกพื้นที่ว่างอื่นในระบบภายนอกตาราง จะทำการปิดหน้าต่าง Dropdown ตัวกรองอัตโนมัติ
document.addEventListener('click', () => closeExcelDropdown());

function toggleInsightSort(columnKey) {
  const state = window.insightHubState;
  if (state.sortColumn === columnKey) {
    state.sortAsc = !state.sortAsc;
  } else {
    state.sortColumn = columnKey;
    state.sortAsc = false;
  }
  applyExcelFiltersAndRender();
}

function renderInsightPaginationUI(totalRows, totalPages, startIdx, pDataLength) {
  const el = document.getElementById('insightPagination');
  if (!el) return;

  const state = window.insightHubState;
  const endIdx = startIdx + pDataLength;

  el.innerHTML = `
    <div>แสดงรายการที่ <b>${totalRows > 0 ? startIdx + 1 : 0}</b> ถึง <b>${endIdx}</b> จากทั้งหมด <b>${totalRows.toLocaleString()}</b> รายการ</div>
    <div style="display:flex; gap:5px; align-items:center;">
      <button onclick="changeInsightPage(${state.currentPage - 1})" ${state.currentPage === 1 ? 'disabled' : ''} style="padding:3px 8px; border:1px solid #cbd5e1; background:#fff; border-radius:4px; cursor:pointer;">ก่อนหน้า</button>
      <span style="padding:0 4px;">หน้า <b>${state.currentPage}</b> / ${totalPages}</span>
      <button onclick="changeInsightPage(${state.currentPage + 1})" ${state.currentPage === totalPages ? 'disabled' : ''} style="padding:3px 8px; border:1px solid #cbd5e1; background:#fff; border-radius:4px; cursor:pointer;">ถัดไป</button>
    </div>
  `;
}

function changeInsightPage(targetPage) {
  window.insightHubState.currentPage = targetPage;
  applyExcelFiltersAndRender();
}

// คงโครงสร้าง Modal และสไตล์ Profile เดิมของคุณไว้ครบถ้วนสมบูรณ์
function showCustomerDetailModal(phone) {
  const c = window.insightHubState.allCustomers.find(item => item.phone === phone);
  if (!c) return;

  const modal = document.getElementById('customerProfileModal');
  if (!modal) return;

  let orderRowsHtml = "";
  c.allOrders.forEach(o => {
    orderRowsHtml += `
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:10px 0; color:#64748b;">${o.date ? o.date.toLocaleDateString('th-TH') : '-'}</td>
        <td style="padding:10px 0; color:#1e293b; font-weight:600;">${o.product || '-'}</td>
        <td style="padding:10px 0; text-align:right; font-weight:700; color:#0f172a;">฿${o.revenue.toLocaleString()}</td>
      </tr>
    `;
  });

  modal.innerHTML = `
    <div class="modal-content" onclick="event.stopPropagation()" style="background:#fff; width:90%; max-width:550px; border-radius:12px; overflow:hidden; box-shadow:0 20px 25px -5px rgba(0,0,0,0.1);">
      <div class="modal-header" style="background:#1e293b; color:#fff; padding:16px 20px; display:flex; justify-content:between; align-items:center;">
        <h3 style="margin:0; font-size:16px; font-weight:600;"><i class="fas fa-user-circle" style="margin-right:8px;"></i>Customer Timeline Profile</h3>
        <button onclick="closeCustomerModal()" style="background:none; border:none; color:#fff; cursor:pointer; font-size:18px;"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body" style="padding:20px; max-height:450px; overflow-y:auto;">
        <div class="profile-card" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:15px; margin-bottom:20px;">
          <h4 style="margin:0 0 6px 0; font-size:16px; color:#0f172a; font-weight:700;">${c.customerName}</h4>
          <p style="margin:0 0 4px 0; font-size:13px; color:#475569;">เบอร์โทรศัพท์: ${c.phone}</p>
          <p style="margin:0; font-size:13px; color:#475569;">First Order: ${c.firstChannel} (${c.firstDateStr})</p>
        </div>
        <h5 style="margin:0 0 10px 0; font-size:13px; font-weight:600; color:#475569;">ประวัติใบสั่งซื้อทั้งหมด</h5>
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr style="border-bottom:2px solid #e2e8f0; text-align:left; color:#64748b; font-weight:600;">
              <th style="padding:6px 0;">วันที่สั่งซื้อ</th>
              <th style="padding:6px 0;">รายการสินค้า</th>
              <th style="padding:6px 0; text-align:right;">ยอดโอน</th>
            </tr>
          </thead>
          <tbody>
            ${orderRowsHtml}
          </tbody>
        </table>
      </div>
      <div class="modal-footer" style="background:#f8fafc; padding:12px 20px; text-align:right; border-top:1px solid #e2e8f0;">
        <button onclick="closeCustomerModal()" style="background:#64748b; color:#fff; border:none; padding:6px 16px; border-radius:6px; font-size:13px; cursor:pointer; font-weight:500;">ปิดหน้าต่าง</button>
      </div>
    </div>
  `;
  modal.style.display = 'flex';
}

function closeCustomerModal() {
  const modal = document.getElementById('customerProfileModal');
  if (modal) modal.style.display = 'none';
}

// ผูกเข้ากับระบบ Window Object เพื่อการเรียกใช้งานดั้งเดิม
window.renderInsightHub = renderInsightHub;
window.clearAllExcelFilters = clearAllExcelFilters;
window.handleExcelCheckboxChange = handleExcelCheckboxChange;
window.handleExcelSearchInput = handleExcelSearchInput;
window.clearSpecificExcelFilter = clearSpecificExcelFilter;
window.closeExcelDropdown = closeExcelDropdown;
window.toggleExcelDropdown = toggleExcelDropdown;
window.toggleInsightSort = toggleInsightSort;
window.changeInsightPage = changeInsightPage;
window.showCustomerDetailModal = showCustomerDetailModal;
window.closeCustomerModal = closeCustomerModal;
