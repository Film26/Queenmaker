// public/api-client.js
// Implements window.CrmApi, the extension point settings.js already calls
// (settingsApiGetUsers/settingsApiSaveUsers) but that was previously never defined,
// so User Management always fell through to localStorage-only "Demo Mode".
// Only getUsers/saveUsers are implemented here - Channel/SubChannel/Product/SubProduct/Admin
// config intentionally still goes through localStorage (settings.js's existing fallback),
// since that data is unrelated to authentication.
window.CrmApi = {
  getUsers: function () {
    return fetch('/api/users', { credentials: 'same-origin' }).then(res => {
      if (!res.ok) throw new Error('Failed to load users (' + res.status + ')');
      return res.json();
    });
  },
  saveUsers: function (users) {
    return fetch('/api/users', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(users)
    }).then(res => {
      if (!res.ok) return res.json().then(body => { throw new Error(body.error || ('Failed to save users (' + res.status + ')')); });
      return res.json();
    });
  }
};
