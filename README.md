# CRM Webapp (AstroBiz)

Simple Node + Express scaffold that serves two pages and allows uploading or loading the sample CSV `RAW 2025 - RAW.csv`.

Run:

```bash
cd crm-webapp
npm install
npm start
```

Open http://localhost:3000 in your browser.

Notes:
- Page 1 uses `หน้าเว็บ1.jpg` as theme hero and Page 2 uses `หน้าเว็บ2.jpg`.
- The server serves workspace files under `/assets`, so the CSV and images in the project root are available to load.

## Organizations (multi-customer)

Every user belongs to one organization, and the data below is stored per organization - two
customers on the same deployment never see each other's: users, KPI Setting, Settings lists
(Channel / Sub Channel / Product / Sub Product / Admin), Sales Notes, contact-status options,
Google access requests and the Export Log. The server always takes the organization from the
signed-in user's session, never from the request.

Everything that existed before lands in `org_default` the first time the new schema runs.
To give a customer their own organization, run this once against the database:

```sql
INSERT INTO organizations (id, name, email_domain)
VALUES ('org_customer1', 'Customer name', 'customer.co.th');   -- email_domain is optional

UPDATE users SET org_id = 'org_customer1' WHERE username IN ('admin@customer.co.th');
-- optional: move that customer's past export log entries with them
UPDATE audit_log SET org_id = 'org_customer1'
 WHERE type = 'data_export' AND data->>'userId' IN (SELECT id FROM users WHERE org_id = 'org_customer1');
```

`email_domain` routes a Google sign-in from an unknown address at that domain to this
organization's access-request queue (otherwise it goes to `org_default`). Never set it to a public
domain such as `gmail.com`. New users created by a Super Admin, or approved from an access request,
always join that Super Admin's organization.

Not yet per organization: the InsightHub tab's Google Apps Script connection.
