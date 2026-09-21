// public/datacheck.js
// Data Check: กระทบยอด (reconciliation) ไฟล์ต้นทางที่ import เข้ามา -> ตัวเลขบน Dashboard และตรวจคุณภาพข้อมูล
// - ไม่แก้ตัวเลข/ไม่ใส่ Adjustment ใดๆ ทั้งสิ้น: ทุกแถวของไฟล์ต้องถูกอธิบายได้ว่า "ถูกนับ" หรือ "ถูกตัดออกเพราะเหตุผลอะไร"
//   (ยอดต้นทาง = ยอดที่ใช้คำนวณ + ยอดที่ถูกตัดออกแยกตามเหตุผล) ถ้าไม่ลงตัวหรือ Dashboard ไม่ตรงกับการคำนวณอิสระ จะขึ้น Warning
// - การคำนวณอิสระ (independent) ในไฟล์นี้อ่านค่าจากหัวคอลัมน์ตรงๆ และบวกเองแบบวนลูปเดียว ไม่เรียก calculateMetrics
//   เพื่อใช้ตรวจว่า pipeline ใน dashboard.html (คัดกรอง -> จัดเดือน -> Calculation Layer) ไม่ทำให้ตัวเลขหลุด
// ต้องโหลดหลังสคริปต์หลักใน dashboard.html (ใช้ rawData, filters, monthlyData ฯลฯ ที่ประกาศไว้ที่นั้น)

(function () {
  const EPS = 0.005; // ทศนิยมสตางค์ - ต่างกันไม่เกินนี้ถือว่าเท่ากัน (ผลจากการบวก floating point)

  function esc(s) {
    return (s === null || s === undefined ? '' : String(s))
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const money = (v) => isNum(v) ? v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/A';
  const int = (v) => isNum(v) ? Math.round(v).toLocaleString('th-TH') : 'N/A';
  const same = (a, b) => (a === null || a === undefined) && (b === null || b === undefined) ? true
    : (isNum(a) && isNum(b) && Math.abs(a - b) <= EPS);

  // แปลงยอดขายแบบอิสระ (ไม่เรียก parseMoney ใน dashboard.html) - อ่านไม่ได้ = NaN
  function srcMoney(v) {
    if (v === null || v === undefined) return NaN;
    let s = String(v).trim();
    if (s === '') return NaN;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/[฿,\s]/g, '').replace(/(บาท|thb|baht)$/i, '');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return NaN;
    return neg ? -Number(s) : Number(s);
  }

  const clean = (s) => String(s).toLowerCase().replace(/[^a-z0-9฀-๿]/g, '');

  // หัวคอลัมน์ที่ getRowValue เลือกใช้จริง + จับแบบตรงตัวหรือคล้าย (includes)
  function resolveField(row, candidates) {
    if (!row) return { header: '', match: 'missing', alternatives: [] };
    getRowValue(row, candidates); // ให้ keyCache ถูกเติมด้วยกติกาเดียวกับที่ระบบใช้จริง
    const header = keyCache[candidates.join('|')] || '';
    const want = candidates.map(clean);
    const alternatives = Object.keys(row).filter(k => want.some(w => clean(k).includes(w)) && k !== header);
    if (!header) return { header: '', match: 'missing', alternatives };
    const exact = want.indexOf(clean(header)) !== -1;
    return { header, match: exact ? 'exact' : 'fuzzy', alternatives };
  }
  function resolveExact(row, candidates) {
    const header = findExactColumnKey(row, candidates);
    return { header, match: header ? 'exact' : 'missing', alternatives: [] };
  }

  const PHONE_KEYS = ['Phone', 'phone', 'เบอร์โทร', 'เบอร์'];
  const ADDRESS_KEYS = ['ที่อยู่ (ลูกค้า)', 'ที่อยู่', 'Address', 'address'];
  const CUSTID_KEYS = ['Customer ID', 'รหัสลูกค้า'];
  const NAME_KEYS = ['CustomerName', 'ชื่อลูกค้า', 'ชื่อ'];
  const STATUS_KEYS = ['Order type', 'OrderType', 'หมายเหตุ', 'Remark', 'สถานะ', 'Status', 'สถานะออเดอร์', 'Order Status'];
  const CANCEL_RX = /cancel|ยกเลิก|refund|คืนเงิน|return|คืนสินค้า|void/i;

  function describeColumns(row) {
    const rev = resolveField(row, window.REVENUE_KEYS);
    const date = resolveField(row, window.DATE_KEYS);
    return [
      { role: 'ยอดขาย (Sales)', keys: window.REVENUE_KEYS, ...rev },
      { role: 'วันที่ขาย', keys: window.DATE_KEYS, ...date },
      { role: 'จำนวน Order - Order ID', keys: window.ORDER_ID_KEYS, ...resolveExact(row, window.ORDER_ID_KEYS), note: 'จับเฉพาะหัวคอลัมน์ตรงตัว ถ้าไม่พบ = 1 แถวนับเป็น 1 ออเดอร์' },
      { role: 'ลูกค้า - เบอร์โทร (ใช้เป็นหลัก)', keys: PHONE_KEYS, ...resolveField(row, PHONE_KEYS) },
      { role: 'ลูกค้า - ที่อยู่ (สำรอง)', keys: ADDRESS_KEYS, ...resolveField(row, ADDRESS_KEYS) },
      { role: 'ลูกค้า - Customer ID (สำรอง)', keys: CUSTID_KEYS, ...resolveField(row, CUSTID_KEYS) },
      { role: 'ลูกค้า - ชื่อ (สำรอง)', keys: NAME_KEYS, ...resolveField(row, NAME_KEYS) },
      { role: 'ประเภทรายการ (Order type)', keys: ['Order type', 'OrderType'], ...resolveExact(row, ['Order type', 'OrderType']) },
      { role: 'Group', keys: ['Group'], header: (typeof getNormalizedGroup === 'function' && row['Group'] !== undefined) ? 'Group' : '', match: row['Group'] !== undefined ? 'exact' : 'missing', alternatives: [] },
      { role: 'Product (ที่ Filter/ตัวเลือกใช้)', keys: ['Product', 'ชื่อสินค้า'], ...resolveField(row, ['Product', 'ชื่อสินค้า']) },
      { role: 'Sub Product', keys: ['Product Set', 'Sub Product', 'SubProduct', 'รายการขาย'], ...resolveField(row, ['Product Set', 'Sub Product', 'SubProduct', 'รายการขาย']) },
      { role: 'หมายเหตุ (Remark)', keys: ['Remark', 'หมายเหตุ'], ...resolveExact(row, ['Remark', 'หมายเหตุ']) },
      { role: 'คอลัมน์ Year (จากต้นทาง ใช้ตรวจเท่านั้น)', keys: ['Year'], ...resolveExact(row, ['Year']) },
      { role: 'คอลัมน์ Purchase Month (จากต้นทาง ใช้ตรวจเท่านั้น)', keys: ['Purchase Month'], ...resolveExact(row, ['Purchase Month']) },
      { role: 'คอลัมน์ First Year (จากต้นทาง ใช้ตรวจเท่านั้น)', keys: ['First Year'], ...resolveExact(row, ['First Year']) }
    ];
  }

  // วิธีที่ getCustomerUniqueId ใช้ระบุตัวลูกค้า (เพื่อรายงานว่าแต่ละแถวใช้ข้อมูลอะไร) - ต้องสอดคล้องกับฟังก์ชันนั้น
  function customerMethod(row) {
    const phone = getRowValue(row, PHONE_KEYS);
    const digits = phone ? phone.toString().replace(/\D/g, '') : '';
    const badPhone = !digits || digits.length < 9 || /^0+$/.test(digits) || phone.toString().trim().toLowerCase() === 'xxxxxxx';
    if (!badPhone) return 'phone';
    if (getRowValue(row, ADDRESS_KEYS)) return 'address';
    if (getRowValue(row, CUSTID_KEYS)) return 'customerId';
    if (getRowValue(row, NAME_KEYS)) return 'name';
    return 'none';
  }

  // ---------- ส่วนที่ 1: กระทบยอดไฟล์ทั้งไฟล์ -> ชุดข้อมูลของการ์ด "ภาพรวมทั้งหมด" ----------
  let fileCache = null;
  function fileLevelReport() {
    const groupSel = filters.Group || 'All';
    const activeSig = JSON.stringify(((window.AppData && window.AppData.config && window.AppData.config.Product) || []).map(p => [p.name, !!p.active]));
    if (fileCache && fileCache.src === rawData && fileCache.group === groupSel && fileCache.sig === activeSig) return fileCache.report;

    const first = rawData[0];
    const columns = first ? describeColumns(first) : [];
    const revHeader = (columns[0] && columns[0].header) || '';
    const orderHeader = (columns[2] && columns[2].header) || '';
    const readRev = (row) => revHeader ? srcMoney(row[revHeader]) : NaN;

    const steps = { source: { rows: 0, sales: 0 }, outsideGroup: { rows: 0, sales: 0 }, notSale: { rows: 0, sales: 0, byType: {} }, inactiveProduct: { rows: 0, sales: 0 }, badDate: { rows: 0, sales: 0 }, included: { rows: 0, sales: 0 } };
    const add = (o, rev) => { o.rows++; o.sales += isNum(rev) ? rev : 0; };
    const q = {
      invalidRevenue: { rows: 0, samples: [] }, negativeRevenue: { rows: 0, sales: 0 }, zeroRevenue: 0,
      customerMethod: { phone: 0, address: 0, customerId: 0, name: 0, none: 0 }, noCustomerSales: 0,
      badPhoneValues: 0,
      cancelLike: { rows: 0, sales: 0, samples: [] },
      dateMismatch: { rows: 0 }, futureDates: 0, oldDates: 0, years: {},
      orderIds: { blank: 0, distinct: 0, duplicateRows: 0, crossMonth: 0 },
      exactDuplicateRows: { rows: 0, sales: 0 },
      sourceYear: { checked: 0, mismatch: 0, samples: [] }, sourcePurchaseMonth: { checked: 0, mismatch: 0, samples: [] },
      firstYear: { checked: 0, sourceEarlier: 0, sourceLater: 0, samples: [] },
      tracking: { rows: 0, distinct: 0, duplicateRows: 0 }, phoneNoLeadingZero: 0,
      orderTypeBlank: 0, remarkKeyword: {}
    };
    const includedRows = [];
    const seenOrder = new Map();
    const seenRow = new Set();
    const statusHeaders = first ? STATUS_KEYS.map(k => findExactColumnKey(first, [k])).filter(Boolean) : [];
    const yearKey = first ? findExactColumnKey(first, ['Year']) : '';
    const pmKey = first ? findExactColumnKey(first, ['Purchase Month']) : '';
    const fyKey = first ? findExactColumnKey(first, ['First Year']) : '';
    const remarkKey = first ? findExactColumnKey(first, ['Remark', 'หมายเหตุ']) : '';
    const orderTypeKey = first ? findExactColumnKey(first, ['Order type', 'OrderType']) : '';
    const trackingSeen = new Set();
    const transferKey = first ? findExactColumnKey(first, ['วันที่โอนเงิน']) : '';
    const createdKey = first ? findExactColumnKey(first, ['วันที่สร้าง']) : '';
    const todayVal = (() => { const t = new Date(); t.setDate(t.getDate() + 1); return t.getFullYear() * 10000 + (t.getMonth() + 1) * 100 + t.getDate(); })();

    rawData.forEach((row, idx) => {
      const rev = readRev(row);
      add(steps.source, rev);

      // แถวซ้ำทั้งแถว (ทุกคอลัมน์เหมือนกัน) - รายงานเท่านั้น ไม่ตัดทิ้ง
      const sig = Object.values(row).join('\u0001');
      if (seenRow.has(sig)) { q.exactDuplicateRows.rows++; q.exactDuplicateRows.sales += isNum(rev) ? rev : 0; } else seenRow.add(sig);

      if (groupSel !== 'All' && getNormalizedGroup(row) !== groupSel) { add(steps.outsideGroup, rev); return; }
      if (!isSaleOrder(row)) {
        add(steps.notSale, rev);
        const t = (row['Order type'] !== undefined ? row['Order type'] : row['OrderType']) || '(ไม่ใช่การขายตามหมายเหตุ/ยอดขาย)';
        const k = String(t).trim() || '(ว่าง - ไม่ใช่การขายตามหมายเหตุ/ยอดขาย)';
        if (!steps.notSale.byType[k]) steps.notSale.byType[k] = { rows: 0, sales: 0 };
        steps.notSale.byType[k].rows++; steps.notSale.byType[k].sales += isNum(rev) ? rev : 0;
        if (!String(t).trim() || String(t).indexOf('(ไม่ใช่การขาย') === 0) {
          const rk = remarkKey ? String(row[remarkKey] || '').toUpperCase() : '';
          const hit = (window.NON_SALE_KEYWORDS || []).find(kw => rk.includes(kw.toUpperCase()));
          const reason = hit ? 'หมายเหตุมีคำว่า "' + hit + '"' : 'ยอดขายไม่เป็นบวก/อ่านไม่ได้';
          if (!q.remarkKeyword[reason]) q.remarkKeyword[reason] = { rows: 0, sales: 0 };
          q.remarkKeyword[reason].rows++; q.remarkKeyword[reason].sales += isNum(rev) ? rev : 0;
        }
        return;
      }
      if (!isProductActive(getNormalizedProduct(row))) { add(steps.inactiveProduct, rev); return; }
      const d = parseDate(getRowDateStr(row));
      if (!d) { add(steps.badDate, rev); return; }
      add(steps.included, rev);
      includedRows.push(row);

      // ---- คุณภาพข้อมูลของแถวที่ถูกนับ ----
      if (!isNum(rev)) { q.invalidRevenue.rows++; if (q.invalidRevenue.samples.length < 5) q.invalidRevenue.samples.push({ row: idx + 2, value: revHeader ? row[revHeader] : '' }); }
      else if (rev < 0) { q.negativeRevenue.rows++; q.negativeRevenue.sales += rev; }
      else if (rev === 0) q.zeroRevenue++;

      const method = customerMethod(row);
      q.customerMethod[method]++;
      if (method === 'none') q.noCustomerSales += isNum(rev) ? rev : 0;
      const ph = getRowValue(row, PHONE_KEYS);
      if (ph && (ph.toString().replace(/\D/g, '').length < 9 || /x/i.test(ph.toString()))) q.badPhoneValues++;

      const dv = d.y * 10000 + d.m * 100 + d.d;
      q.years[d.y] = (q.years[d.y] || 0) + 1;
      if (orderTypeKey && !String(row[orderTypeKey] || '').trim()) q.orderTypeBlank++;
      if (yearKey && String(row[yearKey] || '').trim() !== '') { q.sourceYear.checked++; if (parseInt(row[yearKey], 10) !== d.y) { q.sourceYear.mismatch++; if (q.sourceYear.samples.length < 5) q.sourceYear.samples.push(idx + 2); } }
      if (pmKey && String(row[pmKey] || '').trim() !== '') { q.sourcePurchaseMonth.checked++; if (String(row[pmKey]).trim() !== d.str) { q.sourcePurchaseMonth.mismatch++; if (q.sourcePurchaseMonth.samples.length < 5) q.sourcePurchaseMonth.samples.push(idx + 2); } }
      if (remarkKey) {
        const tm = /tracking\s*:\s*([A-Za-z0-9]+)/i.exec(String(row[remarkKey] || ''));
        if (tm) { q.tracking.rows++; if (trackingSeen.has(tm[1])) q.tracking.duplicateRows++; else trackingSeen.add(tm[1]); }
      }
      { const pd = String(getRowValue(row, PHONE_KEYS) || '').replace(/\D/g, ''); if (pd.length === 9 && pd[0] !== '0') q.phoneNoLeadingZero++; }
      if (dv > todayVal) q.futureDates++;
      if (d.y < 2000) q.oldDates++;
      if (transferKey && createdKey) {
        const a = parseDate(row[transferKey]), b = parseDate(row[createdKey]);
        if (a && b && a.str !== b.str) q.dateMismatch.rows++;
      }
      if (orderHeader) {
        const oid = (row[orderHeader] === undefined || row[orderHeader] === null) ? '' : String(row[orderHeader]).trim();
        if (!oid) q.orderIds.blank++;
        else if (seenOrder.has(oid)) { q.orderIds.duplicateRows++; if (seenOrder.get(oid) !== d.str) q.orderIds.crossMonth++; }
        else seenOrder.set(oid, d.str);
      }
      if (statusHeaders.some(h => CANCEL_RX.test(String(row[h] || '')))) {
        q.cancelLike.rows++; q.cancelLike.sales += isNum(rev) ? rev : 0;
        if (q.cancelLike.samples.length < 5) q.cancelLike.samples.push(idx + 2);
      }
    });
    q.orderIds.distinct = seenOrder.size;
    q.tracking.distinct = trackingSeen.size;
    if (fyKey && groupSel === 'All') {
      const firstYr = {};
      includedRows.forEach(r => { const id = getCustomerUniqueId(r); const d = parseDate(getRowDateStr(r)); if (id && d && (firstYr[id] === undefined || d.y < firstYr[id])) firstYr[id] = d.y; });
      includedRows.forEach((r, i) => {
        const id = getCustomerUniqueId(r); const sy = parseInt(r[fyKey], 10);
        if (!id || !Number.isFinite(sy)) return;
        q.firstYear.checked++;
        if (sy < firstYr[id]) q.firstYear.sourceEarlier++;
        else if (sy > firstYr[id]) { q.firstYear.sourceLater++; if (q.firstYear.samples.length < 5) q.firstYear.samples.push(i); }
      });
    }

    // การคำนวณอิสระของแถวที่ถูกนับ: ยอดรวม / ออเดอร์ / ลูกค้า
    const ids = new Set();
    includedRows.forEach(r => { const id = getCustomerUniqueId(r); if (id) ids.add(id); });
    const independent = {
      sales: steps.included.sales,
      orders: orderHeader ? q.orderIds.distinct + q.orderIds.blank : steps.included.rows,
      customers: ids.size
    };
    const M = calculateMetrics(getGroupScopeRows());

    const explained = steps.outsideGroup.sales + steps.notSale.sales + steps.inactiveProduct.sales + steps.badDate.sales + steps.included.sales;
    const rowsExplained = steps.outsideGroup.rows + steps.notSale.rows + steps.inactiveProduct.rows + steps.badDate.rows + steps.included.rows;
    const report = {
      columns, allHeaders: first ? Object.keys(first) : [],
      steps, quality: q, independent,
      dashboard: { sales: M.totalSales, orders: M.totalOrders, customers: M.uniqueCustomers, aov: M.aov, sph: M.spendingPerHead },
      checks: {
        waterfallSales: same(explained, steps.source.sales),
        waterfallRows: rowsExplained === steps.source.rows,
        sales: same(independent.sales, M.totalSales),
        orders: independent.orders === M.totalOrders,
        customers: independent.customers === M.uniqueCustomers,
        aov: same(independent.orders > 0 ? independent.sales / independent.orders : null, M.aov),
        sph: same(independent.customers > 0 ? independent.sales / independent.customers : null, M.spendingPerHead)
      },
      unexplainedSales: steps.source.sales - explained
    };
    fileCache = { src: rawData, group: groupSel, sig: activeSig, report };
    return report;
  }

  // ---------- ส่วนที่ 2: กระทบยอดตาม Filter ที่เลือกอยู่ ----------
  function independentTotals(rows, revHeader, orderHeader, rowFilter) {
    let sales = 0, count = 0, blank = 0;
    const oids = new Set(), ids = new Set();
    rows.forEach(row => {
      if (rowFilter && !rowFilter(row)) return;
      const v = revHeader ? srcMoney(row[revHeader]) : NaN;
      sales += isNum(v) ? v : 0;
      if (orderHeader) {
        const oid = (row[orderHeader] === undefined || row[orderHeader] === null) ? '' : String(row[orderHeader]).trim();
        if (oid) oids.add(oid); else blank++;
      } else count++;
      const id = getCustomerUniqueId(row);
      if (id) ids.add(id);
    });
    const orders = orderHeader ? oids.size + blank : count;
    return { sales, orders, customers: ids.size, aov: orders > 0 ? sales / orders : null, sph: ids.size > 0 ? sales / ids.size : null };
  }

  function contextReport(fileRep) {
    const revHeader = (fileRep.columns[0] && fileRep.columns[0].header) || '';
    const orderHeader = (fileRep.columns[2] && fileRep.columns[2].header) || '';
    const out = [];
    const line = (label, indep, dash) => out.push({
      label,
      rows: ['sales', 'orders', 'customers', 'aov', 'sph'].map(k => ({ key: k, indep: indep[k], dash: dash[k], ok: same(indep[k], dash[k]) }))
    });

    // Overview: ผลรวมรายเดือนที่ใช้ทำกราฟ เทียบกับผลรวมอิสระของ filteredData
    if (typeof filteredData !== 'undefined' && availableMonths.length > 0) {
      // ผลรวมรายเดือนที่ใช้ทำกราฟ: ออเดอร์นับต่อเดือน (Order ID เดียวกันที่มีแถวคนละเดือนจะนับในทั้งสองเดือน) จึงเทียบกับ
      // ผลรวมของการคำนวณอิสระรายเดือน ไม่ใช่จำนวน Order ไม่ซ้ำทั้งช่วง (ซึ่งตรวจแยกในการ์ด YTD / ภาพรวมทั้งหมดด้านล่าง)
      const byMonth = {};
      filteredData.forEach(row => { const d = parseDate(getRowDateStr(row)); if (d) (byMonth[d.str] = byMonth[d.str] || []).push(row); });
      const ind = { sales: 0, orders: 0, customers: 0, aov: null, sph: null };
      const indCust = new Set();
      Object.keys(byMonth).forEach(ms => {
        const t = independentTotals(byMonth[ms], revHeader, orderHeader);
        ind.sales += t.sales; ind.orders += t.orders;
        byMonth[ms].forEach(r => { const id = getCustomerUniqueId(r); if (id) indCust.add(id); });
      });
      ind.customers = indCust.size;
      ind.aov = ind.orders > 0 ? ind.sales / ind.orders : null;
      ind.sph = ind.customers > 0 ? ind.sales / ind.customers : null;
      let sales = 0, orders = 0; const custs = new Set();
      availableMonths.forEach(m => { sales += monthlyData[m].sales; orders += monthlyData[m].orders; monthlyData[m].buyers.forEach(id => custs.add(id)); });
      line('Overview: ผลรวมรายเดือน (กราฟ) เทียบชุดข้อมูลที่ผ่าน Filter', ind, {
        sales, orders, customers: custs.size,
        aov: orders > 0 ? sales / orders : null, sph: custs.size > 0 ? sales / custs.size : null
      });
      const last = window.qmLastOverview;
      if (last && last.ytd) {
        const cutoff = last.selectedMonthStr, yr = last.currYear;
        const indY = independentTotals(filteredData, revHeader, orderHeader, row => { const d = parseDate(getRowDateStr(row)); return d && d.y === yr && d.str <= cutoff; });
        line('Overview: การ์ด YTD ' + yr + ' (ม.ค. ถึง ' + cutoff + ')', indY, last.ytd);
      }
      if (last && last.allTime) {
        const indA = independentTotals(getAllTimeRows(), revHeader, orderHeader);
        line('Overview: การ์ดภาพรวมทั้งหมด (ทุกปี, ตาม Filter ยกเว้น Year/Month)', indA, last.allTime);
      }
    }
    // Executive: ผลรวมทั้งปีเทียบกับการคำนวณอิสระจากชุดข้อมูลของหน้า Executive เอง
    const ex = window.qmLastExec;
    if (ex && typeof computeFilteredData === 'function' && window.execFilters) {
      const cutoff = ex.monthCutoff;
      const indE = independentTotals(computeFilteredData(window.execFilters), revHeader, orderHeader, row => {
        const d = parseDate(getRowDateStr(row));
        return d && (!cutoff || (d.y + '-' + String(d.m).padStart(2, '0')) <= cutoff);
      });
      line('Executive: Total Year (Filter ของหน้า Executive)', indE, ex.totals);
    }
    return out;
  }

  function buildReport() {
    if (!rawData || rawData.length === 0) return null;
    const file = fileLevelReport();
    const context = contextReport(file);
    const contextOk = context.every(c => c.rows.every(r => r.ok));
    const fileOk = Object.keys(file.checks).every(k => file.checks[k]);
    const q = file.quality;
    const warnings = [];
    if (!file.columns[2].header) warnings.push({ level: (q.tracking.rows > 0 && q.tracking.duplicateRows === 0) ? 'info' : 'warn', text: 'ไม่พบคอลัมน์ Order ID (ชื่อหัวคอลัมน์ตรงตัว) - ระบบนับ 1 แถว = 1 ออเดอร์ ถ้าไฟล์เป็นรายการสินค้า (1 บิลหลายแถว) AOV จะต่ำกว่าความจริง กรุณาระบุคอลัมน์ Order ID' });
    if (file.columns[0].match === 'fuzzy') warnings.push({ level: 'warn', text: 'คอลัมน์ยอดขายที่ระบบเลือก ("' + file.columns[0].header + '") จับด้วยชื่อคล้าย ไม่ใช่ชื่อตรงตัว - ตรวจสอบว่าเป็นยอดขายรวมต่อบิล ไม่ใช่ราคาต่อหน่วย/ส่วนลด' });
    if (file.columns[0].alternatives.length) warnings.push({ level: 'warn', text: 'มีหลายคอลัมน์เข้าข่ายเป็นยอดขาย: ใช้ "' + file.columns[0].header + '" (คอลัมน์อื่นที่ชื่อใกล้เคียง: ' + file.columns[0].alternatives.join(', ') + ') - ยืนยันว่าใช้คอลัมน์ถูกต้อง' });
    if (file.columns[1].alternatives.length) warnings.push({ level: 'warn', text: 'มีหลายคอลัมน์วันที่: ใช้ "' + file.columns[1].header + '" เป็นวันที่ขายทั่วทั้งระบบ (คอลัมน์อื่น: ' + file.columns[1].alternatives.join(', ') + ')' });
    if (q.dateMismatch.rows > 0) warnings.push({ level: 'warn', text: 'วันที่โอนเงินกับวันที่สร้างอยู่คนละเดือนใน ' + int(q.dateMismatch.rows) + ' แถว - ยอดรายเดือนจะต่างกันตามคอลัมน์วันที่ที่เลือกใช้' });
    if (q.invalidRevenue.rows > 0) warnings.push({ level: 'warn', text: 'ยอดขายว่าง/อ่านเป็นตัวเลขไม่ได้ ' + int(q.invalidRevenue.rows) + ' แถว - นับเป็นออเดอร์แต่ยอด 0 (ตัวอย่างแถวในไฟล์ ~' + q.invalidRevenue.samples.map(s => s.row + ' = "' + s.value + '"').join(', ') + ')' });
    if (q.negativeRevenue.rows > 0) warnings.push({ level: 'warn', text: 'ยอดขายติดลบ ' + int(q.negativeRevenue.rows) + ' แถว รวม ' + money(q.negativeRevenue.sales) + ' บาท - ยังนับตามเดิม (อาจเป็นการคืนเงิน/ยกเลิก ต้องยืนยันว่าควรนับหรือไม่)' });
    if (q.cancelLike.rows > 0) warnings.push({ level: 'warn', text: 'พบคำว่า cancel/ยกเลิก/refund/คืนเงิน/return ในคอลัมน์สถานะ/หมายเหตุ ' + int(q.cancelLike.rows) + ' แถว (ยอด ' + money(q.cancelLike.sales) + ') ที่ยังถูกนับเป็นยอดขาย - ต้องยืนยันว่าควรตัดออกหรือไม่ (แถวตัวอย่าง ~' + q.cancelLike.samples.join(', ') + ')' });
    if (q.customerMethod.none > 0) warnings.push({ level: 'warn', text: 'ระบุตัวลูกค้าไม่ได้เลย ' + int(q.customerMethod.none) + ' แถว (ยอด ' + money(q.noCustomerSales) + ') - อยู่ในยอดขายและจำนวนออเดอร์ แต่ไม่อยู่ในจำนวนลูกค้า จึงทำให้ SPH (ยอดขายรวม ÷ ลูกค้า) สูงกว่าเฉลี่ยรายคนจริงเล็กน้อย' });
    if (q.badPhoneValues > 0) warnings.push({ level: 'info', text: 'เบอร์โทรที่ถูกมาสก์/สั้นเกินไป ' + int(q.badPhoneValues) + ' แถว - ไม่ใช้เป็นตัวระบุลูกค้า (ใช้ที่อยู่/Customer ID/ชื่อแทน)' });
    if (q.exactDuplicateRows.rows > 0) warnings.push({ level: 'warn', text: 'พบแถวซ้ำกันทั้งแถว (ทุกคอลัมน์เหมือนกัน) ' + int(q.exactDuplicateRows.rows) + ' แถว ยอด ' + money(q.exactDuplicateRows.sales) + ' - ยังนับตามเดิม ต้องยืนยันว่าเป็นรายการซ้ำจริงหรือไม่' });
    if (q.orderIds.duplicateRows > 0) warnings.push({ level: 'info', text: 'Order ID ซ้ำกัน ' + int(q.orderIds.duplicateRows) + ' แถว - นับเป็น 1 ออเดอร์ต่อ Order ID (ยอดขายของทุกแถวยังถูกรวม)' });
    if (q.orderIds.crossMonth > 0) warnings.push({ level: 'warn', text: 'Order ID เดียวกันมีแถวคนละเดือน ' + int(q.orderIds.crossMonth) + ' แถว - ตัวเลข Order รายเดือนจะนับออเดอร์นั้นในทั้งสองเดือน (ผลรวมรายเดือนจึงมากกว่าจำนวน Order ไม่ซ้ำรวม) ตรวจสอบว่าวันที่ของแต่ละบิลถูกต้อง' });
    if (q.orderIds.blank > 0) warnings.push({ level: 'warn', text: 'Order ID ว่าง ' + int(q.orderIds.blank) + ' แถว - นับแถวละ 1 ออเดอร์' });
    if (file.steps.badDate.rows > 0) warnings.push({ level: 'warn', text: 'วันที่อ่านไม่ได้/ผิดรูปแบบ ' + int(file.steps.badDate.rows) + ' แถว (ยอด ' + money(file.steps.badDate.sales) + ') ถูกตัดออกจากทุกตัวเลข' });
    if (q.futureDates > 0) warnings.push({ level: 'warn', text: 'วันที่อยู่ในอนาคต ' + int(q.futureDates) + ' แถว - อาจเป็นปีผิด' });
    if (q.oldDates > 0) warnings.push({ level: 'warn', text: 'วันที่ก่อนปี 2000 ' + int(q.oldDates) + ' แถว - อาจเป็นปีผิด' });
    if (file.steps.inactiveProduct.rows > 0) warnings.push({ level: 'info', text: 'สินค้าที่ถูกปิดใช้งานในหน้า Settings ถูกตัดออก ' + int(file.steps.inactiveProduct.rows) + ' แถว (ยอด ' + money(file.steps.inactiveProduct.sales) + ')' });

    if (file.columns[9] && file.columns[9].match === 'fuzzy') warnings.push({ level: 'info', text: 'ไม่มีคอลัมน์ Product ตรงตัว ระบบใช้คอลัมน์ "' + file.columns[9].header + '" (จับด้วยชื่อคล้าย) เป็นค่า Product ใน Filter - ถ้าคอลัมน์นี้เป็นรายการสินค้าหลายชิ้นต่อบิล ตัวเลือก Product/Sub Product จะเป็นข้อความยาวและไม่ใช่รายสินค้า (ไม่กระทบยอดขายรวม)' });
    if (q.orderTypeBlank > 0) warnings.push({ level: 'info', text: 'คอลัมน์ Order type ว่าง ' + int(q.orderTypeBlank) + ' แถวที่ถูกนับ - ระบบจึงใช้กติกาสำรอง: นับเป็นยอดขายเมื่อยอดขาย > 0 และหมายเหตุไม่มีคำว่า ' + (window.NON_SALE_KEYWORDS || []).join(' / ') + ' (จับแบบ includes ในข้อความหมายเหตุทั้งหมด รวมชื่อโปรไฟล์ลูกค้า)' });
    Object.keys(q.remarkKeyword).forEach(k => warnings.push({ level: 'warn', text: 'แถวที่ถูกตัดออกจากยอดขายเพราะกติกาสำรอง (' + k + '): ' + int(q.remarkKeyword[k].rows) + ' แถว ยอด ' + money(q.remarkKeyword[k].sales) + ' - ตรวจสอบว่าไม่ได้ตัดยอดขายจริงทิ้ง (คำเหล่านี้อาจอยู่ในชื่อลูกค้าหรือโน้ต)' }));
    if (q.sourceYear.mismatch > 0) warnings.push({ level: 'warn', text: 'คอลัมน์ Year จากต้นทางไม่ตรงกับปีของวันที่ขาย ' + int(q.sourceYear.mismatch) + ' จาก ' + int(q.sourceYear.checked) + ' แถว (แถวตัวอย่าง ~' + q.sourceYear.samples.join(', ') + ') - อาจอ่านวันที่ผิดรูปแบบ (วัน/เดือน/ปี)' });
    if (q.sourcePurchaseMonth.mismatch > 0) warnings.push({ level: 'warn', text: 'คอลัมน์ Purchase Month จากต้นทางไม่ตรงกับเดือนของวันที่ขาย ' + int(q.sourcePurchaseMonth.mismatch) + ' จาก ' + int(q.sourcePurchaseMonth.checked) + ' แถว (แถวตัวอย่าง ~' + q.sourcePurchaseMonth.samples.join(', ') + ')' });
    if (q.firstYear.sourceLater > 0) warnings.push({ level: 'warn', text: 'First Year จากต้นทางใหม่กว่าปีที่ซื้อครั้งแรกที่ระบบคำนวณ ' + int(q.firstYear.sourceLater) + ' แถว - ลูกค้าเหล่านี้ระบบนับเป็นลูกค้าเก่าเร็วกว่าต้นทาง อาจเป็นเพราะระบุตัวลูกค้าคนละแบบ (เบอร์/ที่อยู่)' });
    if (q.firstYear.sourceEarlier > 0) warnings.push({ level: 'info', text: 'First Year จากต้นทางเก่ากว่าข้อมูลในไฟล์ ' + int(q.firstYear.sourceEarlier) + ' แถว - ปกติถ้าไฟล์นี้ไม่ได้มีประวัติการซื้อครั้งแรกของลูกค้าเหล่านั้น (ระบบนับ "ลูกค้าใหม่" จากข้อมูลในไฟล์เท่านั้น)' });
    if (!file.columns[2].header && q.tracking.rows > 0) warnings.push({ level: q.tracking.duplicateRows > 0 ? 'warn' : 'info', text: 'พบเลข Tracking ในหมายเหตุ ' + int(q.tracking.rows) + ' แถว ไม่ซ้ำกัน ' + int(q.tracking.distinct) + ' เลข' + (q.tracking.duplicateRows > 0 ? ' - มี ' + int(q.tracking.duplicateRows) + ' แถวที่เลข Tracking ซ้ำกับแถวอื่น (อาจเป็นบิลเดียวกันหรือรายการซ้ำ - ต้องยืนยัน)' : ' - ทุกแถวเลข Tracking ไม่ซ้ำ ไม่มีสัญญาณว่ามี 1 บิลหลายแถว') + ' (ยังไม่ใช้เป็น Order ID เพราะไม่ใช่คอลัมน์ของตัวเอง)' });
    if (q.phoneNoLeadingZero > 0) warnings.push({ level: 'info', text: 'เบอร์โทร 9 หลักที่ไม่มีเลข 0 นำหน้า ' + int(q.phoneNoLeadingZero) + ' แถว - ระบบตัดเลข 0 นำหน้า/รหัส 66 ออกก่อนเทียบ จึงนับรวมเป็นลูกค้าคนเดียวกับเบอร์ที่มี 0 นำหน้า' });
    const level = (!fileOk || !contextOk) ? 'error' : (warnings.some(w => w.level === 'warn') ? 'warn' : 'ok');
    return { at: new Date().toISOString(), level, fileOk, contextOk, file, context, warnings, group: filters.Group || 'All' };
  }

  // ---------- UI ----------
  const COLORS = { ok: '#16a34a', warn: '#d97706', error: '#dc2626', none: '#94a3b8' };
  let lastReport = null;
  let timer = null;

  function updateButtons(level) {
    ['btn-DataCheck', 'btn-Exec-DataCheck'].forEach(id => {
      const dot = document.querySelector('#' + id + ' .dc-dot');
      if (dot) dot.style.background = COLORS[level] || COLORS.none;
    });
  }

  function cell(v, bold) { return '<td style="padding:6px 10px; border-bottom:1px solid #f0ece4; text-align:right;' + (bold ? 'font-weight:700;' : '') + '">' + v + '</td>'; }
  function cellL(v, bold) { return '<td style="padding:6px 10px; border-bottom:1px solid #f0ece4;' + (bold ? 'font-weight:700;' : '') + '">' + v + '</td>'; }
  const th = (t, right) => '<th style="padding:6px 10px; text-align:' + (right ? 'right' : 'left') + '; font-size:11.5px; color:#8a8577; border-bottom:1px solid #e5e1d8;">' + t + '</th>';
  const tag = (ok) => ok ? '<span style="color:#16a34a; font-weight:700;">✓ ตรง</span>' : '<span style="color:#dc2626; font-weight:700;">✗ ไม่ตรง</span>';

  function renderPanel(rep) {
    const panel = document.getElementById('dataCheckPanel');
    if (!panel || panel.style.display === 'none') return;
    if (!rep) { panel.innerHTML = '<div style="padding:16px;">ยังไม่มีข้อมูล กรุณา Import Data ก่อน</div>'; return; }
    const f = rep.file, s = f.steps;
    const head = { ok: '✓ ตัวเลขทุกตัวกระทบยอดได้ตรงกับไฟล์ต้นทาง', warn: '⚠ ตัวเลขกระทบยอดได้ แต่พบข้อสังเกตเกี่ยวกับข้อมูลต้นทาง', error: '✗ พบตัวเลขที่ไม่ตรงกัน - ต้องตรวจสอบสาเหตุ (ห้ามปรับตัวเลขเอง)' }[rep.level];

    let h = '<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:10px;">' +
      '<strong style="color:' + COLORS[rep.level] + ';">' + head + '</strong>' +
      '<span style="font-size:11.5px; color:#8a8577;">Group: ' + esc(rep.group) + ' · ตรวจเมื่อ ' + esc(new Date(rep.at).toLocaleTimeString('th-TH', { hour12: false })) +
      ' <button class="clear-filters-btn" style="display:inline; margin-left:8px;" onclick="copyDataCheckReport()">คัดลอกรายงาน (JSON)</button></span></div>';

    // 1. คอลัมน์
    h += '<div style="font-weight:700; margin:12px 0 4px;">1) คอลัมน์ที่ระบบใช้คำนวณ</div><table style="width:100%; border-collapse:collapse; font-size:12.5px;"><thead><tr>' + th('หน้าที่') + th('คอลัมน์ที่จับได้') + th('วิธีจับ') + th('หมายเหตุ') + '</tr></thead><tbody>';
    f.columns.forEach(c => {
      const how = c.match === 'exact' ? 'ชื่อตรงตัว' : c.match === 'fuzzy' ? '<span style="color:#d97706; font-weight:700;">ชื่อคล้าย (includes)</span>' : '<span style="color:#94a3b8;">ไม่พบ</span>';
      h += '<tr>' + cellL(esc(c.role)) + cellL(c.header ? '<code>' + esc(c.header) + '</code>' : '-') + cellL(how) + cellL(esc(c.note || (c.alternatives.length ? 'คอลัมน์ใกล้เคียงอื่น: ' + c.alternatives.join(', ') : ''))) + '</tr>';
    });
    h += '</tbody></table><div style="font-size:11.5px; color:#8a8577; margin-top:4px;">หัวคอลัมน์ทั้งหมดในไฟล์: ' + esc(f.allHeaders.join(' | ')) + '</div>';

    // 2. กระทบยอดไฟล์
    h += '<div style="font-weight:700; margin:16px 0 4px;">2) กระทบยอด: ไฟล์ต้นทาง → ชุดข้อมูลที่ใช้คำนวณ (ทุกแถวต้องอธิบายได้)</div><table style="width:100%; border-collapse:collapse; font-size:12.5px;"><thead><tr>' + th('รายการ') + th('แถว', true) + th('ยอดขาย (บาท)', true) + '</tr></thead><tbody>';
    const rowLine = (label, o, bold) => '<tr>' + cellL(label, bold) + cell(int(o.rows), bold) + cell(money(o.sales), bold) + '</tr>';
    h += rowLine('ไฟล์ต้นทาง (ทุกแถวที่ import)', s.source, true);
    if (rep.group !== 'All') h += rowLine('− นอก Group ที่เลือก (' + esc(rep.group) + ')', s.outsideGroup);
    h += rowLine('− ไม่ใช่การขาย (Order type ≠ SALE / ของแถม / เคลม ฯลฯ)', s.notSale);
    Object.keys(s.notSale.byType).forEach(k => { h += '<tr>' + cellL('&nbsp;&nbsp;&nbsp;· ' + esc(k)) + cell(int(s.notSale.byType[k].rows)) + cell(money(s.notSale.byType[k].sales)) + '</tr>'; });
    h += rowLine('− สินค้าถูกปิดใช้งานใน Settings', s.inactiveProduct);
    h += rowLine('− วันที่อ่านไม่ได้/ผิดรูปแบบ', s.badDate);
    h += rowLine('= ที่ใช้คำนวณ (ชุดข้อมูลการ์ด "ภาพรวมทั้งหมด")', s.included, true);
    h += '<tr>' + cellL('ผลต่างที่อธิบายไม่ได้ (ต้องเป็น 0.00)') + cell('') + cell('<span style="color:' + (f.checks.waterfallSales ? '#16a34a' : '#dc2626') + '; font-weight:700;">' + money(f.unexplainedSales) + '</span>') + '</tr></tbody></table>';

    // 3. ตรวจตัวเลขที่ใช้คำนวณ (ชุดข้อมูลเต็ม)
    const m = (label, a, b, fmt, ok) => '<tr>' + cellL(label) + cell(fmt(a)) + cell(fmt(b)) + cell(tag(ok)) + '</tr>';
    h += '<div style="font-weight:700; margin:16px 0 4px;">3) การคำนวณอิสระจากไฟล์ เทียบกับ Calculation Layer (ชุดข้อมูลการ์ดภาพรวมทั้งหมด)</div><table style="width:100%; border-collapse:collapse; font-size:12.5px;"><thead><tr>' + th('Metric') + th('คำนวณอิสระจากไฟล์', true) + th('Dashboard', true) + th('สถานะ', true) + '</tr></thead><tbody>' +
      m('ยอดขายรวม', f.independent.sales, f.dashboard.sales, money, f.checks.sales) +
      m('จำนวน Order', f.independent.orders, f.dashboard.orders, int, f.checks.orders) +
      m('ลูกค้าไม่ซ้ำ (Unique Customer)', f.independent.customers, f.dashboard.customers, int, f.checks.customers) +
      m('AOV = ยอดขายรวม ÷ Order', f.independent.orders > 0 ? f.independent.sales / f.independent.orders : null, f.dashboard.aov, money, f.checks.aov) +
      m('Spending per Head = ยอดขายรวม ÷ ลูกค้าไม่ซ้ำ', f.independent.customers > 0 ? f.independent.sales / f.independent.customers : null, f.dashboard.sph, money, f.checks.sph) +
      '</tbody></table>';

    // 4. Filter context
    h += '<div style="font-weight:700; margin:16px 0 4px;">4) ทุก KPI/กราฟใช้ชุดข้อมูลเดียวกับ Filter ที่เลือก (Group → Year → Month → Channel → ...)</div>';
    if (!rep.context.length) h += '<div style="font-size:12.5px; color:#8a8577;">เปิดหน้า Overview หรือ Executive เพื่อตรวจ</div>';
    rep.context.forEach(c => {
      h += '<div style="margin:8px 0 2px; font-size:12.5px; font-weight:600;">' + esc(c.label) + '</div><table style="width:100%; border-collapse:collapse; font-size:12.5px;"><thead><tr>' + th('Metric') + th('คำนวณอิสระ', true) + th('Dashboard', true) + th('ผลต่าง', true) + th('สถานะ', true) + '</tr></thead><tbody>';
      const names = { sales: 'ยอดขายรวม', orders: 'จำนวน Order', customers: 'ลูกค้าไม่ซ้ำ', aov: 'AOV', sph: 'Spending per Head' };
      c.rows.forEach(r => {
        const fmt = (r.key === 'orders' || r.key === 'customers') ? int : money;
        h += '<tr>' + cellL(names[r.key]) + cell(fmt(r.indep)) + cell(fmt(r.dash)) + cell(isNum(r.indep) && isNum(r.dash) ? money(r.dash - r.indep) : '-') + cell(tag(r.ok)) + '</tr>';
      });
      h += '</tbody></table>';
    });

    // 5. ข้อสังเกต
    h += '<div style="font-weight:700; margin:16px 0 4px;">5) ข้อสังเกตเกี่ยวกับข้อมูลต้นทาง (รายงานเท่านั้น ยังไม่มีการแก้ไขข้อมูล)</div>';
    if (!rep.warnings.length) h += '<div style="font-size:12.5px; color:#16a34a;">ไม่พบข้อสังเกต</div>';
    else h += '<ul style="margin:0; padding-left:18px; font-size:12.5px; line-height:1.7;">' + rep.warnings.map(w => '<li style="color:' + (w.level === 'warn' ? '#b45309' : '#475569') + ';">' + esc(w.text) + '</li>').join('') + '</ul>';

    const q = f.quality;
    h += '<div style="font-size:11.5px; color:#8a8577; margin-top:10px;">วิธีระบุตัวลูกค้าของแถวที่ถูกนับ: เบอร์โทร ' + int(q.customerMethod.phone) + ' · ที่อยู่ ' + int(q.customerMethod.address) + ' · Customer ID ' + int(q.customerMethod.customerId) + ' · ชื่อ ' + int(q.customerMethod.name) + ' · ระบุไม่ได้ ' + int(q.customerMethod.none) + '</div>';
    h += '<div style="font-size:11.5px; color:#8a8577; margin-top:6px; line-height:1.6;"><b>สูตร:</b> AOV = ยอดขายรวม ÷ จำนวน Order · Spending per Head = ยอดขายรวม ÷ ลูกค้าไม่ซ้ำ · ยอดขายรวม = ผลรวมยอดขายจริงของทุกแถวที่นับ (ไม่ปัดเศษก่อนคำนวณ ปัดเฉพาะตอนแสดงผล)</div>';
    panel.innerHTML = h;
  }

  function run() {
    timer = null;
    try {
      lastReport = buildReport();
      window.qmDataCheckReport = lastReport;
      updateButtons(lastReport ? lastReport.level : 'none');
      renderPanel(lastReport);
      if (lastReport && lastReport.level === 'error') console.warn('[DataCheck] ตัวเลขไม่ตรงกัน', lastReport);
    } catch (e) {
      console.error('[DataCheck] ตรวจสอบไม่สำเร็จ', e);
      updateButtons('none');
    }
  }

  // ตรวจแบบ debounce หลังทุกครั้งที่ Filter/ข้อมูลเปลี่ยน (ไม่ให้หน่วงการกด Filter)
  window.scheduleDataCheck = function () {
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, 350);
  };
  window.runDataCheckNow = function () { fileCache = null; run(); return lastReport; };
  window.toggleDataCheck = function () {
    const panel = document.getElementById('dataCheckPanel');
    if (!panel) return;
    const open = panel.style.display === 'none' || panel.style.display === '';
    panel.style.display = open ? 'block' : 'none';
    if (open) { panel.innerHTML = '<div style="padding:16px;">กำลังตรวจสอบ...</div>'; setTimeout(run, 30); }
  };
  window.copyDataCheckReport = function () {
    const txt = JSON.stringify(lastReport, (k, v) => (v instanceof Map || v instanceof Set) ? undefined : v, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => alert('คัดลอกรายงานแล้ว')).catch(() => alert('คัดลอกไม่สำเร็จ'));
  };
})();
