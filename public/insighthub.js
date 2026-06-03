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
    filterAction: "All"
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
  // Normalize string: uppercase, trim, replace multiple spaces with single space
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

  // 1. Inject Premium Styles
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

      .table-filter-bar {
        background: #fff;
        border-radius: 16px;
        padding: 20px;
        margin-bottom: 25px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.02);
        border: 1px solid #f0e6df;
      }
      .filter-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 15px;
        margin-top: 15px;
      }
      .filter-input-group {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .filter-input-group label {
        font-size: 11px;
        font-weight: 700;
        color: #7a665e;
      }
      .filter-select, .search-bar-input {
        padding: 8px 12px;
        font-size: 13px;
        border: 1px solid #ddd;
        border-radius: 8px;
        outline: none;
        background: white;
      }
      .search-bar-input {
        flex-grow: 1;
      }
      
      .table-card {
        background: #fff;
        border-radius: 16px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.02);
        border: 1px solid #f0e6df;
        overflow: hidden;
        margin-bottom: 40px;
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
        padding: 10px 12px;
        border-bottom: 2px solid #ddd;
        white-space: nowrap;
        background-color: #fafafa;
        color: #444;
        cursor: pointer;
        user-select: none;
      }
      .customer-table th:hover {
        background-color: #f1f1f1;
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
      
      /* Column groups colors */
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
      
      /* Actions colors */
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
    `;
    document.head.appendChild(style);
  }

  // Reference date: May 15, 2026, which matches the TODAY() evaluation in the Excel spreadsheet cache
  const today = new Date(2026, 4, 15);
  const state = window.insightHubState;

  // 2. Pre-aggregate ALL transaction history from rawData by customer phone
  const rawSaleOrders = rawData.filter(row => window.isSaleOrder(row));
  const customerHistoryMap = {};
  
  rawSaleOrders.forEach(row => {
    const phone = window.getRowValue(row, ['Phone']).toString().trim();
    if (!phone) return;
    if (!customerHistoryMap[phone]) {
      customerHistoryMap[phone] = [];
    }
    customerHistoryMap[phone].push(row);
  });

  // Calculate unique customer stats (Phone-based) from rawData
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
    // History is parsed globally from rawData to get true lifetime metrics
    const historyRows = customerHistoryMap[phone] || [];
    
    // Sort history chronologically by order date
    const sortedHistory = historyRows.map(row => {
      const dateStr = window.getRowValue(row, ['วันที่สร้าง', 'วันที่โอนเงิน', 'OrderDate', 'Date', 'วันที่']);
      return {
        row: row,
        dateObj: parseToDateObj(dateStr)
      };
    }).filter(item => item.dateObj !== null)
      .sort((a, b) => a.dateObj - b.dateObj);

    if (sortedHistory.length === 0) return null;

    const firstOrder = sortedHistory[0];
    const lastOrder = sortedHistory[sortedHistory.length - 1];
    
    const firstPurchaseDate = firstOrder.dateObj;
    const lastPurchaseDate = lastOrder.dateObj;
    const totalOrders = sortedHistory.length;
    
    // Sum total revenue
    let totalRevenue = 0;
    sortedHistory.forEach(o => {
      const revStr = window.getRowValue(o.row, ['ยอดขาย', 'ราคาสินค้ายังไม่รวมภาษี', 'Net Sales', 'Revenue', 'Amount', 'ยอดโอน']) || '0';
      const rev = parseFloat(revStr.replace(/,/g, ''));
      if (!isNaN(rev)) totalRevenue += rev;
    });

    const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    
    // Days since last purchase to reference date (May 15, 2026)
    const diffTime = today - lastPurchaseDate;
    const daysSinceLast = Math.max(0, diffTime / (1000 * 60 * 60 * 24));
    
    const lastProductStr = window.getRowValue(lastOrder.row, ['Product Set', 'ชื่อสินค้า', 'Product', 'รายการขาย']);
    
    // Next purchase date refill window lookup
    const refillWindow = getRefillWindow(lastProductStr);
    const nextPurchaseDateObj = new Date(lastPurchaseDate.getTime() + refillWindow * 24 * 60 * 60 * 1000);

    // 11. Life Time Value Tier
    let ltvTier = "🐚 4. General";
    if (totalRevenue >= 25000) ltvTier = "💎 1. VVIP Whale (>25k)";
    else if (totalRevenue >= 12000) ltvTier = "🐳 2. VIP Dolphin (>12k)";
    else if (totalRevenue >= 4500) ltvTier = "🐟 3. Regular Minnow (>4.5k)";

    // 12. Loyalty Index (tenure)
    const tenureDays = Math.max(0, (lastPurchaseDate - firstPurchaseDate) / (1000 * 60 * 60 * 24));
    let loyaltyTier = "🌱 Seedling";
    if (tenureDays > 365) loyaltyTier = "🏅 Legendary (1Y+)";
    else if (tenureDays > 180) loyaltyTier = "🥈 Veteran (6M+)";
    else if (tenureDays > 45) loyaltyTier = "🥉 Regular";

    // 13. Entry Product
    const entryProduct = window.getRowValue(firstOrder.row, ['Product Set', 'ชื่อสินค้า', 'Product', 'รายการขาย']);
    
    // 14. Current Favorite
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

    // 15. Segment 1: Standard Period
    let segment1 = "CHURN";
    if (daysSinceLast <= 30) segment1 = "NEW";
    else if (daysSinceLast <= 90) segment1 = "ACTIVE";
    else if (daysSinceLast <= 120) segment1 = "RISK";

    // 16. Segment 2: Dynamic Refill
    let segment2 = "CHURN";
    if (daysSinceLast <= 7) segment2 = "NEW";
    else if (daysSinceLast <= refillWindow - 8) segment2 = "ACTIVE";
    else if (daysSinceLast <= refillWindow + 3) segment2 = "REFILL";
    else if (daysSinceLast <= refillWindow + 59) segment2 = "RISK";

    // 17. Admin Priority
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

    // 18. Action Strategy Guideline
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

    // First and last channels
    const firstChannel = window.getRowValue(firstOrder.row, ['ช่องทาง', 'Channel']) || "-";
    const lastChannel = window.getRowValue(lastOrder.row, ['ช่องทาง', 'Channel']) || "-";
    
    // Last Admin normalized
    let lastAdmin = "-";
    if (window.getNormalizedAdmin) {
      lastAdmin = window.getNormalizedAdmin(lastOrder.row);
    } else {
      lastAdmin = window.getRowValue(lastOrder.row, ['ชื่อแอดมิน', 'Admin', 'Admin Name']) || "-";
    }

    // Annual Tiers
    const annualSpending = { 2023: 0, 2024: 0, 2025: 0, 2026: 0 };
    sortedHistory.forEach(o => {
      const year = o.dateObj.getFullYear();
      if (annualSpending[year] !== undefined) {
        const revStr = window.getRowValue(o.row, ['ยอดขาย', 'ราคาสินค้ายังไม่รวมภาษี', 'Net Sales', 'Revenue', 'Amount', 'ยอดโอน']) || '0';
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

    return {
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
      tier2023: getYearTier(annualSpending[2023]),
      tier2024: getYearTier(annualSpending[2024]),
      tier2025: getYearTier(annualSpending[2025]),
      tier2026: getYearTier(annualSpending[2026])
    };
  }).filter(c => c !== null);

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

  // 5. Filter list based on search term and local dropdown selectors
  let displayedCustomers = customers.filter(c => {
    // Search filter
    const matchesSearch = c.name.toLowerCase().includes(state.searchTerm.toLowerCase()) || 
                          c.phone.includes(state.searchTerm);
    if (!matchesSearch) return false;

    // Advanced filters
    if (state.filterLTV !== "All" && !c.ltvTier.includes(state.filterLTV)) return false;
    if (state.filterLoyalty !== "All" && !c.loyaltyTier.includes(state.filterLoyalty)) return false;
    if (state.filterSeg1 !== "All" && c.segment1 !== state.filterSeg1) return false;
    if (state.filterSeg2 !== "All" && c.segment2 !== state.filterSeg2) return false;
    if (state.filterAdminPriority !== "All" && !c.adminPriority.includes(state.filterAdminPriority)) return false;
    if (state.filterAction !== "All" && !c.actionStrategy.includes(state.filterAction)) return false;

    return true;
  });

  // 6. Sort displayed list
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

  // 7. Paginate
  const totalEntries = displayedCustomers.length;
  const totalPages = Math.ceil(totalEntries / state.rowsPerPage) || 1;
  if (state.currentPage > totalPages) state.currentPage = totalPages;
  const startIndex = (state.currentPage - 1) * state.rowsPerPage;
  const endIndex = Math.min(startIndex + state.rowsPerPage, totalEntries);
  const pageEntries = displayedCustomers.slice(startIndex, endIndex);

  // 8. Render Dashboard UI Template
  let html = `
    <!-- Top banner -->
    <div class="hub-header">
      <h2>Customer Insight Hub</h2>
    </div>

    <!-- Summary KPI cards -->
    <div class="hub-summary-sections">
      <!-- Section: LTV & Advanced -->
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
      
      <!-- Section: Segment 1 Standard Period -->
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

    <!-- Local Table Search & Filters bar -->
    <div class="table-filter-bar">
      <div style="display:flex; gap:15px; align-items:center;">
        <i class="fas fa-search" style="color: #999;"></i>
        <input type="text" id="hub-search" class="search-bar-input" placeholder="Search by name or phone number..." value="${state.searchTerm}">
        <button class="btn btn-import" onclick="resetHubFilters()">Reset Filters</button>
      </div>
      
      <div class="filter-row">
        <div class="filter-input-group">
          <label>Life Time Value</label>
          <select id="filt-ltv" class="filter-select" onchange="setHubFilter('filterLTV', this.value)">
            <option value="All" ${state.filterLTV === 'All' ? 'selected' : ''}>All</option>
            <option value="Whale" ${state.filterLTV === 'Whale' ? 'selected' : ''}>💎 VVIP Whale</option>
            <option value="Dolphin" ${state.filterLTV === 'Dolphin' ? 'selected' : ''}>🐳 VIP Dolphin</option>
            <option value="Minnow" ${state.filterLTV === 'Minnow' ? 'selected' : ''}>🐟 Regular Minnow</option>
            <option value="General" ${state.filterLTV === 'General' ? 'selected' : ''}>🐚 General</option>
          </select>
        </div>
        
        <div class="filter-input-group">
          <label>Loyalty Index</label>
          <select id="filt-loy" class="filter-select" onchange="setHubFilter('filterLoyalty', this.value)">
            <option value="All" ${state.filterLoyalty === 'All' ? 'selected' : ''}>All</option>
            <option value="Legendary" ${state.filterLoyalty === 'Legendary' ? 'selected' : ''}>🏅 Legendary (1Y+)</option>
            <option value="Veteran" ${state.filterLoyalty === 'Veteran' ? 'selected' : ''}>🥈 Veteran (6M+)</option>
            <option value="Regular" ${state.filterLoyalty === 'Regular' ? 'selected' : ''}>🥉 Regular</option>
            <option value="Seedling" ${state.filterLoyalty === 'Seedling' ? 'selected' : ''}>🌱 Seedling</option>
          </select>
        </div>
        
        <div class="filter-input-group">
          <label>Segment 1</label>
          <select id="filt-seg1" class="filter-select" onchange="setHubFilter('filterSeg1', this.value)">
            <option value="All" ${state.filterSeg1 === 'All' ? 'selected' : ''}>All</option>
            <option value="NEW" ${state.filterSeg1 === 'NEW' ? 'selected' : ''}>NEW</option>
            <option value="ACTIVE" ${state.filterSeg1 === 'ACTIVE' ? 'selected' : ''}>ACTIVE</option>
            <option value="RISK" ${state.filterSeg1 === 'RISK' ? 'selected' : ''}>RISK</option>
            <option value="CHURN" ${state.filterSeg1 === 'CHURN' ? 'selected' : ''}>CHURN</option>
          </select>
        </div>
        
        <div class="filter-input-group">
          <label>Segment 2</label>
          <select id="filt-seg2" class="filter-select" onchange="setHubFilter('filterSeg2', this.value)">
            <option value="All" ${state.filterSeg2 === 'All' ? 'selected' : ''}>All</option>
            <option value="NEW" ${state.filterSeg2 === 'NEW' ? 'selected' : ''}>NEW</option>
            <option value="ACTIVE" ${state.filterSeg2 === 'ACTIVE' ? 'selected' : ''}>ACTIVE</option>
            <option value="REFILL" ${state.filterSeg2 === 'REFILL' ? 'selected' : ''}>REFILL</option>
            <option value="RISK" ${state.filterSeg2 === 'RISK' ? 'selected' : ''}>RISK</option>
            <option value="CHURN" ${state.filterSeg2 === 'CHURN' ? 'selected' : ''}>CHURN</option>
          </select>
        </div>

        <div class="filter-input-group">
          <label>Admin Priority</label>
          <select id="filt-priority" class="filter-select" onchange="setHubFilter('filterAdminPriority', this.value)">
            <option value="All" ${state.filterAdminPriority === 'All' ? 'selected' : ''}>All</option>
            <option value="High" ${state.filterAdminPriority === 'High' ? 'selected' : ''}>🟢 High</option>
            <option value="Medium" ${state.filterAdminPriority === 'Medium' ? 'selected' : ''}>🟡 Medium</option>
            <option value="Low" ${state.filterAdminPriority === 'Low' ? 'selected' : ''}>🟠 Low</option>
            <option value="Win-back" ${state.filterAdminPriority === 'Win-back' ? 'selected' : ''}>🔴 Win-back</option>
          </select>
        </div>

        <div class="filter-input-group">
          <label>Action Strategy</label>
          <select id="filt-action" class="filter-select" onchange="setHubFilter('filterAction', this.value)">
            <option value="All" ${state.filterAction === 'All' ? 'selected' : ''}>All</option>
            <option value="Golden" ${state.filterAction === 'Golden' ? 'selected' : ''}>🎯 Golden Period</option>
            <option value="Urgent" ${state.filterAction === 'Urgent' ? 'selected' : ''}>⚡ Urgent Opportunity</option>
            <option value="High LTV" ${state.filterAction === 'High LTV' ? 'selected' : ''}>💎 High LTV</option>
            <option value="Risk Alert" ${state.filterAction === 'Risk Alert' ? 'selected' : ''}>🟠 Risk Alert</option>
            <option value="Slow User" ${state.filterAction === 'Slow User' ? 'selected' : ''}>⚠️ Slow User</option>
            <option value="Speed Churn" ${state.filterAction === 'Speed Churn' ? 'selected' : ''}>🚨 Speed Churn</option>
            <option value="Dead Churn" ${state.filterAction === 'Dead Churn' ? 'selected' : ''}>😴 Dead Churn</option>
            <option value="Healthy Care" ${state.filterAction === 'Healthy Care' ? 'selected' : ''}>✅ Healthy Care</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Scrollable Customers Table Card -->
    <div class="table-card">
      <div class="table-wrapper">
        <table class="customer-table">
          <thead>
            <tr>
              <th onclick="setHubSort('phone')">CustomerKey (Phone) ${getSortIcon('phone')}</th>
              <th onclick="setHubSort('name')">CustomerName (Latest) ${getSortIcon('name')}</th>
              <th onclick="setHubSort('firstPurchaseDate')">FirstPurchaseDate ${getSortIcon('firstPurchaseDate')}</th>
              <th onclick="setHubSort('lastPurchaseDate')">LastPurchaseDate ${getSortIcon('lastPurchaseDate')}</th>
              <th onclick="setHubSort('totalOrders')">TotalOrders (SALE only) ${getSortIcon('totalOrders')}</th>
              <th onclick="setHubSort('totalRevenue')">TotalRevenue (SALE only) ${getSortIcon('totalRevenue')}</th>
              <th onclick="setHubSort('aov')">AOV ${getSortIcon('aov')}</th>
              <th onclick="setHubSort('daysSinceLast')">DaysSinceLast ${getSortIcon('daysSinceLast')}</th>
              <th onclick="setHubSort('lastProductStr')">Last Product ${getSortIcon('lastProductStr')}</th>
              <th onclick="setHubSort('nextPurchaseDateObj')">Next Purchase Date ${getSortIcon('nextPurchaseDateObj')}</th>
              
              <!-- Segmentations (Blue Headers) -->
              <th class="th-insight" onclick="setHubSort('ltvTier')">Life time value ${getSortIcon('ltvTier')}</th>
              <th class="th-insight" onclick="setHubSort('loyaltyTier')">Loyalty Index ${getSortIcon('loyaltyTier')}</th>
              <th class="th-insight" onclick="setHubSort('entryProduct')">Entry Product (สินค้าแรกเริ่ม) ${getSortIcon('entryProduct')}</th>
              <th class="th-insight" onclick="setHubSort('currentFavorite')">Current Favorite (สินค้าโปรดล่าสุด) ${getSortIcon('currentFavorite')}</th>
              
              <!-- Sales Actions (Pink Headers) -->
              <th class="th-action" onclick="setHubSort('adminPriority')">Admin Priority ${getSortIcon('adminPriority')}</th>
              <th class="th-action" onclick="setHubSort('segment1')">Segment 1 : Standard Period ${getSortIcon('segment1')}</th>
              <th class="th-action" onclick="setHubSort('segment2')">Segment 2 : Dynamic Refill ${getSortIcon('segment2')}</th>
              <th class="th-action" onclick="setHubSort('actionStrategy')">Action Strategy Guideline ${getSortIcon('actionStrategy')}</th>
              <th class="th-action" onclick="setHubSort('firstChannel')">FirstChannel (Main) ${getSortIcon('firstChannel')}</th>
              <th class="th-action" onclick="setHubSort('lastChannel')">LastChannel (Main) ${getSortIcon('lastChannel')}</th>
              <th class="th-action" onclick="setHubSort('lastAdmin')">Last Admin ${getSortIcon('lastAdmin')}</th>
              
              <!-- Annual Tiers (Green Headers) -->
              <th class="th-tiers" onclick="setHubSort('tier2023')">Tier 2023 ${getSortIcon('tier2023')}</th>
              <th class="th-tiers" onclick="setHubSort('tier2024')">Tier 2024 ${getSortIcon('tier2024')}</th>
              <th class="th-tiers" onclick="setHubSort('tier2025')">Tier 2025 ${getSortIcon('tier2025')}</th>
              <th class="th-tiers" onclick="setHubSort('tier2026')">Tier 2026 ${getSortIcon('tier2026')}</th>
            </tr>
          </thead>
          <tbody>
            ${pageEntries.map(c => `
              <tr>
                <td style="font-weight: 600;">${c.phone}</td>
                <td>${c.name}</td>
                <td>${formatDateDisplay(c.firstPurchaseDate)}</td>
                <td>${formatDateDisplay(c.lastPurchaseDate)}</td>
                <td style="text-align: center;">${c.totalOrders}</td>
                <td style="font-weight: bold; text-align: right;">฿${c.totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                <td style="text-align: right;">฿${c.aov.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                <td style="text-align: center;">${c.daysSinceLast.toFixed(1)}</td>
                <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis;" title="${c.lastProductStr}">${c.lastProductStr || "-"}</td>
                <td style="font-weight: 600; color: #0269a1;">${formatDateDisplay(c.nextPurchaseDateObj)}</td>
                
                <!-- Insight Columns -->
                <td><span class="badge-span ${getLtvClass(c.ltvTier)}">${c.ltvTier}</span></td>
                <td><span class="badge-span ${getLoyaltyClass(c.loyaltyTier)}">${c.loyaltyTier}</span></td>
                <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;" title="${c.entryProduct}">${c.entryProduct || "-"}</td>
                <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;" title="${c.currentFavorite}">${c.currentFavorite || "-"}</td>
                
                <!-- Sales Action Columns -->
                <td><span class="${getAdminPriClass(c.adminPriority)}">${c.adminPriority}</span></td>
                <td><span class="${getSegClass(c.segment1)}">${c.segment1}</span></td>
                <td><span class="${getSegClass(c.segment2)}">${c.segment2}</span></td>
                <td><span class="act-strategy">${c.actionStrategy}</span></td>
                <td>${c.firstChannel}</td>
                <td>${c.lastChannel}</td>
                <td>${c.lastAdmin}</td>
                
                <!-- Tiers Columns -->
                <td style="text-align: center;">${c.tier2023}</td>
                <td style="text-align: center;">${c.tier2024}</td>
                <td style="text-align: center;">${c.tier2025}</td>
                <td style="text-align: center;">${c.tier2026}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- Pagination Footer -->
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

  // Bind keyup event to Search Bar
  document.getElementById('hub-search').addEventListener('keyup', function(e) {
    state.searchTerm = e.target.value;
    state.currentPage = 1;
    // Debounce re-render slightly to avoid lag
    clearTimeout(window.searchDebounce);
    window.searchDebounce = setTimeout(() => {
      renderInsightHub(filteredData, rawData);
    }, 150);
  });
}

// Global actions connected to window to support HTML onclick events
window.setHubFilter = function(filterKey, val) {
  window.insightHubState[filterKey] = val;
  window.insightHubState.currentPage = 1;
  // Re-run applyFilters to get correct filteredData and update view
  if (window.applyFilters) window.applyFilters();
};

window.resetHubFilters = function() {
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
    filterAction: "All"
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

// Styling helper mappings
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
