// public/settings.js
// หน้า Settings: จัดการ Dropdown Options (Channel/SubChannel/Product/SubProduct/Admin) และ User Management
// ทำงานแบบ Demo Mode (localStorage) โดยดีฟอลต์ ถ้ามี window.CrmApi ต่อ backend จริงแล้วจะเรียกผ่าน CrmApi แทนอัตโนมัติ

const SETTINGS_STORAGE_KEY = 'qm_settings_v1';

const SETTINGS_CATEGORIES = [
  { key: 'Channel', label: 'Channel', sub: 'ช่องทางการขาย', icon: 'fa-bullhorn' },
  { key: 'SubChannel', label: 'Sub Channel', sub: 'ช่องทางการขายย่อย', icon: 'fa-code-branch' },
  { key: 'Product', label: 'Product', sub: 'สินค้าหลัก', icon: 'fa-box' },
  { key: 'SubProduct', label: 'Sub Product', sub: 'สินค้าย่อย', icon: 'fa-boxes-stacked' },
  { key: 'Admin', label: 'Admin', sub: 'ผู้ดูแลระบบ/แอดมิน', icon: 'fa-user-shield' }
];

const SETTINGS_ROLES = ['Super Admin', 'Manager', 'Sales Admin'];

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
      { id: stgUid(), username: 'admin', password: 'admin123', name: 'ผู้ดูแลระบบ', role: 'Super Admin', active: true, createdAt: new Date().toISOString() }
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

// --- Shared app state ---
window.AppData = window.AppData || {};
window.AppData.config = window.AppData.config || {};
window.AppData.users = window.AppData.users || [];

let __settingsUi = { mainTab: 'config', configTab: 'Channel' };

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
    </div>

    <div id="stg-maintab-body">
      ${__settingsUi.mainTab === 'config' ? stgBuildConfigSection() : stgBuildUsersSection()}
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

window.stgSwitchMainTab = function(tab) {
  __settingsUi.mainTab = tab;
  const body = document.getElementById('stg-maintab-body');
  document.querySelectorAll('.stg-maintab-btn').forEach(b => b.classList.remove('active'));
  const idx = tab === 'config' ? 0 : 1;
  const btns = document.querySelectorAll('.stg-maintab-btn');
  if (btns[idx]) btns[idx].classList.add('active');
  if (body) body.innerHTML = tab === 'config' ? stgBuildConfigSection() : stgBuildUsersSection();
};

// =====================================================
// หมวดที่ 1: Dropdown Options Management
// =====================================================
function stgBuildConfigSection() {
  const activeCat = __settingsUi.configTab;
  const items = (window.AppData.config[activeCat] || []);

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
          <p class="stg-subtitle">${stgCategorySub(activeCat)} • ทั้งหมด ${items.length} รายการ</p>
        </div>
        <button class="stg-btn stg-btn-primary" onclick="stgOpenConfigModal('${activeCat}')">
          <i class="fas fa-plus"></i> เพิ่มรายการ
        </button>
      </div>

      <div class="stg-table-wrapper">
        <table class="stg-table">
          <thead>
            <tr><th style="text-align:left;">ชื่อรายการ</th><th>สถานะ</th><th style="width:120px;">จัดการ</th></tr>
          </thead>
          <tbody>
            ${items.length === 0 ? `<tr><td colspan="3" class="stg-empty">ยังไม่มีข้อมูล</td></tr>` : items.map(item => `
              <tr>
                <td style="text-align:left; font-weight:600;">${stgEscapeHtml(item.name)}</td>
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
    </div>
  `;
}

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

  document.getElementById('stg-modal-title').textContent = isEdit
    ? `แก้ไขรายการ - ${stgCategoryLabel(category)}`
    : `เพิ่มรายการใหม่ - ${stgCategoryLabel(category)}`;

  document.getElementById('stg-modal-body').innerHTML = `
    <div class="stg-form-group">
      <label>ชื่อรายการ</label>
      <input type="text" id="stg-config-name" class="stg-input" value="${item ? stgEscapeHtml(item.name) : ''}" placeholder="เช่น Facebook">
    </div>
    <div class="stg-form-group">
      <label>สถานะ</label>
      <select id="stg-config-active" class="stg-input">
        <option value="1" ${!item || item.active ? 'selected' : ''}>Active</option>
        <option value="0" ${item && !item.active ? 'selected' : ''}>Disabled</option>
      </select>
    </div>
  `;

  const saveBtn = document.getElementById('stg-modal-save-btn');
  saveBtn.onclick = () => stgSaveConfigModal(category, itemId);
  stgOpenModal();
};

function stgSaveConfigModal(category, itemId) {
  const name = document.getElementById('stg-config-name').value.trim();
  const active = document.getElementById('stg-config-active').value === '1';
  if (!name) { stgToast('กรุณากรอกชื่อรายการ', 'error'); return; }

  const items = (window.AppData.config[category] || []).slice();
  if (itemId) {
    const idx = items.findIndex(x => x.id === itemId);
    if (idx >= 0) items[idx] = Object.assign({}, items[idx], { name, active });
  } else {
    items.push({ id: stgUid(), name, active });
  }

  settingsApiSaveConfig(category, items).then(() => {
    window.AppData.config[category] = items;
    stgCloseModal();
    stgSwitchConfigTab(category);
    stgToast(itemId ? 'แก้ไขรายการสำเร็จ' : 'เพิ่มรายการสำเร็จ', 'success');
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
              <th>สถานะ</th>
              <th style="width:130px;">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            ${users.length === 0 ? `<tr><td colspan="5" class="stg-empty">ยังไม่มีผู้ใช้งาน</td></tr>` : users.map(u => `
              <tr>
                <td style="text-align:left; font-weight:600;">${stgEscapeHtml(u.username)}</td>
                <td style="text-align:left;">${stgEscapeHtml(u.name)}</td>
                <td><span class="stg-role-badge">${stgEscapeHtml(u.role)}</span></td>
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
    <div class="stg-form-group">
      <label>สถานะ</label>
      <select id="stg-user-active" class="stg-input">
        <option value="1" ${!user || user.active ? 'selected' : ''}>Active</option>
        <option value="0" ${user && !user.active ? 'selected' : ''}>Deactivated</option>
      </select>
    </div>
  `;

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
  const active = document.getElementById('stg-user-active').value === '1';

  if (!isEdit && !username) { stgToast('กรุณากรอก Username', 'error'); return; }
  if (!name) { stgToast('กรุณากรอกชื่อผู้ใช้งาน', 'error'); return; }
  if (!isEdit && !password) { stgToast('กรุณาตั้งรหัสผ่าน', 'error'); return; }

  const users = (window.AppData.users || []).slice();

  if (isEdit) {
    const idx = users.findIndex(x => x.id === userId);
    if (idx < 0) return;
    const updated = Object.assign({}, users[idx], { name, role, active });
    if (password) updated.password = password;
    users[idx] = updated;
  } else {
    if (users.some(x => x.username.toLowerCase() === username.toLowerCase())) {
      stgToast('Username นี้ถูกใช้งานแล้ว', 'error');
      return;
    }
    users.push({ id: stgUid(), username, password, name, role, active, createdAt: new Date().toISOString() });
  }

  settingsApiSaveUsers(users).then(() => {
    window.AppData.users = users;
    stgCloseModal();
    stgSwitchMainTab('users');
    stgToast(isEdit ? 'แก้ไขผู้ใช้งานสำเร็จ' : 'เพิ่มผู้ใช้งานสำเร็จ', 'success');
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
    .stg-maintab-btn.active { background-color: #fce268; border-color: #fce268; color: #333; }

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
    .stg-subtab-btn.active { background: #d95f1d; border-color: #d95f1d; color: #fff; }

    .stg-section-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
    .stg-section-toolbar h3 { font-size: 15px; font-weight: 700; color: #1e293b; margin: 0 0 3px 0; }
    .stg-subtitle { font-size: 12px; color: #7a665e; margin: 0; }

    .stg-btn {
      border: none; border-radius: 20px; padding: 9px 18px; font-weight: 600; font-size: 13px;
      cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: opacity 0.15s;
    }
    .stg-btn:hover { opacity: 0.9; }
    .stg-btn-primary { background: #d95f1d; color: #fff; }
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
    .stg-input:focus { border-color: #d95f1d; outline: none; }
    .stg-input:disabled { background: #f8fafc; color: #94a3b8; }

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
