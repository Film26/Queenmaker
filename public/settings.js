// public/settings.js

const SETTINGS_STORAGE_KEY = 'qm_settings_v1';

const SETTINGS_CATEGORIES = [
  { key: 'Channel', label: 'Channel', sub: 'ช่องทางการขาย', icon: 'fa-bullhorn' },
  { key: 'SubChannel', label: 'Sub Channel', sub: 'ช่องทางการขายย่อย', icon: 'fa-code-branch' },
  { key: 'Product', label: 'Product', sub: 'สินค้าหลัก', icon: 'fa-box' },
  { key: 'SubProduct', label: 'Sub Product', sub: 'สินค้าย่อย', icon: 'fa-boxes-stacked' },
  { key: 'Admin', label: 'Admin', sub: 'ผู้ดูแลระบบ/แอดมิน', icon: 'fa-user-shield' }
];

// Product/SubProduct เป็น "กลุ่ม" ที่ต้อง Mapping กับค่าดิบจากคอลัมน์สินค้าในไฟล์ที่ import เข้ามาจริง
// (แต่ละ item จะมี rawValues: string[] เพิ่มจากหมวดอื่นๆ ที่เป็นแค่รายชื่อเฉยๆ) ต่างจาก Channel/SubChannel/Admin
// ซึ่งยังเป็นแค่รายชื่อ dropdown ธรรมดา ไม่มี mapping - เพราะ dashboard.html จับ Channel/SubChannel/Admin จาก
// คอลัมน์จริงตรงๆ อยู่แล้ว (ดู getNormalizedChannel/getNormalizedSubChannel/getNormalizedAdmin) มีแค่ Product/
// SubProduct เท่านั้นที่เดิมเคยเดาหมวดหมู่จากคำในชื่อสินค้าแบบ hardcode แล้วผู้ใช้อยากให้เปลี่ยนมาเป็นตั้งค่าเอง
const STG_MAPPED_CATEGORIES = ['Product', 'SubProduct'];
function stgIsMappedCategory(category) {
  return STG_MAPPED_CATEGORIES.indexOf(category) !== -1;
}
// คอลัมน์ดิบในไฟล์ import ที่แต่ละหมวด mapping จับข้อมูลมา (ต้องตรงกับ getNormalizedProduct/
// getNormalizedSubProduct ใน dashboard.html ไม่งั้นค่าดิบที่เห็นในหน้า Settings จะไม่ตรงกับที่ Filter ใช้จริง)
const STG_RAW_COLUMN_KEYS = {
  Product: ['Product', 'ชื่อสินค้า'],
  SubProduct: ['Product Set', 'Sub Product', 'SubProduct', 'รายการขาย']
};

// ดึงค่าดิบที่พบจริงในข้อมูลที่ import เข้ามา (rawData/getRowValue/isSaleOrder ประกาศอยู่ใน dashboard.html
// แต่ share scope เดียวกันเพราะโหลดในหน้าเดียวกัน - เช็ค typeof กันพังตอนถูกโหลดในบริบทอื่น)
function stgGetRawProductValues(category) {
  const keys = STG_RAW_COLUMN_KEYS[category];
  if (!keys) return [];
  const values = new Set();
  const data = (typeof rawData !== 'undefined') ? rawData : [];
  data.forEach(row => {
    if (typeof isSaleOrder === 'function' && !isSaleOrder(row)) return;
    const v = typeof getRowValue === 'function' ? getRowValue(row, keys) : '';
    if (v) values.add(v.toString().trim());
  });
  return Array.from(values).sort();
}

// ค่าดิบไหนถูกผูก (map) กับกลุ่มไหนอยู่แล้วบ้าง คืนเป็น { rawValueตัวพิมพ์เล็ก: groupId }
function stgGetRawValueOwnerMap(category) {
  const items = window.AppData.config[category] || [];
  const map = {};
  items.forEach(item => {
    (item.rawValues || []).forEach(rv => { map[(rv || '').toString().trim().toLowerCase()] = item.id; });
  });
  return map;
}

function stgGroupNameById(category, id) {
  const it = (window.AppData.config[category] || []).find(x => x.id === id);
  return it ? it.name : '';
}

const SETTINGS_ROLES = ['Super Admin', 'Manager', 'Sales Admin'];

// หน้าที่ (สิทธิ์การเข้าถึง) ของแต่ละ Role — อิงตามสิทธิ์จริงที่ระบบบังคับใช้อยู่ตอนนี้:
// เมนู Settings ถูกจำกัดให้ Super Admin เห็น/เข้าถึงได้เท่านั้น (ดู checkSessionOrRedirect ใน dashboard.html)
// ส่วน Sales Admin จะเห็นข้อมูล (Overview/Executive/Retention/Cohort ฯลฯ) เฉพาะของตัวเองเท่านั้น กรองด้วย
// ชื่อแอดมิน (adminName) ที่ตั้งไว้ตอนสร้าง/แก้ไขผู้ใช้งาน (ดู scopeRowsForCurrentUser ใน dashboard.html) -
// Super Admin/Manager เห็นข้อมูลทั้งหมดเหมือนเดิม
const SETTINGS_ROLE_PERMISSIONS = {
  'Super Admin': 'เข้าถึงข้อมูลทั้งหมด และจัดการระบบ (Settings)',
  'Manager': 'เข้าถึงข้อมูลทั้งหมด ยกเว้นหน้า Settings',
  'Sales Admin': 'เข้าถึงเฉพาะข้อมูลของตัวเอง (ตามชื่อแอดมิน) ยกเว้นหน้า Settings'
};

function stgRolePermission(role) {
  return SETTINGS_ROLE_PERMISSIONS[role] || '-';
}

// --- Demo default data (ใช้ตอนยังไม่เคยบันทึกอะไรเลย) ---
function settingsDefaultState() {
  const mk = (names) => names.map(name => ({ id: stgUid(), name, active: true }));
  return {
    config: {
      Channel: mk(['Call', 'CRM', 'Facebook', 'Instagram', 'Lazada', 'Line', 'Shopee', 'Tiktok']),
      SubChannel: mk(['FB', 'IG', 'Line', 'Lazada', 'Shopee', 'Tiktok', 'Website', 'Telesale']),
      Product: mk(['Plus', 'Gold', 'Wiss', 'Kides', 'Collagen']),
      SubProduct: mk(['Plus', 'Gold', 'Wiss', 'Kides original', 'Kidesส้ม', 'Kides แตงโม', 'Callagen']),
      Admin: mk(['May', 'บี', 'มิ้ว', 'แอน', 'แอล'])
    },
    users: [
      { id: stgUid(), username: 'admin', password: 'admin123', name: 'ผู้ดูแลระบบ', role: 'Super Admin', permission: SETTINGS_ROLE_PERMISSIONS['Super Admin'], active: true, createdAt: new Date().toISOString() }
    ]
  };
}

function stgUid() {
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

function stgEscapeHtml(str) {
  return (str === null || str === undefined ? '' : String(str))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// --- Local (demo) persistence ---
function settingsLoadLocal() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return settingsDefaultState();
    const parsed = JSON.parse(raw);
    const def = settingsDefaultState();
    if (!parsed.config) parsed.config = def.config;
    SETTINGS_CATEGORIES.forEach(c => { if (!Array.isArray(parsed.config[c.key])) parsed.config[c.key] = def.config[c.key]; });
    if (!Array.isArray(parsed.users) || parsed.users.length === 0) parsed.users = def.users;
    return parsed;
  } catch (e) {
    console.error('[Settings] โหลดข้อมูลไม่สำเร็จ', e);
    return settingsDefaultState();
  }
}

function settingsSaveLocal(state) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(state));
}

// --- Async API layer: เรียก CrmApi จริงถ้ามี ไม่งั้น fallback เป็น Demo Mode (localStorage) ---
function settingsApiGetConfig() {
  if (window.CrmApi && typeof window.CrmApi.getConfig === 'function') {
    return Promise.resolve(window.CrmApi.getConfig());
  }
  return Promise.resolve(settingsLoadLocal().config);
}

function settingsApiSaveConfig(category, items) {
  if (window.CrmApi && typeof window.CrmApi.saveConfig === 'function') {
    return Promise.resolve(window.CrmApi.saveConfig(category, items));
  }
  const state = settingsLoadLocal();
  state.config[category] = items;
  settingsSaveLocal(state);
  return Promise.resolve(items);
}

function settingsApiGetUsers() {
  if (window.CrmApi && typeof window.CrmApi.getUsers === 'function') {
    return Promise.resolve(window.CrmApi.getUsers());
  }
  return Promise.resolve(settingsLoadLocal().users);
}

function settingsApiSaveUsers(users) {
  if (window.CrmApi && typeof window.CrmApi.saveUsers === 'function') {
    return Promise.resolve(window.CrmApi.saveUsers(users));
  }
  const state = settingsLoadLocal();
  state.users = users;
  settingsSaveLocal(state);
  return Promise.resolve(users);
}

// --- InsightHub Apps Script connection (Redis-backed, shared across the whole team -
// see lib/insightHubConfigStore.js / api/insighthub/config.js) ---
function settingsApiGetInsightHubConfig() {
  return fetch('/api/insighthub/config', { credentials: 'same-origin' })
    .then(res => { if (!res.ok) throw new Error('โหลดการตั้งค่า InsightHub ไม่สำเร็จ'); return res.json(); });
}
function settingsApiSaveInsightHubConfig(scriptUrl) {
  return fetch('/api/insighthub/config', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scriptUrl })
  }).then(res => res.json().then(data => {
    if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
    return data;
  }));
}

// --- Shared app state ---
window.DEFAULT_STATUS_OPTIONS = window.DEFAULT_STATUS_OPTIONS || ["คุยแล้ว", "ยังไม่รับสาย", "ไม่สะดวกให้โทร", "ไม่ได้ทานแล้ว", "สนใจซื้อซ้ำ", "รอโปรโมชั่น", "ขอคิดดูก่อน", "ปิดการขายแล้ว", "เปลี่ยนไปใช้ยี่ห้ออื่น", "ติดต่อไม่ได้", "เบอร์ผิด/ไม่ใช่ลูกค้า"];
// Mirrors google-apps-script/InsightHub-Code.gs's DEFAULT_APP_CONFIG so InsightHub has sensible
// values before the first successful fetch.
window.DEFAULT_APP_CONFIG = window.DEFAULT_APP_CONFIG || {
  loyaltyIndex: { seedlingMaxDays: 45, regularMaxDays: 180, veteranMaxDays: 365 },
  adminPriorityMatrix: {
    "NEW|NEW": "Medium", "NEW|ACTIVE": "Medium", "NEW|REFILL": "High", "NEW|RISK": "Medium", "NEW|CHURN": "Medium",
    "ACTIVE|NEW": "Medium", "ACTIVE|ACTIVE": "Low", "ACTIVE|REFILL": "High", "ACTIVE|RISK": "Low", "ACTIVE|CHURN": "Win-back",
    "RISK|NEW": "Medium", "RISK|ACTIVE": "Low", "RISK|REFILL": "High", "RISK|RISK": "Medium", "RISK|CHURN": "Win-back",
    "CHURN|NEW": "Medium", "CHURN|ACTIVE": "Low", "CHURN|REFILL": "High", "CHURN|RISK": "Win-back", "CHURN|CHURN": "Win-back"
  },
  trendVisual: { neutralBandPercent: 0, interpolateCurrentYear: true },
  refillBuffer: 1.1
};
window.AppData = window.AppData || {};
window.AppData.config = window.AppData.config || {};
window.AppData.statusOptions = window.AppData.statusOptions || window.DEFAULT_STATUS_OPTIONS.slice();
window.AppData.appConfig = window.AppData.appConfig || JSON.parse(JSON.stringify(window.DEFAULT_APP_CONFIG));
window.AppData.insightHubScriptUrl = window.AppData.insightHubScriptUrl || '';
window.AppData.users = window.AppData.users || [];

let __settingsUi = { mainTab: 'config', configTab: 'Channel' };

// --- Real-time propagation: แจ้งหน้าอื่น (dashboard/insighthub ฯลฯ) ทุกครั้งที่ AppData เปลี่ยนแปลงสำเร็จ ---
// type: 'config' (Channel/SubChannel/Product/SubProduct/Admin) หรือ 'users'
// ฟังก์ชันนี้แค่ dispatch event เฉยๆ ไม่เรียก render ใดๆ กลับมาเอง จึงไม่มีทางเกิด infinite loop
function stgNotifyChange(type, extra) {
  try {
    window.dispatchEvent(new CustomEvent('appDataChanged', Object.assign({}, { detail: Object.assign({ type: type }, extra || {}) })));
  } catch (e) {
    console.error('[Settings] แจ้งเตือนการเปลี่ยนแปลงข้อมูลไม่สำเร็จ', e);
  }
}

// โหลดข้อมูล config/users เข้า window.AppData ทันทีที่ไฟล์นี้ถูกโหลด (ไม่ต้องรอให้ผู้ใช้เปิดหน้า Settings ก่อน)
// เพื่อให้หน้าอื่น (เช่น Filter Dropdown บน Dashboard) มีข้อมูลล่าสุดพร้อมใช้ตั้งแต่ต้น
// และยิง appDataChanged อีกครั้งเผื่อกรณีมีการโหลดข้อมูลจาก CrmApi จริงที่เป็น async (ช้ากว่าตอนสคริปต์อื่น attach listener)
(function settingsPreload() {
  Promise.all([settingsApiGetConfig(), settingsApiGetUsers()]).then(([config, users]) => {
    window.AppData.config = config;
    window.AppData.users = users;
    stgNotifyChange('config', { source: 'preload' });
    stgNotifyChange('users', { source: 'preload' });
  }).catch(err => {
    console.error('[Settings] โหลดข้อมูลเริ่มต้นไม่สำเร็จ', err);
  });
})();

// --- Toast notifications ---
function stgToast(message, type) {
  type = type || 'success';
  let box = document.getElementById('stg-toast-container');
  if (!box) {
    box = document.createElement('div');
    box.id = 'stg-toast-container';
    box.className = 'stg-toast-container';
    document.body.appendChild(box);
  }
  const icons = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' };
  const el = document.createElement('div');
  el.className = 'stg-toast stg-toast-' + type;
  el.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${stgEscapeHtml(message)}</span>`;
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, 2600);
}

// --- Entry point (called by dashboard.html switchTab('settings')) ---
function renderSettings() {
  const container = document.getElementById('view-settings');
  if (!container) return;

  stgInjectStyles();
  container.innerHTML = stgLoadingSkeleton();

  Promise.all([settingsApiGetConfig(), settingsApiGetUsers()]).then(([config, users]) => {
    window.AppData.config = config;
    window.AppData.users = users;
    stgRenderAll(container);
  }).catch(err => {
    console.error('[Settings] โหลดข้อมูลไม่สำเร็จ', err);
    container.innerHTML = `<div class="stg-card"><p style="color:#b91c1c;">โหลดข้อมูลการตั้งค่าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง</p></div>`;
  });
}

function stgLoadingSkeleton() {
  return `<div class="stg-card" style="text-align:center; padding:60px 20px; color:#94a3b8;">
    <i class="fas fa-circle-notch fa-spin" style="font-size:26px;"></i>
    <p style="margin-top:12px; font-size:13px;">กำลังโหลดข้อมูลการตั้งค่า...</p>
  </div>`;
}

function stgRenderAll(container) {
  container.innerHTML = `
    <div class="stg-header">
      <div>
        <h2><i class="fas fa-cog"></i> Settings</h2>
        <p>จัดการข้อมูลตัวเลือก (Dropdown Options) และผู้ใช้งานระบบ</p>
      </div>
    </div>

    <div class="stg-maintabs">
      <button class="stg-maintab-btn ${__settingsUi.mainTab === 'config' ? 'active' : ''}" onclick="stgSwitchMainTab('config')">
        <i class="fas fa-list-check"></i> จัดการข้อมูลตัวเลือก
      </button>
      <button class="stg-maintab-btn ${__settingsUi.mainTab === 'users' ? 'active' : ''}" onclick="stgSwitchMainTab('users')">
        <i class="fas fa-users-gear"></i> จัดการผู้ใช้งานระบบ
      </button>
      <button class="stg-maintab-btn ${__settingsUi.mainTab === 'insighthub' ? 'active' : ''}" onclick="stgSwitchMainTab('insighthub')">
        <i class="fas fa-plug-circle-bolt"></i> InsightHub
      </button>
    </div>

    <div id="stg-maintab-body">
      ${stgBuildMainTabBody(__settingsUi.mainTab)}
    </div>

    <div id="stg-modal-overlay" class="stg-modal-overlay" style="display:none;" onclick="if(event.target===this) stgCloseModal()">
      <div class="stg-modal">
        <div class="stg-modal-header">
          <h3 id="stg-modal-title">-</h3>
          <button class="stg-modal-close" onclick="stgCloseModal()"><i class="fas fa-times"></i></button>
        </div>
        <div class="stg-modal-body" id="stg-modal-body"></div>
        <div class="stg-modal-footer">
          <button class="stg-btn stg-btn-ghost" onclick="stgCloseModal()">ยกเลิก</button>
          <button class="stg-btn stg-btn-primary" id="stg-modal-save-btn">บันทึก</button>
        </div>
      </div>
    </div>
  `;
}

function stgBuildMainTabBody(tab) {
  if (tab === 'users') return stgBuildUsersSection();
  if (tab === 'insighthub') return stgBuildInsightHubSection();
  return stgBuildConfigSection();
}

window.stgSwitchMainTab = function(tab) {
  __settingsUi.mainTab = tab;
  const body = document.getElementById('stg-maintab-body');
  const tabOrder = ['config', 'users', 'insighthub'];
  document.querySelectorAll('.stg-maintab-btn').forEach((b, i) => b.classList.toggle('active', tabOrder[i] === tab));
  if (!body) return;
  if (tab === 'insighthub') {
    // Connection URL / Advanced Config / Contact Status all live on the InsightHub Apps Script
    // backend, not in window.AppData.config (which is preloaded up front for the other two
    // tabs) - fetch fresh every time this tab is opened so it never shows stale values.
    body.innerHTML = stgLoadingSkeleton();
    stgLoadInsightHubSettingsData().then(() => {
      if (__settingsUi.mainTab === 'insighthub') body.innerHTML = stgBuildMainTabBody(tab);
    });
    return;
  }
  body.innerHTML = stgBuildMainTabBody(tab);
};

// =====================================================
// หมวดที่ 1: Dropdown Options Management
// =====================================================
function stgBuildConfigSection() {
  const activeCat = __settingsUi.configTab;
  const items = (window.AppData.config[activeCat] || []);
  const isMapped = stgIsMappedCategory(activeCat);
  const rawValues = isMapped ? stgGetRawProductValues(activeCat) : [];
  const ownerMap = isMapped ? stgGetRawValueOwnerMap(activeCat) : {};
  const unmapped = isMapped ? rawValues.filter(v => !ownerMap[v.toLowerCase()]) : [];

  return `
    <div class="stg-card">
      <div class="stg-subtabs">
        ${SETTINGS_CATEGORIES.map(c => `
          <button class="stg-subtab-btn ${c.key === activeCat ? 'active' : ''}" onclick="stgSwitchConfigTab('${c.key}')">
            <i class="fas ${c.icon}"></i> ${c.label}
          </button>
        `).join('')}
      </div>

      <div class="stg-section-toolbar">
        <div>
          <h3>${stgCategoryLabel(activeCat)}</h3>
          <p class="stg-subtitle">${stgCategorySub(activeCat)} • ทั้งหมด ${items.length} ${isMapped ? 'กลุ่ม' : 'รายการ'}${isMapped ? ` • ตรวจพบข้อมูลดิบจากไฟล์ import ${rawValues.length} รายการ (ยังไม่จัดหมวดหมู่ ${unmapped.length})` : ''}</p>
        </div>
        <button class="stg-btn stg-btn-primary" onclick="stgOpenConfigModal('${activeCat}')">
          <i class="fas fa-plus"></i> ${isMapped ? 'เพิ่มกลุ่ม' : 'เพิ่มรายการ'}
        </button>
      </div>

      <div class="stg-table-wrapper">
        <table class="stg-table">
          <thead>
            <tr>
              <th style="text-align:left;">${isMapped ? 'ชื่อกลุ่ม' : 'ชื่อรายการ'}</th>
              ${isMapped ? '<th style="text-align:left;">ค่าดิบที่ผูกไว้</th>' : ''}
              <th>สถานะ</th>
              <th style="width:120px;">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            ${items.length === 0 ? `<tr><td colspan="${isMapped ? 4 : 3}" class="stg-empty">ยังไม่มีข้อมูล</td></tr>` : items.map(item => `
              <tr>
                <td style="text-align:left; font-weight:600;">${stgEscapeHtml(item.name)}</td>
                ${isMapped ? `<td style="text-align:left;">${(item.rawValues && item.rawValues.length) ? item.rawValues.map(rv => `<span class="stg-chip">${stgEscapeHtml(rv)}</span>`).join(' ') : '<span class="stg-muted">ยังไม่ได้ผูกค่าดิบ</span>'}</td>` : ''}
                <td>
                  <span class="stg-badge ${item.active ? 'stg-badge-on' : 'stg-badge-off'}" style="cursor:pointer;"
                    title="คลิกเพื่อสลับสถานะ" onclick="stgToggleConfigActive('${activeCat}', '${item.id}')">
                    ${item.active ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td>
                  <button class="stg-icon-btn" title="แก้ไข" onclick="stgOpenConfigModal('${activeCat}', '${item.id}')"><i class="fas fa-pen"></i></button>
                  <button class="stg-icon-btn stg-icon-btn-danger" title="ลบ" onclick="stgDeleteConfigItem('${activeCat}', '${item.id}')"><i class="fas fa-trash"></i></button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      ${isMapped ? stgBuildUnmappedPanel(activeCat, unmapped, items) : ''}
    </div>
  `;
}

// รายการค่าดิบจากไฟล์ import ที่ยังไม่ถูกจัดเข้ากลุ่มไหนเลย - ให้เลือกกลุ่มปลายทางแบบ inline ได้เลยโดยไม่ต้อง
// เปิด modal ทีละรายการ (เร็วกว่าเวลามีค่าดิบใหม่เยอะๆ หลัง import ไฟล์ใหม่)
function stgBuildUnmappedPanel(category, unmapped, items) {
  if (unmapped.length === 0) {
    return `
      <div style="margin-top:18px; border-top:1px solid #f0ece6; padding-top:14px;">
        <p class="stg-subtitle"><i class="fas fa-circle-check" style="color:#198754;"></i> ${items.length === 0 ? 'ยังไม่พบข้อมูลจากไฟล์ import' : 'ค่าดิบจากไฟล์ import ถูกจัดหมวดหมู่ครบแล้ว'}</p>
      </div>
    `;
  }
  return `
    <div style="margin-top:18px; border-top:1px solid #f0ece6; padding-top:14px;">
      <h4 style="margin:0 0 3px; font-size:13.5px; color:#1e293b;">ค่าดิบจากไฟล์ import ที่ยังไม่ได้จัดหมวดหมู่ (${unmapped.length})</h4>
      <p class="stg-subtitle" style="margin-bottom:10px;">ตรวจจับจากคอลัมน์${category === 'SubProduct' ? ' "Product Set"' : ' "Product"'} ในไฟล์ที่ import ล่าสุด - เลือกกลุ่มที่จะผูกให้แต่ละรายการ ค่าที่ยังไม่ถูกจัดจะแสดงเป็นชื่อดิบตรงๆ ใน Filter หน้า Overview ไปก่อน</p>
      <div class="stg-table-wrapper">
        <table class="stg-table">
          <thead><tr><th style="text-align:left;">ค่าดิบจากไฟล์</th><th style="width:240px;">จัดเข้ากลุ่ม</th></tr></thead>
          <tbody>
            ${unmapped.map(rv => `
              <tr>
                <td style="text-align:left;">${stgEscapeHtml(rv)}</td>
                <td>
                  <select class="stg-input" data-raw="${stgEscapeHtml(rv)}" onchange="stgAssignRawValue('${category}', this)">
                    <option value="">-- เลือกกลุ่ม --</option>
                    ${items.map(it => `<option value="${it.id}">${stgEscapeHtml(it.name)}</option>`).join('')}
                    <option value="__new__">+ สร้างกลุ่มใหม่จากชื่อนี้</option>
                  </select>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// เลือกกลุ่มปลายทางจาก dropdown ในตารางค่าดิบที่ยังไม่จัดหมวดหมู่ - ผูกค่าดิบนั้นเข้ากลุ่มที่เลือกทันที
// (หรือสร้างกลุ่มใหม่ถ้าเลือก "+ สร้างกลุ่มใหม่")
window.stgAssignRawValue = function(category, selectEl) {
  const rawValue = selectEl.dataset.raw;
  const choice = selectEl.value;
  if (!choice) return;
  const items = (window.AppData.config[category] || []).slice();

  let nextItems;
  if (choice === '__new__') {
    const name = prompt('ตั้งชื่อกลุ่มใหม่สำหรับ "' + rawValue + '"', rawValue);
    if (!name || !name.trim()) { stgSwitchConfigTab(category); return; }
    nextItems = items.concat([{ id: stgUid(), name: name.trim(), active: true, rawValues: [rawValue] }]);
  } else {
    nextItems = items.map(it => {
      if (it.id !== choice) return it;
      const rv = (it.rawValues || []).slice();
      if (rv.indexOf(rawValue) === -1) rv.push(rawValue);
      return Object.assign({}, it, { rawValues: rv });
    });
  }

  settingsApiSaveConfig(category, nextItems).then(() => {
    window.AppData.config[category] = nextItems;
    stgSwitchConfigTab(category);
    stgToast('จัดหมวดหมู่สำเร็จ', 'success');
    stgNotifyChange('config', { category: category });
  }).catch(err => {
    console.error('[Settings] จัดหมวดหมู่ไม่สำเร็จ', err);
    stgToast('บันทึกไม่สำเร็จ', 'error');
  });
};

function stgCategoryLabel(key) {
  const c = SETTINGS_CATEGORIES.find(x => x.key === key);
  return c ? c.label : key;
}
function stgCategorySub(key) {
  const c = SETTINGS_CATEGORIES.find(x => x.key === key);
  return c ? c.sub : '';
}

window.stgSwitchConfigTab = function(key) {
  __settingsUi.configTab = key;
  const body = document.getElementById('stg-maintab-body');
  if (body) body.innerHTML = stgBuildConfigSection();
};

window.stgOpenConfigModal = function(category, itemId) {
  const isEdit = !!itemId;
  const item = isEdit ? (window.AppData.config[category] || []).find(x => x.id === itemId) : null;
  const isMapped = stgIsMappedCategory(category);

  document.getElementById('stg-modal-title').textContent = isEdit
    ? `แก้ไข${isMapped ? 'กลุ่ม' : 'รายการ'} - ${stgCategoryLabel(category)}`
    : `เพิ่ม${isMapped ? 'กลุ่ม' : 'รายการ'}ใหม่ - ${stgCategoryLabel(category)}`;

  let mappingHtml = '';
  if (isMapped) {
    const allRaw = stgGetRawProductValues(category);
    const ownerMap = stgGetRawValueOwnerMap(category);
    const currentRaw = new Set((item && item.rawValues) || []);
    if (allRaw.length === 0) {
      mappingHtml = `
        <div class="stg-form-group">
          <label>ค่าดิบจากไฟล์ import</label>
          <p class="stg-subtitle">ยังไม่พบข้อมูลจากไฟล์ import (หรือยังไม่เจอคอลัมน์สินค้า) - import ไฟล์ก่อนแล้วค่อยกลับมาผูกค่าดิบกับกลุ่มนี้</p>
        </div>
      `;
    } else {
      mappingHtml = `
        <div class="stg-form-group">
          <label>ค่าดิบจากไฟล์ import ที่ผูกกับกลุ่มนี้</label>
          <div class="stg-checklist">
            ${allRaw.map(rv => {
              const ownerId = ownerMap[rv.toLowerCase()];
              const ownedByOther = ownerId && (!item || ownerId !== item.id);
              const checked = currentRaw.has(rv);
              return `
                <label class="stg-checklist-item${ownedByOther ? ' stg-checklist-item-disabled' : ''}">
                  <input type="checkbox" value="${stgEscapeHtml(rv)}" ${checked ? 'checked' : ''} ${ownedByOther ? 'disabled' : ''} />
                  <span>${stgEscapeHtml(rv)}</span>
                  ${ownedByOther ? `<span class="stg-muted"> (อยู่ในกลุ่ม "${stgEscapeHtml(stgGroupNameById(category, ownerId))}" แล้ว)</span>` : ''}
                </label>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }
  }

  document.getElementById('stg-modal-body').innerHTML = `
    <div class="stg-form-group">
      <label>${isMapped ? 'ชื่อกลุ่ม' : 'ชื่อรายการ'}</label>
      <input type="text" id="stg-config-name" class="stg-input" value="${item ? stgEscapeHtml(item.name) : ''}" placeholder="เช่น Facebook">
    </div>
    <div class="stg-form-group">
      <label>สถานะ</label>
      <select id="stg-config-active" class="stg-input">
        <option value="1" ${!item || item.active ? 'selected' : ''}>Active</option>
        <option value="0" ${item && !item.active ? 'selected' : ''}>Disabled</option>
      </select>
    </div>
    ${mappingHtml}
  `;

  const saveBtn = document.getElementById('stg-modal-save-btn');
  saveBtn.onclick = () => stgSaveConfigModal(category, itemId);
  stgOpenModal();
};

function stgSaveConfigModal(category, itemId) {
  const name = document.getElementById('stg-config-name').value.trim();
  const active = document.getElementById('stg-config-active').value === '1';
  if (!name) { stgToast('กรุณากรอกชื่อรายการ', 'error'); return; }

  const isMapped = stgIsMappedCategory(category);
  const checkedRaw = isMapped
    ? Array.from(document.querySelectorAll('#stg-modal-body .stg-checklist-item input[type="checkbox"]:checked')).map(el => el.value)
    : null;

  let items = (window.AppData.config[category] || []).slice();
  let savingId = itemId;
  if (itemId) {
    const idx = items.findIndex(x => x.id === itemId);
    if (idx >= 0) items[idx] = Object.assign({}, items[idx], { name, active }, isMapped ? { rawValues: checkedRaw } : {});
  } else {
    savingId = stgUid();
    items.push(Object.assign({ id: savingId, name, active }, isMapped ? { rawValues: checkedRaw || [] } : {}));
  }

  // ค่าดิบแต่ละตัวเป็นของกลุ่มเดียวเท่านั้น - ถ้าเพิ่งถูกเลือกให้เข้ากลุ่มนี้ ต้องดึงออกจากกลุ่มอื่นที่เคยผูกไว้ก่อนหน้า
  if (isMapped && checkedRaw) {
    items = items.map(it => {
      if (it.id === savingId) return it;
      const rv = (it.rawValues || []).filter(v => checkedRaw.indexOf(v) === -1);
      return rv.length === (it.rawValues || []).length ? it : Object.assign({}, it, { rawValues: rv });
    });
  }

  settingsApiSaveConfig(category, items).then(() => {
    window.AppData.config[category] = items;
    stgCloseModal();
    stgSwitchConfigTab(category);
    stgToast(itemId ? 'แก้ไขรายการสำเร็จ' : 'เพิ่มรายการสำเร็จ', 'success');
    stgNotifyChange('config', { category: category });
  }).catch(err => {
    console.error('[Settings] บันทึกไม่สำเร็จ', err);
    stgToast('บันทึกข้อมูลไม่สำเร็จ', 'error');
  });
}

window.stgToggleConfigActive = function(category, itemId) {
  const items = (window.AppData.config[category] || []).slice();
  const idx = items.findIndex(x => x.id === itemId);
  if (idx < 0) return;
  items[idx] = Object.assign({}, items[idx], { active: !items[idx].active });

  settingsApiSaveConfig(category, items).then(() => {
    window.AppData.config[category] = items;
    stgSwitchConfigTab(category);
    stgToast('อัปเดตสถานะสำเร็จ', 'success');
    stgNotifyChange('config', { category: category });
  }).catch(err => {
    console.error('[Settings] อัปเดตสถานะไม่สำเร็จ', err);
    stgToast('อัปเดตสถานะไม่สำเร็จ', 'error');
  });
};

window.stgDeleteConfigItem = function(category, itemId) {
  const items = window.AppData.config[category] || [];
  const item = items.find(x => x.id === itemId);
  if (!item) return;
  if (!confirm(`ต้องการลบรายการ "${item.name}" หรือไม่?`)) return;

  const next = items.filter(x => x.id !== itemId);
  settingsApiSaveConfig(category, next).then(() => {
    window.AppData.config[category] = next;
    stgSwitchConfigTab(category);
    stgToast('ลบรายการสำเร็จ', 'success');
    stgNotifyChange('config', { category: category });
  }).catch(err => {
    console.error('[Settings] ลบไม่สำเร็จ', err);
    stgToast('ลบรายการไม่สำเร็จ', 'error');
  });
};

// =====================================================
// หมวดที่ 2: User Management
// =====================================================
function stgBuildUsersSection() {
  const users = window.AppData.users || [];
  return `
    <div class="stg-card">
      <div class="stg-section-toolbar">
        <div>
          <h3>รายชื่อผู้ใช้งานระบบ</h3>
          <p class="stg-subtitle">ทั้งหมด ${users.length} คน</p>
        </div>
        <button class="stg-btn stg-btn-primary" onclick="stgOpenUserModal()">
          <i class="fas fa-user-plus"></i> เพิ่มผู้ใช้งาน
        </button>
      </div>

      <div class="stg-table-wrapper">
        <table class="stg-table">
          <thead>
            <tr>
              <th style="text-align:left;">Username</th>
              <th style="text-align:left;">ชื่อ</th>
              <th>Role</th>
              <th style="text-align:left;">หน้าที่</th>
              <th>สถานะ</th>
              <th style="width:130px;">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            ${users.length === 0 ? `<tr><td colspan="6" class="stg-empty">ยังไม่มีผู้ใช้งาน</td></tr>` : users.map(u => `
              <tr>
                <td style="text-align:left; font-weight:600;">${stgEscapeHtml(u.username)}</td>
                <td style="text-align:left;">${stgEscapeHtml(u.name)}</td>
                <td><span class="stg-role-badge">${stgEscapeHtml(u.role)}</span></td>
                <td style="text-align:left; color:#7a665e; font-size:12px;">${stgEscapeHtml(u.permission || stgRolePermission(u.role))}</td>
                <td>
                  <span class="stg-badge ${u.active ? 'stg-badge-on' : 'stg-badge-off'}" style="cursor:pointer;"
                    title="คลิกเพื่อสลับสถานะ" onclick="stgToggleUserActive('${u.id}')">
                    ${u.active ? 'Active' : 'Deactivated'}
                  </span>
                </td>
                <td>
                  <button class="stg-icon-btn" title="แก้ไข" onclick="stgOpenUserModal('${u.id}')"><i class="fas fa-pen"></i></button>
                  <button class="stg-icon-btn stg-icon-btn-danger" title="ลบผู้ใช้งาน" onclick="stgDeleteUser('${u.id}')"><i class="fas fa-trash"></i></button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.stgOpenUserModal = function(userId) {
  const isEdit = !!userId;
  const user = isEdit ? (window.AppData.users || []).find(x => x.id === userId) : null;

  document.getElementById('stg-modal-title').textContent = isEdit ? 'แก้ไขผู้ใช้งาน' : 'เพิ่มผู้ใช้งานใหม่';

  document.getElementById('stg-modal-body').innerHTML = `
    <div class="stg-form-group">
      <label>Username</label>
      <input type="text" id="stg-user-username" class="stg-input" value="${user ? stgEscapeHtml(user.username) : ''}" placeholder="เช่น jsmith" ${isEdit ? 'disabled' : ''}>
    </div>
    <div class="stg-form-group">
      <label>${isEdit ? 'รีเซ็ต Password (เว้นว่างไว้หากไม่เปลี่ยน)' : 'Password'}</label>
      <input type="password" id="stg-user-password" class="stg-input" placeholder="${isEdit ? '••••••••' : 'ตั้งรหัสผ่าน'}" autocomplete="new-password">
    </div>
    <div class="stg-form-group">
      <label>ชื่อ - นามสกุล</label>
      <input type="text" id="stg-user-name" class="stg-input" value="${user ? stgEscapeHtml(user.name) : ''}" placeholder="เช่น สมชาย ใจดี">
    </div>
    <div class="stg-form-group">
      <label>Role</label>
      <select id="stg-user-role" class="stg-input">
        ${SETTINGS_ROLES.map(r => `<option value="${r}" ${user && user.role === r ? 'selected' : ''}>${r}</option>`).join('')}
      </select>
    </div>
    <div class="stg-form-group" id="stg-user-adminname-group" style="display:none;">
      <label>ชื่อแอดมิน (Admin Name)</label>
      <select id="stg-user-adminname" class="stg-input">
        <option value="">-- เลือกชื่อแอดมิน --</option>
        ${(window.AppData.config.Admin || []).filter(a => a.active).map(a =>
          `<option value="${stgEscapeHtml(a.name)}" ${user && user.adminName === a.name ? 'selected' : ''}>${stgEscapeHtml(a.name)}</option>`
        ).join('')}
      </select>
    </div>
    <div class="stg-form-group">
      <label>หน้าที่ (สิทธิ์การเข้าถึง)</label>
      <textarea id="stg-user-permission" class="stg-input" rows="3" placeholder="เช่น เข้าถึงข้อมูลทั้งหมด ยกเว้นหน้า Settings">${stgEscapeHtml(user && user.permission ? user.permission : stgRolePermission(user ? user.role : SETTINGS_ROLES[0]))}</textarea>
    </div>
    <div class="stg-form-group">
      <label>สถานะ</label>
      <select id="stg-user-active" class="stg-input">
        <option value="1" ${!user || user.active ? 'selected' : ''}>Active</option>
        <option value="0" ${user && !user.active ? 'selected' : ''}>Deactivated</option>
      </select>
    </div>
  `;

  const roleSelect = document.getElementById('stg-user-role');
  // ตั้งค่า visibility เริ่มต้นของช่องชื่อแอดมินแยกจาก onchange ด้านล่าง เพราะ onchange ยังรีเซ็ต
  // ช่องหน้าที่/สิทธิ์กลับเป็นค่า default ของ Role ด้วย ถ้าเรียกตอนเปิด modal จะทับข้อความที่เคย custom ไว้
  const adminNameGroup = document.getElementById('stg-user-adminname-group');
  if (adminNameGroup) adminNameGroup.style.display = roleSelect.value === 'Sales Admin' ? '' : 'none';
  roleSelect.onchange = () => {
    const permField = document.getElementById('stg-user-permission');
    if (permField) permField.value = stgRolePermission(roleSelect.value);
    if (adminNameGroup) adminNameGroup.style.display = roleSelect.value === 'Sales Admin' ? '' : 'none';
  };

  const saveBtn = document.getElementById('stg-modal-save-btn');
  saveBtn.onclick = () => stgSaveUserModal(userId);
  stgOpenModal();
};

function stgSaveUserModal(userId) {
  const isEdit = !!userId;
  const username = document.getElementById('stg-user-username').value.trim();
  const password = document.getElementById('stg-user-password').value;
  const name = document.getElementById('stg-user-name').value.trim();
  const role = document.getElementById('stg-user-role').value;
  const adminNameRaw = document.getElementById('stg-user-adminname')?.value.trim() || '';
  const adminName = role === 'Sales Admin' ? adminNameRaw : null;
  const permission = document.getElementById('stg-user-permission').value.trim();
  const active = document.getElementById('stg-user-active').value === '1';

  if (!isEdit && !username) { stgToast('กรุณากรอก Username', 'error'); return; }
  if (!name) { stgToast('กรุณากรอกชื่อผู้ใช้งาน', 'error'); return; }
  if (!isEdit && !password) { stgToast('กรุณาตั้งรหัสผ่าน', 'error'); return; }
  if (role === 'Sales Admin' && !adminName) { stgToast('กรุณาเลือกชื่อแอดมิน (Admin Name) สำหรับ Sales Admin', 'error'); return; }

  const users = (window.AppData.users || []).slice();

  if (isEdit) {
    const idx = users.findIndex(x => x.id === userId);
    if (idx < 0) return;
    const updated = Object.assign({}, users[idx], { name, role, adminName, permission, active });
    if (password) updated.password = password;
    users[idx] = updated;
  } else {
    if (users.some(x => x.username.toLowerCase() === username.toLowerCase())) {
      stgToast('Username นี้ถูกใช้งานแล้ว', 'error');
      return;
    }
    users.push({ id: stgUid(), username, password, name, role, adminName, permission, active, createdAt: new Date().toISOString() });
  }

  settingsApiSaveUsers(users).then(() => {
    window.AppData.users = users;
    stgCloseModal();
    stgSwitchMainTab('users');
    stgToast(isEdit ? 'แก้ไขผู้ใช้งานสำเร็จ' : 'เพิ่มผู้ใช้งานสำเร็จ', 'success');
    stgNotifyChange('users');
  }).catch(err => {
    console.error('[Settings] บันทึกผู้ใช้งานไม่สำเร็จ', err);
    stgToast('บันทึกข้อมูลไม่สำเร็จ', 'error');
  });
}

window.stgToggleUserActive = function(userId) {
  const users = (window.AppData.users || []).slice();
  const idx = users.findIndex(x => x.id === userId);
  if (idx < 0) return;
  users[idx] = Object.assign({}, users[idx], { active: !users[idx].active });

  settingsApiSaveUsers(users).then(() => {
    window.AppData.users = users;
    stgSwitchMainTab('users');
    stgToast('อัปเดตสถานะสำเร็จ', 'success');
    stgNotifyChange('users');
  }).catch(err => {
    console.error('[Settings] อัปเดตสถานะไม่สำเร็จ', err);
    stgToast('อัปเดตสถานะไม่สำเร็จ', 'error');
  });
};

window.stgDeleteUser = function(userId) {
  const users = window.AppData.users || [];
  const user = users.find(x => x.id === userId);
  if (!user) return;
  if (!confirm(`ต้องการลบผู้ใช้งาน "${user.username}" หรือไม่?`)) return;

  const next = users.filter(x => x.id !== userId);
  settingsApiSaveUsers(next).then(() => {
    window.AppData.users = next;
    stgSwitchMainTab('users');
    stgToast('ลบผู้ใช้งานสำเร็จ', 'success');
    stgNotifyChange('users');
  }).catch(err => {
    console.error('[Settings] ลบผู้ใช้งานไม่สำเร็จ', err);
    stgToast('ลบผู้ใช้งานไม่สำเร็จ', 'error');
  });
};

// --- Modal helpers ---
function stgOpenModal() {
  const overlay = document.getElementById('stg-modal-overlay');
  if (overlay) overlay.style.display = 'flex';
}
window.stgCloseModal = function() {
  const overlay = document.getElementById('stg-modal-overlay');
  if (overlay) overlay.style.display = 'none';
};

// =====================================================
// หมวดที่ 3: InsightHub - การเชื่อมต่อ Google Apps Script + สถานะการติดต่อ (Sales Note) +
// Advanced Config (Loyalty Index / Admin Priority / Trend Visual / Refill Buffer)
//
// Unlike หมวดที่ 1/2 (Channel/SubChannel/.../Users, stored in Queenmaker's own Redis via
// settingsApiGetConfig/settingsApiGetUsers), everything in this tab except the connection URL
// itself lives on the user's own Google Sheet, read/written through window.InsightHubApi
// (public/insighthub-api.js) - the InsightHub tab is a standalone system with its own data
// source, see public/insighthub.js's file header comment. Only the connection URL is stored
// centrally in Queenmaker's Redis (settingsApiGetInsightHubConfig/SaveInsightHubConfig above),
// since it must be shared across the whole team rather than per-browser.
// =====================================================
let __stgStatusDraft = null;

// Fetches the connection URL + (if configured) status options + advanced config fresh from
// their real sources - called every time this tab is opened (see stgSwitchMainTab) rather than
// relying on whatever happened to be preloaded/cached, since none of that is preloaded like
// window.AppData.config/users are.
function stgLoadInsightHubSettingsData() {
  __stgStatusDraft = null;
  return settingsApiGetInsightHubConfig().then(cfg => {
    window.AppData.insightHubScriptUrl = (cfg && cfg.scriptUrl) || '';
    if (!window.AppData.insightHubScriptUrl) return null;
    return Promise.all([
      window.InsightHubApi ? window.InsightHubApi.getStatusOptions().catch(() => null) : null,
      window.InsightHubApi ? window.InsightHubApi.getAppConfig().catch(() => null) : null,
    ]).then(([statusResult, configResult]) => {
      if (statusResult && Array.isArray(statusResult.options) && statusResult.options.length) {
        window.AppData.statusOptions = statusResult.options;
      }
      if (configResult && configResult.config) {
        window.AppData.appConfig = Object.assign({}, window.DEFAULT_APP_CONFIG, configResult.config);
      }
    });
  }).catch(err => {
    console.error('[Settings] โหลดการตั้งค่า InsightHub ไม่สำเร็จ', err);
  });
}

function stgBuildInsightHubSection() {
  const isSuperAdmin = !!(window.currentUser && window.currentUser.role === 'Super Admin');
  const canEditShared = !!(window.currentUser && (window.currentUser.role === 'Super Admin' || window.currentUser.role === 'Manager'));
  const currentUrl = window.AppData.insightHubScriptUrl || '';

  return `
    <div class="stg-card">
      <div class="stg-card-header">
        <h3><i class="fas fa-plug"></i> การเชื่อมต่อ Google Apps Script</h3>
        <p style="font-size:12px; color:#7a665e; margin:4px 0 0 0;">
          วาง URL ของ Web App ที่ deploy จาก google-apps-script/InsightHub-Code.gs (ลงท้ายด้วย /exec)
          ค่านี้ใช้ร่วมกันทั้งทีม (บันทึกไว้ที่เซิร์ฟเวอร์ ไม่ใช่แค่เบราว์เซอร์นี้)
        </p>
      </div>
      ${isSuperAdmin ? `
        <div style="margin-top:14px; display:flex; flex-direction:column; gap:8px;">
          <input type="url" id="stg-insighthub-url" class="stg-input" placeholder="https://script.google.com/macros/s/XXXX/exec" value="${stgEscapeHtml(currentUrl)}">
          <div style="display:flex; gap:8px;">
            <button class="stg-btn stg-btn-primary" onclick="stgSaveInsightHubUrl()"><i class="fas fa-save"></i> บันทึก</button>
            <button class="stg-btn stg-btn-ghost" onclick="stgTestInsightHubConnection()"><i class="fas fa-satellite-dish"></i> ทดสอบการเชื่อมต่อ</button>
          </div>
          <div id="stg-insighthub-status" style="font-size:12.5px;"></div>
        </div>
      ` : `
        <div class="stg-form-group" style="margin-top:14px;">
          <label>สถานะ</label>
          <strong>${currentUrl ? 'เชื่อมต่อแล้ว' : 'ยังไม่ได้เชื่อมต่อ'}</strong>
        </div>
        <p style="color:#94a3b8; font-size:12px;">การตั้งค่าการเชื่อมต่อเป็นสิทธิ์ของ Super Admin เท่านั้น</p>
      `}
    </div>

    ${!currentUrl ? '' : `
    <div class="stg-card">
      <div class="stg-card-header">
        <h3><i class="fas fa-note-sticky"></i> จัดการสถานะการติดต่อ (Sales Note)</h3>
        <p style="font-size:12px; color:#7a665e; margin:4px 0 0 0;">รายการสถานะที่แอดมินเลือกได้ตอนบันทึก Sales Note ในหน้าโปรไฟล์ลูกค้า (เลือกได้มากกว่า 1 รายการต่อครั้ง)</p>
      </div>
      <div style="margin-top:16px;">
        ${stgBuildStatusOptionsRows(canEditShared)}
      </div>
      ${canEditShared ? `
        <div style="margin-top:8px; display:flex; gap:8px;">
          <button class="stg-btn stg-btn-ghost" onclick="stgAddStatusRow()"><i class="fas fa-plus"></i> เพิ่มสถานะ</button>
          <button class="stg-btn stg-btn-primary" onclick="stgSaveStatusOptions()"><i class="fas fa-save"></i> บันทึก</button>
        </div>
      ` : '<p style="color:#94a3b8; font-size:12px; margin-top:8px;">เฉพาะ Super Admin/Manager เท่านั้นที่แก้ไขได้</p>'}
    </div>

    ${canEditShared ? stgBuildAdvancedConfigCard() : ''}
    `}
  `;
}

function stgBuildStatusOptionsRows(canEdit) {
  if (!__stgStatusDraft) {
    __stgStatusDraft = (window.AppData.statusOptions && window.AppData.statusOptions.length) ? window.AppData.statusOptions.slice() : [];
  }
  if (__stgStatusDraft.length === 0) return '<p style="color:#94a3b8; font-size:13px;">ยังไม่มีสถานะ</p>';
  return __stgStatusDraft.map((opt, i) => `
    <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
      <input type="text" class="stg-input" value="${stgEscapeHtml(opt)}" oninput="stgUpdateStatusDraft(${i}, this.value)" ${canEdit ? '' : 'disabled'}>
      ${canEdit ? `<button class="stg-icon-btn" onclick="stgRemoveStatusRow(${i})" title="ลบ"><i class="fas fa-trash"></i></button>` : ''}
    </div>
  `).join('');
}

function stgRerenderInsightHubTab() {
  const body = document.getElementById('stg-maintab-body');
  if (body) body.innerHTML = stgBuildInsightHubSection();
}

window.stgUpdateStatusDraft = function(idx, value) {
  if (!__stgStatusDraft) return;
  __stgStatusDraft[idx] = value;
};

window.stgAddStatusRow = function() {
  if (!__stgStatusDraft) __stgStatusDraft = [];
  __stgStatusDraft.push('');
  stgRerenderInsightHubTab();
};

window.stgRemoveStatusRow = function(idx) {
  if (!__stgStatusDraft) return;
  __stgStatusDraft.splice(idx, 1);
  stgRerenderInsightHubTab();
};

window.stgSaveStatusOptions = function() {
  const values = (__stgStatusDraft || []).map(s => (s || '').trim()).filter(Boolean);
  if (values.length === 0) { stgToast('กรุณาใส่อย่างน้อย 1 สถานะ', 'error'); return; }
  const requestUser = (window.currentUser && (window.currentUser.username || window.currentUser.name)) || '';
  window.InsightHubApi.saveStatusOptions(requestUser, values.join('|')).then((result) => {
    const saved = (result && result.options) || values;
    window.AppData.statusOptions = saved;
    __stgStatusDraft = saved.slice();
    stgToast('บันทึกสถานะการติดต่อสำเร็จ', 'success');
    stgRerenderInsightHubTab();
  }).catch(err => {
    console.error('[Settings] บันทึกสถานะการติดต่อไม่สำเร็จ', err);
    stgToast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
  });
};

window.stgSaveInsightHubUrl = function() {
  const input = document.getElementById('stg-insighthub-url');
  const val = input ? input.value.trim() : '';
  settingsApiSaveInsightHubConfig(val).then(saved => {
    window.AppData.insightHubScriptUrl = saved.scriptUrl || '';
    if (window.InsightHubApi) window.InsightHubApi.invalidateBaseUrlCache();
    stgToast(val ? 'บันทึก Apps Script URL แล้ว' : 'ล้างค่า Apps Script URL แล้ว', 'success');
    stgRerenderInsightHubTab();
  }).catch(err => {
    console.error('[Settings] บันทึก InsightHub URL ไม่สำเร็จ', err);
    stgToast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
  });
};

window.stgTestInsightHubConnection = function() {
  const statusEl = document.getElementById('stg-insighthub-status');
  if (statusEl) { statusEl.textContent = 'กำลังทดสอบ...'; statusEl.style.color = '#7a665e'; }
  if (window.InsightHubApi) window.InsightHubApi.invalidateBaseUrlCache();
  Promise.resolve(window.InsightHubApi ? window.InsightHubApi.ping() : Promise.reject(new Error('InsightHubApi ยังไม่พร้อมใช้งาน'))).then(() => {
    if (statusEl) { statusEl.textContent = '✔ เชื่อมต่อสำเร็จ'; statusEl.style.color = '#15803d'; }
  }).catch(err => {
    if (statusEl) { statusEl.textContent = '✘ ' + err.message; statusEl.style.color = '#b91c1c'; }
  });
};

// --- Advanced Config: Loyalty Index / Admin Priority x Segment matrix / Trend Visual / Refill
// Buffer - all backed by the generic Config_App sheet (google-apps-script/InsightHub-Code.gs's
// handleGetAppConfig/handleSaveAppConfig), one row per key. Each of the 4 sub-sections saves
// independently, same pattern as the reference app.
function stgBuildAdvancedConfigCard() {
  const appConfig = window.AppData.appConfig || window.DEFAULT_APP_CONFIG;
  const SEGMENT1_KEYS = ["NEW", "ACTIVE", "RISK", "CHURN"];
  const SEGMENT2_KEYS = ["NEW", "ACTIVE", "REFILL", "RISK", "CHURN"];
  const PRIORITY_LEVELS = ["High", "Medium", "Low", "Win-back"];

  return `
    <div class="stg-card">
      <div class="stg-card-header">
        <h3><i class="fas fa-sliders"></i> ตั้งค่าเงื่อนไขระบบ (Advanced Config)</h3>
      </div>

      <div style="margin:16px 0 20px 0;">
        <h4 style="font-size:13px; margin:0 0 8px 0;">Loyalty Index (จำนวนวันสะสม)</h4>
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:10px;">
          <label style="font-size:11px; color:#64748b;">Seedling ถึง (วัน)
            <input type="number" id="stg-cfg-loyalty-seedling" class="stg-input" value="${appConfig.loyaltyIndex.seedlingMaxDays}" min="0">
          </label>
          <label style="font-size:11px; color:#64748b;">Regular ถึง (วัน)
            <input type="number" id="stg-cfg-loyalty-regular" class="stg-input" value="${appConfig.loyaltyIndex.regularMaxDays}" min="0">
          </label>
          <label style="font-size:11px; color:#64748b;">Veteran ถึง (วัน)
            <input type="number" id="stg-cfg-loyalty-veteran" class="stg-input" value="${appConfig.loyaltyIndex.veteranMaxDays}" min="0">
          </label>
        </div>
        <button class="stg-btn stg-btn-ghost" onclick="stgSaveInsightHubAppConfig('loyaltyIndex')"><i class="fas fa-save"></i> บันทึก Loyalty Index</button>
      </div>

      <div style="margin-bottom:20px; border-top:1px dashed #e2e8f0; padding-top:16px;">
        <h4 style="font-size:13px; margin:0 0 8px 0;">Admin Priority × Segment</h4>
        <p style="font-size:11.5px; color:#7a665e; margin-top:-4px;">แถว = Segment 1 (Standard Period), คอลัมน์ = Segment 2 (Dynamic Refill)</p>
        <div class="stg-table-wrapper">
          <table class="stg-table" style="min-width:560px;">
            <thead><tr><th></th>${SEGMENT2_KEYS.map(s2 => `<th>${s2}</th>`).join('')}</tr></thead>
            <tbody>
              ${SEGMENT1_KEYS.map(s1 => `
                <tr>
                  <td style="font-weight:600;">${s1}</td>
                  ${SEGMENT2_KEYS.map(s2 => {
                    const key = s1 + '|' + s2;
                    const val = appConfig.adminPriorityMatrix[key] || 'Win-back';
                    return `<td><select class="stg-input stg-cfg-priority-cell" data-key="${key}">
                      ${PRIORITY_LEVELS.map(lvl => `<option value="${lvl}" ${lvl === val ? 'selected' : ''}>${lvl}</option>`).join('')}
                    </select></td>`;
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <button class="stg-btn stg-btn-ghost" style="margin-top:10px;" onclick="stgSaveInsightHubAppConfig('adminPriorityMatrix')"><i class="fas fa-save"></i> บันทึก Admin Priority</button>
      </div>

      <div style="margin-bottom:20px; border-top:1px dashed #e2e8f0; padding-top:16px;">
        <h4 style="font-size:13px; margin:0 0 8px 0;">Trend Visual</h4>
        <div style="display:flex; gap:20px; align-items:end; flex-wrap:wrap; margin-bottom:10px;">
          <label style="font-size:11px; color:#64748b;">Neutral band (%)
            <input type="number" id="stg-cfg-trend-band" class="stg-input" value="${appConfig.trendVisual.neutralBandPercent}" min="0" step="0.5" style="width:100px;">
          </label>
          <label style="font-size:12px; color:#334155; display:flex; align-items:center; gap:6px;">
            <input type="checkbox" id="stg-cfg-trend-interpolate" ${appConfig.trendVisual.interpolateCurrentYear ? 'checked' : ''}>
            Interpolate ปีปัจจุบันที่ยังไม่ครบปี
          </label>
        </div>
        <button class="stg-btn stg-btn-ghost" onclick="stgSaveInsightHubAppConfig('trendVisual')"><i class="fas fa-save"></i> บันทึก Trend Visual</button>
      </div>

      <div style="border-top:1px dashed #e2e8f0; padding-top:16px;">
        <h4 style="font-size:13px; margin:0 0 8px 0;">Refill Buffer</h4>
        <p style="font-size:11.5px; color:#7a665e; margin-top:-4px;">ตัวคูณรอบเติมสินค้าที่คาดการณ์ (ค่าเริ่มต้น 1.1)</p>
        <input type="number" id="stg-cfg-refill-buffer" class="stg-input" value="${appConfig.refillBuffer}" min="1" step="0.05" style="width:100px; margin-bottom:10px;">
        <button class="stg-btn stg-btn-ghost" onclick="stgSaveInsightHubAppConfig('refillBuffer')"><i class="fas fa-save"></i> บันทึก Refill Buffer</button>
      </div>
    </div>
  `;
}

window.stgSaveInsightHubAppConfig = function(key) {
  let value;
  if (key === 'loyaltyIndex') {
    value = {
      seedlingMaxDays: parseInt(document.getElementById('stg-cfg-loyalty-seedling').value, 10) || 45,
      regularMaxDays: parseInt(document.getElementById('stg-cfg-loyalty-regular').value, 10) || 180,
      veteranMaxDays: parseInt(document.getElementById('stg-cfg-loyalty-veteran').value, 10) || 365,
    };
  } else if (key === 'adminPriorityMatrix') {
    value = {};
    document.querySelectorAll('.stg-cfg-priority-cell').forEach(sel => { value[sel.dataset.key] = sel.value; });
  } else if (key === 'trendVisual') {
    value = {
      neutralBandPercent: parseFloat(document.getElementById('stg-cfg-trend-band').value) || 0,
      interpolateCurrentYear: document.getElementById('stg-cfg-trend-interpolate').checked,
    };
  } else if (key === 'refillBuffer') {
    value = parseFloat(document.getElementById('stg-cfg-refill-buffer').value) || 1.1;
  } else {
    return;
  }

  const requestUser = (window.currentUser && (window.currentUser.username || window.currentUser.name)) || '';
  window.InsightHubApi.saveAppConfig(requestUser, key, value).then(() => {
    window.AppData.appConfig = window.AppData.appConfig || {};
    window.AppData.appConfig[key] = value;
    stgToast('บันทึกสำเร็จ', 'success');
    if (typeof window.refreshInsightHub === 'function') window.refreshInsightHub();
  }).catch(err => {
    console.error('[Settings] บันทึก Advanced Config ไม่สำเร็จ', err);
    stgToast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
  });
};

// --- Styles (injected once, mirrors kpisetting.js pattern) ---
function stgInjectStyles() {
  if (document.getElementById('settings-styles')) return;
  const style = document.createElement('style');
  style.id = 'settings-styles';
  style.innerHTML = `
    .stg-header {
      background-color: #0b2240;
      color: white;
      padding: 20px 30px;
      border-radius: 12px;
      margin-bottom: 20px;
      font-family: 'Outfit', sans-serif;
    }
    .stg-header h2 { margin: 0 0 4px 0; font-size: 22px; font-weight: 700; letter-spacing: 0.5px; }
    .stg-header h2 i { color: #fce268; margin-right: 8px; }
    .stg-header p { margin: 0; font-size: 12px; color: #b9c6db; }

    .stg-maintabs { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
    .stg-maintab-btn {
      background: #fff; border: 1px solid #ddd; padding: 10px 20px; border-radius: 8px;
      font-weight: 600; font-size: 13px; cursor: pointer; color: #555;
      display: flex; align-items: center; gap: 8px;
    }
    .stg-maintab-btn.active { background-color: #1e293b; border-color: #1e293b; color: #ffffff; }

    .stg-card {
      background: #fff; border-radius: 16px; padding: 22px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.03); border: 1px solid #f0e6df; margin-bottom: 20px;
    }

    .stg-subtabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; border-bottom: 1px solid #f0ece6; padding-bottom: 14px; }
    .stg-subtab-btn {
      background: #fafafa; border: 1px solid #eee; padding: 7px 14px; border-radius: 20px;
      font-size: 12.5px; font-weight: 600; color: #7a665e; cursor: pointer;
      display: flex; align-items: center; gap: 6px;
    }
    .stg-subtab-btn:hover { background: #fdf1e6; }
    .stg-subtab-btn.active { background: #1e293b; border-color: #1e293b; color: #fff; }

    .stg-section-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
    .stg-section-toolbar h3 { font-size: 15px; font-weight: 700; color: #1e293b; margin: 0 0 3px 0; }
    .stg-subtitle { font-size: 12px; color: #7a665e; margin: 0; }

    .stg-btn {
      border: none; border-radius: 20px; padding: 9px 18px; font-weight: 600; font-size: 13px;
      cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: opacity 0.15s;
    }
    .stg-btn:hover { opacity: 0.9; }
    .stg-btn-primary { background: #1e293b; color: #fff; }
    .stg-btn-ghost { background: #eee; color: #333; }

    .stg-table-wrapper { overflow-x: auto; }
    .stg-table { width: 100%; border-collapse: collapse; font-size: 13px; font-family: 'Inter', sans-serif; }
    .stg-table th {
      font-weight: 600; padding: 10px 8px; border-bottom: 2px solid #eee; white-space: nowrap;
      color: #444; background: #fafafa; text-align: center;
    }
    .stg-table td { padding: 10px 8px; border-bottom: 1px solid #f5f5f5; text-align: center; }
    .stg-empty { color: #94a3b8; padding: 30px !important; }

    .stg-badge { display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 11.5px; font-weight: 700; }
    .stg-badge-on { background: rgba(25,135,84,0.1); color: #198754; }
    .stg-badge-off { background: rgba(220,53,69,0.1); color: #dc3545; }
    .stg-role-badge { background: rgba(13,110,253,0.08); color: #0d6efd; padding: 3px 12px; border-radius: 20px; font-size: 11.5px; font-weight: 700; }

    .stg-icon-btn {
      background: none; border: 1px solid #eee; color: #555; width: 30px; height: 30px; border-radius: 8px;
      cursor: pointer; margin: 0 3px; font-size: 12px;
    }
    .stg-icon-btn:hover { background: #f5f5f5; }
    .stg-icon-btn-danger { color: #dc3545; }
    .stg-icon-btn-danger:hover { background: rgba(220,53,69,0.08); border-color: #f3c9c9; }

    .stg-modal-overlay {
      position: fixed; inset: 0; background: rgba(15,23,42,0.45); z-index: 1000;
      display: none; align-items: center; justify-content: center; padding: 20px;
    }
    .stg-modal {
      background: #fff; border-radius: 16px; width: 100%; max-width: 420px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.25); overflow: hidden; animation: stg-modal-in 0.18s ease-out;
    }
    @keyframes stg-modal-in { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    .stg-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 18px 22px; border-bottom: 1px solid #f0ece6; }
    .stg-modal-header h3 { font-size: 15px; font-weight: 700; color: #1e293b; margin: 0; }
    .stg-modal-close { background: none; border: none; font-size: 15px; color: #94a3b8; cursor: pointer; }
    .stg-modal-close:hover { color: #333; }
    .stg-modal-body { padding: 20px 22px; max-height: 60vh; overflow-y: auto; }
    .stg-modal-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 22px; border-top: 1px solid #f0ece6; background: #fbf9f4; }

    .stg-form-group { margin-bottom: 14px; }
    .stg-form-group:last-child { margin-bottom: 0; }
    .stg-form-group label { display: block; font-size: 12.5px; font-weight: 600; color: #334155; margin-bottom: 6px; }
    .stg-input {
      width: 100%; padding: 9px 12px; font-size: 13px; border: 1px solid #e2e8f0; border-radius: 8px;
      box-sizing: border-box; font-family: 'Inter', sans-serif;
    }
    .stg-input:focus { border-color: #1e293b; outline: none; }
    .stg-input:disabled { background: #f8fafc; color: #94a3b8; }
    textarea.stg-input { resize: vertical; line-height: 1.5; }

    .stg-chip {
      display: inline-block; background: #f1f5f9; color: #334155; padding: 2px 9px; border-radius: 12px;
      font-size: 11.5px; font-weight: 600; margin: 2px 3px 2px 0;
    }
    .stg-muted { color: #94a3b8; font-size: 12px; }
    .stg-checklist {
      max-height: 220px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px;
    }
    .stg-checklist-item {
      display: flex; align-items: center; gap: 8px; padding: 5px 2px; font-size: 12.5px; color: #334155;
      cursor: pointer;
    }
    .stg-checklist-item input[type="checkbox"] { flex-shrink: 0; }
    .stg-checklist-item-disabled { color: #94a3b8; cursor: default; }

    .stg-toast-container {
      position: fixed; top: 20px; right: 20px; z-index: 2000;
      display: flex; flex-direction: column; gap: 10px;
    }
    .stg-toast {
      background: #1e293b; color: #fff; padding: 12px 18px; border-radius: 10px; font-size: 13px;
      display: flex; align-items: center; gap: 10px; box-shadow: 0 8px 20px rgba(0,0,0,0.2);
      opacity: 0; transform: translateX(20px); transition: all 0.25s ease; min-width: 220px;
    }
    .stg-toast.show { opacity: 1; transform: translateX(0); }
    .stg-toast-success { background: #15803d; }
    .stg-toast-error { background: #b91c1c; }
    .stg-toast-info { background: #1e293b; }
  `;
  document.head.appendChild(style);
}

window.renderSettings = renderSettings;
