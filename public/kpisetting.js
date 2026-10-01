// public/kpisetting.js

// KPI targets now live on the server, one set per organization (GET/PUT/DELETE /api/kpi).
// This key is only read once, to offer importing what an older version saved in this browser
// (it was shared by every account that used the browser, which is why it's no longer trusted).
const KPI_LEGACY_STORAGE_KEY = 'qm_kpi_setting_v1';
const KPI_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ฟิลด์ของ "หนึ่งขอบเขต" เป้า KPI - ใช้รูปแบบเดียวกันทั้งกับ KPI All (ภาพรวมทั้งหมด ไม่แยก Group) และแต่ละ KPI Group
function kpiDefaultScopeState() {
  return {
    byProduct: [
      { name: 'Plus', values: Array(12).fill(null) },
      { name: 'Collagen', values: Array(12).fill(null) },
      { name: 'Gold', values: Array(12).fill(null) },
      { name: 'Wiss', values: Array(12).fill(null) },
      { name: 'Kides Probiotic', values: Array(12).fill(null) },
      { name: 'Kides กัมมี่ เสริมภูมิ', values: Array(12).fill(null) },
      { name: 'Kides กัมมี่ สมอง', values: Array(12).fill(null) },
      { name: 'สินค้าใหม่', values: Array(12).fill(null) }
    ],
    byChannel: [
      { name: 'Online', values: Array(12).fill(null) }
    ],
    customerSetting: {
      old: { value: null, unit: '%' },
      new: { value: null, unit: '%' }
    },
    customerMonthly: {
      old: Array(12).fill(null),
      new: Array(12).fill(null)
    },
    crm: {
      totalCustomers: null,
      aov: null,
      sph: null,
      retention: null
    },
    savedAt: null
  };
}

// เอกสารทั้งก้อนที่เก็บต่อองค์กร: ฟิลด์ระดับบนสุด = ขอบเขต "KPI All" (เหมือน kpiDefaultScopeState ทุกประการ - ข้อมูล
// เดิมก่อนมี KPI Group จึงยังอ่าน/เขียนได้ตามปกติ ไม่ breaking) บวก groups: { "<ชื่อ Group>": <ขอบเขตรูปแบบเดียวกัน> }
function kpiDefaultState() {
  return Object.assign(kpiDefaultScopeState(), { groups: {} });
}

// รวมกับค่า default กันกรณีโครงสร้างเก่าขาดฟิลด์ใหม่ - ใช้ร่วมกันทั้งกับ KPI All และแต่ละ Group (โครงสร้างฟิลด์เดียวกัน)
function kpiNormalizeScopeState(parsed) {
  if (!parsed || typeof parsed !== 'object') return kpiDefaultScopeState();
  const def = kpiDefaultScopeState();
  return Object.assign(def, parsed, {
    customerSetting: Object.assign(def.customerSetting, parsed.customerSetting),
    customerMonthly: Object.assign(def.customerMonthly, parsed.customerMonthly),
    crm: Object.assign(def.crm, parsed.crm)
  });
}

function kpiNormalizeState(parsed) {
  const doc = kpiNormalizeScopeState(parsed);
  doc.groups = {};
  if (parsed && parsed.groups && typeof parsed.groups === 'object' && !Array.isArray(parsed.groups)) {
    Object.keys(parsed.groups).forEach(name => {
      doc.groups[name] = kpiNormalizeScopeState(parsed.groups[name]);
    });
  }
  return doc;
}

// อ่านค่า KPI ขององค์กรที่ล็อกอินอยู่จาก server (server ดูองค์กรจาก session เอง ไม่รับจาก client)
// คืน null ถ้ายังไม่เคยบันทึก - โยน error ถ้าโหลดไม่สำเร็จ
async function kpiFetchSavedState() {
  const res = await fetch('/api/kpi', { credentials: 'same-origin' });
  if (!res.ok) throw new Error('โหลด KPI Setting ไม่สำเร็จ (' + res.status + ')');
  const body = await res.json();
  return body && body.data ? kpiNormalizeState(body.data) : null;
}

// เฉพาะ Super Admin / Manager ที่แก้เป้า KPI ได้ (ตรงกับที่ /api/kpi บังคับที่ฝั่ง server)
function kpiCanEdit() {
  const role = window.currentUser && window.currentUser.role;
  return role === 'Super Admin' || role === 'Manager';
}

function kpiReadLegacyLocalState() {
  try {
    const raw = localStorage.getItem(KPI_LEGACY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function kpiClearLegacyLocalState() {
  try { localStorage.removeItem(KPI_LEGACY_STORAGE_KEY); } catch (e) { /* storage blocked - nothing to clear */ }
}

function kpiFormatNum(n) {
  if (n === null || n === undefined || isNaN(n)) return '';
  return Number(n).toLocaleString('en-US');
}

function kpiParseNum(str) {
  if (!str) return 0;
  const n = parseFloat(str.toString().replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function kpiRowTotal(values) {
  return values.reduce((sum, v) => sum + (kpiParseNum(v) || 0), 0);
}

// Splits pasted clipboard text (e.g. copied from Excel/Sheets) into a grid: rows on newline,
// columns on tab. A single pasted value degenerates to a 1x1 grid, so this also covers normal paste.
function kpiParsePasteGrid(text) {
  const rows = text.replace(/\r/g, '').split('\n');
  if (rows.length > 1 && rows[rows.length - 1] === '') rows.pop();
  return rows.map(row => row.split('\t'));
}

// Pastes a block of cells into a monthly product/channel row table, starting at (r0, m0) and
// filling across months and, for a multi-row paste, down into subsequent rows.
window.handleKpiRowPaste = function(event, sectionKey, prefix, r0, m0) {
  const clipboard = event.clipboardData || window.clipboardData;
  const text = clipboard ? clipboard.getData('text') : '';
  if (!text) return;
  event.preventDefault();

  const grid = kpiParsePasteGrid(text);
  const rows = window.__kpiState[sectionKey] || [];
  grid.forEach((rowVals, i) => {
    const r = r0 + i;
    if (r >= rows.length) return;
    rowVals.forEach((val, j) => {
      const m = m0 + j;
      if (m > 11) return;
      const el = document.getElementById(`kpi-${prefix}-${r}-${m}`);
      if (el) el.value = kpiFormatNum(kpiParseNum(val));
    });
    updateKpiRowTotal(prefix, r);
  });
};

// Same idea for the KPI Customer monthly table (2 rows: old, new).
window.handleKpiCustomerPaste = function(event, type0, m0) {
  const clipboard = event.clipboardData || window.clipboardData;
  const text = clipboard ? clipboard.getData('text') : '';
  if (!text) return;
  event.preventDefault();

  const grid = kpiParsePasteGrid(text);
  const order = ['old', 'new'];
  const startIdx = order.indexOf(type0);
  grid.forEach((rowVals, i) => {
    const type = order[startIdx + i];
    if (!type) return;
    rowVals.forEach((val, j) => {
      const m = m0 + j;
      if (m > 11) return;
      const el = document.getElementById(`kpi-cust-${type}-${m}`);
      if (el) el.value = kpiFormatNum(kpiParseNum(val));
    });
    updateKpiCustomerMonthlyTotal(type);
  });
};

// ขอบเขตที่กำลังแก้ไขอยู่ในหน้านี้ตอนนี้: 'All' (KPI All) หรือชื่อ Group หนึ่งชื่อ
// window.__kpiDoc = เอกสารทั้งก้อนที่โหลดมาจาก server (ทุกขอบเขตรวมกัน)
// window.__kpiState = "มุมมองของขอบเขตที่เปิดอยู่" ชี้ไปที่ตัวเดียวกับ window.__kpiDoc เมื่อขอบเขตเป็น 'All' (ฟิลด์ของ
// All อยู่ที่ระดับบนสุดของเอกสารอยู่แล้ว) หรือชี้ไปที่ window.__kpiDoc.groups[ชื่อ] เมื่อเป็น Group - ฟังก์ชันเดิมทั้งหมด
// ที่อ่าน/เขียน window.__kpiState (ตาราง/ฟอร์มด้านล่าง) จึงทำงานเหมือนเดิมได้โดยไม่ต้องแก้ ไม่ว่ากำลังแก้ขอบเขตไหนอยู่
function kpiSetActiveScope(name) {
  window.__kpiScope = name || 'All';
  if (window.__kpiScope === 'All') {
    window.__kpiState = window.__kpiDoc;
  } else {
    window.__kpiDoc.groups = window.__kpiDoc.groups || {};
    if (!window.__kpiDoc.groups[window.__kpiScope]) window.__kpiDoc.groups[window.__kpiScope] = kpiDefaultScopeState();
    window.__kpiState = window.__kpiDoc.groups[window.__kpiScope];
  }
}

// รายชื่อ Group ให้เลือกในหน้านี้: รวมชื่อ Group ที่พบในไฟล์ข้อมูลที่ Import เข้าหน้า Dashboard ไว้แล้วในเซสชันนี้
// (getGroupOptionList มาจาก dashboard.html - เช็ค typeof กันพังถ้ายังไม่ได้ import ข้อมูล) กับชื่อ Group ที่เคยบันทึก
// เป้า KPI ไว้แล้ว (เผื่อเปิดหน้านี้โดยยังไม่ได้ import ไฟล์ที่มี Group นั้นในเซสชันนี้ ก็ยังเห็น/แก้ของเดิมได้)
function kpiAvailableGroups() {
  const fromData = (() => {
    try { return typeof getGroupOptionList === 'function' ? getGroupOptionList() : []; } catch (e) { return []; }
  })();
  const fromSaved = window.__kpiDoc && window.__kpiDoc.groups ? Object.keys(window.__kpiDoc.groups) : [];
  return Array.from(new Set(fromData.concat(fromSaved))).sort();
}

function kpiEscapeHtml(str) {
  return (str === null || str === undefined ? '' : String(str))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

window.switchKpiScope = function(name) {
  kpiSetActiveScope(name);
  const container = document.getElementById('view-kpisetting');
  if (container) kpiRenderAll(container);
};

async function renderKpiSetting() {
  const container = document.getElementById('view-kpisetting');
  if (!container) return;

  if (!document.getElementById('kpisetting-styles')) {
    const style = document.createElement('style');
    style.id = 'kpisetting-styles';
    style.innerHTML = `
      .kpiset-header {
        background-color: #0b2240;
        color: white;
        padding: 20px 30px;
        border-radius: 12px;
        margin-bottom: 25px;
        font-family: 'Outfit', sans-serif;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .kpiset-header h2 { margin: 0 0 4px 0; font-size: 22px; font-weight: 700; letter-spacing: 0.5px; }
      .kpiset-header p { margin: 0; font-size: 12px; color: #b9c6db; }
      .kpiset-header-actions { display: flex; gap: 10px; flex-wrap: wrap; }
      .kpiset-header-totals { display: flex; gap: 22px; flex-wrap: wrap; margin-top: 10px; }
      .kpiset-header-totals .stat { display: flex; flex-direction: column; gap: 2px; }
      .kpiset-header-totals .stat-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px; color: #8fa1bd; }
      .kpiset-header-totals .stat-value { font-size: 18px; font-weight: 700; color: #fce268; font-family: 'Outfit', sans-serif; }
      .kpiset-btn {
        border: none;
        border-radius: 20px;
        padding: 8px 18px;
        font-weight: 600;
        font-size: 13px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: opacity 0.15s;
      }
      .kpiset-btn:hover { opacity: 0.9; }
      .kpiset-btn-save { background: #15803d; color: white; }
      .kpiset-btn-reset { background: #fff; color: #b91c1c; border: 1px solid #f3c9c9; }

      .kpiset-card {
        background: #fff;
        border-radius: 16px;
        padding: 20px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.02);
        border: 1px solid #f0e6df;
        margin-bottom: 25px;
      }
      .kpiset-card h3 {
        font-size: 15px;
        font-weight: 700;
        color: #1e293b;
        margin: 0 0 4px 0;
      }
      .kpiset-card .kpiset-subtitle {
        font-size: 12px;
        color: #7a665e;
        margin: 0 0 15px 0;
      }
      .kpiset-card h4 {
        font-size: 13px;
        font-weight: 700;
        color: #7a665e;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin: 20px 0 10px 0;
      }
      .kpiset-card h4:first-of-type { margin-top: 0; }

      .kpiset-table-wrapper { overflow-x: auto; }
      .kpiset-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
        font-family: 'Inter', sans-serif;
      }
      .kpiset-table th {
        font-weight: 600;
        padding: 8px 6px;
        border-bottom: 2px solid #eee;
        white-space: nowrap;
        color: #444;
        background: #fafafa;
      }
      .kpiset-table td {
        padding: 4px;
        border-bottom: 1px solid #f5f5f5;
        white-space: nowrap;
      }
      .kpiset-table .kpiset-row-name {
        min-width: 150px;
        font-size: 12px;
        font-weight: 600;
        border: none;
        background: transparent;
        padding: 6px 4px;
        width: 100%;
        box-sizing: border-box;
      }
      .kpiset-input {
        width: 80px;
        padding: 6px 6px;
        font-size: 12px;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        text-align: right;
        box-sizing: border-box;
      }
      .kpiset-input:focus { border-color: #d95f1d; outline: none; }
      .kpiset-total-cell {
        font-weight: 700;
        text-align: right;
        color: #d95f1d;
        padding-right: 10px !important;
      }
      .kpiset-remove-btn {
        background: none;
        border: none;
        color: #cbd5e1;
        cursor: pointer;
        font-size: 13px;
        padding: 4px 6px;
      }
      .kpiset-remove-btn:hover { color: #b91c1c; }
      .kpiset-add-row-btn {
        margin-top: 10px;
        background: #fdf1e6;
        color: #d95f1d;
        border: 1px dashed #f68843;
        border-radius: 8px;
        padding: 6px 14px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .kpiset-add-row-btn:hover { background: #fce4d0; }

      .kpiset-setting-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 0;
        flex-wrap: wrap;
      }
      .kpiset-setting-row .kpiset-setting-label { flex: 1; min-width: 220px; font-size: 13px; color: #334155; font-weight: 600; }
      .kpiset-setting-row .kpiset-input { width: 100px; }
      .kpiset-unit-select {
        padding: 6px 10px;
        font-size: 12px;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
      }

      .kpiset-metric-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 0;
        border-bottom: 1px solid #f8fafc;
      }
      .kpiset-metric-row:last-child { border-bottom: none; }
      .kpiset-metric-label { font-size: 13px; color: #64748b; }
      .kpiset-metric-row .kpiset-input { width: 130px; }
      .kpiset-freq-value { font-size: 15px; font-weight: 700; color: #1e293b; }

      .kpiset-saved-note { font-size: 11px; color: #94a3b8; margin-top: -10px; margin-bottom: 20px; }

      .kpiset-scope-row {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        margin: 18px 0 10px 0;
        font-family: 'Inter', sans-serif;
      }
      .kpiset-scope-row label { font-size: 12.5px; font-weight: 700; color: #334155; display: flex; align-items: center; gap: 6px; }
      .kpiset-scope-select {
        padding: 7px 10px;
        font-size: 12.5px;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        background: #fff;
        min-width: 240px;
      }
      .kpiset-scope-hint { font-size: 11px; color: #94a3b8; }
      .kpiset-scope-banner {
        display: inline-block;
        font-size: 11.5px;
        font-weight: 700;
        color: #92400e;
        background: #fef3c7;
        border: 1px solid #fde68a;
        border-radius: 999px;
        padding: 4px 12px;
        margin-bottom: 14px;
      }
    `;
    document.head.appendChild(style);
  }

  container.innerHTML = '<p style="color:#6b7280;">กำลังโหลด KPI Setting...</p>';

  let state = null;
  try {
    state = await kpiFetchSavedState();
  } catch (e) {
    console.error('[KPI Setting]', e);
    container.innerHTML = '<p style="color:#b91c1c;">โหลด KPI Setting ไม่สำเร็จ กรุณารีเฟรชหน้านี้แล้วลองอีกครั้ง</p>';
    return;
  }

  // ยังไม่มีค่าที่บันทึกไว้ของ organization นี้ แต่เบราว์เซอร์นี้อาจมีค่าที่เวอร์ชันเก่าเคยเก็บไว้ -
  // ไม่ดึงเข้ามาเองโดยอัตโนมัติ เพราะค่านั้นอาจเป็นของบัญชีอื่นที่เคยใช้เบราว์เซอร์เดียวกัน
  if (!state && kpiCanEdit()) {
    const legacy = kpiReadLegacyLocalState();
    if (legacy) {
      const useIt = confirm('พบค่า KPI Setting ที่เคยบันทึกไว้ในเบราว์เซอร์นี้ (ระบบเวอร์ชันเก่า)\n\nต้องการนำมาใช้เป็นค่าขององค์กรนี้หรือไม่?\n- ตกลง: นำมาแสดงในหน้านี้ (ต้องกด "บันทึก" เพื่อเก็บลงระบบ)\n- ยกเลิก: ไม่ใช้ค่านั้น\n\nไม่ว่าเลือกแบบใด ค่าเก่าในเบราว์เซอร์จะถูกลบออก');
      if (useIt) state = kpiNormalizeState(legacy);
      kpiClearLegacyLocalState();
    }
  }

  window.__kpiDoc = state || kpiDefaultState();
  kpiSetActiveScope(window.__kpiScope || 'All'); // คงขอบเขตที่เปิดอยู่ตอนสลับแท็บไปมา - ครั้งแรกเป็น 'All' เสมอ
  kpiRenderAll(container);
}

function kpiRenderAll(container) {
  const state = window.__kpiState;
  const scope = window.__kpiScope || 'All';
  const scopeLabel = scope === 'All' ? 'KPI All (ภาพรวมทั้งหมด)' : `KPI Group: ${scope}`;

  const savedNote = state.savedAt
    ? `บันทึกล่าสุด (${scopeLabel}): ${new Date(state.savedAt).toLocaleString('th-TH')}`
    : `ยังไม่เคยบันทึก (${scopeLabel})`;

  const groupOptions = kpiAvailableGroups();

  container.innerHTML = `
    <div class="kpiset-header">
      <div>
        <h2>KPI Setting</h2>
        <p>กรอกเป้าหมาย KPI ด้วยมือ แล้วกดบันทึกเพื่อเก็บค่าไว้ใช้เปรียบเทียบในหน้า Dashboard</p>
        <div class="kpiset-header-totals">
          <div class="stat">
            <span class="stat-label">Total Sales Target (Year)</span>
            <span class="stat-value" id="kpiset-total-sales">0</span>
          </div>
          <div class="stat">
            <span class="stat-label">Total New Customer Target</span>
            <span class="stat-value" id="kpiset-total-newcust">0</span>
          </div>
          <div class="stat">
            <span class="stat-label">Total Old Customer Target</span>
            <span class="stat-value" id="kpiset-total-oldcust">0</span>
          </div>
        </div>
      </div>
      <div class="kpiset-header-actions">
        ${kpiCanEdit() ? `
        <button class="kpiset-btn kpiset-btn-reset" onclick="resetKpiSettings()"><i class="fas fa-undo"></i> ล้างค่า (${scope === 'All' ? 'KPI All' : kpiEscapeHtml(scope)})</button>
        <button class="kpiset-btn kpiset-btn-save" onclick="saveKpiSettings()"><i class="fas fa-save"></i> บันทึก</button>` : '<span style="color:#9ca3af;font-size:13px;">ดูได้อย่างเดียว - เฉพาะ Super Admin / Manager ที่แก้เป้า KPI ได้</span>'}
      </div>
    </div>

    <div class="kpiset-scope-row">
      <label for="kpi-scope-select"><i class="fas fa-layer-group"></i> KPI Group</label>
      <select class="kpiset-scope-select" id="kpi-scope-select" onchange="switchKpiScope(this.value)">
        <option value="All" ${scope === 'All' ? 'selected' : ''}>KPI All (ภาพรวมทั้งหมด ไม่แยก Group)</option>
        ${groupOptions.map(g => `<option value="${kpiEscapeHtml(g)}" ${scope === g ? 'selected' : ''}>${kpiEscapeHtml(g)}</option>`).join('')}
      </select>
      ${groupOptions.length === 0
        ? '<span class="kpiset-scope-hint">นำเข้าไฟล์ข้อมูล (Import Data) ก่อน เพื่อเลือกตั้งเป้าเฉพาะ Group</span>'
        : '<span class="kpiset-scope-hint">เลือก Group เพื่อตั้งเป้าแยกเฉพาะกลุ่มนั้น (คนละชุดข้อมูลกับ KPI All)</span>'}
    </div>
    <div class="kpiset-scope-banner">กำลังตั้งค่า: ${kpiEscapeHtml(scopeLabel)}</div>
    <div class="kpiset-saved-note">${savedNote}</div>

    <div class="kpiset-card">
      <h3>1. KPI ยอดขาย</h3>
      <p class="kpiset-subtitle">เป้าหมายยอดขายรายเดือน แยกตามสินค้าและช่องทาง</p>

      <h4>1.1 By Product</h4>
      <div class="kpiset-table-wrapper" id="kpi-product-table-wrapper">
        ${kpiBuildRowTable('byProduct', 'prod', state.byProduct)}
      </div>
      <button class="kpiset-add-row-btn" onclick="addKpiRow('byProduct')"><i class="fas fa-plus"></i> เพิ่มแถวสินค้า</button>

      <h4>1.2 By Channel</h4>
      <div class="kpiset-table-wrapper" id="kpi-channel-table-wrapper">
        ${kpiBuildRowTable('byChannel', 'chan', state.byChannel)}
      </div>
      <button class="kpiset-add-row-btn" onclick="addKpiRow('byChannel')"><i class="fas fa-plus"></i> เพิ่มแถวช่องทาง</button>
    </div>

    <div class="kpiset-card">
      <h3>2. KPI Customer</h3>
      <p class="kpiset-subtitle">ให้สามารถเลือกกำหนดได้ 2 แบบ คือ แบบ % หรือ แบบจำนวนคนต่อเดือน</p>

      <div class="kpiset-setting-row">
        <span class="kpiset-setting-label">2.1 เพิ่มจำนวนลูกค้าเก่า</span>
        <input type="text" inputmode="decimal" class="kpiset-input" id="kpi-cust-setting-old-value" value="${kpiFormatNum(state.customerSetting.old.value)}" placeholder="0">
        <select class="kpiset-unit-select" id="kpi-cust-setting-old-unit">
          <option value="%" ${state.customerSetting.old.unit === '%' ? 'selected' : ''}>% ต่อเดือน</option>
          <option value="count" ${state.customerSetting.old.unit === 'count' ? 'selected' : ''}>จำนวนคน/เดือน</option>
        </select>
      </div>
      <div class="kpiset-setting-row">
        <span class="kpiset-setting-label">2.1 เพิ่มจำนวนลูกค้าใหม่</span>
        <input type="text" inputmode="decimal" class="kpiset-input" id="kpi-cust-setting-new-value" value="${kpiFormatNum(state.customerSetting.new.value)}" placeholder="0">
        <select class="kpiset-unit-select" id="kpi-cust-setting-new-unit">
          <option value="%" ${state.customerSetting.new.unit === '%' ? 'selected' : ''}>% ต่อเดือน</option>
          <option value="count" ${state.customerSetting.new.unit === 'count' ? 'selected' : ''}>จำนวนคน/เดือน</option>
        </select>
      </div>

      <h4>KPI Customer รายเดือน</h4>
      <div class="kpiset-table-wrapper" id="kpi-customer-table-wrapper">
        ${kpiBuildCustomerMonthlyTable(state.customerMonthly)}
      </div>
    </div>

    <div class="kpiset-card">
      <h3>3. KPI CRM Metric</h3>
      <div class="kpiset-metric-row">
        <span class="kpiset-metric-label">จำนวนลูกค้าทั้งหมด (คน)</span>
        <input type="text" inputmode="decimal" class="kpiset-input" id="kpi-crm-totalCustomers" value="${kpiFormatNum(state.crm.totalCustomers)}" placeholder="0" oninput="updateKpiFrequency()">
      </div>
      <div class="kpiset-metric-row">
        <span class="kpiset-metric-label">AOV Average Order Value (ยอดเฉลี่ยต่อบิล)</span>
        <input type="text" inputmode="decimal" class="kpiset-input" id="kpi-crm-aov" value="${kpiFormatNum(state.crm.aov)}" placeholder="0" oninput="updateKpiFrequency()">
      </div>
      <div class="kpiset-metric-row">
        <span class="kpiset-metric-label">SPH Spending per Head (เฉลี่ยซื้อต่อคน)</span>
        <input type="text" inputmode="decimal" class="kpiset-input" id="kpi-crm-sph" value="${kpiFormatNum(state.crm.sph)}" placeholder="0" oninput="updateKpiFrequency()">
      </div>
      <div class="kpiset-metric-row">
        <span class="kpiset-metric-label">Frequency (SPH/AOV) (ความถี่ซื้อ) <span style="color:#94a3b8;">&lt;-- สูตร auto</span></span>
        <span class="kpiset-freq-value" id="kpi-crm-freq">0.00</span>
      </div>
      <div class="kpiset-metric-row">
        <span class="kpiset-metric-label">Retention rate (อัตราการซื้อซ้ำ) (%)</span>
        <input type="text" inputmode="decimal" class="kpiset-input" id="kpi-crm-retention" value="${kpiFormatNum(state.crm.retention)}" placeholder="0">
      </div>
    </div>
  `;

  updateKpiFrequency();
  updateKpiHeaderTotals();
}

// Recomputes the header stat chips from whatever is currently in the DOM (not saved state),
// so it stays live as the user types/pastes, matching the per-row/per-table totals below.
window.updateKpiHeaderTotals = function() {
  const salesEl = document.getElementById('kpiset-total-sales');
  const newEl = document.getElementById('kpiset-total-newcust');
  const oldEl = document.getElementById('kpiset-total-oldcust');
  if (!salesEl || !window.__kpiState) return;

  let salesTotal = 0;
  (window.__kpiState.byChannel || []).forEach((row, r) => {
    for (let m = 0; m < 12; m++) {
      const el = document.getElementById(`kpi-chan-${r}-${m}`);
      salesTotal += kpiParseNum(el ? el.value : 0);
    }
  });
  salesEl.textContent = kpiFormatNum(salesTotal) || '0';

  ['new', 'old'].forEach(type => {
    let total = 0;
    for (let m = 0; m < 12; m++) {
      const el = document.getElementById(`kpi-cust-${type}-${m}`);
      total += kpiParseNum(el ? el.value : 0);
    }
    const el = type === 'new' ? newEl : oldEl;
    if (el) el.textContent = kpiFormatNum(total) || '0';
  });
};

function kpiBuildRowTable(sectionKey, prefix, rows) {
  return `
    <table class="kpiset-table">
      <thead>
        <tr>
          <th style="text-align:left;">สินค้า/ช่องทาง</th>
          ${KPI_MONTHS.map(m => `<th>${m}</th>`).join('')}
          <th>Total</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="kpi-${prefix}-tbody">
        ${rows.map((row, r) => kpiBuildRowTr(sectionKey, prefix, r, row)).join('')}
      </tbody>
    </table>
  `;
}

function kpiBuildRowTr(sectionKey, prefix, r, row) {
  return `
    <tr>
      <td><input type="text" class="kpiset-row-name" id="kpi-${prefix}-name-${r}" value="${row.name}" onchange="syncKpiRowName('${sectionKey}', ${r}, this.value)"></td>
      ${row.values.map((v, m) => `
        <td><input type="text" inputmode="decimal" class="kpiset-input" id="kpi-${prefix}-${r}-${m}" value="${kpiFormatNum(v)}" placeholder="0" oninput="updateKpiRowTotal('${prefix}', ${r})" onpaste="handleKpiRowPaste(event, '${sectionKey}', '${prefix}', ${r}, ${m})"></td>
      `).join('')}
      <td class="kpiset-total-cell" id="kpi-${prefix}-total-${r}">${kpiFormatNum(kpiRowTotal(row.values)) || 0}</td>
      <td><button class="kpiset-remove-btn" onclick="removeKpiRow('${sectionKey}', '${prefix}', ${r})" title="ลบแถว"><i class="fas fa-times"></i></button></td>
    </tr>
  `;
}

function kpiBuildCustomerMonthlyTable(customerMonthly) {
  const labels = { old: 'เพิ่มจำนวนลูกค้าเก่า', new: 'เพิ่มจำนวนลูกค้าใหม่' };
  return `
    <table class="kpiset-table">
      <thead>
        <tr>
          <th style="text-align:left;">KPI Customer</th>
          ${KPI_MONTHS.map(m => `<th>${m}</th>`).join('')}
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${['old', 'new'].map(type => `
          <tr>
            <td style="font-weight:600;">${labels[type]}</td>
            ${customerMonthly[type].map((v, m) => `
              <td><input type="text" inputmode="decimal" class="kpiset-input" id="kpi-cust-${type}-${m}" value="${kpiFormatNum(v)}" placeholder="0" oninput="updateKpiCustomerMonthlyTotal('${type}')" onpaste="handleKpiCustomerPaste(event, '${type}', ${m})"></td>
            `).join('')}
            <td class="kpiset-total-cell" id="kpi-cust-total-${type}">${kpiFormatNum(kpiRowTotal(customerMonthly[type])) || 0}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// --- Live update handlers ---

window.updateKpiRowTotal = function(prefix, r) {
  let total = 0;
  for (let m = 0; m < 12; m++) {
    const el = document.getElementById(`kpi-${prefix}-${r}-${m}`);
    total += kpiParseNum(el ? el.value : 0);
  }
  const totalCell = document.getElementById(`kpi-${prefix}-total-${r}`);
  if (totalCell) totalCell.textContent = kpiFormatNum(total) || '0';
  updateKpiHeaderTotals();
};

window.updateKpiCustomerMonthlyTotal = function(type) {
  let total = 0;
  for (let m = 0; m < 12; m++) {
    const el = document.getElementById(`kpi-cust-${type}-${m}`);
    total += kpiParseNum(el ? el.value : 0);
  }
  const totalCell = document.getElementById(`kpi-cust-total-${type}`);
  if (totalCell) totalCell.textContent = kpiFormatNum(total) || '0';
  updateKpiHeaderTotals();
};

window.updateKpiFrequency = function() {
  const aovEl = document.getElementById('kpi-crm-aov');
  const sphEl = document.getElementById('kpi-crm-sph');
  const freqEl = document.getElementById('kpi-crm-freq');
  if (!aovEl || !sphEl || !freqEl) return;
  const aov = kpiParseNum(aovEl.value);
  const sph = kpiParseNum(sphEl.value);
  freqEl.textContent = aov > 0 ? (sph / aov).toFixed(2) : '0.00';
};

window.syncKpiRowName = function(sectionKey, r, value) {
  if (window.__kpiState && window.__kpiState[sectionKey] && window.__kpiState[sectionKey][r]) {
    window.__kpiState[sectionKey][r].name = value;
  }
};

// ดึงค่าปัจจุบันจาก DOM กลับเข้า state ก่อนที่จะ rebuild ตาราง (กันข้อมูลที่พิมพ์ไว้หายตอนเพิ่ม/ลบแถว)
function kpiSyncRowTableFromDom(sectionKey, prefix) {
  const rows = window.__kpiState[sectionKey];
  rows.forEach((row, r) => {
    const nameEl = document.getElementById(`kpi-${prefix}-name-${r}`);
    if (nameEl) row.name = nameEl.value;
    for (let m = 0; m < 12; m++) {
      const el = document.getElementById(`kpi-${prefix}-${r}-${m}`);
      if (el) row.values[m] = kpiParseNum(el.value) || null;
    }
  });
}

window.addKpiRow = function(sectionKey) {
  const prefix = sectionKey === 'byProduct' ? 'prod' : 'chan';
  kpiSyncRowTableFromDom(sectionKey, prefix);
  window.__kpiState[sectionKey].push({
    name: sectionKey === 'byProduct' ? 'สินค้าใหม่' : 'ช่องทางใหม่',
    values: Array(12).fill(null)
  });
  const wrapper = document.getElementById(`kpi-${sectionKey === 'byProduct' ? 'product' : 'channel'}-table-wrapper`);
  if (wrapper) wrapper.innerHTML = kpiBuildRowTable(sectionKey, prefix, window.__kpiState[sectionKey]);
  updateKpiHeaderTotals();
};

window.removeKpiRow = function(sectionKey, prefix, r) {
  kpiSyncRowTableFromDom(sectionKey, prefix);
  window.__kpiState[sectionKey].splice(r, 1);
  const wrapper = document.getElementById(`kpi-${sectionKey === 'byProduct' ? 'product' : 'channel'}-table-wrapper`);
  if (wrapper) wrapper.innerHTML = kpiBuildRowTable(sectionKey, prefix, window.__kpiState[sectionKey]);
  updateKpiHeaderTotals();
};

// --- Save / Reset ---

function kpiCollectStateFromDom() {
  const state = window.__kpiState;

  kpiSyncRowTableFromDom('byProduct', 'prod');
  kpiSyncRowTableFromDom('byChannel', 'chan');

  state.customerSetting.old.value = kpiParseNum(document.getElementById('kpi-cust-setting-old-value').value) || null;
  state.customerSetting.old.unit = document.getElementById('kpi-cust-setting-old-unit').value;
  state.customerSetting.new.value = kpiParseNum(document.getElementById('kpi-cust-setting-new-value').value) || null;
  state.customerSetting.new.unit = document.getElementById('kpi-cust-setting-new-unit').value;

  ['old', 'new'].forEach(type => {
    for (let m = 0; m < 12; m++) {
      const el = document.getElementById(`kpi-cust-${type}-${m}`);
      state.customerMonthly[type][m] = el ? (kpiParseNum(el.value) || null) : null;
    }
  });

  state.crm.totalCustomers = kpiParseNum(document.getElementById('kpi-crm-totalCustomers').value) || null;
  state.crm.aov = kpiParseNum(document.getElementById('kpi-crm-aov').value) || null;
  state.crm.sph = kpiParseNum(document.getElementById('kpi-crm-sph').value) || null;
  state.crm.retention = kpiParseNum(document.getElementById('kpi-crm-retention').value) || null;

  return state;
}

// ส่งค่าไปยังคลัง window.kpiSettingsData ที่หน้า CRM Dashboard ใช้ (ปุ่ม KPI Compare + การ์ด 10 ใบ)
// ใช้ร่วมกันทั้งตอนกดบันทึก และตอนโหลดหน้าครั้งแรก (preload จาก /api/kpi)
function kpiApplyStateToGlobalSettings(state) {
  // เริ่มจากศูนย์ทุกครั้ง (ไม่ต่อยอดจากค่าเดิม) เพื่อให้ค่าที่ล้าง/ไม่ได้ตั้ง กลายเป็น "ไม่มีเป้า" จริงๆ
  // ไม่ค้างค่าจากการโหลดครั้งก่อน
  window.kpiSettingsData = { salesYTD: 0, totalCust: 0, newCustYTD: 0 };

  const onlineRow = (state.byChannel || []).find(r => (r.name || '').trim().toLowerCase() === 'online') || (state.byChannel || [])[0];
  if (onlineRow) {
    window.kpiSettingsData.salesYTD = kpiRowTotal(onlineRow.values); // รวมทั้งปี (fallback)
    window.kpiSettingsData.monthlyOnlineSales = onlineRow.values.map(v => v || 0); // เป้าต่อเดือน ใช้คำนวณ YTD-to-date และการ์ดยอดขายรายเดือน
  }

  window.kpiSettingsData.totalCust = (state.crm && state.crm.totalCustomers) || 0;
  window.kpiSettingsData.aov = (state.crm && state.crm.aov) || 0;
  window.kpiSettingsData.sph = (state.crm && state.crm.sph) || 0;
  // Frequency เป้าหมาย = SPH/AOV เหมือนสูตร auto ในหน้านี้
  window.kpiSettingsData.frequency = (state.crm && state.crm.aov && state.crm.sph) ? (state.crm.sph / state.crm.aov) : 0;

  if (state.customerMonthly) {
    window.kpiSettingsData.monthlyCustomerNew = (state.customerMonthly.new || []).map(v => v || 0);
    window.kpiSettingsData.monthlyCustomerOld = (state.customerMonthly.old || []).map(v => v || 0);
    window.kpiSettingsData.newCustYTD = kpiRowTotal(state.customerMonthly.new || []); // รวมทั้งปี (fallback)
  }
}

// เลือก state ของขอบเขตที่ตรงกับ Group ที่กำลังดูอยู่บน Dashboard (ใช้เทียบ KPI Compare) - ถ้า Group นั้นไม่เคยตั้ง
// เป้าไว้ คืนค่า default (เป้า 0 = "ไม่มีเป้า") ไม่ fallback ไปใช้เป้าของ KPI All เพราะสองขอบเขตนี้แยกจากกันโดยเจตนา
function kpiScopeStateFromDoc(doc, groupName) {
  if (!doc) return kpiDefaultScopeState();
  if (!groupName || groupName === 'All') return doc;
  return (doc.groups && doc.groups[groupName]) || kpiDefaultScopeState();
}

// อัปเดต window.kpiSettingsData (ที่ badge KPI Compare บน Dashboard อ่าน) ให้ตรงกับ Group ที่ filter บน Overview
// เลือกอยู่ตอนนี้ - dashboard.html เรียกฟังก์ชันนี้เองทุกครั้งที่สลับ Group filter (ดู setGroup ใน dashboard.html)
window.kpiApplyScopedSettings = function(groupName) {
  if (!window.__kpiRemoteDoc) return;
  kpiApplyStateToGlobalSettings(kpiScopeStateFromDoc(window.__kpiRemoteDoc, groupName));
};

// เซฟเอกสารที่เพิ่งบันทึก/ล้างค่าไว้เป็น "ค่าล่าสุดจาก server" แล้วรีเฟรช badge บน Dashboard ให้ตรงกับ Group filter
// ที่เปิดอยู่ตอนนี้ (อาจเป็นคนละ Group กับขอบเขตที่เพิ่งแก้ในหน้านี้ก็ได้ - อ่านจาก filters.Group ของ Dashboard เอง)
function kpiRefreshDashboardBadges(doc) {
  window.__kpiRemoteDoc = doc;
  const activeGroup = (typeof filters !== 'undefined' && filters.Group) || 'All';
  window.kpiApplyScopedSettings(activeGroup);
  if (typeof rawData !== 'undefined' && rawData.length > 0 && typeof applyFilters === 'function') applyFilters();
}

window.saveKpiSettings = async function() {
  if (!kpiCanEdit()) { alert('เฉพาะ Super Admin / Manager ที่แก้ KPI Setting ได้'); return; }
  kpiCollectStateFromDom(); // แก้ window.__kpiState ซึ่งเป็น object เดียวกับขอบเขตที่เปิดอยู่ใน window.__kpiDoc อยู่แล้ว
  window.__kpiState.savedAt = new Date().toISOString(); // ประทับเวลาเฉพาะขอบเขตที่บันทึก ไม่กระทบขอบเขตอื่น

  let savedDoc;
  try {
    const res = await fetch('/api/kpi', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(window.__kpiDoc) // ส่งทั้งเอกสาร (ทุกขอบเขต) เพราะ server เก็บเป็นก้อนเดียวต่อองค์กร
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || ('HTTP ' + res.status));
    savedDoc = kpiNormalizeState(body.data);
  } catch (e) {
    console.error('[KPI Setting] บันทึกไม่สำเร็จ', e);
    alert('บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง\n' + e.message);
    return;
  }

  window.__kpiDoc = savedDoc;
  kpiSetActiveScope(window.__kpiScope); // ชี้ window.__kpiState ไปที่ object ใหม่ในขอบเขตเดิม
  kpiRefreshDashboardBadges(savedDoc);

  const container = document.getElementById('view-kpisetting');
  if (container) kpiRenderAll(container);

  alert('บันทึก KPI Setting สำเร็จ');
};

window.resetKpiSettings = async function() {
  if (!kpiCanEdit()) { alert('เฉพาะ Super Admin / Manager ที่แก้ KPI Setting ได้'); return; }
  const scope = window.__kpiScope || 'All';
  const scopeLabel = scope === 'All' ? 'KPI All (ภาพรวมทั้งหมด)' : `Group "${scope}"`;
  if (!confirm(`ต้องการล้างค่า ${scopeLabel} หรือไม่? (ขอบเขตอื่นจะไม่ถูกล้าง)`)) return;

  // ล้างเฉพาะขอบเขตที่กำลังเปิดอยู่ แล้วบันทึกทั้งเอกสารทับ (เหมือนกด "บันทึก" ด้วยค่าว่าง) - ขอบเขตอื่นในเอกสารเดิม
  // ไม่ถูกแตะต้อง ต่างจากเดิมที่ปุ่มนี้เคยลบค่า KPI ทั้งองค์กรทิ้งทั้งหมด
  const cleared = kpiDefaultScopeState();
  if (scope === 'All') {
    Object.assign(window.__kpiDoc, cleared);
  } else {
    window.__kpiDoc.groups = window.__kpiDoc.groups || {};
    window.__kpiDoc.groups[scope] = cleared;
  }
  kpiSetActiveScope(scope);

  try {
    const res = await fetch('/api/kpi', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(window.__kpiDoc)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || ('HTTP ' + res.status));
    window.__kpiDoc = kpiNormalizeState(body.data);
    kpiSetActiveScope(scope);
  } catch (e) {
    console.error('[KPI Setting] ล้างค่าไม่สำเร็จ', e);
    alert('ล้างค่าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง\n' + e.message);
    return;
  }

  kpiRefreshDashboardBadges(window.__kpiDoc);
  const container = document.getElementById('view-kpisetting');
  if (container) kpiRenderAll(container);
};

// โหลดค่าที่ organization นี้บันทึกไว้ (ถ้ามี) เข้า window.kpiSettingsData ตอนเปิดหน้า ตามขอบเขตที่ตรงกับ Group filter
// ของ Dashboard ในเซสชันนี้ (ปกติคือ 'All' ตอนเพิ่งเปิดหน้า) เพื่อให้ CRM Dashboard / Insight Hub ใช้ค่าที่ตั้งไว้ได้
// แม้ยังไม่เคยเปิดหน้า KPI Setting ในเซสชันนี้ - ถ้ายังไม่เคยบันทึก (หรือโหลดไม่สำเร็จ) จะเป็นค่าเริ่มต้น "ไม่มีเป้า" (0)
// ซึ่งหน้า Dashboard แสดงเป็น "KPI -"
(async function kpiPreloadSettings() {
  try {
    const doc = await kpiFetchSavedState();
    window.__kpiRemoteDoc = doc || kpiDefaultState();
    const activeGroup = (typeof filters !== 'undefined' && filters.Group) || 'All';
    window.kpiApplyScopedSettings(activeGroup);
    // ข้อมูลอาจ Import เสร็จไปก่อนที่ค่า KPI จะโหลดมาถึง - วาดการ์ดใหม่ให้ badge ใช้เป้าที่ถูกต้อง
    if (typeof rawData !== 'undefined' && rawData.length > 0 && typeof applyFilters === 'function') applyFilters();
  } catch (e) {
    // ยังไม่ได้ล็อกอิน / เครือข่ายขัดข้อง: ใช้ค่าเริ่มต้นต่อไป (ไม่มีเป้า)
  }
})();
