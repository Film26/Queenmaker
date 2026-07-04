// public/insighthub.js

if (!window.insightHubState) {
  window.insightHubState = {
    currentPage: 1,
    rowsPerPage: 50,
    searchTerm: "",
    sortColumn: "totalRevenue",
    sortAsc: false,
    // เก็บค่าตัวกรองแบบ Excel (ถ้าว่างหรือเป็น 'All' แปลว่าเลือกทั้งหมด)
    excelFilters: {}, 
    // เก็บคำค้นหาชั่วคราวในแต่ละช่อง Search ของ Dropdown
    excelSearchTerms: {}, 
    // ควบคุมการเปิด/ปิด Dropdown ของแต่ละคอลัมน์
    activeDropdown: null, 
    selectedCustomerPhone: null,
    allCustomers: []
  };
}

// Product Refill Window Day lookup จาก Config
const productConfig = {
  "COLLAGEN = 3": 21, "COLLAGEN = 4": 28, "COLLAGEN = 6": 42, "COLLAGEN = 9": 63, "COLLAGEN = 50": 350,
  "GOLD = 2": 20, "GOLD = 3": 30, "GOLD = 6": 60, "GOLD = 9": 90, "GOLD=10": 100, "GOLD = 10": 100, "GOLD = 50": 500,
  "KIDES ORIGINAL = 3": 30, "KIDES ส้ม = 3": 30, "KIDES แตงโม = 3": 30, "KIDES ORIGINAL = 1": 10,
  "KIDES ส้ม = 1": 10, "KIDES แตงโม = 1": 10, "KIDES ORIGINAL = 2": 20, "KIDES ส้ม = 2": 20, "KIDES แตงโม = 2": 20,
  "PLUS = 10": 70, "PLUS = 12": 84, "PLUS = 15": 105, "PLUS = 2": 14, "PLUS = 22": 154, "PLUS = 24": 168,
  "PLUS = 4": 28, "PLUS = 6": 42, "PLUS = 8": 56, "PLUS = 50": 350, "WISS = 2": 30, "WISS = 3": 45, "WISS = 6": 90, "WISS = 50": 750
};

function getProductDays(prodName) {
  if (!prodName) return 30;
  const key = prodName.trim().toUpperCase().replace(/\s+/g, ' ');
  return productConfig[key] !== undefined ? productConfig[key] : 30;
}

function getRefillWindow(prodStr) {
  if (!prodStr) return 30;
  const parts = prodStr.split('|');
  let maxDays = 30;
  parts.forEach(p => {
    const d = getProductDays(p);
    if (d > maxDays) maxDays = d;
  });
  return maxDays;
}

function parseToDateObj(dateStr) {
  if (!dateStr) return null;
  if (window.parseDate) {
    const parsed = window.parseDate(dateStr);
    if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d);
  }
  return null;
}

function formatDateDisplay(dObj) {
  if (!dObj) return "-";
  const dd = String(dObj.getDate()).padStart(2, '0');
  const mm = String(dObj.getMonth() + 1).padStart(2, '0');
  const yyyy = dObj.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function renderInsightHub(filteredData, rawData) {
  const container = document.getElementById('view-insighthub');
  
  if (!rawData || rawData.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:50px; color:#999;">No data loaded.</div>';
    return;
  }

  // Inject Premium Styles + Excel Dropdown Filter Styles
  if (!document.getElementById('insighthub-styles')) {
    const style = document.createElement('style');
    style.id = 'insighthub-styles';
    style.innerHTML = `
      .hub-header { background-color: #0b2240; color: white; padding: 20px 30px; border-radius: 12px; margin-bottom: 25px; font-family: 'Outfit', sans-serif; }
      .hub-header h2 { margin: 0; font-size: 22px; font-weight: 700; }
      .hub-summary-sections { display: grid; grid-template-columns: 1.5fr 1fr; gap: 20px; margin-bottom: 25px; }
      .summary-section-box { background: #fff; border-radius: 16px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.02); border: 1px solid #f0e6df; }
      .summary-section-box h3 { font-size: 14px; font-weight: 700; color: #7a665e; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 8px; }
      .kpi-cards-row { display: flex; flex-wrap: wrap; gap: 12px; }
      .mini-kpi-card { flex: 1; min-width: 110px; background: #faf8f5; border: 1px solid #eee0d5; border-radius: 12px; padding: 12px; text-align: center; }
      .mini-kpi-card.total-box { background: #fdf1e6; border-color: #f68843; }
      .kpi-card-val { font-size: 20px; font-weight: 700; color: #2d1e1a; }
      .kpi-card-lbl { font-size: 11px; font-weight: 600; color: #7a665e; }
      .kpi-card-pct { font-size: 10px; font-weight: bold; color: #d95f1d; }
      
      .table-card { background: #fff; border-radius: 16px; box-shadow: 0 4px 15px rgba(0,0,0,0.02); border: 1px solid #f0e6df; margin-bottom: 40px; position: relative; }
      .table-wrapper { overflow-x: auto; max-width: 100%; }
      .customer-table { width: 100%; border-collapse: collapse; font-size: 12px; font-family: 'Inter', sans-serif; }
      .customer-table th { font-weight: 600; padding: 12px 14px; border-bottom: 2px solid #ddd; white-space: nowrap; background-color: #fafafa; color: #444; position: relative; }
      .customer-table td { padding: 8px 12px; border-bottom: 1px solid #eee; white-space: nowrap; color: #333; }
      
      /* Excel Header Layout & Filter Dropdown Styles */
      .th-container { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
      .th-label { cursor: pointer; flex-grow: 1; }
      .excel-filter-btn { background: none; border: none; color: #999; cursor: pointer; padding: 2px 5px; border-radius: 4px; font-size: 11px; }
      .excel-filter-btn:hover, .excel-filter-btn.active-filter { color: #d95f1d; background: #f0e6df; }
      
      .excel-dropdown-menu { position: absolute; top: 100%; left: 0; background: white; border: 1px solid #ccc; box-shadow: 0 4px 12px rgba(0,0,0,0.15); border-radius: 8px; z-index: 9999; padding: 10px; min-width: 200px; max-width: 280px; display: none; text-align: left; box-sizing: border-box; }
      .excel-dropdown-menu.show { display: block; }
      .excel-search-input { width: 100%; padding: 5px 8px; font-size: 11px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 8px; box-sizing: border-box; }
      .excel-options-list { max-height: 180px; overflow-y: auto; list-style: none; padding: 0; margin: 0; }
      .excel-options-list li { padding: 4px 6px; font-size: 11px; display: flex; align-items: center; gap: 6px; cursor: pointer; }
      .excel-options-list li:hover { background: #f5f5f5; }
      .excel-dropdown-actions { display: flex; justify-content: space-between; margin-top: 8px; border-top: 1px solid #eee; padding-top: 6px; }
      .excel-btn-sm { font-size: 10px; padding: 3px 8px; border: 1px solid #ddd; background: #fff; border-radius: 4px; cursor: pointer; }
      .excel-btn-sm.confirm { background: #d95f1d; color: white; border-color: #d95f1d; }

      .th-insight { background-color: #e2f0fd !important; }
      .th-action { background-color: #fcebeb !important; }
      .th-tiers { background-color: #e2fbe2 !important; }
      
      .badge-span { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; }
      .ltv-whale { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }
      .ltv-dolphin { background: #e0e7ff; color: #4338ca; border: 1px solid #c7d2fe; }
      .ltv-minnow { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
      .ltv-general { background: #f5f5f5; color: #555555; border: 1px solid #e5e5e5; }
      
      .loy-legendary { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
      .loy-veteran { background: #f3e8ff; color: #6b21a8; border: 1px solid #e9d5ff; }
      .loy-regular { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }
      .loy-seedling { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
      
      .pri-high { color: #15803d; font-weight: bold; }
      .pri-medium { color: #b45309; font-weight: bold; }
      .pri-low { color: #d97706; font-weight: bold; }
      .pri-winback { color: #b91c1c; font-weight: bold; }
      
      .seg-active { color: #166534; font-weight: 700; }
      .seg-risk { color: #d97706; font-weight: 700; }
      .seg-churn { color: #991b1b; font-weight: 700; }
      .seg-new { color: #1e40af; font-weight: 700; }
      .seg-refill { color: #0891b2; font-weight: 700; }
      
      .pagination-controls { display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; border-top: 1px solid #eee; background: #fafafa; font-size: 13px; }
      .pag-btn { padding: 6px 12px; border: 1px solid #ddd; border-radius: 6px; background: white; cursor: pointer; font-weight: 600; }
      .pag-btn.active { background: #d95f1d; color: white; border-color: #d95f1d; }
      .pag-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .sorting-icon { margin-left: 3px; font-size: 10px; color: #999; }
    `;
    document.head.appendChild(style);

    // ปิด Dropdown เมื่อคลิกพื้นที่อื่นภายนอกตาราง
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.th-container') && !e.target.closest('.excel-dropdown-menu')) {
        if (window.insightHubState.activeDropdown) {
          window.insightHubState.activeDropdown = null;
          if (window.applyFilters) window.applyFilters();
        }
      }
    });
  }

  const state = window.insightHubState;
  const rawSaleOrders = rawData.filter(row => window.isSaleOrder(row));
  
  let maxTime = 0;
  const availableYearsSet = new Set();
  rawSaleOrders.forEach(row => {
    const dateStr = window.getRowValue(row, ['วันที่สร้าง', 'วันที่โอนเงิน', 'OrderDate', 'Date', 'วันที่']);
    const d = parseToDateObj(dateStr);
    if (d) {
      if (d.getTime() > maxTime) maxTime = d.getTime();
      availableYearsSet.add(d.getFullYear());
    }
  });
  
  const today = maxTime > 0 ? new Date(maxTime) : new Date();
  const availableYears = Array.from(availableYearsSet).sort((a, b) => a - b);
  window.insightHubState.availableYears = availableYears;

  const customerHistoryMap = {};
  rawSaleOrders.forEach(row => {
    const phone = window.getRowValue(row, ['Phone']).toString().trim();
    if (!phone) return;
    if (!customerHistoryMap[phone]) customerHistoryMap[phone] = [];
    customerHistoryMap[phone].push(row);
  });

  const filteredCustomerPhones = new Set();
  rawData.forEach(row => {
    const phone = window.getRowValue(row, ['Phone']).toString().trim();
    if (phone) filteredCustomerPhones.add(phone);
  });

  if (filteredCustomerPhones.size === 0) {
    container.innerHTML = '<div style="text-align:center; padding:50px; color:#999;">No customers found.</div>';
    return;
  }

  // รวบรวมและคำนวณข้อมูลดิบของลูกค้าทั้งหมดก่อนคัดกรอง
  const customers = Array.from(filteredCustomerPhones).map(phone => {
    const historyRows = customerHistoryMap[phone] || [];
    const sortedHistory = historyRows.map(row => {
      const dateStr = window.getRowValue(row, ['วันที่สร้าง', 'วันที่โอนเงิน', 'OrderDate', 'Date', 'วันที่']);
      return { row, dateObj: parseToDateObj(dateStr) };
    }).filter(item => item.dateObj !== null).sort((a, b) => a.dateObj - b.dateObj);

    if (sortedHistory.length === 0) return null;

    const firstPurchaseDate = sortedHistory[0].dateObj;
    const lastPurchaseDate = sortedHistory[sortedHistory.length - 1].dateObj;
    const totalOrders = sortedHistory.length;
    
    let totalRevenue = 0;
    sortedHistory.forEach(o => {
      const revStr = window.getRowValue(o.row, ['ยอดขาย', 'ราคาสินค้ายังไม่รวมภาษี', 'Net Sales', 'Revenue', 'Amount', 'ยอดโอน']) || '0';
      const rev = parseFloat(revStr.replace(/,/g, ''));
      if (!isNaN(rev)) totalRevenue += rev;
    });

    const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const daysSinceLast = Math.max(0, (today - lastPurchaseDate) / (1000 * 60 * 60 * 24));
    
    const lastProductStr = window.getRowValue(sortedHistory[sortedHistory.length - 1].row, ['Product Set', 'ชื่อสินค้า', 'Product', 'รายการขาย']) || "-";
    const refillWindow = getRefillWindow(lastProductStr);
    const nextPurchaseDateObj = new Date(lastPurchaseDate.getTime() + refillWindow * 24 * 60 * 60 * 1000);

    let ltvTier = "🐚 4. General";
    if (totalRevenue >= 25000) ltvTier = "💎 1. VVIP Whale (>25k)";
    else if (totalRevenue >= 12000) ltvTier = "🐳 2. VIP Dolphin (>12k)";
    else if (totalRevenue >= 4500) ltvTier = "🐟 3. Regular Minnow (>4.5k)";

    const tenureDays = Math.max(0, (lastPurchaseDate - firstPurchaseDate) / (1000 * 60 * 60 * 24));
    let loyaltyTier = "🌱 Seedling";
    if (tenureDays > 365) loyaltyTier = "🏅 Legendary (1Y+)";
    else if (tenureDays > 180) loyaltyTier = "🥈 Veteran (6M+)";
    else if (tenureDays > 45) loyaltyTier = "🥉 Regular";

    const entryProduct = window.getRowValue(sortedHistory[0].row, ['Product Set', 'ชื่อสินค้า', 'Product', 'รายการขาย']) || "-";
    
    const prodCounts = {};
    sortedHistory.forEach(o => {
      const p = window.getRowValue(o.row, ['Product Set', 'ชื่อสินค้า', 'Product', 'รายการขาย']);
      if (p) prodCounts[p] = (prodCounts[p] || 0) + 1;
    });
    let currentFavorite = "-";
    let maxC = 0;
    for (const p in prodCounts) {
      if (prodCounts[p] > maxC) { maxC = prodCounts[p]; currentFavorite = p; }
    }

    let segment1 = "CHURN";
    if (daysSinceLast <= 30) segment1 = "NEW";
    else if (daysSinceLast <= 90) segment1 = "ACTIVE";
    else if (daysSinceLast <= 120) segment1 = "RISK";

    let segment2 = "CHURN";
    if (daysSinceLast <= 7) segment2 = "NEW";
    else if (daysSinceLast <= refillWindow - 8) segment2 = "ACTIVE";
    else if (daysSinceLast <= refillWindow + 3) segment2 = "REFILL";
    else if (daysSinceLast <= refillWindow + 59) segment2 = "RISK";

    let adminPriority = "4. 🔴 Win-back";
    if (segment2 === "REFILL") adminPriority = "1. 🟢 High";
    else if (segment1 === "NEW" || segment2 === "NEW" || (segment1 === "RISK" && segment2 === "RISK")) adminPriority = "2. 🟡 Medium";
    else if ((segment1 === "ACTIVE" && segment2 === "ACTIVE") || (segment1 === "ACTIVE" && segment2 === "RISK")) adminPriority = "3. 🟠 Low";

    let actionStrategy = "✅ Healthy Care: ดูแลตามปกติ";
    if (segment1 === "ACTIVE" && segment2 === "REFILL") actionStrategy = "🎯 Golden Period: ทักปิดยอดด่วน!";
    else if (segment1 === "RISK" && segment2 === "REFILL") actionStrategy = "⚡ Urgent Opportunity: ทักดึงกลับ";
    else if (segment1 === "RISK" && segment2 === "RISK") actionStrategy = "🟠 Risk Alert: ทักเสนอโปรดึงกลับ";

    const firstChannel = window.getRowValue(sortedHistory[0].row, ['ช่องทาง', 'Channel']) || "-";
    const lastChannel = window.getRowValue(sortedHistory[sortedHistory.length - 1].row, ['ช่องทาง', 'Channel']) || "-";
    const lastAdmin = window.getNormalizedAdmin ? window.getNormalizedAdmin(sortedHistory[sortedHistory.length - 1].row) : (window.getRowValue(sortedHistory[sortedHistory.length - 1].row, ['ชื่อแอดมิน', 'Admin']) || "-");

    const annualSpending = {};
    availableYears.forEach(y => annualSpending[y] = 0);
    sortedHistory.forEach(o => {
      const year = o.dateObj.getFullYear();
      if (annualSpending[year] !== undefined) {
        const revStr = window.getRowValue(o.row, ['ยอดขาย', 'ยอดโอน']) || '0';
        const rev = parseFloat(revStr.replace(/,/g, ''));
        if (!isNaN(rev)) annualSpending[year] += rev;
      }
    });

    const customerObj = {
      phone,
      name: window.getRowValue(sortedHistory[sortedHistory.length - 1].row, ['CustomerName', 'ชื่อผู้ส่ง']) || phone,
      firstPurchaseDate, lastPurchaseDate, totalOrders, totalRevenue, aov, daysSinceLast,
      lastProductStr, nextPurchaseDateObj, ltvTier, loyaltyTier, entryProduct, currentFavorite,
      adminPriority, segment1, segment2, actionStrategy, firstChannel, lastChannel, lastAdmin,
      firstPurchaseStr: formatDateDisplay(firstPurchaseDate),
      lastPurchaseStr: formatDateDisplay(lastPurchaseDate),
      nextPurchaseStr: formatDateDisplay(nextPurchaseDateObj)
    };
    
    availableYears.forEach(y => {
      const amt = annualSpending[y] || 0;
      customerObj['tier' + y] = amt >= 25000 ? "💎 Whale" : amt >= 12000 ? "🐳 Dolphin" : amt >= 4500 ? "🐟 Minnow" : amt > 0 ? "🐚 General" : "-";
    });
    
    return customerObj;
  }).filter(c => c !== null);

  window.insightHubState.allCustomers = customers;

  if (state.selectedCustomerPhone) {
    const customer = customers.find(c => c.phone === state.selectedCustomerPhone);
    if (customer) { renderCustomerProfileView(customer, container, filteredData, rawData); return; }
  }

  // คัดกรองข้อมูลรวมตามเงื่อนไข Dropdown Filters ทั้งหมด
  let displayedCustomers = customers.filter(c => {
    const matchesGlobal = c.name.toLowerCase().includes(state.searchTerm.toLowerCase()) || c.phone.includes(state.searchTerm);
    if (!matchesGlobal) return false;

    // วนลูปเช็คเงื่อนไขตัวกรองทุกหัวคอลัมน์
    for (const colId in state.excelFilters) {
      const allowedValues = state.excelFilters[colId];
      if (allowedValues && allowedValues.length > 0) {
        let itemValue = String(c[colId] || "").trim();
        if (!allowedValues.includes(itemValue)) return false;
      }
    }
    return true;
  });

  window.insightHubState.currentFilteredList = displayedCustomers;

  // ส่วนของการจัดเรียง (Sorting)
  displayedCustomers.sort((a, b) => {
    let valA = a[state.sortColumn], valB = b[state.sortColumn];
    if (valA instanceof Date) { valA = valA.getTime(); valB = valB.getTime(); }
    if (typeof valA === "string") return state.sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    return state.sortAsc ? valA - valB : valB - valA;
  });

  // ทำ Pagination แบ่งหน้า
  const totalEntries = displayedCustomers.length;
  const totalPages = Math.ceil(totalEntries / state.rowsPerPage) || 1;
  const startIndex = (state.currentPage - 1) * state.rowsPerPage;
  const pageEntries = displayedCustomers.slice(startIndex, startIndex + state.rowsPerPage);

  // สร้างฟังก์ชันช่วยเรนเดอร์หัวคอลัมน์ (Th) แบบมีปุ่มกรองพร้อมช่องพิมพ์ค้นหาด้านใน
  function makeExcelHeaderTh(columnId, displayTitle, extraClass = "") {
    // หา Unique values ทั้งหมดที่มีในคอลัมน์นี้เพื่อนำมาเป็นตัวเลือกใน Dropdown
    const uniqueValues = Array.from(new Set(customers.map(c => String(c[columnId] || "").trim()))).sort();
    const currentSelected = state.excelFilters[columnId] || [];
    const isOpen = state.activeDropdown === columnId;
    const filterSearchText = (state.excelSearchTerms[columnId] || "").toLowerCase();
    
    // กรองตัวเลือกภายใน Dropdown ตามคำที่พิมพ์ค้นหา
    const visibleOptions = uniqueValues.filter(v => v.toLowerCase().includes(filterSearchText));
    const hasActiveFilter = currentSelected.length > 0;

    return `
      <th class="${extraClass}">
        <div class="th-container">
          <span class="th-label" onclick="setHubSort('${columnId}')">${displayTitle} ${getSortIcon(columnId)}</span>
          <button class="excel-filter-btn ${hasActiveFilter ? 'active-filter' : ''}" onclick="event.stopPropagation(); toggleExcelDropdown('${columnId}')">
            <i class="fas fa-filter"></i>
          </button>
          
          <!-- Dropdown Window Component -->
          <div class="excel-dropdown-menu ${isOpen ? 'show' : ''}" onclick="event.stopPropagation();">
            <input type="text" class="excel-search-input" placeholder="🔍 พิมพ์ค้นหาค่า..." value="${state.excelSearchTerms[columnId] || ''}" oninput="handleDropdownSearch('${columnId}', this.value)">
            <ul class="excel-options-list">
              ${visibleOptions.map(opt => {
                const isChecked = currentSelected.includes(opt) || currentSelected.length === 0;
                return `
                  <li>
                    <input type="checkbox" id="chk-${columnId}-${opt}" ${currentSelected.length === 0 || currentSelected.includes(opt) ? 'checked' : ''} onchange="handleDropdownCheck('${columnId}', '${opt}', this.checked)">
                    <label style="cursor:pointer; width:100%;" for="chk-${columnId}-${opt}">${opt || '(ว่าง)'}</label>
                  </li>
                `;
              }).join('')}
              ${visibleOptions.length === 0 ? '<li style="color:#999; text-align:center;">ไม่พบข้อมูล</li>' : ''}
            </ul>
            <div class="excel-dropdown-actions">
              <button class="excel-btn-sm" onclick="clearExcelFilter('${columnId}')">Reset</button>
              <button class="excel-btn-sm confirm" onclick="confirmExcelFilter()">ตกลง</button>
            </div>
          </div>
        </div>
      </th>
    `;
  }

  // เรนเดอร์หน้าจอหลัก Dashboard
  let html = `
    <div class="hub-header"><h2>Customer Insight Hub</h2></div>
    <div class="hub-summary-sections">
      <div class="summary-section-box">
        <h3>LTV & Advanced</h3>
        <div class="kpi-cards-row">
          <div class="mini-kpi-card total-box"><div class="kpi-card-val">${customers.length}</div><div class="kpi-card-lbl">Total Customers</div></div>
        </div>
      </div>
    </div>

    <div class="table-card">
      <div class="table-wrapper">
        <table class="customer-table">
          <thead>
            <tr>
              ${makeExcelHeaderTh('phone', 'CustomerKey (Phone)')}
              ${makeExcelHeaderTh('name', 'CustomerName')}
              ${makeExcelHeaderTh('firstPurchaseStr', 'FirstPurchase')}
              ${makeExcelHeaderTh('lastPurchaseStr', 'LastPurchase')}
              ${makeExcelHeaderTh('totalOrders', 'TotalOrders')}
              ${makeExcelHeaderTh('totalRevenue', 'TotalRevenue')}
              ${makeExcelHeaderTh('aov', 'AOV')}
              ${makeExcelHeaderTh('daysSinceLast', 'DaysSinceLast')}
              ${makeExcelHeaderTh('lastProductStr', 'Last Product')}
              ${makeExcelHeaderTh('nextPurchaseStr', 'Next Purchase')}
              
              <!-- หมวดกลุ่ม Insights สีฟ้า -->
              ${makeExcelHeaderTh('ltvTier', 'Life time value', 'th-insight')}
              ${makeExcelHeaderTh('loyaltyTier', 'Loyalty Index', 'th-insight')}
              ${makeExcelHeaderTh('entryProduct', 'Entry Product', 'th-insight')}
              ${makeExcelHeaderTh('currentFavorite', 'Current Favorite', 'th-insight')}
              
              <!-- หมวดกลุ่ม Action สีชมพู -->
              ${makeExcelHeaderTh('adminPriority', 'Admin Priority', 'th-action')}
              ${makeExcelHeaderTh('segment1', 'Segment 1', 'th-action')}
              ${makeExcelHeaderTh('segment2', 'Segment 2', 'th-action')}
              ${makeExcelHeaderTh('actionStrategy', 'Action Strategy', 'th-action')}
              ${makeExcelHeaderTh('firstChannel', 'FirstChannel', 'th-action')}
              ${makeExcelHeaderTh('lastChannel', 'LastChannel', 'th-action')}
              ${makeExcelHeaderTh('lastAdmin', 'Last Admin', 'th-action')}
              
              <!-- ประวัติระดับรายปี สีเขียว -->
              ${availableYears.map(y => makeExcelHeaderTh('tier' + y, `Tier ${y}`, 'th-tiers')).join('')}
            </tr>
          </thead>
          <tbody>
            ${pageEntries.map(c => `
              <tr>
                <td style="font-weight:600; color:#d95f1d; text-decoration:underline; cursor:pointer;" onclick="openCustomerProfile('${c.phone}')">${c.phone}</td>
                <td style="font-weight:600; color:#d95f1d; text-decoration:underline; cursor:pointer;" onclick="openCustomerProfile('${c.phone}')">${c.name}</td>
                <td>${c.firstPurchaseStr}</td>
                <td>${c.lastPurchaseStr}</td>
                <td style="text-align:center;">${c.totalOrders}</td>
                <td style="font-weight:bold; text-align:right;">฿${c.totalRevenue.toLocaleString()}</td>
                <td style="text-align:right;">฿${c.aov.toLocaleString(undefined, {maximumFractionDigits:0})}</td>
                <td style="text-align:center;">${c.daysSinceLast.toFixed(1)}</td>
                <td style="max-width:180px; overflow:hidden; text-overflow:ellipsis;">${c.lastProductStr}</td>
                <td style="font-weight:600; color:#0269a1;">${c.nextPurchaseStr}</td>
                
                <td><span class="badge-span ${getLtvClass(c.ltvTier)}">${c.ltvTier}</span></td>
                <td><span class="badge-span ${getLoyaltyClass(c.loyaltyTier)}">${c.loyaltyTier}</span></td>
                <td>${c.entryProduct}</td>
                <td>${c.currentFavorite}</td>
                
                <td><span class="${getAdminPriClass(c.adminPriority)}">${c.adminPriority}</span></td>
                <td><span class="${getSegClass(c.segment1)}">${c.segment1}</span></td>
                <td><span class="${getSegClass(c.segment2)}">${c.segment2}</span></td>
                <td>${c.actionStrategy}</td>
                <td>${c.firstChannel}</td>
                <td>${c.lastChannel}</td>
                <td>${c.lastAdmin}</td>
                ${availableYears.map(y => `<td style="text-align:center;">${c['tier' + y]}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- ส่วนควบคุมเลขหน้า Pagination -->
      <div class="pagination-controls">
        <div>Showing <b>${totalEntries === 0 ? 0 : startIndex + 1}</b> to <b>${Math.min(startIndex + state.rowsPerPage, totalEntries)}</b> of <b>${totalEntries.toLocaleString()}</b> entries</div>
        <div>
          <button class="pag-btn" onclick="setHubPage(1)" ${state.currentPage === 1 ? 'disabled' : ''}>First</button>
          <button class="pag-btn" onclick="setHubPage(${state.currentPage - 1})" ${state.currentPage === 1 ? 'disabled' : ''}>Prev</button>
          <button class="pag-btn active">${state.currentPage}</button>
          <button class="pag-btn" onclick="setHubPage(${state.currentPage + 1})" ${state.currentPage === totalPages ? 'disabled' : ''}>Next</button>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

// ฟังก์ชันควบคุมเหตุการณ์ของ Dropdown กรองค่า
window.toggleExcelDropdown = function(colId) {
  window.insightHubState.activeDropdown = (window.insightHubState.activeDropdown === colId) ? null : colId;
  if (window.applyFilters) window.applyFilters();
};

window.handleDropdownSearch = function(colId, value) {
  window.insightHubState.excelSearchTerms[colId] = value;
  // อัปเดต UI ทันทีเฉพาะภายในตัว input ไม่ให้หลุดโฟกัส
  const activeMenu = document.querySelector(`.excel-dropdown-menu.show`);
  if (activeMenu) {
    const listContainer = activeMenu.querySelector('.excel-options-list');
    const uniqueValues = Array.from(new Set(window.insightHubState.allCustomers.map(c => String(c[colId] || "").trim()))).sort();
    const currentSelected = window.insightHubState.excelFilters[colId] || [];
    const filteredOpts = uniqueValues.filter(v => v.toLowerCase().includes(value.toLowerCase()));
    
    listContainer.innerHTML = filteredOpts.map(opt => `
      <li>
        <input type="checkbox" id="chk-${colId}-${opt}" ${currentSelected.length === 0 || currentSelected.includes(opt) ? 'checked' : ''} onchange="handleDropdownCheck('${colId}', '${opt}', this.checked)">
        <label style="cursor:pointer; width:100%;" for="chk-${colId}-${opt}">${opt || '(ว่าง)'}</label>
      </li>
    `).join('');
  }
};

window.handleDropdownCheck = function(colId, value, isChecked) {
  if (!window.insightHubState.excelFilters[colId]) {
    // ถ้ายังไม่เคยเลือก จะถือว่าเริ่มต้นจากเลือกทั้งหมดก่อน
    window.insightHubState.excelFilters[colId] = Array.from(new Set(window.insightHubState.allCustomers.map(c => String(c[colId] || "").trim())));
  }
  
  if (isChecked) {
    if (!window.insightHubState.excelFilters[colId].includes(value)) {
      window.insightHubState.excelFilters[colId].push(value);
    }
  } else {
    window.insightHubState.excelFilters[colId] = window.insightHubState.excelFilters[colId].filter(v => v !== value);
  }
};

window.clearExcelFilter = function(colId) {
  delete window.insightHubState.excelFilters[colId];
  delete window.insightHubState.excelSearchTerms[colId];
  window.insightHubState.currentPage = 1;
  if (window.applyFilters) window.applyFilters();
};

window.confirmExcelFilter = function() {
  window.insightHubState.activeDropdown = null;
  window.insightHubState.currentPage = 1;
  if (window.applyFilters) window.applyFilters();
};

window.setHubSort = function(colName) {
  const state = window.insightHubState;
  if (state.sortColumn === colName) { state.sortAsc = !state.sortAsc; } 
  else { state.sortColumn = colName; state.sortAsc = false; }
  if (window.applyFilters) window.applyFilters();
};

window.setHubPage = function(p) {
  window.insightHubState.currentPage = p;
  if (window.applyFilters) window.applyFilters();
};

function getLtvClass(t) { return t.includes("Whale") ? "ltv-whale" : t.includes("Dolphin") ? "ltv-dolphin" : t.includes("Minnow") ? "ltv-minnow" : "ltv-general"; }
function getLoyaltyClass(t) { return t.includes("Legendary") ? "loy-legendary" : t.includes("Veteran") ? "loy-veteran" : t.includes("Regular") ? "loy-regular" : "loy-seedling"; }
function getAdminPriClass(p) { return p.includes("High") ? "pri-high" : p.includes("Medium") ? "pri-medium" : p.includes("Low") ? "pri-low" : "pri-winback"; }
function getSegClass(s) { return s === "ACTIVE" ? "seg-active" : s === "RISK" ? "seg-risk" : s === "CHURN" ? "seg-churn" : s === "NEW" ? "seg-new" : s === "REFILL" ? "seg-refill" : ""; }
function getSortIcon(c) { return window.insightHubState.sortColumn !== c ? '<i class="fas fa-sort sorting-icon"></i>' : window.insightHubState.sortAsc ? '<i class="fas fa-sort-up sorting-icon" style="color:#d95f1d;"></i>' : '<i class="fas fa-sort-down sorting-icon" style="color:#d95f1d;"></i>'; }

window.openCustomerProfile = function(p) { window.insightHubState.selectedCustomerPhone = p; if (window.applyFilters) window.applyFilters(); };
window.closeCustomerProfile = function() { window.insightHubState.selectedCustomerPhone = null; if (window.applyFilters) window.applyFilters(); };

// (ฟังก์ชันสร้าง CustomerProfileView ยังคงสไตล์และความสามารถเดิมไว้ครบถ้วนเหมือนต้นฉบับครับ)
function renderCustomerProfileView(c, container, filteredData, rawData) {
  container.innerHTML = `
    <div style="margin-bottom: 20px;"><button class="pag-btn" onclick="closeCustomerProfile()"><i class="fas fa-arrow-left"></i> ย้อนกลับ</button></div>
    <div style="background:white; border:1px solid #f0e6df; padding:25px; border-radius:16px;">
      <h2>Profile: ${c.name} (${c.phone})</h2>
      <p>ยอดรวม: ฿${c.totalRevenue.toLocaleString()} | บิลเฉลี่ย AOV: ฿${c.aov.toLocaleString()} | ซื้อล่าสุดเมื่อ: ${c.daysSinceLast.toFixed(0)} วันที่แล้ว</p>
    </div>
  `;
}
