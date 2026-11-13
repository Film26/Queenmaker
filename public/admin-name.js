// public/admin-name.js
// Admin name of an imported row - shared by the browser (dashboard.html getNormalizedAdmin, retention.js
// retAdminName) and the server (lib/sheetSource.js, which tags rows synced from a Google Sheet so a
// Sales Admin is only sent their own rows). Keeping one copy means both sides always agree.
// Works as a plain <script> (window.QMAdminName) and as a CommonJS module.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QMAdminName = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Same column matching as dashboard.html getRowValue (case/punctuation-insensitive, exact name first
  // then "contains"), without its cache - the browser passes its own cached getRowValue instead.
  function rowValue(row, possibleKeys) {
    if (!row) return '';
    const clean = s => s.toLowerCase().replace(/[^a-zA-Z0-9฀-๿]/g, '');
    const rowKeys = Object.keys(row);
    for (const cp of possibleKeys.map(clean)) {
      for (const rk of rowKeys) {
        const cleanRk = clean(rk);
        if (cleanRk === cp || cleanRk.includes(cp)) return (row[rk] || '').toString().trim();
      }
    }
    return '';
  }

  function normalizeAdmin(row, getRowValue) {
    if (!row) return 'Unknown';
    const read = getRowValue || rowValue;
    // [CLEANSED] ยึด Admin_STD จากชีต Config_Admin_Map เป็นหลัก ไม่ว่า RawKey จะพิมพ์แบบไหนมา
    // หมายเหตุ: ไฟล์ export มีหัวคอลัมน์ 'Admin Name' ซ้ำ 2 ตำแหน่ง (คอลัมน์ K ที่ว่าง กับคอลัมน์ขวาสุด
    // ที่เป็น Admin_STD) PapaParse จะตั้งชื่อตัวหลังเป็น 'Admin Name_1' -> ต้องอ่านจากชื่อนี้
    if (row['Admin_STD'] !== undefined || row['Admin Name_1'] !== undefined) {
      const aStd = ((row['Admin_STD'] !== undefined ? row['Admin_STD'] : row['Admin Name_1']) || '').toString().trim();
      return aStd || 'Unknown';
    }
    // [RETENTION PATTERN] คอลัมน์ "Note" คู่กับ "Order Type" (T ใหญ่) ของไฟล์ Retention คือชื่อแอดมินอยู่แล้ว
    // (ไม่ต้องเดา/จับคำแบบไฟล์เดิมด้านล่าง) ใช้ตรงๆ - เพิ่มเติมจากของเดิม ไม่ได้แทนที่ รองรับชื่อแอดมินใหม่ที่ไม่อยู่
    // ใน keyword list ด้านล่างได้ด้วย (เช่น "เอ", "พัด")
    if (row['Note'] !== undefined && row['Order Type'] !== undefined) {
      const nRet = (row['Note'] || '').toString().trim();
      return nRet || 'Unknown';
    }
    // จับค่าจากคอลัมน์ Admin Name เท่านั้น (ชื่อแอดมิน/Admin/Admin Name) ถ้าคอลัมน์นี้ไม่มีข้อมูลจริง
    // ให้ถือว่าไม่ทราบชื่อแอดมินไปเลย ไม่เอาคอลัมน์อื่น (เช่น หมายเหตุ/Remark) มาแสดงแทน
    const a = (read(row, ['ชื่อแอดมิน', 'Admin', 'Admin Name']) || '').toString().trim();
    if (!a) return 'Unknown';
    const lower = a.toLowerCase();

    if (lower.includes('may') || lower.includes('เมย์')) return 'May';
    if (lower.includes('บี')) return 'บี';
    if (lower.includes('มิ้ว')) return 'มิ้ว';
    if (lower.includes('แอน')) return 'แอน';
    if (lower.includes('แอล')) return 'แอล';

    if (a.includes(',')) {
      const parts = a.split(',');
      const adminPart = parts[parts.length - 1].trim();
      const lowerPart = adminPart.toLowerCase();
      if (lowerPart.includes('may') || lowerPart.includes('เมย์')) return 'May';
      if (lowerPart.includes('บี')) return 'บี';
      if (lowerPart.includes('มิ้ว')) return 'มิ้ว';
      if (lowerPart.includes('แอน')) return 'แอน';
      if (lowerPart.includes('แอล')) return 'แอล';
      if (adminPart) return adminPart;
    }
    return a;
  }

  // Retention file rows: the clean "Note" column is the admin name; otherwise the main rule above.
  // null when unknown (see retention.js retAdminName).
  function retentionAdmin(row, getRowValue) {
    const read = getRowValue || rowValue;
    const note = read(row, ['Note']);
    if (note && note.toString().trim()) return note.toString().trim();
    const a = normalizeAdmin(row, read);
    return a === 'Unknown' ? null : a;
  }

  return { rowValue, normalizeAdmin, retentionAdmin };
});
