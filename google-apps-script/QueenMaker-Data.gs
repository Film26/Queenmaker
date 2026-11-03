// ส่งข้อมูลจาก Google Sheet ให้ระบบ QueenMaker (เมนู Import Data from Google Sheet)
// วางไฟล์นี้ใน Extensions > Apps Script ของชีตที่มีข้อมูล ไม่ต้องแก้โค้ด:
//   1. เลือกฟังก์ชัน setupQueenMaker แล้วกด Run (สร้างรหัสลับให้อัตโนมัติ)
//   2. Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone)
//   3. กด Run setupQueenMaker อีกครั้ง แล้วคัดลอกลิงก์ที่ขึ้นใน Execution log ไปวางในระบบ
// รหัสลับเก็บใน Script Properties ไม่อยู่ในโค้ด ไฟล์นี้จึงขึ้น Git ได้ปลอดภัย

const TOKEN_PROPERTY = 'ACCESS_TOKEN';
// หัวคอลัมน์ที่ใช้หาแท็บข้อมูลอัตโนมัติ - ชุดเดียวกับที่ระบบใช้อ่านไฟล์ Excel (DATE_KEYS / REVENUE_KEYS ใน dashboard.html)
const DATE_KEYS = ['วันที่โอนเงิน', 'วันที่สร้าง', 'OrderDate', 'Date', 'วันที่'];
const REVENUE_KEYS = ['Revenue_Allocated', 'ราคาขาย', 'ราคารวม', 'ยอดรวม', 'ราคาสุทธิ', 'ยอดขาย', 'ราคาสินค้ายังไม่รวมภาษี', 'Net Sales', 'Revenue', 'Amount', 'ยอดโอน'];

function doGet(e) {
  const params = (e && e.parameter) || {};
  try {
    const token = getToken_();
    if (!token) return jsonResponse_({ ok: false, error: 'ยังไม่ได้ตั้งค่า กรุณา Run ฟังก์ชัน setupQueenMaker ใน Apps Script' });
    if (params.token !== token) return jsonResponse_({ ok: false, error: 'รหัส token ไม่ถูกต้อง' });

    const sheet = params.sheet ? SpreadsheetApp.getActiveSpreadsheet().getSheetByName(params.sheet) : findDataSheet_();
    if (!sheet) return jsonResponse_({ ok: false, error: 'ไม่พบแท็บชื่อ "' + params.sheet + '"' });

    // getDisplayValues = ค่าตามที่เห็นในชีต เบอร์โทรไม่เสียเลข 0 นำหน้า และวันที่ไม่เปลี่ยนรูปแบบ
    return jsonResponse_({ ok: true, sheet: sheet.getName(), values: sheet.getDataRange().getDisplayValues() });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

// Run ครั้งแรกเพื่อสร้างรหัสลับ และ Run ซ้ำได้ทุกเมื่อเพื่อดูลิงก์สำหรับวางในระบบ (รหัสเดิมไม่เปลี่ยน)
function setupQueenMaker() {
  if (!getToken_()) PropertiesService.getScriptProperties().setProperty(TOKEN_PROPERTY, newToken_());
  logLink_();
}

// ใช้เมื่อลิงก์หลุด: สร้างรหัสใหม่ ลิงก์เดิมใช้ไม่ได้ทันที (ไม่ต้อง Deploy ใหม่)
function changeQueenMakerToken() {
  PropertiesService.getScriptProperties().setProperty(TOKEN_PROPERTY, newToken_());
  logLink_();
}

function logLink_() {
  const url = ScriptApp.getService().getUrl();
  if (!url) {
    Logger.log('ตั้งรหัสลับแล้ว ขั้นต่อไป: Deploy > New deployment > Web app (Who has access: Anyone) แล้ว Run setupQueenMaker อีกครั้งเพื่อดูลิงก์');
    return;
  }
  Logger.log('ลิงก์สำหรับวางในระบบ QueenMaker (ห้ามแชร์ต่อ):\n' + url + '?token=' + getToken_());
  Logger.log('แท็บที่จะส่งข้อมูล: "' + findDataSheet_().getName() + '" - ถ้าไม่ใช่ ให้ต่อท้ายลิงก์ด้วย &sheet=ชื่อแท็บ');
}

// แท็บที่หัวตาราง (แถว 1) มีทั้งคอลัมน์วันที่และยอดขาย ถ้ามีหลายแท็บเลือกแท็บที่มีแถวมากที่สุด ไม่เจอเลยใช้แท็บแรก
function findDataSheet_() {
  const sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  const clean = s => String(s).toLowerCase().replace(/[^a-z0-9฀-๿]/g, '');
  const hasAny = (headers, keys) => keys.some(k => headers.some(h => h && h.indexOf(clean(k)) !== -1));
  let best = null;
  sheets.forEach(sheet => {
    const lastCol = sheet.getLastColumn();
    if (lastCol === 0) return;
    const headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(clean);
    if (!hasAny(headers, DATE_KEYS) || !hasAny(headers, REVENUE_KEYS)) return;
    if (!best || sheet.getLastRow() > best.getLastRow()) best = sheet;
  });
  return best || sheets[0];
}

function getToken_() {
  return PropertiesService.getScriptProperties().getProperty(TOKEN_PROPERTY) || '';
}

function newToken_() {
  return Utilities.getUuid().replace(/-/g, '');
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}