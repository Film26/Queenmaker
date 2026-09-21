// public/api-client.js
// Implements window.CrmApi, the extension point settings.js already calls
// (settingsApiGetUsers/settingsApiSaveUsers) but that was previously never defined,
// so User Management always fell through to localStorage-only "Demo Mode".
// getUsers/saveUsers talk to /api/users; getConfigState/saveConfig talk to /api/config, which
// holds the Channel/SubChannel/Product/SubProduct/Admin lists. Both are scoped server-side to the
// signed-in user's organization - the browser never says which org it wants.
window.CrmApi = {
  // -> { config: { Channel: [...], ... } (only categories the org has saved), useDemoDefaults }
  getConfigState: function () {
    return fetch('/api/config', { credentials: 'same-origin' }).then(res => {
      if (!res.ok) throw new Error('Failed to load settings (' + res.status + ')');
      return res.json();
    });
  },
  // `config` is a { Category: items } map; categories not included are left untouched server-side.
  saveConfig: function (config) {
    return fetch('/api/config', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: config })
    }).then(res => res.json().then(body => {
      if (!res.ok) throw new Error(body.error || ('Failed to save settings (' + res.status + ')'));
      return body.config;
    }));
  },
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
