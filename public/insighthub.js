// public/insighthub.js

window.addEventListener('appDataChanged', function(e) {
  if (!e || !e.detail || e.detail.type !== 'config') return;
  if (window.__hubCache && window.__hubCache.uniq) {
    window.__hubCache.uniq = {};
  }
});

if (!window.insightHubState) {
  window.insightHubState = {
    currentPage: 1,
    rowsPerPage: 100,
    searchTerm: "",
    sortColumn: "totalRevenue",
    sortAsc: false,
    excelFilters: {},
    excelSearchTerms: {},
    activeDropdown: null,
    selectedCustomerPhone: null,
    allCustomers: [],
    // 'feed' (ค่าเริ่มต้น) = การ์ด Insight อัตโนมัติ, 'table' = ตารางลูกค้าแบบเดิม, 'profile' คุมแยกผ่าน
    // selectedCustomerPhone (มี priority สูงสุดเสมอ ไม่ว่า activeView จะเป็นอะไร - ดู renderInsightHub)
    activeView: 'feed'
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

// สร้างยอดขายรายเดือน แยกตาม Channel/Admin/Product ใช้สำหรับการ์ด Insight Feed ที่ต้องเทียบ
// เดือนนี้กับเดือนก่อน (Channel Movers, Top Admin, Product Movers) - ใช้ getNormalized* ตัวเดียวกับที่
// หน้า Overview ใช้ (ไม่ใช่ CHANNEL_MAP ของไฟล์นี้เอง) เพื่อให้ตัวเลขตรงกับหน้า Overview/Executive เสมอ
// รับ rawSaleOrders ที่กรอง isSaleOrder มาแล้วจาก renderInsightHub (แถวเดียวกับที่ใช้คำนวณ customers)
// ไม่ใช่ rawData ดิบ ไม่งั้นยอดจะไม่ตรงกับคอลัมน์ Total Revenue ในตาราง
function getHubMonthlyDims(rawSaleOrders) {
  const byChannel = {}, byAdmin = {}, byProduct = {};
  const monthsSet = new Set();
  (rawSaleOrders || []).forEach(row => {
    const dateStr = window.getRowValue(row, ['วันที่สร้าง', 'วันที่โอนเงิน', 'OrderDate', 'Date', 'วันที่']);
    const d = window.parseDate ? window.parseDate(dateStr) : null;
    if (!d) return;
    const mStr = d.str || `${d.y}-${String(d.m).padStart(2, '0')}`;
    monthsSet.add(mStr);
    const revStr = window.getRowValue(row, ['ยอดขาย', 'ราคาสินค้ายังไม่รวมภาษี', 'Net Sales', 'Revenue', 'Amount', 'ยอดโอน']) || '0';
    const revenue = parseFloat(revStr.toString().replace(/,/g, '').trim()) || 0;

    const channel = window.getNormalizedChannel ? window.getNormalizedChannel(window.getRowValue(row, ['ช่องทาง', 'Channel']), row) : 'Other';
    const admin = window.getNormalizedAdmin ? window.getNormalizedAdmin(row) : 'Unknown';
    const rawProductName = window.getRowValue(row, ['Product Set', 'ชื่อสินค้า', 'Product', 'รายการขาย']);
    const product = window.getNormalizedProduct ? window.getNormalizedProduct(rawProductName) : 'Unknown';

    if (!byChannel[mStr]) byChannel[mStr] = {};
    byChannel[mStr][channel] = (byChannel[mStr][channel] || 0) + revenue;
    if (!byAdmin[mStr]) byAdmin[mStr] = {};
    byAdmin[mStr][admin] = (byAdmin[mStr][admin] || 0) + revenue;
    if (!byProduct[mStr]) byProduct[mStr] = {};
    byProduct[mStr][product] = (byProduct[mStr][product] || 0) + revenue;
  });
  return { months: Array.from(monthsSet).sort(), byChannel, byAdmin, byProduct };
}

// LTV tier ตาม totalRevenue สะสม - แยกเป็นฟังก์ชันเพื่อให้การ์ด "ลูกค้า VIP ใหม่" ใน Insight Feed
// เรียกซ้ำได้ (เทียบ tier ก่อน/หลังออเดอร์ล่าสุด เพื่อดูว่าเพิ่งข้าม tier ในช่วงนี้หรือเปล่า)
// ต้องเป็นค่าเดียวกับที่ใช้กำหนด ltvTier ของลูกค้าแต่ละคนด้านล่างเป๊ะๆ ห้ามมีสูตรสองชุด
function getLtvTierFor(totalRevenue) {
  if (totalRevenue >= 25000) return "💎 1. VVIP Whale (>25k)";
  if (totalRevenue >= 12000) return "🐳 2. VIP Dolphin (>12k)";
  if (totalRevenue >= 4500) return "🐟 3. Regular Minnow (>4.5k)";
  return "🐚 4. General";
}

function parseToDateObj(dateStr) {
  if (!dateStr) return null;
  if (window.parseDate) {
    const parsed = window.parseDate(dateStr);
    if (parsed) {
      return new Date(parsed.y, parsed.m - 1, parsed.d);
    }
  }
  // [RAW2021] fallback: รูปแบบวันที่ใน RAW 2021 เป็น d/m/yyyy เช่น 30/1/2021
  const m = dateStr.toString().trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const d = parseInt(m[1], 10), mo = parseInt(m[2], 10), y = parseInt(m[3], 10);
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) return new Date(y, mo - 1, d);
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

// Cleansing: ใช้เบอร์โทรศัพท์เป็นคีย์หลักของลูกค้า ต้อง normalize ก่อนเทียบ/รวมข้อมูล
// เพื่อไม่ให้เบอร์เดียวกันที่รูปแบบต่างกัน (ขีด, เว้นวรรค, +66, เลข 0 นำหน้าหาย) ถูกนับเป็นคนละคน
function normalizePhone(raw) {
  if (raw === null || raw === undefined) return '';
  let p = raw.toString().trim();
  if (!p) return '';
  if (/e\+?\d+$/i.test(p)) {
    const num = Number(p);
    if (!isNaN(num)) p = num.toFixed(0);
  }
  // เก็บเลข 0-9 และตัวมาสก์ x/X ไว้ (เบอร์ที่ถูกปิดบังบางส่วน เช่น 081-xxx-1234) ตัดเฉพาะขีด/วงเล็บ/เว้นวรรค/+
  p = p.replace(/[^0-9xX]/g, '').toLowerCase();
  if (!p) return '';
  if (p.startsWith('66') && p.length >= 11) {
    p = '0' + p.slice(2);
  }
  if (p.length === 9 && !p.startsWith('0')) {
    p = '0' + p;
  }
  return p;
}

// [RAW2021] คีย์ลูกค้า (auto-detect ตามรูปแบบไฟล์ ไม่กระทบพฤติกรรมเดิม):
// - ไฟล์รูปแบบเดิมที่มีเบอร์เต็ม -> ใช้เบอร์แบบ normalize เป็นคีย์ "เหมือนเดิมทุกอย่าง"
// - ไฟล์แบบ RAW 2021 ที่เบอร์ถูกมาสก์ (xxxxxxx746 มี unique แค่ ~1,050 แต่ลูกค้าจริง ~21,325 ราย)
//   -> สลับไปใช้รหัสใน CustomerName (เช่น EW66746) แทน ไม่งั้นลูกค้าเลขท้ายซ้ำจะถูกรวมเป็นคนเดียว
function getCustomerKey(row) {
  const phone = normalizePhone(window.getRowValue(row, ['Phone', 'เบอร์โทร', 'เบอร์โทรศัพท์']));
  const isMasked = phone.indexOf('x') !== -1;
  if (phone && !isMasked) return phone; // พฤติกรรมเดิม
  const code = (window.getRowValue(row, ['CustomerName', 'รหัสลูกค้า', 'Customer ID']) || '').toString().trim();
  if (code) return code.toUpperCase(); // เฉพาะกรณีเบอร์มาสก์/ไม่มีเบอร์
  return phone;
}

// Mapping ช่องทางดิบ (RawKey) -> { sub: SubChannel_STD, main: MainChannel_STD }
// [CLEANSED] ปรับค่าให้ตรงกับชีต Config_SubChannel_Map จริง (ถอดจากไฟล์ที่ผ่าน Data cleansing
// โดยเทียบ RawKey ใน Remark กับคอลัมน์ Sub Channel/Channel ทั้ง 56,391 แถว):
// FB คงเป็น FB (ไม่ใช่ FBH), LINE/L1/L2/L3 คงค่าเดิมไม่ยุบรวม, EMAIL/TELESALE/PHONE/CALL/OTHER ตัวพิมพ์ใหญ่ตามชีต
// map นี้ใช้เป็น fallback เฉพาะไฟล์ดิบที่ยังไม่มีคอลัมน์มาตรฐานมาให้ (ไฟล์ cleansed อ่านคอลัมน์ตรงๆ)
const CHANNEL_MAP = {
  'FB':        { sub: 'FB',       main: 'Facebook' },
  'FACEBOOK':  { sub: 'FB',       main: 'Facebook' },
  'FBH':       { sub: 'FBH',      main: 'Facebook' },
  'FBP':       { sub: 'FBP',      main: 'Facebook' },
  'FBSS':      { sub: 'FBSS',     main: 'Facebook' },
  'FBD':       { sub: 'FBD',      main: 'Facebook' },
  'FBM':       { sub: 'FBM',      main: 'Facebook' },
  'FBW':       { sub: 'FBW',      main: 'Facebook' },
  'FBK':       { sub: 'FBK',      main: 'Facebook' },
  'FBG':       { sub: 'FBG',      main: 'Facebook' },
  'FBC':       { sub: 'FBC',      main: 'Facebook' },
  'FBP-W':     { sub: 'FBP',      main: 'Facebook' },
  'FBH-IG':    { sub: 'FBH',      main: 'Facebook' },
  'FBบอกลา':   { sub: 'FB',       main: 'Facebook' },
  'FBย':       { sub: 'FB',       main: 'Facebook' },
  'FBA':       { sub: 'FBA',      main: 'Facebook' },
  'FBS':       { sub: 'FBS',      main: 'Facebook' },
  'FBB':       { sub: 'FBB',      main: 'Facebook' },
  'FBN':       { sub: 'FBN',      main: 'Facebook' },
  'FBO':       { sub: 'FBO',      main: 'Facebook' },
  'FBF':       { sub: 'FBF',      main: 'Facebook' },
  'PBP':       { sub: 'FBP',      main: 'Facebook' },
  'IG':        { sub: 'IG',       main: 'Instagram' },
  'INSTAGRAM': { sub: 'IG',       main: 'Instagram' },
  'IG-FBH':    { sub: 'IG-FBH',   main: 'Instagram' },
  'IG-FBW':    { sub: 'IG-FBW',   main: 'Instagram' },
  'IG-FBSS':   { sub: 'IG-FBSS',  main: 'Instagram' },
  'IG-FBM':    { sub: 'IG',       main: 'Instagram' },
  'IG-FBK':    { sub: 'IG',       main: 'Instagram' },
  'LINE':      { sub: 'LINE',     main: 'Line' },
  'LINE_OA':   { sub: 'LINE',     main: 'Line' },
  'L1':        { sub: 'L1',       main: 'Line' },
  'L2':        { sub: 'L2',       main: 'Line' },
  'L3':        { sub: 'L3',       main: 'Line' },
  'LAZADA':    { sub: 'Lazada',   main: 'Lazada' },
  'SHOPEE':    { sub: 'Shopee',   main: 'Shopee' },
  'TIKTOK':    { sub: 'Tiktok',   main: 'Tiktok' },
  'WEB':       { sub: 'WEB',      main: 'Website' },
  'WWW':       { sub: 'WWW',      main: 'Website' },
  'WEBSITE':   { sub: 'WEBSITE',  main: 'Website' },
  'โทรศัพท์':   { sub: 'CALL',     main: 'Call' },
  'CALL':      { sub: 'CALL',     main: 'Call' },
  'PHONE':     { sub: 'PHONE',    main: 'Call' },
  'EMAIL':     { sub: 'EMAIL',    main: 'Email' },
  'CRM':       { sub: 'CRM',      main: 'CRM' },
  'PC':        { sub: 'PC',       main: 'PC' },
  'OTHER':     { sub: 'OTHER',    main: 'Other' },
  'TELESALE':  { sub: 'TELESALE', main: 'Telesale' },
  'TELESALES': { sub: 'TELESALE', main: 'Telesale' }
};

// [RAW2021] แปลง token ช่องทางดิบ -> entry ใน CHANNEL_MAP (คืน null ถ้าไม่รู้จัก)
// รองรับความเพี้ยนที่พบจริงในข้อมูล: zero-width space, จุด/เครื่องหมายปน (FB., L;INE),
// มีคำต่อท้าย (FB P, LINE H, FBบอกลา), พิมพ์ผิด (LIINE, LINME, LIN, INE)
function resolveChannel(rawChannel) {
  if (rawChannel === null || rawChannel === undefined) return null;
  let t = rawChannel.toString()
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/[^0-9A-Za-z\u0e00-\u0e7f\- ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  if (!t) return null;

  if (CHANNEL_MAP[t]) return CHANNEL_MAP[t];

  const first = t.split(' ')[0];
  if (CHANNEL_MAP[first]) return CHANNEL_MAP[first];

  const compact = t.replace(/\s+/g, '');
  if (CHANNEL_MAP[compact]) return CHANNEL_MAP[compact];

  if (/^LI{1,2}N+M?E*$/.test(compact) || compact === 'LIN' || compact === 'INE' || compact.indexOf('LINE') === 0) {
    return CHANNEL_MAP['LINE'];
  }
  if (compact.indexOf('IG') === 0) return CHANNEL_MAP['IG'];
  if (compact.indexOf('FBP') === 0) return CHANNEL_MAP['FBP'];
  if (compact.indexOf('FB') === 0) {
    const sub = compact.length > 2 && compact.length <= 6 && /^FB[A-Z\-]+$/.test(compact) ? compact : 'FB';
    return { sub: sub, main: 'Facebook' };
  }
  if (compact.indexOf('WEB') === 0 || compact === 'WWW') return CHANNEL_MAP['WEB'];
  if (compact.indexOf('EMAIL') === 0 || compact.indexOf('MAIL') === 0) return CHANNEL_MAP['EMAIL'];
  if (compact.indexOf('TELESALE') === 0) return CHANNEL_MAP['TELESALE'];
  if (compact.indexOf('LAZADA') === 0) return CHANNEL_MAP['LAZADA'];
  if (compact.indexOf('SHOPEE') === 0) return CHANNEL_MAP['SHOPEE'];
  if (compact.indexOf('TIKTOK') === 0) return CHANNEL_MAP['TIKTOK'];
  return null;
}

// rawChannel: string|null/undefined -> { subChannel, mainChannel }
// ค่าว่าง -> คืนค่าว่างทั้งคู่, ค่าที่ไม่รู้จัก -> "Other" ทั้งคู่ (ไม่ปล่อยค่าดิบหลุดออกมา)
function standardizeChannel(rawChannel) {
  if (rawChannel === null || rawChannel === undefined) return { subChannel: '', mainChannel: '' };
  const raw = rawChannel.toString().trim();
  if (!raw) return { subChannel: '', mainChannel: '' };

  const entry = resolveChannel(raw);
  if (entry) return { subChannel: entry.sub, mainChannel: entry.main };

  console.warn('[standardizeChannel] Unknown channel key, defaulting to "Other":', raw);
  return { subChannel: 'Other', mainChannel: 'Other' };
}

// [RAW2021] RAW 2021 ไม่มีคอลัมน์ช่องทางแยก แต่ฝังอยู่ใน Remark รูปแบบเช่น
//   "เลข Tracking : 121563623182\nFB : Gojy Jinutta"      -> FB
//   "...\nFBH,แอน"                                        -> FBH (คั่นด้วย comma ตามด้วยชื่อแอดมิน)
//   "...\nEMAIL" หรือ "...\nTelesale"                      -> token เดี่ยวๆ ทั้งบรรทัด
// วิธีอ่าน: ไล่ทีละบรรทัด ข้ามบรรทัด Tracking แล้วเอาข้อความก่อน : หรือ , (หรือทั้งบรรทัดถ้าสั้น)
// ไปเช็คกับ CHANNEL_MAP -- รับเฉพาะบรรทัดที่ resolve เป็นช่องทางที่รู้จักจริงๆ กันข้อความอิสระปนเข้ามา
function extractChannelFromRemark(remark) {
  if (!remark) return '';
  const lines = remark.toString().split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/[\u200b\u200c\u200d\ufeff]/g, '').trim();
    if (!line) continue;
    if (/tracking/i.test(line) || line.indexOf('เลข') === 0) continue;
    const sep = line.search(/[:：,;；]/);
    const candidate = (sep >= 0 ? line.slice(0, sep) : line).trim();
    if (!candidate || candidate.length > 25) continue;
    if (resolveChannel(candidate)) return candidate;
  }
  return '';
}

// [RAW2021] จุดอ่านช่องทางจุดเดียว: ใช้คอลัมน์ ช่องทาง/Channel ก่อนถ้ามี (ไฟล์รูปแบบเดิม)
// ถ้าไม่มีค่อย fallback ไปแกะจาก Remark (รูปแบบ RAW 2021)
function getChannelRaw(row) {
  const direct = window.getRowValue(row, ['ช่องทาง', 'Channel']);
  if (direct && direct.toString().trim()) return direct.toString().trim();
  return extractChannelFromRemark(window.getRowValue(row, ['Remark', 'หมายเหตุ']));
}

// [CLEANSED] จุดอ่านช่องทางมาตรฐานของแถว (ใช้ทั้ง FirstChannel/LastChannel):
// 1) ไฟล์ที่ผ่าน Data cleansing มีคอลัมน์ Sub Channel/Channel (ผลจากชีต Config_SubChannel_Map)
//    -> ยึดค่าจากชีตแบบเด็ดขาด "รวมถึงค่าว่าง" (ว่าง = ชีตระบุว่าแถวนี้ไม่มีช่องทาง) ไม่เดาเพิ่มจาก Remark
// 2) ไฟล์ดิบที่ไม่มีคอลัมน์เหล่านี้ -> fallback ไปอ่านคอลัมน์ช่องทางดิบ/แกะจาก Remark แล้ว map ด้วย CHANNEL_MAP
function getRowChannelStd(row) {
  if (row && (row['Sub Channel'] !== undefined || row['SubChannel_STD'] !== undefined)) {
    const subCol = ((row['SubChannel_STD'] !== undefined ? row['SubChannel_STD'] : row['Sub Channel']) || '').toString().trim();
    const mainCol = ((row['MainChannel_STD'] !== undefined ? row['MainChannel_STD'] : row['Channel']) || '').toString().trim();
    return { subChannel: subCol, mainChannel: mainCol };
  }
  const raw = getChannelRaw(row);
  if (!raw) return { subChannel: '', mainChannel: '' };
  return standardizeChannel(raw);
}

function getMainChannel(rawChannel) {
  const mainChannel = standardizeChannel(rawChannel).mainChannel;
  return mainChannel || "-";
}

function getSubChannel(rawChannel) {
  const subChannel = standardizeChannel(rawChannel).subChannel;
  return subChannel || "-";
}

// [PERF] แปลงค่าในออบเจ็กต์ลูกค้าเป็นสตริงที่ใช้แสดง/กรอง (รวมไว้ที่เดียว เดิมโค้ดชุดนี้ถูกก๊อปซ้ำ 4 ที่)
function getCustomerFilterValue(c, colId) {
  if (colId === 'firstPurchaseDate') return c.firstPurchaseStr;
  if (colId === 'lastPurchaseDate') return c.lastPurchaseStr;
  if (colId === 'nextPurchaseDateObj') return c.nextPurchaseStr;
  if (colId === 'totalOrders') return c.totalOrdersStr;
  if (colId === 'totalRevenue') return c.totalRevenueStr;
  if (colId === 'aov') return c.aovStr;
  if (colId === 'daysSinceLast') return c.daysSinceLastStr;
  return String(c[colId] || "").trim();
}

// [PERF] แคชรายการค่า unique ต่อคอลัมน์ (ตัวเลือกใน dropdown filter)
// เดิมถูกคำนวณใหม่จากลูกค้าทั้งหมด (~21k ราย) ทุกคอลัมน์ทุกครั้งที่ render -> คำนวณครั้งเดียวต่อชุดข้อมูล
function getHubUniqueValues(colId) {
  const uniq = window.__hubCache && window.__hubCache.uniq;
  if (uniq && uniq[colId]) return uniq[colId];
  const vals = Array.from(new Set(
    (window.insightHubState.allCustomers || []).map(c => getCustomerFilterValue(c, colId))
  )).sort();
  if (uniq) uniq[colId] = vals;
  return vals;
}

// [PERF] จำกัดจำนวนตัวเลือกที่ render ใน dropdown ต่อครั้ง (บางคอลัมน์มี unique เป็นหมื่นค่า
// การยัดเป็น <li> ทั้งหมดทำให้ DOM บวมและหน่วง) พิมพ์ค้นหาเพื่อกรองตัวเลือกได้ตามปกติ
const HUB_OPTION_RENDER_LIMIT = 500;

function renderInsightHub(filteredData, rawData) {
  const container = document.getElementById('view-insighthub');
  // แก้ปัญหาหน้าเด้งกลับขึ้นบนสุดทุกครั้งที่เปลี่ยนหน้า/กรอง/เรียงลำดับ (ทุกอย่างวนกลับมาเรียกฟังก์ชันนี้ใหม่
  // ซึ่ง innerHTML ทั้ง container ทำให้ scroll ของทั้งหน้าและ scroll ภายในตารางเอง (.table-wrapper ที่ freeze
  // หัวตาราง มี overflow-y ของตัวเอง) รีเซ็ตกลับเป็น 0 ทุกครั้ง) -> จำตำแหน่ง scroll ทั้งสองจุดไว้ก่อน แล้วคืนค่าหลัง render เสร็จ
  const __scrollBox = container.closest('.main-content') || document.scrollingElement || document.documentElement;
  const __savedScrollTop = __scrollBox.scrollTop;
  const __oldTableWrapper = container.querySelector('.table-wrapper');
  const __savedTableScrollTop = __oldTableWrapper ? __oldTableWrapper.scrollTop : 0;
  const __oldTableScrollLeft = __oldTableWrapper ? __oldTableWrapper.scrollLeft : 0;
  try {

  if (!rawData || rawData.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:50px; color:#999;">No data loaded. Please import or load sample data.</div>';
    return;
  }

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
        overflow: visible;
        margin-bottom: 40px;
        position: relative;
      }
      .table-wrapper {
        overflow-x: auto;
        overflow-y: auto;
        max-height: 70vh;
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
        position: sticky;
        top: 0;
        z-index: 3;
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
        color: #1e293b;
        background: #f0e6df;
      }
      
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
        border-color: #1e293b;
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
        background: #1e293b;
        color: white;
        border-color: #1e293b;
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
      
      .ltv-whale { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }
      .ltv-dolphin { background: #e0e7ff; color: #4338ca; border: 1px solid #c7d2fe; }
      .ltv-minnow { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
      .ltv-general { background: #f5f5f5; color: #555555; border: 1px solid #e5e5e5; }

      .ctier-junior { background: #f5f5f5; color: #616161; border: 1px solid #e0e0e0; }
      .ctier-silver { background: #eef2f7; color: #546679; border: 1px solid #cbd5e1; }
      .ctier-gold { background: #fff8e1; color: #b7791f; border: 1px solid #f5d78e; }
      .ctier-platinum { background: #e6fbfb; color: #0e7490; border: 1px solid #a5f3fc; }
      .ctier-diamond { background: #f2e9ff; color: #6d28d9; border: 1px solid #ddd0fb; }

      .annual-tier-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      .annual-tier-table th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; text-align: left; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
      .annual-tier-table td { font-size: 13px; padding: 8px; border-bottom: 1px solid #f1f5f9; color: #334155; }
      .annual-tier-table th:not(:first-child), .annual-tier-table td:not(:first-child) { text-align: right; }

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
        background: #eef2f7;
        color: #1e293b;
        border-color: #94a3b8;
      }
      .pag-btn.active {
        background: #1e293b;
        color: white;
        border-color: #1e293b;
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

    document.addEventListener('click', function(e) {
      const state = window.insightHubState;
      let changed = false;
      if (!e.target.closest('.th-container') && !e.target.closest('.excel-dropdown-menu')) {
        if (state.activeDropdown) { state.activeDropdown = null; changed = true; }
        // .hub-subscribe-panel มีคลาส .excel-dropdown-menu ร่วมด้วย เช็คแค่ปุ่ม trigger เพราะปุ่มมันเอง
        // กัน propagation ไว้แล้ว (onclick="event.stopPropagation()") ส่วนคลิกนอกทั้งปุ่มและ panel ให้ปิด
        if (state.hubSubscribePanelOpen) { state.hubSubscribePanelOpen = false; changed = true; }
      }
      if (state.hubOpenNoteEditor && !e.target.closest('.hub-feed-note-box') && !e.target.closest('.hub-feed-note-icon')) {
        state.hubOpenNoteEditor = null; changed = true;
      }
      if (changed && window.applyFilters) window.applyFilters();
    });
  }

  const state = window.insightHubState;

  // [PERF] แคชผลการยุบข้อมูล: raw ~56k แถว -> ลูกค้า ~21k ราย เป็นงานหนักที่สุดของหน้านี้
  // เดิมถูกคำนวณใหม่ทุก interaction (เปิด dropdown, sort, เปลี่ยนหน้า ล้วนเรียก render ใหม่) ทำให้หน่วง
  // -> คำนวณครั้งเดียวต่อชุดข้อมูล ส่วน sort/filter/แบ่งหน้าใช้ผลจากแคช (ข้อมูลใหม่/import ใหม่จะคำนวณใหม่เอง)
  if (!window.__hubCache) window.__hubCache = { rawRef: null, rawLen: -1, customers: null, years: null, uniq: {} };
  const hubCache = window.__hubCache;

  let customers, availableYears;
  if (hubCache.rawRef === rawData && hubCache.rawLen === rawData.length && hubCache.customers) {
    customers = hubCache.customers;
    availableYears = hubCache.years;
    window.insightHubState.availableYears = availableYears;
  } else {

  // [RAW2021] กันพังกรณี window.isSaleOrder ไม่ถูกโหลด -> ถือว่าทุกแถวเป็น SALE
  const isSaleRow = (row) => (typeof window.isSaleOrder === 'function' ? window.isSaleOrder(row) : true);

  // [RAW2021] ตรวจรูปแบบไฟล์: RAW 2021 เป็น export รายการขายล้วน (มีคอลัมน์ Net Sales
  // แต่ไม่มีคอลัมน์ประเภทเอกสาร/สถานะ) ถ้าปล่อยผ่าน isSaleOrder ของรูปแบบเดิม
  // มันอาจกรองแถวทิ้งเพราะหาคอลัมน์ที่ใช้ตรวจไม่เจอ ทำให้ยอดขาย/จำนวนออเดอร์ "มาไม่ครบ"
  // -> ไฟล์รูปแบบนี้ให้นับทุกแถวเป็นรายการขาย ส่วนไฟล์รูปแบบเดิมยังผ่าน isSaleOrder ตามปกติทุกอย่าง
  const sampleRows = rawData.slice(0, 50);
  const hasNetSalesCol = sampleRows.some(r => (window.getRowValue(r, ['Net Sales']) || '').toString().trim() !== '');
  const hasDocTypeCol = sampleRows.some(r => (window.getRowValue(r, ['Order type', 'OrderType', 'ประเภทเอกสาร', 'ประเภท', 'สถานะ', 'DocType', 'Document Type', 'Status', 'Type']) || '').toString().trim() !== '');
  const isRaw2021Format = hasNetSalesCol && !hasDocTypeCol;
  const rawSaleOrders = isRaw2021Format ? rawData.slice() : rawData.filter(row => isSaleRow(row));
  
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
  availableYears = Array.from(availableYearsSet).sort((a, b) => a - b);
  window.insightHubState.availableYears = availableYears;

  const customerHistoryMap = {};

  rawSaleOrders.forEach(row => {
    const key = getCustomerKey(row); // [RAW2021] เดิมใช้ normalizePhone
    if (!key) return;
    if (!customerHistoryMap[key]) {
      customerHistoryMap[key] = [];
    }
    customerHistoryMap[key].push(row);
  });

  // ประวัติออเดอร์ "ทุกประเภท" (ไม่กรองเฉพาะ SALE) ต่อลูกค้า ใช้คำนวณ FirstChannel/LastChannel
  // ให้ตรงกับสูตรเดิมใน Google Sheets ที่ค้นหาจากชีต 'All Order_Inputs' ทั้งหมด
  const allOrdersHistoryMap = {};
  rawData.forEach(row => {
    const key = getCustomerKey(row); // [RAW2021]
    if (!key) return;
    if (!allOrdersHistoryMap[key]) {
      allOrdersHistoryMap[key] = [];
    }
    allOrdersHistoryMap[key].push(row);
  });

  const filteredCustomerKeys = new Set();
  rawData.forEach(row => {
    const key = getCustomerKey(row); // [RAW2021]
    if (key) filteredCustomerKeys.add(key);
  });

  if (filteredCustomerKeys.size === 0) {
    container.innerHTML = '<div style="text-align:center; padding:50px; color:#999;">No customers found matching the filters.</div>';
    return;
  }

  customers = Array.from(filteredCustomerKeys).map(custKey => {
    const historyRows = customerHistoryMap[custKey] || [];
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

    // ยอดเฉพาะออเดอร์ล่าสุด (ไม่รวมสะสม) - ใช้เทียบ LTV tier ก่อน/หลังออเดอร์นี้ สำหรับการ์ด
    // "ลูกค้า VIP ใหม่" ใน Insight Feed (ดู getLtvTierFor)
    const lastOrderRevStr = window.getRowValue(lastOrder.row, ['ยอดขาย', 'ราคาสินค้ายังไม่รวมภาษี', 'Net Sales', 'Revenue', 'Amount', 'ยอดโอน']) || '0';
    const lastOrderRevenueParsed = parseFloat(lastOrderRevStr.replace(/,/g, ''));
    const lastOrderRevenue = isNaN(lastOrderRevenueParsed) ? 0 : lastOrderRevenueParsed;

    const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const diffTime = today - lastPurchaseDate;
    const daysSinceLast = Math.max(0, diffTime / (1000 * 60 * 60 * 24));

    const lastProductStr = window.getRowValue(lastOrder.row, ['Product Set', 'ชื่อสินค้า', 'Product', 'รายการขาย']) || "-";
    const refillWindow = getRefillWindow(lastProductStr);
    const nextPurchaseDateObj = new Date(lastPurchaseDate.getTime() + refillWindow * 24 * 60 * 60 * 1000);

    const ltvTier = getLtvTierFor(totalRevenue);

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

    let segment1 = "CHURN";
    if (daysSinceLast <= 30) segment1 = "NEW";
    else if (daysSinceLast <= 90) segment1 = "ACTIVE";
    else if (daysSinceLast <= 120) segment1 = "RISK";

    let segment2 = "CHURN";
    if (daysSinceLast <= 7) segment2 = "NEW";
    else if (daysSinceLast <= refillWindow - 8) segment2 = "ACTIVE";
    else if (daysSinceLast <= refillWindow + 3) segment2 = "REFILL";
    else if (daysSinceLast <= refillWindow + 59) segment2 = "RISK";

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

    // FirstChannel = ช่องทางของออเดอร์แรกสุด (ทุกประเภท) ตามลำดับเวลา
    // LastChannel = ช่องทางล่าสุดที่ "ไม่ว่าง" (ทุกประเภท)
    // [RAW2021] เปลี่ยนจากอ่านคอลัมน์ ช่องทาง/Channel ตรงๆ เป็น getChannelRaw() ที่ fallback ไปแกะจาก Remark
    const allOrdersSorted = (allOrdersHistoryMap[custKey] || []).map(row => {
      const dateStr = window.getRowValue(row, ['วันที่สร้าง', 'วันที่โอนเงิน', 'OrderDate', 'Date', 'วันที่']);
      return { row, dateObj: parseToDateObj(dateStr) };
    }).filter(item => item.dateObj !== null).sort((a, b) => a.dateObj - b.dateObj);

    let firstChannel = "-";
    if (allOrdersSorted.length > 0) {
      const stdFirst = getRowChannelStd(allOrdersSorted[0].row);
      firstChannel = stdFirst.mainChannel || "-";
    }

    let lastChannel = "-";
    for (let i = allOrdersSorted.length - 1; i >= 0; i--) {
      const stdRow = getRowChannelStd(allOrdersSorted[i].row);
      if (stdRow.subChannel || stdRow.mainChannel) { lastChannel = stdRow.subChannel || stdRow.mainChannel; break; }
    }
    
    let lastAdmin = "-";
    if (window.getNormalizedAdmin) {
      lastAdmin = window.getNormalizedAdmin(lastOrder.row);
    } else {
      lastAdmin = window.getRowValue(lastOrder.row, ['ชื่อแอดมิน', 'Admin', 'Admin Name']) || "-";
    }
    // ไม่มีชื่อแอดมิน (getNormalizedAdmin คืน 'Unknown' เป็นค่า default) -> แสดง "-" แทน
    if (!lastAdmin || lastAdmin === 'Unknown') lastAdmin = "-";

    // lastChannel ด้านบน (ใช้แสดงในตาราง/โปรไฟล์) เป็นค่า sub-channel ก่อน (เช่น 'FB','LINE' ตัวพิมพ์ใหญ่)
    // จาก getRowChannelStd ของไฟล์นี้เอง - คนละระบบ/คนละรูปแบบตัวพิมพ์กับ getNormalizedChannel ที่การ์ด
    // Channel Movers ใน Insight Feed ใช้ (เช่น 'Line' ตัวพิมพ์เล็กผสมใหญ่) เทียบกันตรงๆ จะไม่ match เลย
    // -> เก็บอีกค่าที่มาจากระบบเดียวกับ getHubMonthlyDims ไว้แยกต่างหาก ใช้เฉพาะ deep-link จากการ์ด Movers
    const lastMainChannel = window.getNormalizedChannel
      ? window.getNormalizedChannel(window.getRowValue(lastOrder.row, ['ช่องทาง', 'Channel']), lastOrder.row)
      : lastChannel;

    // คำนวณยอดเงินสะสมจริงแยกรายปี + จำนวนออร์เดอร์ต่อปี (ใช้แสดงในโปรไฟล์ลูกค้า)
    // [RAW2021] เพิ่ม 'Net Sales' ในลิสต์คอลัมน์ยอดขาย (เดิมมีแค่ ยอดขาย/ยอดโอน ทำให้ RAW 2021 ได้ 0 หมด)
    const annualSpending = {};
    const annualOrders = {};
    availableYears.forEach(y => { annualSpending[y] = 0; annualOrders[y] = 0; });
    sortedHistory.forEach(o => {
      const year = o.dateObj.getFullYear();
      if (annualSpending[year] !== undefined) {
        const revStr = window.getRowValue(o.row, ['ยอดขาย', 'ยอดโอน', 'Net Sales', 'ราคาสินค้ายังไม่รวมภาษี', 'Revenue', 'Amount']) || '0';
        const rev = parseFloat(revStr.replace(/,/g, ''));
        if (!isNaN(rev)) annualSpending[year] += rev;
        annualOrders[year] += 1;
      }
    });

    // [RAW2021] เบอร์สำหรับ "แสดงผล" ในคอลัมน์ CustomerKey (Phone)
    // - ไฟล์เดิม: custKey คือเบอร์อยู่แล้ว -> โชว์เหมือนเดิมเป๊ะ
    // - RAW 2021: custKey เป็นรหัสลูกค้า (ใช้จับกลุ่มเบื้องหลัง) แต่หน้าจอโชว์เบอร์มาสก์ตามไฟล์ เช่น xxxxxxx429
    const rawPhoneVal = (window.getRowValue(lastOrder.row, ['Phone', 'เบอร์โทร', 'เบอร์โทรศัพท์']) || '').toString().trim();
    const normPhone = normalizePhone(rawPhoneVal);
    const displayPhone = (custKey === normPhone) ? custKey : (normPhone || rawPhoneVal || custKey);

    const customerObj = {
      phone: custKey, // [RAW2021] property ชื่อเดิม ค่าคือคีย์จาก getCustomerKey (ไฟล์เดิม = เบอร์โทรเหมือนเดิม)
      displayPhone,
      name: window.getRowValue(lastOrder.row, ['CustomerName', 'ชื่อผู้ส่ง', 'Customer ID', 'รหัสลูกค้า']) || custKey,
      firstPurchaseDate,
      lastPurchaseDate,
      totalOrders,
      totalRevenue,
      lastOrderRevenue,
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
      lastMainChannel,
      lastAdmin,
      annualSpending,
      annualOrders,
      firstPurchaseStr: formatDateDisplay(firstPurchaseDate),
      lastPurchaseStr: formatDateDisplay(lastPurchaseDate),
      nextPurchaseStr: formatDateDisplay(nextPurchaseDateObj),
      totalOrdersStr: String(totalOrders),
      totalRevenueStr: "฿" + totalRevenue.toLocaleString(undefined, {maximumFractionDigits:0}),
      aovStr: "฿" + aov.toLocaleString(undefined, {maximumFractionDigits:0}),
      daysSinceLastStr: daysSinceLast.toFixed(1)
    };
    
    // ตั้งค่าแสดงผลบนตารางหน้าหลักเป็น ยอดเงินบาท
    availableYears.forEach(y => {
      const amt = annualSpending[y] || 0;
      customerObj['tier' + y] = amt > 0 ? "฿" + amt.toLocaleString(undefined, {maximumFractionDigits:0}) : "-";
    });
    
    return customerObj;
  }).filter(c => c !== null);

  // [PERF] เก็บผลลงแคช + log ตัวเลขไว้ตรวจสอบ (เปิด Console ดูได้ว่าแถว/ยอดหายที่ขั้นไหน)
  hubCache.rawRef = rawData;
  hubCache.rawLen = rawData.length;
  hubCache.customers = customers;
  hubCache.years = availableYears;
  // today = วันที่ล่าสุดที่เจอในข้อมูลจริง (ไม่ใช่ new Date() ตามเวลาเครื่อง) ใช้เป็นค่า "วันนี้" อ้างอิงเดียวกัน
  // ทั้ง segment1/segment2/refill window (คำนวณไปแล้วด้านบน) และการ์ดใน Insight Feed (ดู renderHubFeed)
  hubCache.today = today;
  // ยอดขายรายเดือนแยก Channel/Admin/Product - ใช้เฉพาะการ์ด Movers ใน Insight Feed คำนวณครั้งเดียวพร้อม
  // customers ตรงนี้เลย (แคชอายุเท่ากัน invalidate พร้อมกัน) ไม่ต้องวน rawSaleOrders ซ้ำอีกรอบตอน render feed
  hubCache.monthlyDims = getHubMonthlyDims(rawSaleOrders);
  hubCache.uniq = {};
  console.info('[InsightHub] rows:', rawData.length,
    '| sale rows:', rawSaleOrders.length,
    '| isRaw2021Format:', isRaw2021Format,
    '| customers:', customers.length,
    '| total revenue:', customers.reduce((s, c) => s + c.totalRevenue, 0).toLocaleString());

  } // end: cache miss (คำนวณใหม่)

  window.insightHubState.allCustomers = customers;

  if (state.selectedCustomerPhone) {
    const customer = customers.find(c => c.phone === state.selectedCustomerPhone);
    if (customer) {
      renderCustomerProfileView(customer, container, filteredData, rawData);
      return;
    }
  }

  // 'table' = ตารางลูกค้าแบบเดิม (Excel-style filter/sort/pagination/export ทุกอย่างเหมือนเดิมเป๊ะ
  // ดู renderHubTable) / อย่างอื่นทั้งหมด (ค่าเริ่มต้น 'feed') = การ์ด Insight Feed ใหม่ (ดู renderHubFeed)
  if (state.activeView === 'table') {
    renderHubTable(customers, container);
    return;
  }
  renderHubFeed(customers, container);
  return;

  } finally {
    __scrollBox.scrollTop = __savedScrollTop;
    const __newTableWrapper = container.querySelector('.table-wrapper');
    if (__newTableWrapper) {
      __newTableWrapper.scrollTop = __savedTableScrollTop;
      __newTableWrapper.scrollLeft = __oldTableScrollLeft;
    }
  }
}

// แยกออกมาจาก renderInsightHub เดิม (cut-paste ตรงๆ ไม่แก้ logic) ตอน renderInsightHub ยังโชว์แต่ตารางเสมอ
// ตอนนี้เป็น "classic view" ที่เข้าถึงได้ผ่านปุ่ม "ดูตารางลูกค้าทั้งหมด" ใน Insight Feed (hubSetView('table'))
// filter/sort/pagination/export (exportInsightHubExcel อ่าน state.displayedCustomers ที่ตั้งค่าไว้ท้ายฟังก์ชันนี้)
// ต้องทำงานเหมือนเดิมทุกประการ - ห้ามแก้ logic ใดๆ ในนี้นอกจากจำเป็นต้องปรับให้เป็นฟังก์ชันแยก
function renderHubTable(customers, container) {
  const state = window.insightHubState;
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

  // [PERF] เตรียมชุดกรองล่วงหน้า: เดิมเช็คด้วย Array.includes ต่อลูกค้าต่อคอลัมน์
  // (ลูกค้า ~21k ราย x ตัวเลือกในคอลัมน์สูงสุด ~21k ค่า = O(n^2) คือต้นเหตุอาการค้าง)
  // -> แปลงเป็น Set (เช็ค O(1)) และข้ามคอลัมน์ที่เลือกครบทุกค่า (ถือว่าไม่ได้กรอง)
  // หมายเหตุ: คอลัมน์ที่ "ล้าง" จนว่าง (length 0) ต้องข้ามเหมือนเดิมตามพฤติกรรมโค้ดเดิม
  const activeFilterSets = {};
  for (const colId in state.excelFilters) {
    const allowedValues = state.excelFilters[colId];
    if (!allowedValues || allowedValues.length === 0) continue;
    if (allowedValues.length >= getHubUniqueValues(colId).length) continue;
    activeFilterSets[colId] = new Set(allowedValues);
  }

  let displayedCustomers = customers.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(state.searchTerm.toLowerCase()) || c.phone.includes(state.searchTerm) || (c.displayPhone || '').includes(state.searchTerm);
    if (!matchesSearch) return false;

    for (const colId in activeFilterSets) {
      if (!activeFilterSets[colId].has(getCustomerFilterValue(c, colId))) return false;
    }
    return true;
  });

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

  // เก็บผลลัพธ์ที่กรอง/เรียงแล้ว (ไม่ตัดหน้า) ไว้ให้ปุ่ม Export ใช้ export ทั้งหมดที่ตรงเงื่อนไข ไม่ใช่แค่หน้าที่เห็น
  state.displayedCustomers = displayedCustomers;

  const totalEntries = displayedCustomers.length;
  const totalPages = Math.ceil(totalEntries / state.rowsPerPage) || 1;
  if (state.currentPage > totalPages) state.currentPage = totalPages;
  const startIndex = (state.currentPage - 1) * state.rowsPerPage;
  const endIndex = Math.min(startIndex + state.rowsPerPage, totalEntries);
  const pageEntries = displayedCustomers.slice(startIndex, endIndex);

  function makeExcelHeaderTh(columnId, displayTitle, extraClass = "") {
    // [PERF] ใช้ค่าจากแคชแทนการ map ลูกค้าทั้งหมดใหม่ทุกคอลัมน์ทุกครั้งที่ render
    const uniqueValues = getHubUniqueValues(columnId);

    if (!window.insightHubState.excelFilters[columnId]) {
      window.insightHubState.excelFilters[columnId] = [...uniqueValues];
    }

    const currentSelected = window.insightHubState.excelFilters[columnId];
    const isOpen = window.insightHubState.activeDropdown === columnId;
    const filterSearchText = (window.insightHubState.excelSearchTerms[columnId] || "").toLowerCase();
    // [PERF] คำนวณ/สร้าง <li> เฉพาะ dropdown ที่เปิดอยู่ (เดิมสร้างของทุกคอลัมน์แม้ซ่อนอยู่
    // บางคอลัมน์มีตัวเลือกเป็นหมื่น -> DOM บวมหลักแสน node ต่อ render) และจำกัดที่ HUB_OPTION_RENDER_LIMIT
    const visibleOptions = isOpen ? uniqueValues.filter(v => v.toLowerCase().includes(filterSearchText)) : [];
    const renderedOptions = visibleOptions.slice(0, HUB_OPTION_RENDER_LIMIT);
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
              ${renderedOptions.map(opt => {
                const isChecked = currentSelected.includes(opt);
                return `
                  <li style="padding: 4px 0; display: flex; align-items: center; gap: 6px; font-size:11px;">
                    <input type="checkbox" id="chk-${columnId}-${opt.replace(/[^a-zA-Z0-9]/g, '_')}" ${isChecked ? 'checked' : ''} onchange="handleDropdownCheck('${columnId}', '${opt.replace(/'/g, "\\'")}', this.checked)">
                    <label style="cursor:pointer; flex-grow:1; font-weight: normal; margin:0;" for="chk-${columnId}-${opt.replace(/[^a-zA-Z0-9]/g, '_')}">${opt || '(ว่าง)'}</label>
                  </li>
                `;
              }).join('')}
              ${isOpen && visibleOptions.length > HUB_OPTION_RENDER_LIMIT ? `<li style="color:#999; padding: 6px 0; font-style: italic;">แสดง ${HUB_OPTION_RENDER_LIMIT.toLocaleString()} จาก ${visibleOptions.length.toLocaleString()} รายการ — พิมพ์ค้นหาเพื่อกรองตัวเลือก</li>` : ''}
              ${isOpen && visibleOptions.length === 0 ? '<li style="color:#999; text-align:center; padding: 10px 0;">ไม่พบผลลัพธ์</li>' : ''}
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

  let html = `
    <div class="hub-header" style="display: flex; align-items: center; justify-content: space-between;">
      <h2>Customer Insight Hub</h2>
      <div style="display: flex; gap: 10px;">
        <button class="pag-btn" onclick="hubSetView('feed')">
          <i class="fas fa-stream"></i> กลับไปหน้า Feed
        </button>
        <button class="pag-btn" style="background: #15803d; color: white; border-color: #15803d; font-weight: 600;" onclick="exportInsightHubExcel()">
          <i class="fas fa-file-excel"></i> Export Excel
        </button>
      </div>
    </div>

    ${state.hubJumpLabel ? `
      <div class="hub-jump-banner">
        <span><i class="fas fa-filter"></i> กรองมาจาก Insight Feed: <strong>${escapeHtml(state.hubJumpLabel)}</strong></span>
        <button onclick="hubClearJumpLabel()" title="ล้างข้อความนี้"><i class="fas fa-xmark"></i></button>
      </div>
    ` : ''}

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
              ${makeExcelHeaderTh('displayPhone', 'CustomerKey (Phone)')}
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
              ${makeExcelHeaderTh('entryProduct', 'Entry Product (สินค้าเปิดใจ)', 'th-insight')}
              ${makeExcelHeaderTh('currentFavorite', 'Current Favorite (สินค้าตัวโปรด)', 'th-insight')}
              
              ${makeExcelHeaderTh('adminPriority', 'Admin Priority', 'th-action')}
              ${makeExcelHeaderTh('segment1', 'Segment 1 : Standard Period', 'th-action')}
              ${makeExcelHeaderTh('segment2', 'Segment 2 : Dynamic Refill', 'th-action')}
              ${makeExcelHeaderTh('actionStrategy', 'Action Strategy Guideline', 'th-action')}
              ${makeExcelHeaderTh('firstChannel', 'FirstChannel (Main)', 'th-action')}
              ${makeExcelHeaderTh('lastChannel', 'LastChannel (Main)', 'th-action')}
              ${makeExcelHeaderTh('lastAdmin', 'Last Admin', 'th-action')}
              
              ${state.availableYears.map(y => makeExcelHeaderTh('tier' + y, `ยอดซื้อปี ${y}`, 'th-tiers')).join('')}
            </tr>
          </thead>
          <tbody>
            ${pageEntries.map(c => `
              <tr>
                <td style="font-weight: 600; cursor: pointer; color: #1e293b; text-decoration: underline;" onclick="openCustomerProfile('${c.phone}')">${c.displayPhone}</td>
                <td style="font-weight: 600; cursor: pointer; color: #1e293b; text-decoration: underline;" onclick="openCustomerProfile('${c.phone}')">${c.name}</td>
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
                
                ${state.availableYears.map(y => '<td style="text-align: right; font-weight: 500;">' + c['tier' + y] + '</td>').join('')}
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

// ==========================================================================
// Insight Feed (Phase 1: Feed + Annotation + Subscribe) - ดูแผนที่ตกลงกันไว้
// เนื้อหาการ์ดคำนวณจากข้อมูล CRM ของเราเอง (ไม่ใช่ข่าวภายนอกแบบเว็บต้นแบบ) หัวข้อคงที่ 6 หัวข้อ v1
// ==========================================================================

function getHubPeriodKey(today) {
  return today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
}

function escapeHtml(str) {
  return (str || '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const HUB_ALL_TOPIC_IDS = ['churn-risk', 'refill-due', 'new-vip', 'channel-movers', 'admin-performance', 'product-movers'];

function getHubSubscriptions() {
  try {
    const raw = localStorage.getItem('qm_hub_subscriptions_v1');
    if (!raw) return HUB_ALL_TOPIC_IDS.slice();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : HUB_ALL_TOPIC_IDS.slice();
  } catch (e) { return HUB_ALL_TOPIC_IDS.slice(); }
}

window.hubToggleSubscription = function(topicId) {
  const subs = getHubSubscriptions();
  const idx = subs.indexOf(topicId);
  if (idx === -1) subs.push(topicId); else subs.splice(idx, 1);
  localStorage.setItem('qm_hub_subscriptions_v1', JSON.stringify(subs));
  if (window.applyFilters) window.applyFilters();
};

window.hubOpenSubscribePanel = function() {
  window.insightHubState.hubSubscribePanelOpen = true;
  if (window.applyFilters) window.applyFilters();
};
window.hubCloseSubscribePanel = function() {
  window.insightHubState.hubSubscribePanelOpen = false;
  if (window.applyFilters) window.applyFilters();
};

function getHubNotes() {
  try { return JSON.parse(localStorage.getItem('qm_hub_notes_v1') || '{}'); } catch (e) { return {}; }
}

window.hubSaveNote = function(topicId, periodKey, text) {
  const notes = getHubNotes();
  const key = topicId + ':' + periodKey;
  const trimmed = (text || '').trim();
  if (trimmed) notes[key] = trimmed; else delete notes[key];
  localStorage.setItem('qm_hub_notes_v1', JSON.stringify(notes));
  window.insightHubState.hubOpenNoteEditor = null;
  if (window.applyFilters) window.applyFilters();
};

window.hubToggleNoteEditor = function(topicId) {
  const state = window.insightHubState;
  state.hubOpenNoteEditor = (state.hubOpenNoteEditor === topicId) ? null : topicId;
  if (window.applyFilters) window.applyFilters();
};

// เก็บ matchedCustomers/label ของแต่ละการ์ดไว้ที่ window (ไม่ใช่ฝังลง onclick attribute โดยตรง) เพราะชื่อ
// ลูกค้าเป็นข้อมูลดิบจากไฟล์ CSV อาจมีเครื่องหมายคำพูดปนอยู่ ถ้าฝังลง HTML attribute ตรงๆ จะพัง/เสี่ยง
// ต่อการหลุด attribute ได้ - onclick จึงส่งแค่ topicId (ค่าคงที่ปลอดภัย) แล้วมาค้นจาก object นี้แทน
window.__hubFeedMatches = {};
window.__hubFeedLabels = {};

window.hubJumpToTable = function(topicId) {
  const matches = window.__hubFeedMatches[topicId] || [];
  const state = window.insightHubState;
  state.excelFilters = { displayPhone: Array.from(new Set(matches.map(c => c.displayPhone))) };
  state.excelSearchTerms = {};
  state.searchTerm = '';
  state.currentPage = 1;
  state.activeView = 'table';
  state.hubJumpLabel = window.__hubFeedLabels[topicId] || '';
  if (window.applyFilters) window.applyFilters();
};

window.hubClearJumpLabel = function() {
  window.insightHubState.hubJumpLabel = '';
  if (window.applyFilters) window.applyFilters();
};

window.hubSetView = function(view) {
  window.insightHubState.activeView = view;
  if (window.applyFilters) window.applyFilters();
};

// หา "ตัวเด่น" ของแต่ละมิติ (Channel/Admin/Product) เทียบเดือนล่าสุดกับเดือนก่อนหน้าใน monthlyDims -
// ใช้ร่วมกันทั้ง 3 การ์ด Movers ไม่แยกเขียนซ้ำ ต้องมีข้อมูลอย่างน้อย 2 เดือนถึงจะเทียบ MoM ได้
function getHubMoverStats(dimMap, months) {
  if (!months || months.length < 2) return null;
  const currMonth = months[months.length - 1];
  const prevMonth = months[months.length - 2];
  const currData = dimMap[currMonth] || {};
  const prevData = dimMap[prevMonth] || {};
  const keys = new Set(Object.keys(currData).concat(Object.keys(prevData)));
  const rows = Array.from(keys).map(key => {
    const curr = currData[key] || 0;
    const prev = prevData[key] || 0;
    const pct = prev > 0 ? ((curr - prev) / prev) * 100 : (curr > 0 ? Infinity : 0);
    return { key, curr, prev, pct };
  }).filter(r => r.curr > 0 || r.prev > 0);
  if (rows.length === 0) return null;
  const grower = rows.slice().sort((a, b) => b.pct - a.pct)[0];
  const decliner = rows.slice().sort((a, b) => a.pct - b.pct)[0];
  // เลือกตัวที่ "เคลื่อนไหวเด่นที่สุด" ตัวเดียว (ขึ้นแรงสุด หรือ ลงแรงสุด) ไม่ใส่ทั้งคู่พร้อมกัน กันการ์ดรก
  const gMag = grower ? (grower.pct === Infinity ? Number.MAX_SAFE_INTEGER : Math.abs(grower.pct)) : -1;
  const dMag = decliner ? (decliner.pct === Infinity ? Number.MAX_SAFE_INTEGER : Math.abs(decliner.pct)) : -1;
  const standout = gMag >= dMag ? grower : decliner;
  return { currMonth, prevMonth, standout };
}

function formatHubPct(pct) {
  if (pct === Infinity) return 'ใหม่ในเดือนนี้';
  return (pct >= 0 ? '+' : '') + pct.toFixed(0) + '%';
}

function getHubTopicCatalog() {
  return [
    {
      id: 'churn-risk', title: 'ลูกค้าเสี่ยงหาย', icon: 'fa-triangle-exclamation',
      compute(customers) {
        const matched = customers.filter(c => ['RISK', 'CHURN'].includes(c.segment1) || ['RISK', 'CHURN'].includes(c.segment2));
        if (matched.length === 0) return null;
        const pct = customers.length > 0 ? (matched.length / customers.length) * 100 : 0;
        const sorted = matched.slice().sort((a, b) => b.daysSinceLast - a.daysSinceLast);
        return {
          headline: matched.length.toLocaleString(),
          headlineSub: 'คน',
          subLabel: pct.toFixed(0) + '% ของลูกค้าทั้งหมด',
          sentence: `มีลูกค้า <strong>${matched.length.toLocaleString()} คน</strong> ที่เข้าข่ายเสี่ยงหาย (ไม่ได้ซื้อนานเกินคาด) ควรทักติดตามด่วน`,
          examples: sorted.slice(0, 5).map(c => c.name),
          matchedCustomers: matched
        };
      }
    },
    {
      id: 'refill-due', title: 'ถึงรอบซื้อซ้ำเร็วๆ นี้', icon: 'fa-rotate',
      compute(customers, monthlyDims, today) {
        const in7d = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
        const matched = customers.filter(c => c.nextPurchaseDateObj && c.nextPurchaseDateObj >= today && c.nextPurchaseDateObj <= in7d);
        if (matched.length === 0) return null;
        const sorted = matched.slice().sort((a, b) => a.nextPurchaseDateObj - b.nextPurchaseDateObj);
        return {
          headline: matched.length.toLocaleString(),
          headlineSub: 'คน',
          subLabel: 'ภายใน 7 วันนี้',
          sentence: `มีลูกค้า <strong>${matched.length.toLocaleString()} คน</strong> ที่คาดว่าจะถึงรอบซื้อซ้ำภายใน 7 วันนี้ ทักก่อนใครเพิ่มโอกาสปิดยอด`,
          examples: sorted.slice(0, 5).map(c => c.name + ' (' + c.nextPurchaseStr + ')'),
          matchedCustomers: matched
        };
      }
    },
    {
      id: 'new-vip', title: 'ลูกค้า VIP ใหม่', icon: 'fa-crown',
      compute(customers, monthlyDims, today) {
        const periodKey = getHubPeriodKey(today);
        const matched = customers.filter(c => {
          if (!c.lastPurchaseDate) return false;
          const lastKey = c.lastPurchaseDate.getFullYear() + '-' + String(c.lastPurchaseDate.getMonth() + 1).padStart(2, '0');
          if (lastKey !== periodKey) return false;
          if (!c.ltvTier.includes('Whale') && !c.ltvTier.includes('Dolphin')) return false;
          const prevTier = getLtvTierFor(c.totalRevenue - (c.lastOrderRevenue || 0));
          return prevTier !== c.ltvTier;
        });
        if (matched.length === 0) return null;
        const sorted = matched.slice().sort((a, b) => b.totalRevenue - a.totalRevenue);
        return {
          headline: matched.length.toLocaleString(),
          headlineSub: 'คน',
          subLabel: 'เดือนนี้',
          sentence: `มีลูกค้า <strong>${matched.length.toLocaleString()} คน</strong> เพิ่งข้ามขึ้นเป็นระดับ VIP (Dolphin/Whale) จากการซื้อครั้งล่าสุดในเดือนนี้`,
          examples: sorted.slice(0, 5).map(c => c.name),
          matchedCustomers: matched
        };
      }
    },
    {
      id: 'channel-movers', title: 'ช่องทางที่เคลื่อนไหวเด่น', icon: 'fa-share-nodes',
      compute(customers, monthlyDims) {
        const stats = getHubMoverStats(monthlyDims.byChannel, monthlyDims.months);
        if (!stats || !stats.standout) return null;
        const s = stats.standout;
        const dir = (s.pct === Infinity || s.pct > 0) ? 'up' : (s.pct < 0 ? 'down' : 'flat');
        return {
          headline: s.key,
          trend: { dir, label: formatHubPct(s.pct) },
          sentence: `ช่องทาง <strong>${escapeHtml(s.key)}</strong> ยอดขายเดือนนี้ ฿${s.curr.toLocaleString(undefined, {maximumFractionDigits: 0})} เทียบเดือนก่อน (฿${s.prev.toLocaleString(undefined, {maximumFractionDigits: 0})}) ${formatHubPct(s.pct)}`,
          examples: [],
          matchedCustomers: customers.filter(c => c.lastMainChannel === s.key)
        };
      }
    },
    {
      id: 'admin-performance', title: 'แอดมินทำยอดเด่น', icon: 'fa-user-tie',
      compute(customers, monthlyDims) {
        const stats = getHubMoverStats(monthlyDims.byAdmin, monthlyDims.months);
        if (!stats || !stats.standout) return null;
        const s = stats.standout;
        const dir = (s.pct === Infinity || s.pct > 0) ? 'up' : (s.pct < 0 ? 'down' : 'flat');
        return {
          headline: s.key,
          trend: { dir, label: formatHubPct(s.pct) },
          sentence: `แอดมิน <strong>${escapeHtml(s.key)}</strong> ทำยอดเดือนนี้ ฿${s.curr.toLocaleString(undefined, {maximumFractionDigits: 0})} เทียบเดือนก่อน (฿${s.prev.toLocaleString(undefined, {maximumFractionDigits: 0})}) ${formatHubPct(s.pct)}`,
          examples: [],
          matchedCustomers: customers.filter(c => c.lastAdmin === s.key)
        };
      }
    },
    {
      id: 'product-movers', title: 'สินค้าที่เคลื่อนไหวเด่น', icon: 'fa-box',
      compute(customers, monthlyDims) {
        const stats = getHubMoverStats(monthlyDims.byProduct, monthlyDims.months);
        if (!stats || !stats.standout) return null;
        const s = stats.standout;
        const dir = (s.pct === Infinity || s.pct > 0) ? 'up' : (s.pct < 0 ? 'down' : 'flat');
        return {
          headline: s.key,
          trend: { dir, label: formatHubPct(s.pct) },
          sentence: `สินค้า <strong>${escapeHtml(s.key)}</strong> ยอดขายเดือนนี้ ฿${s.curr.toLocaleString(undefined, {maximumFractionDigits: 0})} เทียบเดือนก่อน (฿${s.prev.toLocaleString(undefined, {maximumFractionDigits: 0})}) ${formatHubPct(s.pct)}`,
          examples: [],
          matchedCustomers: customers.filter(c => (c.currentFavorite || '').includes(s.key))
        };
      }
    }
  ];
}

function renderHubSubscribePanel(subscribedSet) {
  const catalog = getHubTopicCatalog();
  return `
    <div class="hub-subscribe-panel excel-dropdown-menu show">
      <div style="font-weight:700; font-size:12px; color:#7a665e; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px;">หัวข้อที่ติดตาม</div>
      <ul class="excel-options-list">
        ${catalog.map(t => `
          <li onclick="hubToggleSubscription('${t.id}')">
            <input type="checkbox" ${subscribedSet.has(t.id) ? 'checked' : ''} readonly style="pointer-events:none;">
            <i class="fas ${t.icon}"></i> ${t.title}
          </li>
        `).join('')}
      </ul>
      <div class="excel-dropdown-actions">
        <button class="excel-btn-sm confirm" onclick="hubCloseSubscribePanel()">ปิด</button>
      </div>
    </div>
  `;
}

function renderHubFeedCard(topic, result, noteText, noteEditorOpen, periodKey) {
  const trendHtml = result.trend
    ? `<span class="hub-feed-trend-${result.trend.dir}"><i class="fas fa-arrow-${result.trend.dir === 'up' ? 'up' : result.trend.dir === 'down' ? 'down' : 'right'}"></i> ${escapeHtml(result.trend.label)}</span>`
    : (result.subLabel ? `<span class="hub-feed-trend-flat">${escapeHtml(result.subLabel)}</span>` : '');

  const examplesHtml = (result.examples && result.examples.length)
    ? `<div class="hub-feed-examples">${result.examples.slice(0, 5).map(name => `<span class="badge-span ltv-general">${escapeHtml(name)}</span>`).join(' ')}${result.examples.length > 5 ? ` <span style="font-size:11px;color:#7a665e;">+${result.examples.length - 5} อื่นๆ</span>` : ''}</div>`
    : '';

  const ctaHtml = (result.matchedCustomers && result.matchedCustomers.length)
    ? `<button class="hub-feed-cta-btn" onclick="hubJumpToTable('${topic.id}')">ดูรายชื่อลูกค้า (${result.matchedCustomers.length}) <i class="fas fa-arrow-right"></i></button>`
    : '';

  const noteEditorHtml = noteEditorOpen ? `
    <div class="hub-feed-note-box">
      <textarea id="hub-note-input-${topic.id}" placeholder="จดโน้ตเกี่ยวกับ Insight นี้...">${escapeHtml(noteText)}</textarea>
      <div style="display:flex; gap:6px; margin-top:6px;">
        <button class="excel-btn-sm confirm" onclick="hubSaveNote('${topic.id}', '${periodKey}', document.getElementById('hub-note-input-${topic.id}').value)">บันทึก</button>
        <button class="excel-btn-sm" onclick="hubToggleNoteEditor('${topic.id}')">ยกเลิก</button>
      </div>
    </div>
  ` : (noteText ? `<div class="hub-feed-note-preview" onclick="hubToggleNoteEditor('${topic.id}')" title="แก้ไขโน้ต"><i class="fas fa-note-sticky"></i> ${escapeHtml(noteText)}</div>` : '');

  return `
    <div class="hub-feed-card">
      <div class="hub-feed-card-head">
        <span class="hub-feed-icon"><i class="fas ${topic.icon}"></i></span>
        <span class="hub-feed-title">${topic.title}</span>
        <button class="hub-feed-note-icon" title="จดโน้ต" onclick="hubToggleNoteEditor('${topic.id}')"><i class="fas fa-pen"></i></button>
      </div>
      <div class="hub-feed-metric">${result.headline}<span class="hub-feed-metric-sub">${result.headlineSub || ''}</span></div>
      ${trendHtml}
      <div class="hub-feed-sentence">${result.sentence}</div>
      ${examplesHtml}
      ${noteEditorHtml}
      ${ctaHtml}
    </div>
  `;
}

function renderHubFeed(customers, container) {
  if (!document.getElementById('insighthub-feed-styles')) {
    const style = document.createElement('style');
    style.id = 'insighthub-feed-styles';
    style.innerHTML = `
      .hub-feed-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 20px;
      }
      .hub-feed-card {
        background: #fff;
        border-radius: 16px;
        padding: 20px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.03);
        border: 1px solid #f0e6df;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .hub-feed-card-head {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .hub-feed-icon {
        width: 32px; height: 32px; border-radius: 8px;
        background: #fdf1e6; color: #d95f1d;
        display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      }
      .hub-feed-title { font-weight: 700; font-size: 14px; color: #2d1e1a; flex-grow: 1; }
      .hub-feed-note-icon {
        background: none; border: none; color: #bbb; cursor: pointer; padding: 4px 6px; border-radius: 4px;
      }
      .hub-feed-note-icon:hover { color: #1e293b; background: #f0e6df; }
      .hub-feed-metric { font-size: 26px; font-weight: 700; color: #0f172a; line-height: 1.1; }
      .hub-feed-metric-sub { font-size: 13px; font-weight: 500; color: #7a665e; margin-left: 6px; }
      .hub-feed-trend-up { color: #198754; font-size: 12px; font-weight: 700; }
      .hub-feed-trend-down { color: #dc3545; font-size: 12px; font-weight: 700; }
      .hub-feed-trend-flat { color: #6c757d; font-size: 12px; font-weight: 600; }
      .hub-feed-sentence { font-size: 13px; color: #444; line-height: 1.5; }
      .hub-feed-examples { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
      .hub-feed-cta-btn {
        align-self: flex-start; margin-top: 4px;
        background: #1e293b; color: #fff; border: none; border-radius: 8px;
        padding: 8px 14px; font-size: 12px; font-weight: 600; cursor: pointer;
      }
      .hub-feed-cta-btn:hover { background: #0f172a; }
      .hub-feed-note-box textarea {
        width: 100%; min-height: 60px; box-sizing: border-box; padding: 8px 10px;
        font-size: 12px; font-family: 'Inter', sans-serif; border: 1px solid #ddd; border-radius: 8px;
        resize: vertical; outline: none;
      }
      .hub-feed-note-box textarea:focus { border-color: #1e293b; }
      .hub-feed-note-preview {
        background: #fdf8f0; border: 1px solid #f5e6d0; border-radius: 8px; padding: 8px 10px;
        font-size: 12px; color: #7a5a2e; cursor: pointer;
      }
      .hub-feed-note-preview:hover { background: #fbf1de; }
      .hub-jump-banner {
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
        background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af;
        border-radius: 10px; padding: 10px 16px; margin-bottom: 16px; font-size: 13px;
      }
      .hub-jump-banner button { background: none; border: none; color: #1e40af; cursor: pointer; font-size: 14px; }
    `;
    document.head.appendChild(style);
  }

  const state = window.insightHubState;
  const hubCache = window.__hubCache || {};
  const today = hubCache.today || new Date();
  const monthlyDims = hubCache.monthlyDims || { months: [], byChannel: {}, byAdmin: {}, byProduct: {} };
  const periodKey = getHubPeriodKey(today);
  const subscribedIds = getHubSubscriptions();
  const subscribedSet = new Set(subscribedIds);
  const notes = getHubNotes();
  const catalog = getHubTopicCatalog();

  window.__hubFeedMatches = {};
  window.__hubFeedLabels = {};

  const cards = catalog
    .filter(topic => subscribedSet.has(topic.id))
    .map(topic => {
      let result = null;
      try { result = topic.compute(customers, monthlyDims, today); } catch (e) { console.error('[InsightHub] topic compute failed:', topic.id, e); }
      if (result) {
        window.__hubFeedMatches[topic.id] = result.matchedCustomers || [];
        window.__hubFeedLabels[topic.id] = topic.title;
      }
      return result ? { topic, result } : null;
    })
    .filter(x => x !== null);

  let html = `
    <div class="hub-header" style="display:flex; align-items:center; justify-content:space-between;">
      <h2><i class="fas fa-bolt"></i> Insight Feed</h2>
      <div style="display:flex; gap:10px; position:relative;">
        <button class="pag-btn" onclick="event.stopPropagation(); hubOpenSubscribePanel();">
          <i class="fas fa-list-check"></i> จัดการหัวข้อที่ติดตาม
        </button>
        ${state.hubSubscribePanelOpen ? renderHubSubscribePanel(subscribedSet) : ''}
        <button class="pag-btn" onclick="hubSetView('table')">
          <i class="fas fa-table"></i> ดูตารางลูกค้าทั้งหมด
        </button>
      </div>
    </div>
  `;

  if (cards.length === 0) {
    html += `
      <div class="summary-section-box" style="text-align:center; padding:50px; color:#7a665e;">
        ${subscribedSet.size === 0
          ? 'ยังไม่ได้ติดตามหัวข้อไหนเลย กด "จัดการหัวข้อที่ติดตาม" เพื่อเลือกหัวข้อที่สนใจ'
          : 'ยังไม่มี Insight ใหม่ในช่วงนี้'}
      </div>
    `;
  } else {
    html += `<div class="hub-feed-grid">`;
    cards.forEach(({ topic, result }) => {
      const noteText = notes[topic.id + ':' + periodKey];
      html += renderHubFeedCard(topic, result, noteText, state.hubOpenNoteEditor === topic.id, periodKey);
    });
    html += `</div>`;
  }

  container.innerHTML = html;
}

window.toggleExcelDropdown = function(colId) {
  if (window.insightHubState.activeDropdown === colId) {
    window.insightHubState.activeDropdown = null;
  } else {
    window.insightHubState.activeDropdown = colId;
  }
  if (window.applyFilters) window.applyFilters();
};

window.handleDropdownSearch = function(colId, value) {
  window.insightHubState.excelSearchTerms[colId] = value;
  
  const listContainer = document.getElementById(`list-${colId}`);
  if (!listContainer) return;

  // [PERF] ใช้ค่าจากแคช + จำกัดจำนวนที่ render
  const uniqueValues = getHubUniqueValues(colId);

  const currentSelectedSet = new Set(window.insightHubState.excelFilters[colId] || []);
  const filteredOpts = uniqueValues.filter(v => v.toLowerCase().includes(value.toLowerCase()));
  const renderedOpts = filteredOpts.slice(0, HUB_OPTION_RENDER_LIMIT);
  
  listContainer.innerHTML = renderedOpts.map(opt => {
    const isChecked = currentSelectedSet.has(opt);
    return `
      <li style="padding: 4px 0; display: flex; align-items: center; gap: 6px; font-size:11px;">
        <input type="checkbox" id="chk-${colId}-${opt.replace(/[^a-zA-Z0-9]/g, '_')}" ${isChecked ? 'checked' : ''} onchange="handleDropdownCheck('${colId}', '${opt.replace(/'/g, "\\'")}', this.checked)">
        <label style="cursor:pointer; flex-grow:1; font-weight: normal; margin:0;" for="chk-${colId}-${opt.replace(/[^a-zA-Z0-9]/g, '_')}">${opt || '(ว่าง)'}</label>
      </li>
    `;
  }).join('') + (filteredOpts.length > HUB_OPTION_RENDER_LIMIT ? `<li style="color:#999; padding: 6px 0; font-style: italic;">แสดง ${HUB_OPTION_RENDER_LIMIT.toLocaleString()} จาก ${filteredOpts.length.toLocaleString()} รายการ — พิมพ์ค้นหาเพื่อกรองตัวเลือก</li>` : '');
  
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

window.excelSelectAllRows = function(colId) {
  // [PERF] ใช้ค่าจากแคช
  window.insightHubState.excelFilters[colId] = [...getHubUniqueValues(colId)];
  const filterSearchText = (window.insightHubState.excelSearchTerms[colId] || "");
  window.handleDropdownSearch(colId, filterSearchText);
};

window.excelClearAllRows = function(colId) {
  window.insightHubState.excelFilters[colId] = [];
  const filterSearchText = (window.insightHubState.excelSearchTerms[colId] || "");
  window.handleDropdownSearch(colId, filterSearchText);
};

window.clearExcelFilter = function(colId) {
  delete window.insightHubState.excelFilters[colId];
  delete window.insightHubState.excelSearchTerms[colId];
  window.insightHubState.activeDropdown = null;
  window.insightHubState.currentPage = 1;
  if (window.applyFilters) window.applyFilters();
};

window.confirmExcelFilter = function() {
  window.insightHubState.activeDropdown = null;
  window.insightHubState.currentPage = 1;
  if (window.applyFilters) window.applyFilters();
};

window.resetHubFilters = function() {
  window.insightHubState = {
    currentPage: 1,
    rowsPerPage: 100,
    searchTerm: "",
    sortColumn: "totalRevenue",
    sortAsc: false,
    excelFilters: {},
    excelSearchTerms: {},
    activeDropdown: null,
    selectedCustomerPhone: null,
    allCustomers: window.insightHubState.allCustomers,
    activeView: window.insightHubState.activeView || 'feed'
  };
  if (window.applyFilters) window.applyFilters();
};

// Export ข้อมูลลูกค้าที่กรอง/เรียงลำดับอยู่ตอนนี้ (ไม่ใช่แค่หน้าที่แบ่งไว้) ออกเป็นไฟล์ Excel (.xlsx)
window.exportInsightHubExcel = function() {
  if (typeof XLSX === 'undefined') {
    alert('ไม่สามารถโหลดไลบรารี Excel ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่');
    return;
  }
  const state = window.insightHubState;
  const rows = state.displayedCustomers || state.allCustomers || [];
  if (rows.length === 0) {
    alert('ไม่มีข้อมูลลูกค้าให้ export');
    return;
  }
  const years = state.availableYears || [];

  const exportRows = rows.map(c => {
    const row = {
      'CustomerKey (Phone)': c.displayPhone,
      'CustomerName (Latest)': c.name,
      'FirstPurchaseDate': c.firstPurchaseStr,
      'LastPurchaseDate': c.lastPurchaseStr,
      'TotalOrders (SALE only)': c.totalOrders,
      'TotalRevenue (SALE only)': c.totalRevenue,
      'AOV': c.aov,
      'DaysSinceLast': Number(c.daysSinceLastStr),
      'Last Product': c.lastProductStr || '-',
      'Next Purchase Date': c.nextPurchaseStr,
      'Life time value': c.ltvTier,
      'Loyalty Index': c.loyaltyTier,
      'Entry Product (สินค้าเปิดใจ)': c.entryProduct || '-',
      'Current Favorite (สินค้าตัวโปรด)': c.currentFavorite || '-',
      'Admin Priority': c.adminPriority,
      'Segment 1 : Standard Period': c.segment1,
      'Segment 2 : Dynamic Refill': c.segment2,
      'Action Strategy Guideline': c.actionStrategy,
      'FirstChannel (Main)': c.firstChannel,
      'LastChannel (Main)': c.lastChannel,
      'Last Admin': c.lastAdmin
    };
    years.forEach(y => { row[`ยอดซื้อปี ${y}`] = c['tier' + y]; });
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(exportRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'InsightHub');
  const dateTag = new Date().toISOString().slice(0, 10);
  const fileName = `InsightHub_Export_${dateTag}.xlsx`;
  XLSX.writeFile(wb, fileName);

  // Task 7: audit trail for exports of confidential customer data.
  fetch('/api/audit/log', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'insighthub_export', detail: { fileName, rowCount: exportRows.length } })
  }).catch(err => console.error('[InsightHub] Failed to record export audit log:', err));
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

// Customer Tier รายปีในโปรไฟล์ลูกค้า: คำนวณจากยอดซื้อสะสมของปีนั้นๆ เท่านั้น
// Junior < 5,900 | Silver 5,900-<25,000 | Gold 25,000-<35,000 | Platinum 35,000-<45,000 | Diamond >= 45,000
// คืนค่า null ถ้ายอดปีนั้น = 0 (กรณีนี้ไม่ต้องแสดง Tier)
function getAnnualTier(amount) {
  if (!amount || amount <= 0) return null;
  if (amount < 5900) return "Junior";
  if (amount < 25000) return "Silver";
  if (amount < 35000) return "Gold";
  if (amount < 45000) return "Platinum";
  return "Diamond";
}

function getCustomerTierClass(tier) {
  if (tier === "Diamond") return "ctier-diamond";
  if (tier === "Platinum") return "ctier-platinum";
  if (tier === "Gold") return "ctier-gold";
  if (tier === "Silver") return "ctier-silver";
  return "ctier-junior";
}

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
  return state.sortAsc ? '<i class="fas fa-sort-up sorting-icon" style="color:#1e293b;"></i>' : '<i class="fas fa-sort-down sorting-icon" style="color:#1e293b;"></i>';
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
    c.name.toLowerCase().includes(inputVal.toLowerCase()) ||
    (c.displayPhone || '').includes(inputVal)
  );
  if (match) {
    window.insightHubState.selectedCustomerPhone = match.phone;
    if (window.applyFilters) window.applyFilters();
  } else {
    alert('ไม่พบข้อมูลลูกค้าสำหรับคีย์: ' + inputVal);
  }
};

// AI Summary: ข้อความปกติ (ไม่ใช่ list เลขข้อ) แต่เว้นวรรคแยกแต่ละประเด็นให้อ่านง่าย
// ตามลำดับ: ระดับความภักดี / ออร์เดอร์-AOV / สินค้าโปรด / วันที่ซื้อล่าสุด-คาดซื้อครั้งถัดไป
// ส่วน "จัดกลุ่ม" (Admin Priority) และ "ระดับ" (LTV Tier) ย้ายไปแสดงเป็นไอคอนไฮไลท์ข้างชื่อลูกค้าด้านบนแทน (ดู renderCustomerProfileView)
function generateAiSummary(c) {
  const loyaltyClean = c.loyaltyTier.replace(/[^a-zA-Z0-9\s()>.\-฀-๿]/g, '').trim();
  const points = [
    'ระดับความภักดี: <strong>' + loyaltyClean + '</strong>',
    'สั่งซื้อไปแล้ว <strong>' + c.totalOrders + ' ครั้ง</strong> · ยอดสั่งซื้อเฉลี่ยต่อบิล (AOV) <strong>฿' + c.aov.toLocaleString(undefined, {maximumFractionDigits: 0}) + '</strong>',
    'มีความชอบในผลิตภัณฑ์ <strong>' + (c.currentFavorite || '-') + '</strong>',
    'สั่งซื้อล่าสุดเมื่อ <strong>' + c.lastPurchaseStr + '</strong> (' + c.daysSinceLast.toFixed(0) + ' วันที่แล้ว) &rarr; คาดว่าจะกลับมาสั่งซื้ออีกครั้งวันที่ <strong>' + c.nextPurchaseStr + '</strong>'
  ];
  return '<strong>AI Summary:</strong><div style="margin-top: 8px; display: flex; flex-direction: column; gap: 8px;">' +
    points.map(function(p) { return '<div>' + p + '</div>'; }).join('') +
    '</div>';
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
      <p style="color: #64748b; font-size: 14px; margin: 0;">กรอกเบอร์โทรศัพท์เพื่อดูข้อมูลลูกค้าแบบละเอียด</p>
    </div>

    <div style="display: flex; justify-content: center; gap: 10px; margin-bottom: 35px; max-width: 600px; margin-left: auto; margin-right: auto;">
      <div style="position: relative; flex-grow: 1;">
        <i class="fas fa-search" style="position: absolute; left: 15px; top: 50%; transform: translateY(-50%); color: #999;"></i>
        <input type="text" id="profile-search-input" class="search-bar-input" style="padding-left: 45px; width: 100%; height: 45px; font-size: 14px; border: 1px solid #e2e8f0; border-radius: 8px;" placeholder="ค้นหาโดยใช้ชื่อ หรือ เบอร์โทรศัพท์..." value="${c.displayPhone}">
      </div>
      <button class="btn" style="background: #2563eb; color: white; border: none; padding: 0 25px; border-radius: 8px; font-weight: 600; cursor: pointer; height: 45px; font-size: 14px;" onclick="searchProfileKey()">Search</button>
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center; background: white; border: 1px solid #f0e6df; padding: 25px; border-radius: 16px; margin-bottom: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.02);">
      <div style="display: flex; align-items: center; gap: 20px;">
        <div style="width: 60px; height: 60px; border-radius: 12px; background: #eff6ff; display: flex; align-items: center; justify-content: center; color: #2563eb; font-size: 24px;">
          <i class="fas fa-user"></i>
        </div>
        <div>
          <h3 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: #1e293b; display: flex; align-items: center; flex-wrap: wrap; gap: 8px;">
            ${c.name}
            <span class="badge-span ${getLtvClass(c.ltvTier)}" style="font-size: 11px; padding: 5px 12px; border-radius: 20px;">${c.ltvTier}</span>
            <span class="${getAdminPriClass(c.adminPriority)}" style="font-size: 11px; padding: 5px 12px; border-radius: 20px; background: #f5f5f5; border: 1px solid #e5e5e5;">${c.adminPriority}</span>
          </h3>
          <p style="margin: 0; color: #64748b; font-size: 13px;">Customer Profile (เบอร์โทรศัพท์: ${c.displayPhone})</p>
        </div>
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
        <h3>Action</h3>
        <div style="display: flex; flex-direction: column; gap: 5px;">
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

          <div style="margin-top: 15px; padding-top: 10px; border-top: 1px dashed #e2e8f0;">
            <span style="font-size: 12px; font-weight: bold; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;">ยอดซื้อสะสมรายปี (2021 - 2026)</span>
          </div>
          <table class="annual-tier-table">
            <thead>
              <tr>
                <th>ปี</th>
                <th>จำนวนออร์เดอร์</th>
                <th>ยอดซื้อสะสม</th>
                <th>Tier</th>
              </tr>
            </thead>
            <tbody>
              ${[2021, 2022, 2023, 2024, 2025, 2026].map(year => {
                // คอลัมน์เรียงตามลำดับ: 1.ปี 2.จำนวนออร์เดอร์ 3.ยอดซื้อสะสม 4.Tier
                // ถ้ายอดปีนั้น = 0 ไม่ต้องแสดง Tier
                const amount = c.annualSpending[year] || 0;
                const orders = (c.annualOrders && c.annualOrders[year]) || 0;
                const tier = getAnnualTier(amount);
                return `
                  <tr>
                    <td style="text-align: left; font-weight: 600;">${year}</td>
                    <td>${orders}</td>
                    <td style="font-weight: bold; color: ${amount > 0 ? '#1e293b' : '#94a3b8'};">${amount > 0 ? '฿' + amount.toLocaleString() : '-'}</td>
                    <td>${tier ? `<span class="badge-span ${getCustomerTierClass(tier)}" style="font-size: 10px;">${tier}</span>` : '-'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>

        </div>
      </div>
    </div>
  `;
  container.innerHTML = html;
}
