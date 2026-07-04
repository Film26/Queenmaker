// public/insighthub.js

if (!window.insightHubState) {
  window.insightHubState = {
    currentPage: 1,
    rowsPerPage: 50,
    searchTerm: "",
    sortColumn: "totalRevenue",
    sortAsc: false,
    // ระบบ Excel-Style Filter สำหรับผูกเข้ากับคอลัมน์เวอร์ชันดั้งเดิมของคุณ
    excelFilters: {
      customerName: [],
      phone: [],
      daysSinceLast: [],
      lastProductStr: [],
      firstChannel: [],
      totalOrders: [],
      totalRevenue: [],
      recencyStatus: [],
      adminPriority: [],
      actionNeeded: []
    },
    selectedCustomerPhone: null,
    allCustomers: []
  };
}

// Product Refill Window Day จากเวอร์ชันเดิมของคุณ
const productConfig = {
  "COLLAGEN = 3": 21, "COLLAGEN = 4": 28, "COLLAGEN = 6": 42, "COLLAGEN = 9": 63, "COLLAGEN = 50": 350,
  "GOLD = 2": 20, "GOLD = 3": 30, "GOLD = 6": 60, "GOLD = 9": 90, "GOLD=10": 100, "GOLD = 10": 100, "GOLD = 50": 500,
  "KIDES ORIGINAL = 3": 30, "KIDES ส้ม = 3": 30, "KIDES แตงโม = 3": 30, "KIDES ORIGINAL = 1": 10, "KIDES ส้ม = 1": 10, "KIDES แตงโม = 1": 10,
  "PLUS = 1": 10, "PLUS = 2": 20, "PLUS = 3": 15, "PLUS = 4": 20, "PLUS = 5": 25, "PLUS = 6": 30, "PLUS = 10": 50, "PLUS = 12": 60, "PLUS = 20": 100, "PLUS = 50": 250,
  "WISS = 2": 20, "WISS = 3": 30, "WISS = 4": 40, "WISS = 6": 60, "WISS = 9": 90, "WISS = 10": 100, "WISS = 50": 500
};

function getRefillDays(productStr) {
  if (!productStr) return 30;
  let normalized = productStr.toUpperCase().replace(/\s+/g, ' ').trim();
  for (let key in productConfig) {
    if (normalized.includes(key)) return productConfig[key];
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
  if (addr) return addr.toString().toLowerCase().replace(/[\s\r\n\t\-,\.\/\\_]+/g, '');
  const phone = getInsightRowValue(row, ['Phone', 'phone', 'เบอร์โทร', 'เบอร์']);
  if (phone && phone !== 'xxxxxxx') return phone.toString().trim();
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
    let p0 = parseInt(parts[0], 10), p1 = parseInt(parts[1], 10), p2 = parseInt(parts[2], 10);
    if (isNaN(p0) || isNaN(p1) || isNaN(p2)) return null;
    let y, m, d;
    if (p0 > 1000) { y = p0; m = p1; d = p2; } 
    else if (p2 > 1000) { d = p0; m = p1; y = p2; } 
    else { d = p0; m = p1; y = p2; if (y < 2000) y += 2000; }
    if (y > 2500) y -= 543;
    return new Date(y, m - 1, d);
  }
  return null;
}

// Logic ประมวลผลจากเวอร์ชันดั้งเดิมของคุณทั้งหมด
function renderInsightHub(filteredData, rawData) {
  const targetData = (filteredData && filteredData.length > 0) ? filteredData : rawData;
  if (!targetData || targetData.length === 0) {
    const container = document.getElementById('view-insighthub');
    if (container) container.innerHTML = '<div style="padding:40px; text-align:center; color:#666;">ไม่พบข้อมูลใน Insight Hub</div>';
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
        id: id, customerName: name, phone: phone, totalRevenue: 0, totalOrders: 0,
        firstDate: orderDate, firstChannel: channel, lastDate: orderDate, lastProductStr: productStr,
        allOrders: []
      };
    }

    const c = customerMap[id];
    c.totalRevenue += revenue;
    c.totalOrders += 1;
    c.allOrders.push({ date: orderDate, product: productStr, revenue: revenue });

    if (orderDate) {
      if (!c.firstDate || orderDate < c.firstDate) { c.firstDate = orderDate; c.firstChannel = channel; }
      if (!c.lastDate || orderDate > c.lastDate) { c.lastDate = orderDate; c.lastProductStr = productStr; }
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
      recencyStatus = "Churn"; adminPriority = "High 🚨"; actionNeeded = "ติดต่อเสนอบริการพิเศษด่วน";
    } else if (daysSinceLast > refillWindow) {
      recencyStatus = "Snooze"; adminPriority = "Medium ⚠️"; actionNeeded = "ส่งข้อความทักทายเตือนสินค้าหมด";
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

// โครงสร้างหน้าตาและ Layout เวอร์ชันดั้งเดิมของคุณ 100%
function buildInsightHubLayout() {
  const container = document.getElementById('view-insighthub');
  if (!container) return;

  container.innerHTML = `
    <div class="insight-hub-container" style="background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
      <div class="insight-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
        <div>
          <h2 style="margin: 0; font-size: 18px; color: #333;">Customer Insight Hub</h2>
          <p style="margin: 2px 0 0 0; font-size: 12px; color: #666;">วิเคราะห์และแบ่งกลุ่มพฤติกรรมลูกค้าสำหรับการทำ CRM เจาะลึก</p>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <input type="text" id="insightGlobalSearch" placeholder="ค้นหาชื่อลูกค้า, เบอร์โทร..." value="${window.insightHubState.searchTerm}" 
            style="padding: 5px 10px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px; width: 200px;" />
          <button onclick="clearAllExcelFilters()" style="padding: 5px 10px; font-size: 12px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 4px; color: #333; cursor: pointer;">
            ล้างการกรองทั้งหมด
          </button>
        </div>
      </div>

      <div style="overflow-x: auto; border: 1px solid #ddd; border-radius: 4px;" id="excelTableContainer">
         <!-- ตารางรูปแบบดั้งเดิมของคุณจะวาดตรงนี้ -->
      </div>

      <div id="insightPagination" style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px; font-size: 12px; color: #666;"></div>
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

function applyExcelFiltersAndRender() {
  let data = [...window.insightHubState.allCustomers];
  const state = window.insightHubState;

  if (state.searchTerm.trim() !== "") {
    const srch = state.searchTerm.toLowerCase();
    data = data.filter(c => 
      c.customerName.toLowerCase().includes(srch) ||
      c.phone.includes(srch) ||
      c.lastProductStr.toLowerCase().includes(srch) ||
      c.firstChannel.toLowerCase().includes(srch) ||
      c.recencyStatus.toLowerCase().includes(srch) ||
      c.adminPriority.toLowerCase().includes(srch)
    );
  }

  // นำเงื่อนไข Excel Filter มาร่วมคัดกรองข้อมูลรายคอลัมน์ดั้งเดิม
  Object.keys(state.excelFilters).forEach(colKey => {
    const selectedValues = state.excelFilters[colKey];
    if (selectedValues && selectedValues.length > 0) {
      data = data.filter(c => selectedValues.includes(String(c[colKey])));
    }
  });

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

// ตารางเวอร์ชันดั้งเดิมของคุณทุกคอลัมน์ (ยึดตามเวอร์ชันที่คุณส่งมาเป๊ะๆ) เพิ่มแค่ปุ่มไอคอนกรองฟิลเตอร์สไตล์ Excel บนหัวตาราง
function renderExcelTable(pageData) {
  const container = document.getElementById('excelTableContainer');
  if (!container) return;

  // โครงสร้างลำดับคอลัมน์ดั้งเดิมเวอร์ชันคุณเป๊ะๆ 100%
  const columns = [
    { key: "customerName", label: "ชื่อลูกค้า" },
    { key: "phone", label: "เบอร์โทรศัพท์" },
    { key: "daysSinceLast", label: "Days Since Last" },
    { key: "lastProductStr", label: "Last Product" },
    { key: "firstChannel", label: "First Channel" },
    { key: "totalOrders", label: "Total Orders" },
    { key: "totalRevenue", label: "LTV Revenue" },
    { key: "recencyStatus", label: "Recency Segment" },
    { key: "adminPriority", label: "Admin Priority" },
    { key: "actionNeeded", label: "Action Needed" }
  ];

  let html = `
    <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 12px;">
      <thead>
        <tr style="background: #f5f5f5; border-bottom: 2px solid #ddd;">
  `;

  columns.forEach(col => {
    const isFiltered = window.insightHubState.excelFilters[col.key].length > 0;
    const filterColor = isFiltered ? "#ff6b00" : "#999";
    
    html += `
      <th style="padding: 10px; color: #333; font-weight: bold; white-space: nowrap; border-right: 1px solid #ddd; position: relative;">
        <span onclick="toggleInsightSort('${col.key}')" style="cursor: pointer; user-select: none; margin-right: 3px;">
          ${col.label} ${window.insightHubState.sortColumn === col.key ? (window.insightHubState.sortAsc ? '🔼' : '🔽') : ''}
        </span>
        <button onclick="toggleExcelDropdown(event, '${col.key}')" style="background: none; border: none; color: ${filterColor}; cursor: pointer; font-size: 11px; padding: 2px 4px; outline: none;">
          <i class="fas fa-filter"></i>
        </button>
        
        <!-- กล่องเมนูป๊อปอัพตัวเลือกในการกรอง Filter รายคอลัมน์สไตล์ตาราง Excel -->
        <div id="excelDrop-${col.key}" class="excel-filter-menu" style="display: none; position: absolute; top: 32px; left: 5px; background: #fff; border: 1px solid #ccc; box-shadow: 0 2px 10px rgba(0,0,0,0.15); border-radius: 4px; z-index: 9999; min-width: 160px; max-height: 240px; overflow-y: auto; padding: 8px; font-weight: normal; text-align: left;">
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
    html += `<tr><td colspan="${columns.length}" style="padding: 20px; text-align: center; color: #999;">ไม่พบข้อมูลรายการที่คุณเลือกค้นหาหรือกรองไว้</td></tr>`;
  } else {
    pageData.forEach((c, idx) => {
      const rowBg = idx % 2 === 0 ? "#ffffff" : "#fafafa";
      
      // การแสดงสียึดตามเงื่อนไขเดิมในไฟล์เวอร์ชันดั้งเดิมของคุณทั้งหมด 100%
      let badgeStyle = "background: #e0e0e0; color: #333;";
      if (c.recencyStatus === "Active") badgeStyle = "background: #e6f4ea; color: #137333; font-weight: bold;";
      if (c.recencyStatus === "Snooze") badgeStyle = "background: #fef7e0; color: #b06000; font-weight: bold;";
      if (c.recencyStatus === "Churn") badgeStyle = "background: #fce8e6; color: #c5221f; font-weight: bold;";

      let priorityStyle = "color: #333;";
      if (c.adminPriority.includes("High")) priorityStyle = "color: #c5221f; font-weight: bold;";
      if (c.adminPriority.includes("Medium")) priorityStyle = "color: #b06000; font-weight: bold;";

      html += `
        <tr style="background: ${rowBg}; border-bottom: 1px solid #eee; cursor: pointer;" onclick="showCustomerDetailModal('${c.phone}')">
          <td style="padding: 10px; font-weight: bold; color: #333; border-right: 1px solid #eee;">${c.customerName}</td>
          <td style="padding: 10px; color: #555; border-right: 1px solid #eee;">${c.phone}</td>
          <td style="padding: 10px; text-align: center; border-right: 1px solid #eee;">${c.daysSinceLast} วัน</td>
          <td style="padding: 10px; color: #444; border-right: 1px solid #eee; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${c.lastProductStr}">${c.lastProductStr || '-'}</td>
          <td style="padding: 10px; border-right: 1px solid #eee;"><span style="background: #eee; padding: 2px 6px; border-radius: 4px; font-size: 11px;">${c.firstChannel}</span></td>
          <td style="padding: 10px; text-align: center; border-right: 1px solid #eee;">${c.totalOrders}</td>
          <td style="padding: 10px; text-align: right; font-weight: bold; color: #111; border-right: 1px solid #eee;">฿${c.totalRevenue.toLocaleString()}</td>
          <td style="padding: 10px; text-align: center; border-right: 1px solid #eee;"><span style="padding: 2px 6px; border-radius: 10px; font-size: 11px; ${badgeStyle}">${c.recencyStatus}</span></td>
          <td style="padding: 10px; text-align: center; border-right: 1px solid #eee; ${priorityStyle}">${c.adminPriority}</td>
          <td style="padding: 10px; color: #666;">${c.actionNeeded}</td>
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

// ตัวสร้างเมนูกล่องตัวเลือกกรองข้อมูลอัจฉริยะ (Excel Filter) รายคอลัมน์
function toggleExcelDropdown(event, colKey) {
  event.stopPropagation();
  const menu = document.getElementById(`excelDrop-${colKey}`);
  if (!menu) return;

  const currentDisplay = menu.style.display;
  document.querySelectorAll('.excel-filter-menu').forEach(m => m.style.display = 'none');

  if (currentDisplay === 'none') {
    menu.style.display = 'block';

    const distinctValues = [...new Set(window.insightHubState.allCustomers.map(c => String(c[colKey])))].sort();
    const selectedValues = window.insightHubState.excelFilters[colKey];

    let menuHtml = `
      <div style="font-weight: bold; font-size: 11px; margin-bottom: 4px; border-bottom: 1px solid #eee; padding-bottom: 3px; color: #333;">ตัวเลือกตัวกรอง</div>
      <div style="max-height: 130px; overflow-y: auto; margin-bottom: 6px;">
    `;

    distinctValues.forEach(val => {
      const isChecked = selectedValues.includes(val) ? 'checked' : '';
      menuHtml += `
        <label style="display: flex; align-items: center; gap: 4px; font-size: 11px; padding: 2px 0; cursor: pointer; color: #444;">
          <input type="checkbox" value="${val}" ${isChecked} onchange="handleExcelCheckboxChange('${colKey}', this)" style="cursor: pointer;" />
          ${val === '' || val === 'undefined' ? '(ว่าง)' : val}
        </label>
      `;
    });

    menuHtml += `
      </div>
      <div style="display: flex; justify-content: space-between; gap: 4px; border-top: 1px solid #eee; padding-top: 4px;">
        <button onclick="clearSpecificExcelFilter(event, '${colKey}')" style="background: none; border: none; color: #c5221f; font-size: 11px; cursor: pointer;">ล้างค่า</button>
        <button onclick="closeExcelDropdown(event)" style="background: #333; border: none; color: #fff; font-size: 11px; padding: 2px 6px; border-radius: 3px; cursor: pointer;">ตกลง</button>
      </div>
    `;
    menu.innerHTML = menuHtml;
  }
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
  if(event) event.stopPropagation();
  window.insightHubState.excelFilters[colKey] = [];
  applyExcelFiltersAndRender();
  const menu = document.getElementById(`excelDrop-${colKey}`);
  if(menu) menu.style.display = 'none';
}

function clearAllExcelFilters() {
  window.insightHubState.searchTerm = "";
  const sInput = document.getElementById('insightGlobalSearch');
  if(sInput) sInput.value = "";
  
  Object.keys(window.insightHubState.excelFilters).forEach(k => {
    window.insightHubState.excelFilters[k] = [];
  });
  window.insightHubState.currentPage = 1;
  applyExcelFiltersAndRender();
}

function closeExcelDropdown(event) {
  if(event) event.stopPropagation();
  document.querySelectorAll('.excel-filter-menu').forEach(m => m.style.display = 'none');
}

// ปิดป๊อปอัพตัวเลือกกรองคอลลัมน์อัตโนมัติเมื่อกดข้างนอกตาราง
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
    <div style="display: flex; gap: 5px; align-items: center;">
      <button onclick="changeInsightPage(${state.currentPage - 1})" ${state.currentPage === 1 ? 'disabled' : ''} style="padding: 3px 6px; border: 1px solid #ccc; background: #fff; border-radius: 4px; cursor: pointer;">ก่อนหน้า</button>
      <span style="padding: 0 4px;">หน้า <b>${state.currentPage}</b> / ${totalPages}</span>
      <button onclick="changeInsightPage(${state.currentPage + 1})" ${state.currentPage === totalPages ? 'disabled' : ''} style="padding: 3px 6px; border: 1px solid #ccc; background: #fff; border-radius: 4px; cursor: pointer;">ถัดไป</button>
    </div>
  `;
}

function changeInsightPage(targetPage) {
  window.insightHubState.currentPage = targetPage;
  applyExcelFiltersAndRender();
}

// Modal Timeline รายบุคคลดีไซน์ดั้งเดิมของคุณ 100%
function showCustomerDetailModal(phone) {
  const c = window.insightHubState.allCustomers.find(item => item.phone === phone);
  if (!c) return;

  const modal = document.getElementById('customerProfileModal');
  if (!modal) return;

  let orderRowsHtml = "";
  c.allOrders.forEach(o => {
    orderRowsHtml += `
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding: 8px 0; color: #666;">${o.date ? o.date.toLocaleDateString('th-TH') : '-'}</td>
        <td style="padding: 8px 0; color: #333; font-weight: bold;">${o.product || '-'}</td>
        <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #111;">฿${o.revenue.toLocaleString()}</td>
      </tr>
    `;
  });

  modal.innerHTML = `
    <div style="background: #fff; width: 90%; max-width: 500px; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.2);" onclick="event.stopPropagation()">
      <div style="background: #333; color: #fff; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; font-size: 15px; font-weight: bold;"><i class="fas fa-user-circle" style="margin-right: 8px;"></i>Customer Timeline Profile</h3>
        <button onclick="closeCustomerModal()" style="background: none; border: none; color: #fff; cursor: pointer; font-size: 18px;"><i class="fas fa-times"></i></button>
      </div>
      <div style="padding: 20px; max-height: 380px; overflow-y: auto;">
        <div style="background: #f9f9f9; border: 1px solid #ddd; border-radius: 4px; padding: 12px; margin-bottom: 15px;">
          <div style="font-size: 14px; font-weight: bold; color: #222; margin-bottom: 4px;">${c.customerName}</div>
          <div style="font-size: 12px; color: #555;">เบอร์โทรศัพท์: ${c.phone}</div>
          <div style="font-size: 12px; color: #555; margin-top: 2px;">First Order Channel: ${c.firstChannel} (${c.firstDateStr})</div>
        </div>
        <div style="font-size: 12px; font-weight: bold; color: #555; margin-bottom: 6px;">ประวัติใบสั่งซื้อทั้งหมด</div>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="border-bottom: 2px solid #ddd; text-align: left; color: #666;">
              <th style="padding: 4px 0;">วันที่สั่งซื้อ</th>
              <th style="padding: 4px 0;">รายการสินค้า</th>
              <th style="padding: 4px 0; text-align: right;">ยอดโอน</th>
            </tr>
          </thead>
          <tbody>
            ${orderRowsHtml}
          </tbody>
        </table>
      </div>
      <div style="background: #f5f5f5; padding: 10px 20px; text-align: right; border-top: 1px solid #ddd;">
        <button onclick="closeCustomerModal()" style="background: #666; color: #fff; border: none; padding: 5px 12px; border-radius: 4px; font-size: 12px; cursor: pointer;">ปิดหน้าต่าง</button>
      </div>
    </div>
  `;
  modal.style.display = 'flex';
}

function closeCustomerModal() {
  const modal = document.getElementById('customerProfileModal');
  if (modal) modal.style.display = 'none';
}

window.renderInsightHub = renderInsightHub;
window.clearAllExcelFilters = clearAllExcelFilters;
window.handleExcelCheckboxChange = handleExcelCheckboxChange;
window.clearSpecificExcelFilter = clearSpecificExcelFilter;
window.closeExcelDropdown = closeExcelDropdown;
window.toggleExcelDropdown = toggleExcelDropdown;
window.toggleInsightSort = toggleInsightSort;
window.changeInsightPage = changeInsightPage;
window.showCustomerDetailModal = showCustomerDetailModal;
window.closeCustomerModal = closeCustomerModal;
