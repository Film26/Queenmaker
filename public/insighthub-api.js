// public/insighthub-api.js
// Client for the InsightHub tab's Google Apps Script backend - ported from the reference
// app (Film26/Insinghub, js/api.js) and renamed to window.InsightHubApi (window.CrmApi is
// already taken by public/api-client.js, which talks to Queenmaker's own Express/Redis
// backend for Users/Notes - this is a completely separate data pipeline, see the InsightHub
// port plan). Every call is a plain GET with query-string params, since Apps Script web apps
// don't handle CORS preflights for POST/JSON bodies well.
(function () {
  // Unlike the reference app (which keeps the Apps Script URL in localStorage, per-browser),
  // Queenmaker stores it centrally in Redis (/api/insighthub/config) so the whole team shares
  // one connection - fetched once and cached in memory, refreshed after Settings saves a new URL.
  let cachedScriptUrl = null;
  let cachedScriptUrlPromise = null;

  async function fetchScriptUrl() {
    const res = await fetch('/api/insighthub/config', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('โหลดการตั้งค่า InsightHub ไม่สำเร็จ');
    const data = await res.json();
    return (data && data.scriptUrl) || '';
  }

  async function getBaseUrl() {
    if (cachedScriptUrl !== null) return cachedScriptUrl;
    if (!cachedScriptUrlPromise) {
      cachedScriptUrlPromise = fetchScriptUrl().then(url => {
        cachedScriptUrl = url;
        return url;
      }).catch(err => {
        cachedScriptUrlPromise = null;
        throw err;
      });
    }
    return cachedScriptUrlPromise;
  }

  // Called by Settings right after it saves a new URL, so the rest of the app picks up the
  // change immediately instead of keeping the previously-cached (possibly blank/old) value.
  function invalidateBaseUrlCache() {
    cachedScriptUrl = null;
    cachedScriptUrlPromise = null;
  }

  async function apiRequest(action, params) {
    const base = await getBaseUrl();
    if (!base) {
      throw new Error('ยังไม่ได้ตั้งค่า Apps Script URL สำหรับ InsightHub กรุณาไปที่หน้า Settings เพื่อกรอก URL ก่อน');
    }

    let url;
    try {
      url = new URL(base);
    } catch (e) {
      throw new Error('Apps Script URL ของ InsightHub ไม่ถูกต้อง กรุณาตรวจสอบที่หน้า Settings');
    }
    url.searchParams.set('action', action);
    Object.keys(params || {}).forEach((key) => {
      const value = params[key];
      if (value === undefined || value === null) return; // avoid sending the literal string "undefined"/"null"
      url.searchParams.set(key, value);
    });
    // กัน browser cache ตอบ response เก่าซ้ำ (URL เดิมทุก field เหมือนเดิมทุกครั้งที่เรียก
    // เพราะเป็น GET ล้วน - ถ้าไม่กันไว้ กด Refresh แล้วอาจได้ข้อมูลเก่าที่ไม่ตรงกับชีตปัจจุบัน)
    url.searchParams.set('_ts', Date.now().toString());

    let res;
    try {
      res = await fetch(url.toString(), { method: 'GET', redirect: 'follow', cache: 'no-store' });
    } catch (e) {
      throw new Error('เชื่อมต่อ Apps Script ไม่สำเร็จ (เครือข่าย/CORS) กรุณาตรวจสอบ URL และการ Deploy');
    }

    if (!res.ok) {
      throw new Error('เซิร์ฟเวอร์ตอบกลับผิดพลาด (HTTP ' + res.status + ')');
    }

    let data;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error('รูปแบบข้อมูลที่ได้รับไม่ถูกต้อง (ไม่ใช่ JSON)');
    }

    if (data && data.success === false) {
      throw new Error(data.error || 'เกิดข้อผิดพลาดจากเซิร์ฟเวอร์');
    }
    return data;
  }

  window.InsightHubApi = {
    getBaseUrl,
    invalidateBaseUrlCache,
    ping() {
      return apiRequest('ping', {});
    },
    getOrders() {
      return apiRequest('orders', {});
    },
    getNotes() {
      return apiRequest('notes', {});
    },
    upsertNote({ customerKey, customerName, note, statuses, requestUser }) {
      return apiRequest('upsertNote', {
        customerKey,
        customerName: customerName || '',
        note: note || '',
        statuses: statuses || '',
        requestUser: requestUser || '',
      });
    },
    getStatusOptions() {
      return apiRequest('statusOptions', {});
    },
    saveStatusOptions(requestUser, optionsPipeJoined) {
      return apiRequest('saveStatusOptions', { requestUser, options: optionsPipeJoined || '' });
    },
    getAppConfig() {
      return apiRequest('appConfig', {});
    },
    saveAppConfig(requestUser, key, valueObj) {
      return apiRequest('saveAppConfig', { requestUser, key, value: JSON.stringify(valueObj) });
    },
  };
})();
