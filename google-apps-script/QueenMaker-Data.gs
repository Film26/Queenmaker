// ส่งข้อมูลจาก Google Sheet ให้ระบบ QueenMaker (เมนู Import Data from Google Sheet)
// วางไฟล์นี้ใน Extensions > Apps Script ของชีตที่มีข้อมูล แล้ว Deploy เป็น Web app

// รหัสลับสำหรับเรียกข้อมูล - ตั้งเองให้เดายาก ถ้าลิงก์รั่วให้เปลี่ยนค่านี้แล้ว Deploy เวอร์ชันใหม่ ลิงก์เดิมจะใช้ไม่ได้ทันที
const ACCESS_TOKEN = 'Queen2026'
// ชื่อแท็บที่จะส่งข้อมูล - เว้นว่าง = แท็บแรก (เลือกแท็บอื่นได้ด้วย &sheet=ชื่อแท็บ ต่อท้ายลิงก์)
const DEFAULT_SHEET_NAME = '';

function doGet(e) {
  const params = (e && e.parameter) || {};
  try {
    if (!ACCESS_TOKEN || ACCESS_TOKEN === 'Queen2026') return jsonResponse_({ ok: false, error: 'ยังไม่ได้ตั้งค่า ACCESS_TOKEN ในสคริปต์' });
    if (params.token !== ACCESS_TOKEN) return jsonResponse_({ ok: false, error: 'รหัส token ไม่ถูกต้อง' });

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheetName = params.sheet || DEFAULT_SHEET_NAME;
    const sheet = sheetName ? spreadsheet.getSheetByName(sheetName) : spreadsheet.getSheets()[0];
    if (!sheet) return jsonResponse_({ ok: false, error: 'ไม่พบแท็บชื่อ "' + sheetName + '"' });

    // getDisplayValues = ค่าตามที่เห็นในชีต เบอร์โทรไม่เสียเลข 0 นำหน้า และวันที่ไม่เปลี่ยนรูปแบบ
    return jsonResponse_({ ok: true, sheet: sheet.getName(), values: sheet.getDataRange().getDisplayValues() });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
