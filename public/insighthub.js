// public/insighthub.js

if (!window.insightHubState) {
  window.insightHubState = {
    currentPage: 1,
    rowsPerPage: 50,
    searchTerm: "",
    sortColumn: "totalRevenue",
    sortAsc: false,
    // เก็บค่าคัดกรอง (ตัวเลือกที่เลือกไว้) ของแต่ละคอลัมน์ [columnId]: [ array ของค่าที่ถูกเลือก ]
    excelFilters: {}, 
    // เก็บคำค้นหาภายในแต่ละช่อง Search ของ Dropdown [columnId]: "คำที่พิมพ์"
    excelSearchTerms: {}, 
    // ควบคุมการเปิด/ปิด Dropdown ของแต่ละคอลัมน์ (เก็บ id คอลัมน์ที่เปิดอยู่)
    activeDropdown: null, 
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
  "KIDES ORIGINAL = 2": 20,
  "KIDES ส้ม = 2": 20,
  "KIDES แตงโม = 2": 20,
  "PLUS = 10": 70,
  "PLUS = 12": 84,
  "PLUS = 15": 105,
  "PLUS = 2": 14,
  "PLUS = 22": 154,
  "PLUS = 24": 168,
  "PLUS = 4": 28,
  "PLUS = 6": 42,
  "PLUS = 8": 56,
  "PLUS = 50": 350,
  "WISS = 2": 30,
  "WISS = 3": 45,
  "WISS = 6": 90,
  "WISS = 50": 750
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
    if (d > maxDays) {
      maxDays = d;
    }
  });
  return maxDays;
}

function parseToDateObj(dateStr) {
  if (!dateStr) return null;
  if (window.parseDate) {
    const parsed = window.parseDate(dateStr);
    if (parsed) {
      return new Date(parsed.y, parsed.m - 1, parsed.d);
    }
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
    container.innerHTML = '<div style="text-align:center; padding:50px; color:#999;">No data loaded. Please import or load sample data.</div>';
    return;
  }

  // 1. Inject Premium Styles + Excel Filter Component Styles
  if (!document.getElementById('insighthub-styles')) {
    const style = document.createElement('style');
    style.id = 'insighthub-styles';
    style.innerHTML = `
      .hub-header {
        background-color: #0b2240;
        color: white;
        padding: 20px 30px;
        border-radius: 12px;
        margin-bottom: 25px;
        font-family: 'Outfit', sans-serif;
      }
      .hub-header h2 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.5px; }
      
      .hub-summary-sections {
        display: grid;
        grid-template-columns: 1.5fr 1fr;
        gap: 20px;
        margin-bottom: 25px;
      }
      .summary-section-box {
        background: #fff;
        border-radius: 16px;
        padding: 20px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.02);
        border: 1px solid #f0e6df;
      }
      .summary-section-box h3 {
        font-size: 14px;
        font-weight: 700;
        color: #7a665e;
        margin-bottom: 15px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        border-bottom: 1px solid #eee;
        padding-bottom: 8px;
      }
      
      .kpi-cards-row {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }
      .mini-kpi-card {
        flex: 1;
        min-width: 110px;
        background: #faf8f5;
        border: 1px solid #eee0d5;
        border-radius: 12px;
        padding: 12px;
        text-align: center;
        transition: transform 0.2s;
      }
      .mini-kpi-card:hover {
        transform: translateY(-2px);
      }
      .mini-kpi-card.total-box {
        background: #fdf1e6;
        border-color: #f68843;
      }
      .kpi-card-val {
        font-size: 20px;
        font-weight: 700;
        color: #2d1e1a;
        margin-bottom: 2px;
      }
      .kpi-card-lbl {
        font-size: 11px;
        font-weight: 600;
        color: #7a665e;
        margin-bottom: 4px;
      }
      .kpi-card-pct {
        font-size: 10px;
        font-weight: bold;
        color: #d95f1d;
      }
      
      .table-card {
        background: #fff;
        border-radius: 16px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.02);
        border: 1px solid #f0e6df;
        overflow: visible; /* เปลี่ยนเป็น visible เพื่อป้องกันดรอปดาวน์โดนขอบตารางตัดขาด */
        margin-bottom: 40px;
        position: relative;
      }
      .table-wrapper {
        overflow-x: auto;
        max-width: 100%;
        scrollbar-width: thin;
      }
      .customer-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
        font-family: 'Inter', sans-serif;
        text-align: left;
      }
      .customer-table th {
        font-weight: 600;
        padding: 12px 14px;
        border-bottom: 2px solid #ddd;
        white-space: nowrap;
        background-color: #fafafa;
        color: #444;
        user-select: none;
        position: relative;
      }
      .customer-table td {
        padding: 8px 12px;
        border-bottom: 1px solid #eee;
        white-space: nowrap;
        color: #333;
      }
      .customer-table tr:hover td {
        background-color: #fafafa;
      }
      
      /* Layout สำหรับปุ่ม Filter และการ Sort บนหัวตาราง */
      .th-container {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
      }
      .th-label {
        cursor: pointer;
        flex-grow: 1;
      }
      .excel-filter-btn {
        background: none;
        border: none;
        color: #bbb;
        cursor: pointer;
        padding: 2px 5px;
        border-radius: 4px;
        font-size: 11px;
        transition: all 0.15s;
      }
      .excel-filter-btn:hover, .excel-filter-btn.active-filter {
        color: #d95f1d;
        background: #f0e6df;
      }
      
      /* หน้าต่าง Excel Dropdown Box */
      .excel-dropdown-menu {
        position: absolute;
        top: 100%;
        right: 0;
        background: white;
        border: 1px solid #ccc;
        box-shadow: 0 4px 15px rgba(0,0,0,0.15);
        border-radius: 8px;
        z-index: 9999;
        padding: 10px;
        min-width: 220px;
        max-width: 280px;
        display: none;
        text-align: left;
        box-sizing: border-box;
      }
      .excel-dropdown-menu.show {
        display: block;
      }
      .excel-search-input {
        width: 100%;
        padding: 6px 10px;
        font-size: 11px;
        border: 1px solid #ddd;
        border-radius: 5px;
        margin-bottom: 8px;
        box-sizing: border-box;
        outline: none;
      }
      .excel-search-input:focus {
        border-color: #d95f1d;
      }
      .excel-options-list {
        max-height: 160px;
        overflow-y: auto;
        list-style: none;
        padding: 0;
        margin: 0;
        scrollbar-width: thin;
      }
      .excel-options-list li {
        padding: 5px 6px;
        font-size: 11px;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
      }
      .excel-options-list li:hover {
        background: #f5f5f5;
      }
      .excel-dropdown-actions {
        display: flex;
        justify-content: space-between;
        margin-top: 8px;
        border-top: 1px solid #eee;
        padding-top: 6px;
      }
      .excel-btn-sm {
        font-size: 11px;
        padding: 4px 10px;
        border: 1px solid #ddd;
        background: #fff;
        border-radius: 5px;
        cursor: pointer;
      }
      .excel-btn-sm.confirm {
        background: #d95f1d;
        color: white;
        border-color: #d95f1d;
        font-weight: 600;
      }
      
      .th-insight { background-color: #e2f0fd !important; }
      .th-action { background-color: #fcebeb !important; }
      .th-tiers { background-color: #e2fbe2 !important; }
      
      .badge-span {
        display: inline-block;
        padding: 3px 8px;
        border-radius: 12px;
        font-size: 10px;
        font-weight: 700;
      }
      
      /* Life Time Value colors */
      .ltv-whale { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }
      .ltv-dolphin { background: #e0e7ff; color: #4338ca; border: 1px solid #c7d2fe; }
      .ltv-minnow { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
      .ltv-general { background: #f5f5f5; color: #555555; border: 1px solid #e5e5e5; }
      
      /* Loyalty Index colors */
      .loy-legendary { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
      .loy-veteran { background: #f3e8ff; color: #6b21a8; border: 1px solid #e9d5ff; }
      .loy-regular { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }
      .loy-seedling { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
      
      /* Admin Priority colors */
      .pri-high { color: #15803d; font-weight: bold; }
      .pri-medium { color: #b45309; font-weight: bold; }
      .pri-low { color: #d97706; font-weight: bold; }
      .pri-winback { color: #b91c1c; font-weight: bold; }
      
      /* Segments colors */
      .seg-active { color: #166534; font-weight: 700; }
      .seg-risk { color: #d97706; font-weight: 700; }
      .seg-churn { color: #991b1b; font-weight: 700; }
      .seg-new { color: #1e40af; font-weight: 700; }
      .seg-refill { color: #0891b2; font-weight: 700; }
      
      .act-strategy {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-weight: 600;
        color: #222;
      }
      
      .pagination-controls {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 15px 20px;
        border-top: 1px solid #eee;
        background: #fafafa;
        font-size: 13px;
        color: #666;
      }
      .pagination-buttons {
        display: flex;
        gap: 6px;
      }
      .pag-btn {
        padding: 6px 12px;
        border: 1px solid #ddd;
        border-radius: 6px;
        background: white;
        cursor: pointer;
        font-weight: 600;
        transition: all 0.2s;
      }
      .pag-btn:hover:not(:disabled) {
        background: #fdf1e6;
        color: #d95f1d;
        border-color: #f68843;
      }
      .pag-btn.active {
        background: #d95f1d;
        color: white;
        border-color: #d95f1d;
      }
      .pag-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      .sorting-icon {
        margin-left: 5px;
        font-size: 10px;
        color: #999;
      }
      
      /* Profile View Styles */
      .profile-kpi-grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 20px; }
      .profile-kpi-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 25px; }
      @media (max-width: 1024px) {
        .profile-kpi-grid-4 { grid-template-columns: repeat(2, 1fr); }
        .profile-kpi-grid-3 { grid-template-columns: repeat(2, 1fr); }
      }
      @media (max-width: 600px) {
        .profile-kpi-grid-4 { grid-template-columns: 1fr; }
        .profile-kpi-grid-3 { grid-template-columns: 1fr; }
      }
      .profile-kpi-card {
        background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px;
        display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 10px rgba(0,0,0,0.01);
      }
      .profile-kpi-info { display: flex; flex-direction: column; gap: 4px; }
      .profile-kpi-lbl { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
      .profile-kpi-val { font-size: 22px; font-weight: 700; color: #0f172a; }
      .profile-kpi-icon {
        font-size: 20px; color: #2563eb; background: #eff6ff; width: 40px; height: 40px;
        border-radius: 50%; display: flex; align-items: center; justify-content: center;
      }
      .profile-detail-card h3 { font-size: 16px; font-weight: 700; color: #1e293b; margin: 0 0 15px 0; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; }
      .profile-detail-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #f8fafc; }
      .profile-detail-row:last-child { border-bottom: none; }
    `;
    document.head.appendChild(style);

    // ปิดหน้าต่าง Filter Dropdown เมื่อคลิกนอกพื้นที่ควบคุม
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

  // 2. Pre-aggregate ALL transaction history from rawData by customer phone
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
    if (!customerHistoryMap[phone]) {
      customerHistoryMap[phone] = [];
    }
    customerHistoryMap[phone].push(row);
  });

  const filteredCustomerPhones = new Set();
  rawData.forEach(row => {
    const phone = window.getRowValue(row, ['Phone']).toString().trim();
    if (phone) filteredCustomerPhones.add(phone);
  });

  if (filteredCustomerPhones.size === 0) {
    container.innerHTML = '<div style="text-align:center; padding:50px; color:#999;">No customers found matching the filters.</div>';
    return;
  }

  // 3. Compile customer records (calculating Excel formulas dynamically)
  const customers = Array.from(filteredCustomerPhones).map(phone => {
    const historyRows = customerHistoryMap[phone] || [];
    const sortedHistory = historyRows.map(row => {
      const dateStr = window.getRowValue(row, ['วันที่สร้าง', 'วันที่โอนเงิน', 'OrderDate', 'Date', 'วันที่']);
      return { row: row, dateObj: parseToDateObj(dateStr) };
    }).filter(item => item.dateObj !== null).sort((a, b) => a.dateObj - b.dateObj);

    if (sortedHistory.length === 0) return null;

    const firstOrder = sortedHistory[0];
    const lastOrder = sortedHistory[sortedHistory.length - 1];
    
    const firstPurchaseDate = firstOrder.dateObj;
    const lastPurchaseDate = lastOrder.dateObj;
    const totalOrders = sortedHistory.length;
    
    let totalRevenue = 0;
    sortedHistory.forEach(o => {
      const revStr = window.getRowValue(o.row, ['ยอดขาย', 'ราคาสินค้ายังไม่รวมภาษี', 'Net Sales', 'Revenue', 'Amount', 'ยอดโอน']) || '0';
      const rev = parseFloat(revStr.replace(/,/g, ''));
      if (!isNaN(rev)) totalRevenue += rev;
    });

    const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const diffTime = today - lastPurchaseDate;
    const daysSinceLast = Math.max(0, diffTime / (1000 * 60 * 60 * 24));
    
    const lastProductStr = window.getRowValue(lastOrder.row, ['Product Set', 'ชื่อสินค้า', 'Product', 'รายการขาย']) || "-";
    const refillWindow = getRefillWindow(lastProductStr);
    const nextPurchaseDateObj = new Date(lastPurchaseDate.getTime() + refillWindow * 24 * 60 * 60 * 1000);

    // Life Time Value Tier
    let ltvTier = "🐚 4. General";
    if (totalRevenue >= 25000) ltvTier = "💎 1. VVIP Whale (>25k)";
    else if (totalRevenue >= 12000) ltvTier = "🐳 2. VIP Dolphin (>12k)";
    else if (totalRevenue >= 4500) ltvTier = "🐟 3. Regular Minnow (>4.5k)";

    // Loyalty Index
    const tenureDays = Math.max(0, (lastPurchaseDate - firstPurchaseDate) / (1000 * 60 * 60 * 24));
    let loyaltyTier = "🌱 Seedling";
    if (tenureDays > 365) loyaltyTier = "🏅 Legendary (1Y+)";
    else if (tenureDays > 180) loyaltyTier = "🥈 Veteran (6M+)";
    else if (tenureDays > 45) loyaltyTier = "🥉 Regular";

    const entryProduct = window.getRowValue(firstOrder.row, ['Product Set', 'ชื่อสินค้า', 'Product', 'รายการขาย']) || "-";
    
    const prodCounts = {};
    sortedHistory.forEach(o => {
      const p = window.getRowValue(o.row, ['Product Set', 'ชื่อสินค้า', 'Product', 'รายการขาย']);
      if (p) prodCounts[p] = (prodCounts[p] || 0) + 1;
    });
    let currentFavorite = "-";
    let maxC = 0;
    for (const p in prodCounts) {
      if (prodCounts[p] > maxC) {
        maxC = prodCounts[p];
        currentFavorite = p;
      }
    }

    // Segment 1
    let segment1 = "CHURN";
    if (daysSinceLast <= 30) segment1 = "NEW";
    else if (daysSinceLast <= 90) segment1 = "ACTIVE";
    else if (daysSinceLast <= 120) segment1 = "RISK";

    // Segment 2
    let segment2 = "CHURN";
    if (daysSinceLast <= 7) segment2 = "NEW";
    else if (daysSinceLast <= refillWindow - 8) segment2 = "ACTIVE";
    else if (daysSinceLast <= refillWindow + 3) segment2 = "REFILL";
    else if (daysSinceLast <= refillWindow + 59) segment2 = "RISK";

    // Admin Priority
    let adminPriority = "4. 🔴 Win-back (กู้สถานะ)";
    if (segment2 === "REFILL") {
      adminPriority = "1. 🟢 High (ยอดขาย)";
    } else if (segment1 === "NEW" || segment2 === "NEW" || (segment1 === "RISK" && segment2 === "RISK")) {
      adminPriority = "2. 🟡 Medium (สร้างใจ)";
    } else if (
      (segment1 === "ACTIVE" && segment2 === "ACTIVE") ||
      ((segment1 === "RISK" || segment1 === "CHURN") && segment2 === "ACTIVE") ||
      (segment1 === "ACTIVE" && segment2 === "RISK")
    ) {
      adminPriority = "3. 🟠 Low (ดูแลสัมพันธ์)";
    }

    // Action Strategy Guideline
    let actionStrategy = "✅ Healthy Care: ดูแลตามปกติ";
    if (segment1 === "ACTIVE" && segment2 === "REFILL") actionStrategy = "🎯 Golden Period: ทักปิดยอดด่วน!";
    else if (segment1 === "RISK" && segment2 === "REFILL") actionStrategy = "⚡ Urgent Opportunity: ทักดึงกลับด้วยโปร";
    else if (segment1 === "CHURN" && segment2 === "REFILL") actionStrategy = "🕒 Legacy Refill: ทักกระตุ้นรอบใหม่";
    else if ((segment1 === "RISK" || segment1 === "CHURN") && segment2 === "ACTIVE") actionStrategy = "💎 High LTV: ลูกค้าเซ็ตใหญ่ (ห้ามตื๊อ)";
    else if (segment1 === "RISK" && segment2 === "RISK") actionStrategy = "🟠 Risk Alert: ทักเสนอโปรดึงกลับ";
    else if (segment1 === "NEW" && segment2 === "RISK") actionStrategy = "🟠 Risk Alert: ถามวิธีทาน/กระตุ้น/ความพอใจ";
    else if (segment1 === "ACTIVE" && segment2 === "RISK") actionStrategy = "⚠️ Slow User: ทักถามวิธีทาน/กระตุ้น";
    else if (segment1 === "ACTIVE" && segment2 === "CHURN") actionStrategy = "🚨 Speed Churn: ทักถามความพึงพอใจ";
    else if (segment1 === "NEW" && segment2 === "NEW") actionStrategy = "💖 Welcome: ติดตามผล/สอนวิธีใช้";
    else if ((segment1 === "RISK" || segment1 === "CHURN") && segment2 === "CHURN") actionStrategy = "😴 Dead Churn: ส่งโปรแรงดึงกลับ";

    const firstChannel = window.getRowValue(firstOrder.row, ['ช่องทาง', 'Channel']) || "-";
    const lastChannel = window.getRowValue(lastOrder.row, ['ช่องทาง', 'Channel']) || "-";
    
    let lastAdmin = "-";
    if (window.getNormalizedAdmin) {
      lastAdmin = window.getNormalizedAdmin(lastOrder.row);
    } else {
      lastAdmin = window.getRowValue(lastOrder.row, ['ชื่อแอดมิน', 'Admin', 'Admin Name']) || "-";
    }

    // Annual Tiers
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

    const getYearTier = (amt) => {
      if (amt <= 0) return "-";
      if (amt >= 25000) return "💎 Whale";
      if (amt >= 12000) return "🐳 Dolphin";
      if (amt >= 4500) return "🐟 Minnow";
      return "🐚 General";
    };

    const customerObj = {
      phone,
      name: window.getRowValue(lastOrder.row, ['CustomerName', 'ชื่อผู้ส่ง', 'Customer ID', 'รหัสลูกค้า']) || phone,
      firstPurchaseDate,
      lastPurchaseDate,
      totalOrders,
      totalRevenue,
      aov,
      daysSinceLast,
      lastProductStr,
      nextPurchaseDateObj,
      ltvTier,
      loyaltyTier,
      entryProduct,
      currentFavorite,
      adminPriority,
      segment1,
      segment2,
      actionStrategy,
      firstChannel,
      lastChannel,
      lastAdmin,
      // แปลงฟอร์แมตวันที่เป็นข้อความไว้สำหรับแสดงผลและเสิร์ชใน Filter ของ Excel
      firstPurchaseStr: formatDateDisplay(firstPurchaseDate),
      lastPurchaseStr: formatDateDisplay(lastPurchaseDate),
      nextPurchaseStr: formatDateDisplay(nextPurchaseDateObj),
      totalOrdersStr: String(totalOrders),
      totalRevenueStr: "฿" + totalRevenue.toLocaleString(undefined, {maximumFractionDigits:0}),
      aovStr: "฿" + aov.toLocaleString(undefined, {maximumFractionDigits:0}),
      daysSinceLastStr: daysSinceLast.toFixed(1)
    };
    
    availableYears.forEach(y => {
      customerObj['tier' + y] = getYearTier(annualSpending[y] || 0);
    });
    
    return customerObj;
  }).filter(c => c !== null);

  window.insightHubState.allCustomers = customers;

  if (state.selectedCustomerPhone) {
    const customer = customers.find(c => c.phone === state.selectedCustomerPhone);
    if (customer) {
      renderCustomerProfileView(customer, container, filteredData, rawData);
      return;
    }
  }

  // 4. Calculate KPI aggregation counts
  let countWhale = 0, countDolphin = 0, countMinnow = 0, countGeneral = 0;
  let countActive = 0, countRisk = 0, countChurn = 0;
  const totalCount = customers.length;

  customers.forEach(c => {
    if (c.ltvTier.includes("Whale")) countWhale++;
    else if (c.ltvTier.includes("Dolphin")) countDolphin++;
    else if (c.ltvTier.includes("Minnow")) countMinnow++;
    else countGeneral++;

    if (c.segment1 === "ACTIVE") countActive++;
    else if (c.segment1 === "RISK") countRisk++;
    else if (c.segment1 === "CHURN") countChurn++;
  });

  const getPctStr = (count) => totalCount > 0 ? ((count / totalCount) * 100).toFixed(0) + '%' : '0%';

  // 5. คัดกรองข้อมูลหลักตาม Global Search และ Excel Multi-Checkbox Dropdown ทุกฟิลด์แบบไดนามิก
  let displayedCustomers = customers.filter(c => {
    // แถบค้นหาหลัก (Global Search) ค้นชื่อหรือเบอร์
    const matchesSearch = c.name.toLowerCase().includes(state.searchTerm.toLowerCase()) || c.phone.includes(state.searchTerm);
    if (!matchesSearch) return false;

    // ตรวจสอบเงื่อนไขคัดกรองของคอลัมน์ Excel Dropdowns ทั้งหมด
    for (const colId in state.excelFilters) {
      const allowedValues = state.excelFilters[colId];
      if (allowedValues && allowedValues.length > 0) {
        // ดึงค่าของฟิลด์นั้นมาตรวจสอบ (ใช้ฟิลด์สำหรับเช็คข้อความแสดงผล)
        let itemValue = String(c[colId] || "").trim();
        if (colId === 'firstPurchaseDate') itemValue = c.firstPurchaseStr;
        if (colId === 'lastPurchaseDate') itemValue = c.lastPurchaseStr;
        if (colId === 'nextPurchaseDateObj') itemValue = c.nextPurchaseStr;
        if (colId === 'totalOrders') itemValue = c.totalOrdersStr;
        if (colId === 'totalRevenue') itemValue = c.totalRevenueStr;
        if (colId === 'aov') itemValue = c.aovStr;
        if (colId === 'daysSinceLast') itemValue = c.daysSinceLastStr;

        if (!allowedValues.includes(itemValue)) return false;
      }
    }

    return true;
  });

  // 6. จัดเรียงข้อมูล (Sorting)
  displayedCustomers.sort((a, b) => {
    let valA = a[state.sortColumn];
    let valB = b[state.sortColumn];

    if (state.sortColumn === "firstPurchaseDate" || state.sortColumn === "lastPurchaseDate" || state.sortColumn === "nextPurchaseDateObj") {
      valA = valA ? valA.getTime() : 0;
      valB = valB ? valB.getTime() : 0;
    }

    if (typeof valA === "string") {
      return state.sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    } else {
      return state.sortAsc ? valA - valB : valB - valA;
    }
  });

  // 7. Pagination แบ่งหน้า
  const totalEntries = displayedCustomers.length;
  const totalPages = Math.ceil(totalEntries / state.rowsPerPage) || 1;
  if (state.currentPage > totalPages) state.currentPage = totalPages;
  const startIndex = (state.currentPage - 1) * state.rowsPerPage;
  const endIndex = Math.min(startIndex + state.rowsPerPage, totalEntries);
  const pageEntries = displayedCustomers.slice(startIndex, endIndex);

  // 8. ฟังก์ชันสร้างหัวตาราง Th สไตล์ Excel พร้อมกล่องพิมพ์ค้นหาข้อมูลภายในตัวกรอง
  function makeExcelHeaderTh(columnId, displayTitle, extraClass = "") {
  // 1. ดึงค่า Unique ทั้งหมดของคอลัมน์นี้ออกมาทำรายการตัวเลือก
  const uniqueValues = Array.from(new Set(window.insightHubState.allCustomers.map(c => {
    if (columnId === 'firstPurchaseDate') return c.firstPurchaseStr;
    if (columnId === 'lastPurchaseDate') return c.lastPurchaseStr;
    if (columnId === 'nextPurchaseDateObj') return c.nextPurchaseStr;
    if (columnId === 'totalOrders') return c.totalOrdersStr;
    if (columnId === 'totalRevenue') return c.totalRevenueStr;
    if (columnId === 'aov') return c.aovStr;
    if (columnId === 'daysSinceLast') return c.daysSinceLastStr;
    return String(c[columnId] || "").trim();
  }))).sort();

  // หากคอลัมน์นี้ยังไม่มีการตั้งค่าฟิลเตอร์ ให้ตั้งต้นเลือกทั้งหมดไว้ก่อน
  if (!window.insightHubState.excelFilters[columnId]) {
    window.insightHubState.excelFilters[columnId] = [...uniqueValues];
  }

  const currentSelected = window.insightHubState.excelFilters[columnId];
  const isOpen = window.insightHubState.activeDropdown === columnId;
  const filterSearchText = (window.insightHubState.excelSearchTerms[columnId] || "").toLowerCase();
  
  // คัดกรองตัวเลือกในลิสต์ตามคำค้นหาที่พิมพ์
  const visibleOptions = uniqueValues.filter(v => v.toLowerCase().includes(filterSearchText));
  
  // เช็คว่าคอลัมน์นี้มีการคัดกรองอยู่หรือไม่ (ถ้าจำนวนที่เลือกน้อยกว่าค่าทั้งหมด แปลว่ากำลังฟิลเตอร์)
  const hasActiveFilter = currentSelected.length < uniqueValues.length;

  return `
    <th class="${extraClass}" style="position: relative;">
      <div class="th-container">
        <span class="th-label" onclick="setHubSort('${columnId}')">${displayTitle} ${getSortIcon(columnId)}</span>
        <button class="excel-filter-btn ${hasActiveFilter ? 'active-filter' : ''}" onclick="event.stopPropagation(); toggleExcelDropdown('${columnId}')">
          <i class="fas fa-filter"></i>
        </button>
        
        <div class="excel-dropdown-menu ${isOpen ? 'show' : ''}" onclick="event.stopPropagation();" style="width: 260px; position: absolute; background:#fff; border:1px solid #ccc; padding:10px; border-radius:8px; box-shadow:0 4px 15px rgba(0,0,0,0.15); z-index:9999;">
          
          <div style="font-size: 11px; margin-bottom: 8px; font-weight: normal; text-align: left;">
            <a href="javascript:void(0);" style="color: #2563eb; font-weight: bold; text-decoration: none;" onclick="excelSelectAllRows('${columnId}')">เลือกทั้งหมด</a>
            <span style="color: #ccc;"> | </span>
            <a href="javascript:void(0);" style="color: #b91c1c; font-weight: bold; text-decoration: none;" onclick="excelClearAllRows('${columnId}')">ล้าง</a>
            <span style="float: right; color:#999;">พบ ${visibleOptions.length} รายการ</span>
          </div>

          <div style="margin-bottom: 8px;">
            <input type="text" class="excel-search-input" placeholder="🔍 พิมพ์คำค้นหาตัวเลือก..." value="${window.insightHubState.excelSearchTerms[columnId] || ''}" oninput="handleDropdownSearch('${columnId}', this.value)" style="width:100%; padding:6px; font-size:11px; border:1px solid #ddd; border-radius:4px; box-sizing:border-box;">
          </div>
          
          <ul class="excel-options-list" id="list-${columnId}" style="max-height: 160px; overflow-y: auto; list-style: none; padding: 0; margin: 0; text-align: left;">
            ${visibleOptions.map(opt => {
              const isChecked = currentSelected.includes(opt);
              return `
                <li style="padding: 4px 0; display: flex; align-items: center; gap: 6px; font-size:11px;">
                  <input type="checkbox" id="chk-${columnId}-${opt.replace(/[^a-zA-Z0-9]/g, '_')}" ${isChecked ? 'checked' : ''} onchange="handleDropdownCheck('${columnId}', '${opt.replace(/'/g, "\\'")}', this.checked)">
                  <label style="cursor:pointer; flex-grow:1; font-weight: normal; margin:0;" for="chk-${columnId}-${opt.replace(/[^a-zA-Z0-9]/g, '_')}">${opt || '(ว่าง)'}</label>
                </li>
              `;
            }).join('')}
            ${visibleOptions.length === 0 ? '<li style="color:#999; text-align:center; padding: 10px 0;">ไม่พบผลลัพธ์</li>' : ''}
          </ul>
          
          <div class="excel-dropdown-actions" style="margin-top: 10px; border-top: 1px solid #eee; padding-top: 8px; display: flex; justify-content: space-between;">
            <button class="excel-btn-sm" style="border-radius: 4px; padding: 4px 10px; border:1px solid #ddd; background:#fff; cursor:pointer; font-size:11px;" onclick="clearExcelFilter('${columnId}')">ยกเลิกฟิลเตอร์</button>
            <button class="excel-btn-sm confirm" style="background: #15803d; border-color: #15803d; color: white; border-radius: 4px; padding: 4px 12px; cursor:pointer; font-size:11px; font-weight:bold;" onclick="confirmExcelFilter()">ตกลง</button>
          </div>
        </div>
      </div>
    </th>
  `;
}

  // 9. แสดงผล UI โครงสร้างหน้าหลัก
  let html = `
    <div class="hub-header">
      <h2>Customer Insight Hub</h2>
    </div>

    <div class="hub-summary-sections">
      <div class="summary-section-box">
        <h3>LTV & Advanced</h3>
        <div class="kpi-cards-row">
          <div class="mini-kpi-card total-box">
            <div class="kpi-card-val">${totalCount.toLocaleString()}</div>
            <div class="kpi-card-lbl">Total Customers</div>
            <div class="kpi-card-pct">100%</div>
          </div>
          <div class="mini-kpi-card">
            <div class="kpi-card-val">${countWhale}</div>
            <div class="kpi-card-lbl">VVIP (Whale)</div>
            <div class="kpi-card-pct">${getPctStr(countWhale)}</div>
          </div>
          <div class="mini-kpi-card">
            <div class="kpi-card-val">${countDolphin}</div>
            <div class="kpi-card-lbl">VIP (Dolphin)</div>
            <div class="kpi-card-pct">${getPctStr(countDolphin)}</div>
          </div>
          <div class="mini-kpi-card">
            <div class="kpi-card-val">${countMinnow}</div>
            <div class="kpi-card-lbl">Regular (Minnow)</div>
            <div class="kpi-card-pct">${getPctStr(countMinnow)}</div>
          </div>
          <div class="mini-kpi-card">
            <div class="kpi-card-val">${countGeneral}</div>
            <div class="kpi-card-lbl">General (General)</div>
            <div class="kpi-card-pct">${getPctStr(countGeneral)}</div>
          </div>
        </div>
      </div>
      
      <div class="summary-section-box">
        <h3>Segment 1 : Standard Period</h3>
        <div class="kpi-cards-row">
          <div class="mini-kpi-card">
            <div class="kpi-card-val">${countActive}</div>
            <div class="kpi-card-lbl">ACTIVE</div>
            <div class="kpi-card-pct">${getPctStr(countActive)}</div>
          </div>
          <div class="mini-kpi-card">
            <div class="kpi-card-val">${countRisk}</div>
            <div class="kpi-card-lbl">RISK</div>
            <div class="kpi-card-pct">${getPctStr(countRisk)}</div>
          </div>
          <div class="mini-kpi-card">
            <div class="kpi-card-val">${countChurn}</div>
            <div class="kpi-card-lbl">CHURN</div>
            <div class="kpi-card-pct">${getPctStr(countChurn)}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="table-card">
      <div class="table-wrapper">
        <table class="customer-table">
          <thead>
            <tr>
              ${makeExcelHeaderTh('phone', 'CustomerKey (Phone)')}
              ${makeExcelHeaderTh('name', 'CustomerName (Latest)')}
              ${makeExcelHeaderTh('firstPurchaseDate', 'FirstPurchaseDate')}
              ${makeExcelHeaderTh('lastPurchaseDate', 'LastPurchaseDate')}
              ${makeExcelHeaderTh('totalOrders', 'TotalOrders (SALE only)')}
              ${makeExcelHeaderTh('totalRevenue', 'TotalRevenue (SALE only)')}
              ${makeExcelHeaderTh('aov', 'AOV')}
              ${makeExcelHeaderTh('daysSinceLast', 'DaysSinceLast')}
              ${makeExcelHeaderTh('lastProductStr', 'Last Product')}
              ${makeExcelHeaderTh('nextPurchaseDateObj', 'Next Purchase Date')}
              
              ${makeExcelHeaderTh('ltvTier', 'Life time value', 'th-insight')}
              ${makeExcelHeaderTh('loyaltyTier', 'Loyalty Index', 'th-insight')}
              ${makeExcelHeaderTh('entryProduct', 'Entry Product (สินค้าแรกเริ่ม)', 'th-insight')}
              ${makeExcelHeaderTh('currentFavorite', 'Current Favorite (สินค้าโปรดล่าสุด)', 'th-insight')}
              
              ${makeExcelHeaderTh('adminPriority', 'Admin Priority', 'th-action')}
              ${makeExcelHeaderTh('segment1', 'Segment 1 : Standard Period', 'th-action')}
              ${makeExcelHeaderTh('segment2', 'Segment 2 : Dynamic Refill', 'th-action')}
              ${makeExcelHeaderTh('actionStrategy', 'Action Strategy Guideline', 'th-action')}
              ${makeExcelHeaderTh('firstChannel', 'FirstChannel (Main)', 'th-action')}
              ${makeExcelHeaderTh('lastChannel', 'LastChannel (Main)', 'th-action')}
              ${makeExcelHeaderTh('lastAdmin', 'Last Admin', 'th-action')}
              
              ${state.availableYears.map(y => makeExcelHeaderTh('tier' + y, `Tier ${y}`, 'th-tiers')).join('')}
            </tr>
          </thead>
          <tbody>
            ${pageEntries.map(c => `
              <tr>
                <td style="font-weight: 600; cursor: pointer; color: #d95f1d; text-decoration: underline;" onclick="openCustomerProfile('${c.phone}')">${c.phone}</td>
                <td style="font-weight: 600; cursor: pointer; color: #d95f1d; text-decoration: underline;" onclick="openCustomerProfile('${c.phone}')">${c.name}</td>
                <td>${c.firstPurchaseStr}</td>
                <td>${c.lastPurchaseStr}</td>
                <td style="text-align: center;">${c.totalOrders}</td>
                <td style="font-weight: bold; text-align: right;">${c.totalRevenueStr}</td>
                <td style="text-align: right;">${c.aovStr}</td>
                <td style="text-align: center;">${c.daysSinceLastStr}</td>
                <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis;" title="${c.lastProductStr}">${c.lastProductStr || "-"}</td>
                <td style="font-weight: 600; color: #0269a1;">${c.nextPurchaseStr}</td>
                
                <td><span class="badge-span ${getLtvClass(c.ltvTier)}">${c.ltvTier}</span></td>
                <td><span class="badge-span ${getLoyaltyClass(c.loyaltyTier)}">${c.loyaltyTier}</span></td>
                <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;" title="${c.entryProduct}">${c.entryProduct || "-"}</td>
                <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;" title="${c.currentFavorite}">${c.currentFavorite || "-"}</td>
                
                <td><span class="${getAdminPriClass(c.adminPriority)}">${c.adminPriority}</span></td>
                <td><span class="${getSegClass(c.segment1)}">${c.segment1}</span></td>
                <td><span class="${getSegClass(c.segment2)}">${c.segment2}</span></td>
                <td><span class="act-strategy">${c.actionStrategy}</span></td>
                <td>${c.firstChannel}</td>
                <td>${c.lastChannel}</td>
                <td>${c.lastAdmin}</td>
                
                ${state.availableYears.map(y => `<td style="text-align: center;">${c['tier' + y]}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="pagination-controls">
        <div>
          Showing <b>${totalEntries === 0 ? 0 : startIndex + 1}</b> to <b>${endIndex}</b> of <b>${totalEntries.toLocaleString()}</b> entries
        </div>
        <div class="pagination-buttons">
          <button class="pag-btn" onclick="setHubPage(1)" ${state.currentPage === 1 ? 'disabled' : ''}>First</button>
          <button class="pag-btn" onclick="setHubPage(${state.currentPage - 1})" ${state.currentPage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>
          
          ${getPageRange(state.currentPage, totalPages).map(p => `
            <button class="pag-btn ${state.currentPage === p ? 'active' : ''}" onclick="setHubPage(${p})">${p}</button>
          `).join('')}
          
          <button class="pag-btn" onclick="setHubPage(${state.currentPage + 1})" ${state.currentPage === totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
          <button class="pag-btn" onclick="setHubPage(${totalPages})" ${state.currentPage === totalPages ? 'disabled' : ''}>Last</button>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

// 10. ฟังก์ชันจัดการพฤติกรรมระบบ Excel Filtering เชื่อมต่อเข้ากับ Window
window.toggleExcelDropdown = function(colId) {
  // สลับการเปิดปิดหน้าต่างดรอปดาวน์ โดยไม่รีรันตารางหลัก ป้องกันอาการหนัตารางสั่นเด้ง
  if (window.insightHubState.activeDropdown === colId) {
    window.insightHubState.activeDropdown = null;
  } else {
    window.insightHubState.activeDropdown = colId;
  }
  // ดึงเฉพาะแถว Th หัวตารางมารีเฟรชสถานะเปิด/ปิด เพื่อล็อกพิกัด Scroll ไว้ที่เดิม
  if (window.applyFilters) window.applyFilters();
};

// แก้บัคข้อ 1 & 2: เมื่อพิมพ์เสิร์ช จะเปลี่ยนเฉพาะลิสต์กล่องเช็คบ็อกซ์ภายใน โดยไม่ยุ่งกับตารางด้านหลัง โฟกัสไม่หลุดแน่นอน
window.handleDropdownSearch = function(colId, value) {
  window.insightHubState.excelSearchTerms[colId] = value;
  
  const listContainer = document.getElementById(`list-${colId}`);
  if (!listContainer) return;

  const uniqueValues = Array.from(new Set(window.insightHubState.allCustomers.map(c => {
    if (colId === 'firstPurchaseDate') return c.firstPurchaseStr;
    if (colId === 'lastPurchaseDate') return c.lastPurchaseStr;
    if (colId === 'nextPurchaseDateObj') return c.nextPurchaseStr;
    if (colId === 'totalOrders') return c.totalOrdersStr;
    if (colId === 'totalRevenue') return c.totalRevenueStr;
    if (colId === 'aov') return c.aovStr;
    if (colId === 'daysSinceLast') return c.daysSinceLastStr;
    return String(c[colId] || "").trim();
  }))).sort();

  const currentSelected = window.insightHubState.excelFilters[colId] || [];
  const filteredOpts = uniqueValues.filter(v => v.toLowerCase().includes(value.toLowerCase()));
  
  listContainer.innerHTML = filteredOpts.map(opt => {
    const isChecked = currentSelected.includes(opt);
    return `
      <li style="padding: 4px 0; display: flex; align-items: center; gap: 6px; font-size:11px;">
        <input type="checkbox" id="chk-${colId}-${opt.replace(/[^a-zA-Z0-9]/g, '_')}" ${isChecked ? 'checked' : ''} onchange="handleDropdownCheck('${colId}', '${opt.replace(/'/g, "\\'")}', this.checked)">
        <label style="cursor:pointer; flex-grow:1; font-weight: normal; margin:0;" for="chk-${colId}-${opt.replace(/[^a-zA-Z0-9]/g, '_')}">${opt || '(ว่าง)'}</label>
      </li>
    `;
  }).join('');
  
  if (filteredOpts.length === 0) {
    listContainer.innerHTML = '<li style="color:#999; text-align:center; padding: 10px 0;">ไม่พบผลลัพธ์</li>';
  }
};

window.handleDropdownCheck = function(colId, value, isChecked) {
  if (!window.insightHubState.excelFilters[colId]) {
    window.insightHubState.excelFilters[colId] = [];
  }
  if (isChecked) {
    if (!window.insightHubState.excelFilters[colId].includes(value)) {
      window.insightHubState.excelFilters[colId].push(value);
    }
  } else {
    window.insightHubState.excelFilters[colId] = window.insightHubState.excelFilters[colId].filter(v => v !== value);
  }
};

// แก้บัคข้อ 3: ฟังก์ชันคลิกปุ่ม "เลือกทั้งหมด" 
window.excelSelectAllRows = function(colId) {
  const uniqueValues = Array.from(new Set(window.insightHubState.allCustomers.map(c => {
    if (colId === 'firstPurchaseDate') return c.firstPurchaseStr;
    if (colId === 'lastPurchaseDate') return c.lastPurchaseStr;
    if (colId === 'nextPurchaseDateObj') return c.nextPurchaseStr;
    if (colId === 'totalOrders') return c.totalOrdersStr;
    if (colId === 'totalRevenue') return c.totalRevenueStr;
    if (colId === 'aov') return c.aovStr;
    if (colId === 'daysSinceLast') return c.daysSinceLastStr;
    return String(c[colId] || "").trim();
  })));
  
  window.insightHubState.excelFilters[colId] = [...uniqueValues];
  const filterSearchText = (window.insightHubState.excelSearchTerms[colId] || "");
  window.handleDropdownSearch(colId, filterSearchText);
};

// แก้บัคข้อ 3: ฟังก์ชันคลิกปุ่ม "ล้าง"
window.excelClearAllRows = function(colId) {
  window.insightHubState.excelFilters[colId] = [];
  const filterSearchText = (window.insightHubState.excelSearchTerms[colId] || "");
  window.handleDropdownSearch(colId, filterSearchText);
};

// ปุ่มยกเลิกฟิลเตอร์ -> รีเซ็ตกลับไปเป็นเลือกทั้งหมดของคอลัมน์นั้นและอัปเดตตารางหลัก
window.clearExcelFilter = function(colId) {
  delete window.insightHubState.excelFilters[colId];
  delete window.insightHubState.excelSearchTerms[colId];
  window.insightHubState.activeDropdown = null;
  window.insightHubState.currentPage = 1;
  if (window.applyFilters) window.applyFilters();
};

// ปุ่มตกลง -> ทำการคำนวณและปรับเปลี่ยนผลลัพธ์บนตารางหลักตามชอยส์ที่เลือกทันที (แก้บัคข้อ 2)
window.confirmExcelFilter = function() {
  window.insightHubState.activeDropdown = null;
  window.insightHubState.currentPage = 1;
  if (window.applyFilters) window.applyFilters();
};

window.resetHubFilters = function() {
  window.insightHubState = {
    currentPage: 1,
    rowsPerPage: 50,
    searchTerm: "",
    sortColumn: "totalRevenue",
    sortAsc: false,
    excelFilters: {},
    excelSearchTerms: {},
    activeDropdown: null,
    selectedCustomerPhone: null,
    allCustomers: window.insightHubState.allCustomers
  };
  if (window.applyFilters) window.applyFilters();
};

window.setHubSort = function(colName) {
  const state = window.insightHubState;
  if (state.sortColumn === colName) {
    state.sortAsc = !state.sortAsc;
  } else {
    state.sortColumn = colName;
    state.sortAsc = false;
  }
  if (window.applyFilters) window.applyFilters();
};

window.setHubPage = function(pageNumber) {
  window.insightHubState.currentPage = pageNumber;
  if (window.applyFilters) window.applyFilters();
};

function getLtvClass(tier) {
  if (tier.includes("Whale")) return "ltv-whale";
  if (tier.includes("Dolphin")) return "ltv-dolphin";
  if (tier.includes("Minnow")) return "ltv-minnow";
  return "ltv-general";
}

function getLoyaltyClass(tier) {
  if (tier.includes("Legendary")) return "loy-legendary";
  if (tier.includes("Veteran")) return "loy-veteran";
  if (tier.includes("Regular")) return "loy-regular";
  return "loy-seedling";
}

function getAdminPriClass(priority) {
  if (priority.includes("High")) return "pri-high";
  if (priority.includes("Medium")) return "pri-medium";
  if (priority.includes("Low")) return "pri-low";
  return "pri-winback";
}

function getSegClass(seg) {
  if (seg === "ACTIVE") return "seg-active";
  if (seg === "RISK") return "seg-risk";
  if (seg === "CHURN") return "seg-churn";
  if (seg === "NEW") return "seg-new";
  if (seg === "REFILL") return "seg-refill";
  return "";
}

function getSortIcon(colName) {
  const state = window.insightHubState;
  if (state.sortColumn !== colName) return '<i class="fas fa-sort sorting-icon"></i>';
  return state.sortAsc ? '<i class="fas fa-sort-up sorting-icon" style="color:#d95f1d;"></i>' : '<i class="fas fa-sort-down sorting-icon" style="color:#d95f1d;"></i>';
}

function getPageRange(current, total) {
  const range = [];
  const start = Math.max(1, current - 2);
  const end = Math.min(total, current + 2);
  for (let i = start; i <= end; i++) {
    range.push(i);
  }
  return range;
}

window.openCustomerProfile = function(phone) {
  window.insightHubState.selectedCustomerPhone = phone;
  if (window.applyFilters) window.applyFilters();
};

window.closeCustomerProfile = function() {
  window.insightHubState.selectedCustomerPhone = null;
  if (window.applyFilters) window.applyFilters();
};

window.searchProfileKey = function() {
  const inputVal = document.getElementById('profile-search-input').value.trim();
  if (!inputVal) return;
  const match = (window.insightHubState.allCustomers || []).find(c => 
    c.phone === inputVal || 
    c.name.toLowerCase() === inputVal.toLowerCase() ||
    c.phone.includes(inputVal) ||
    c.name.toLowerCase().includes(inputVal.toLowerCase())
  );
  if (match) {
    window.insightHubState.selectedCustomerPhone = match.phone;
    if (window.applyFilters) window.applyFilters();
  } else {
    alert('ไม่พบข้อมูลลูกค้าสำหรับคีย์: ' + inputVal);
  }
};

function generateAiSummary(c) {
  const name = c.name || c.phone;
  const ltvClean = c.ltvTier.replace(/[^\w\s\(\)>.\-\u0e00-\u0e7f]/g, '').trim();
  const loyaltyClean = c.loyaltyTier.replace(/[^\w\s\(\)>.\-\u0e00-\u0e7f]/g, '').trim();
  const priorityClean = c.adminPriority.replace(/[^\w\s\(\)>.\-\u0e00-\u0e7f]/g, '').trim();
  
  return `<strong>AI Summary:</strong> ลูกค้า <strong>${name}</strong> เป็นสมาชิกระดับ <strong>${ltvClean}</strong> และมีระดับความภักดีเป็น <strong>${loyaltyClean}</strong> ซึ่งสั่งซื้อไปแล้ว <strong>${c.totalOrders} ครั้ง</strong> รวมยอดสั่งซื้อสะสม <strong>฿${c.totalRevenue.toLocaleString()}</strong> โดยมียอดสั่งซื้อเฉลี่ยต่อบิล (AOV) <strong>฿${c.aov.toLocaleString(undefined, {maximumFractionDigits: 0})}</strong> และมีความชอบในผลิตภัณฑ์ <strong>${c.currentFavorite || '-'}</strong> ปัจจุบันจัดอยู่ในกลุ่ม segment 1: <strong>${c.segment1}</strong> และ segment 2: <strong>${c.segment2}</strong> จากการสั่งซื้อล่าสุดเมื่อ <strong>${c.daysSinceLast.toFixed(0)} วันที่แล้ว</strong> คาดว่าลูกค้าจะกลับมาสั่งซื้ออีกครั้งในช่วงวันที่ <strong>${c.nextPurchaseStr}</strong> และควรได้รับการดูแลจากแอดมินในลำดับความสำคัญระดับ <strong>${priorityClean}</strong>`;
}

function renderCustomerProfileView(c, container, filteredData, rawData) {
  const html = `
    <div style="margin-bottom: 20px;">
      <button class="pag-btn" onclick="closeCustomerProfile()" style="display: inline-flex; align-items: center; gap: 8px; font-size: 13px; padding: 8px 16px; border: 1px solid #ddd; border-radius: 8px; background: white; cursor: pointer;">
        <i class="fas fa-arrow-left"></i> ย้อนกลับไปหน้ารายการ
      </button>
    </div>

    <div style="text-align: center; margin-bottom: 30px;">
      <h2 style="font-size: 26px; font-weight: 700; color: #0f172a; margin: 0 0 8px 0; font-family: 'Outfit', sans-serif;">Customer Profile</h2>
      <p style="color: #64748b; font-size: 14px; margin: 0;">Enter a customer key to view their complete profile</p>
    </div>

    <div style="display: flex; justify-content: center; gap: 10px; margin-bottom: 35px; max-width: 600px; margin-left: auto; margin-right: auto;">
      <div style="position: relative; flex-grow: 1;">
        <i class="fas fa-search" style="position: absolute; left: 15px; top: 50%; transform: translateY(-50%); color: #999;"></i>
        <input type="text" id="profile-search-input" class="search-bar-input" style="padding-left: 45px; width: 100%; height: 45px; font-size: 14px; border: 1px solid #e2e8f0; border-radius: 8px;" placeholder="ค้นหาโดยใช้ชื่อ หรือ เบอร์โทรศัพท์..." value="${c.phone}">
      </div>
      <button class="btn" style="background: #2563eb; color: white; border: none; padding: 0 25px; border-radius: 8px; font-weight: 600; cursor: pointer; height: 45px; font-size: 14px;" onclick="searchProfileKey()">Search</button>
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center; background: white; border: 1px solid #f0e6df; padding: 25px; border-radius: 16px; margin-bottom: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.02);">
      <div style="display: flex; align-items: center; gap: 20px;">
        <div style="width: 60px; height: 60px; border-radius: 12px; background: #eff6ff; display: flex; align-items: center; justify-content: center; color: #2563eb; font-size: 24px;">
          <i class="fas fa-user"></i>
        </div>
        <div>
          <h3 style="margin: 0 0 5px 0; font-size: 22px; font-weight: 700; color: #1e293b;">${c.name}</h3>
          <p style="margin: 0; color: #64748b; font-size: 13px;">Customer Profile (Key: ${c.phone})</p>
        </div>
      </div>
      <div>
        <span class="badge-span ${getLtvClass(c.ltvTier)}" style="font-size: 12px; padding: 6px 15px; border-radius: 20px;">${c.ltvTier}</span>
      </div>
    </div>

    <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px; margin-bottom: 25px; line-height: 1.6; font-size: 14px; color: #334155;">
      ${generateAiSummary(c)}
    </div>

    <div class="profile-kpi-grid-4">
      <div class="profile-kpi-card">
        <div class="profile-kpi-info">
          <span class="profile-kpi-lbl">Total Revenue</span>
          <span class="profile-kpi-val">${c.totalRevenueStr}</span>
        </div>
        <div class="profile-kpi-icon"><i class="fas fa-dollar-sign"></i></div>
      </div>
      <div class="profile-kpi-card">
        <div class="profile-kpi-info">
          <span class="profile-kpi-lbl">Loyalty Index</span>
          <span class="profile-kpi-val" style="font-size: 16px;">${c.loyaltyTier}</span>
        </div>
        <div class="profile-kpi-icon" style="color: #ec4899; background: #fdf2f8;"><i class="fas fa-heart"></i></div>
      </div>
      <div class="profile-kpi-card">
        <div class="profile-kpi-info">
          <span class="profile-kpi-lbl">Next Purchase</span>
          <span class="profile-kpi-val" style="font-size: 18px; color: #0269a1;">${c.nextPurchaseStr}</span>
        </div>
        <div class="profile-kpi-icon" style="color: #0ea5e9; background: #f0f9ff;"><i class="fas fa-chart-line"></i></div>
      </div>
      <div class="profile-kpi-card">
        <div class="profile-kpi-info">
          <span class="profile-kpi-lbl">Avg. Order Value</span>
          <span class="profile-kpi-val">${c.aovStr}</span>
        </div>
        <div class="profile-kpi-icon" style="color: #10b981; background: #ecfdf5;"><i class="fas fa-shopping-cart"></i></div>
      </div>
    </div>

    <div class="profile-kpi-grid-3">
      <div class="profile-kpi-card">
        <div class="profile-kpi-info">
          <span class="profile-kpi-lbl">First Purchase Date</span>
          <span class="profile-kpi-val" style="font-size: 18px;">${c.firstPurchaseStr}</span>
        </div>
        <div class="profile-kpi-icon" style="color: #6366f1; background: #eef2ff;"><i class="fas fa-calendar"></i></div>
      </div>
      <div class="profile-kpi-card">
        <div class="profile-kpi-info">
          <span class="profile-kpi-lbl">Last Purchase Date</span>
          <span class="profile-kpi-val" style="font-size: 18px;">${c.lastPurchaseStr}</span>
        </div>
        <div class="profile-kpi-icon" style="color: #8b5cf6; background: #f5f3ff;"><i class="fas fa-calendar-alt"></i></div>
      </div>
      <div class="profile-kpi-card">
        <div class="profile-kpi-info">
          <span class="profile-kpi-lbl">Total Orders</span>
          <span class="profile-kpi-val">${c.totalOrders}</span>
        </div>
        <div class="profile-kpi-icon" style="color: #f59e0b; background: #fffbeb;"><i class="fas fa-hashtag"></i></div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 25px; margin-bottom: 40px;">
      <div class="profile-detail-card" style="background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 25px; box-shadow: 0 4px 15px rgba(0,0,0,0.02);">
        <h3>Status & Segmentation</h3>
        <div style="display: flex; flex-direction: column; gap: 5px;">
          <div class="profile-detail-row">
            <span style="color: #64748b; font-size: 13px;"><i class="fas fa-flag" style="margin-right: 8px; width: 15px;"></i> Priority</span>
            <span style="font-size: 13px;"><span class="badge-span ${getAdminPriClass(c.adminPriority)}">${c.adminPriority}</span></span>
          </div>
          <div class="profile-detail-row">
            <span style="color: #64748b; font-size: 13px;"><i class="fas fa-layer-group" style="margin-right: 8px; width: 15px;"></i> Segment 1</span>
            <span style="font-size: 13px;"><span class="badge-span ${getSegClass(c.segment1)}">${c.segment1}</span></span>
          </div>
          <div class="profile-detail-row">
            <span style="color: #64748b; font-size: 13px;"><i class="fas fa-tag" style="margin-right: 8px; width: 15px;"></i> Segment 2</span>
            <span style="font-size: 13px;"><span class="badge-span ${getSegClass(c.segment2)}">${c.segment2}</span></span>
          </div>
          <div class="profile-detail-row" style="flex-direction: column; gap: 5px; align-items: flex-start; border-bottom: none;">
            <span style="color: #64748b; font-size: 13px;"><i class="fas fa-book" style="margin-right: 8px; width: 15px;"></i> Action Strategy Guideline</span>
            <span style="font-size: 13px; color: #334155; font-weight: 500; margin-left: 23px; padding-top: 5px;">${c.actionStrategy || 'No guideline available.'}</span>
          </div>
        </div>
      </div>
      
      <div class="profile-detail-card" style="background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 25px; box-shadow: 0 4px 15px rgba(0,0,0,0.02);">
        <h3>Purchase History</h3>
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <div class="profile-detail-row">
            <span style="color: #64748b; font-size: 13px;"><i class="fas fa-box" style="margin-right: 8px; width: 15px;"></i> First Product</span>
            <span style="font-size: 13px; font-weight: 600; color: #334155;">${c.entryProduct || '-'}</span>
          </div>
          <div class="profile-detail-row">
            <span style="color: #64748b; font-size: 13px;"><i class="fas fa-star" style="margin-right: 8px; width: 15px;"></i> Most Frequent Product</span>
            <span style="font-size: 13px; font-weight: 600; color: #334155;">${c.currentFavorite || '-'}</span>
          </div>
          <div class="profile-detail-row">
            <span style="color: #64748b; font-size: 13px;"><i class="fas fa-calendar-alt" style="margin-right: 8px; width: 15px;"></i> Last Purchase Date</span>
            <span style="font-size: 13px; font-weight: 600; color: #334155;">${c.lastPurchaseStr}</span>
          </div>
          <div class="profile-detail-row">
            <span style="color: #64748b; font-size: 13px;"><i class="fas fa-clock" style="margin-right: 8px; width: 15px;"></i> Days Since Last</span>
            <span style="font-size: 13px; font-weight: 600; color: #334155;">${c.daysSinceLastStr} วัน</span>
          </div>
          <div class="profile-detail-row">
            <span style="color: #64748b; font-size: 13px;"><i class="fas fa-shopping-basket" style="margin-right: 8px; width: 15px;"></i> Last Product</span>
            <span style="font-size: 13px; font-weight: 600; color: #334155; max-width: 250px; overflow: hidden; text-overflow: ellipsis;" title="${c.lastProductStr}">${c.lastProductStr || '-'}</span>
          </div>
          <div class="profile-detail-row">
            <span style="color: #64748b; font-size: 13px;"><i class="fas fa-sign-in-alt" style="margin-right: 8px; width: 15px;"></i> First Channel</span>
            <span style="font-size: 13px; font-weight: 600; color: #334155;">${c.firstChannel || '-'}</span>
          </div>
          <div class="profile-detail-row">
            <span style="color: #64748b; font-size: 13px;"><i class="fas fa-sign-out-alt" style="margin-right: 8px; width: 15px;"></i> Last Channel</span>
            <span style="font-size: 13px; font-weight: 600; color: #334155;">${c.lastChannel || '-'}</span>
          </div>
        </div>
      </div>
    </div>
  `;
  container.innerHTML = html;
}
