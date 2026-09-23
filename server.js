const http = require("http");
const { URL } = require("url");
const Stripe = require("stripe");
const crypto = require("crypto");
const { Pool } = require("pg");

// ============================================================
// CONFIGURATION
// ============================================================

const PORT = Number(process.env.PORT || 10000);

const KOALA_CRYPTO_URL = (
  process.env.KOALA_CRYPTO_URL ||
  "https://koala-2-trqv.onrender.com"
).replace(/\/+$/, "");

const KOALA_STORE_URL = (
  process.env.KOALA_STORE_URL ||
  "https://koala-store-1.onrender.com"
).replace(/\/+$/, "");

const STRIPE_SECRET_KEY = (
  process.env.STRIPE_SECRET_KEY || ""
).trim();

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY)
  : null;

// ============================================================
// ESPACE MARCHAND - MULTI-MARCHANDS / POSTGRESQL PARTAGE
// ============================================================

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : null;

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || "").split(";").forEach(part => {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0,i).trim()] = decodeURIComponent(part.slice(i+1).trim());
  });
  return out;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [salt, expected] = String(stored || "").split(":");
    if (!salt || !expected) return false;
    const actual = crypto.scryptSync(String(password), salt, 64);
    const expectedBuffer = Buffer.from(expected, "hex");
    return expectedBuffer.length === actual.length &&
      crypto.timingSafeEqual(expectedBuffer, actual);
  } catch {
    return false;
  }
}

async function initStoreDatabase() {
  if (!pool) {
    console.log("Koala Store PostgreSQL : DATABASE_URL non configurée");
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS store_merchants (
      id BIGSERIAL PRIMARY KEY,
      business_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS store_sessions (
      token TEXT PRIMARY KEY,
      merchant_id BIGINT NOT NULL REFERENCES store_merchants(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS store_sessions_merchant_id_idx
    ON store_sessions(merchant_id)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS store_orders (
      id BIGSERIAL PRIMARY KEY,
      merchant_id BIGINT NOT NULL REFERENCES store_merchants(id) ON DELETE CASCADE,
      payment_method TEXT NOT NULL,
      amount_eur NUMERIC(12,2) NOT NULL,
      installments_count INTEGER,
      status TEXT NOT NULL DEFAULT 'created',
      external_reference TEXT,
      items_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS store_orders_merchant_id_idx
    ON store_orders(merchant_id, created_at DESC)
  `);

  await pool.query(`
    ALTER TABLE store_orders
    ADD COLUMN IF NOT EXISTS paid_amount_eur NUMERIC(12,2) NOT NULL DEFAULT 0
  `);

  await pool.query(`
    ALTER TABLE store_orders
    ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS store_payout_requests (
      id BIGSERIAL PRIMARY KEY,
      merchant_id BIGINT NOT NULL REFERENCES store_merchants(id) ON DELETE CASCADE,
      amount_eur NUMERIC(12,2) NOT NULL CHECK (amount_eur > 0),
      status TEXT NOT NULL DEFAULT 'requested',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMPTZ,
      payout_reference TEXT
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS store_payout_requests_merchant_idx
    ON store_payout_requests(merchant_id, created_at DESC)
  `);

  await pool.query(`
    DELETE FROM store_sessions
    WHERE expires_at <= NOW()
  `);

  console.log("Tables Koala Store : store_merchants / store_sessions OK");
}

async function merchantSession(req) {
  if (!pool) return null;
  const token = parseCookies(req).koala_merchant_session;
  if (!token) return null;

  const result = await pool.query(`
    SELECT
      s.token,
      m.id AS merchant_id,
      m.business_name,
      m.email
    FROM store_sessions s
    JOIN store_merchants m ON m.id = s.merchant_id
    WHERE s.token = $1
      AND s.expires_at > NOW()
    LIMIT 1
  `, [token]);

  return result.rows[0] || null;
}

function merchantLoginPage(error = "", success = "") {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Koala Store - Marchand</title><style>body{margin:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#151515}.box{max-width:430px;margin:45px auto;padding:20px}.card{background:#fff;border-radius:22px;padding:24px;box-shadow:0 8px 30px rgba(0,0,0,.08)}h1{margin:0 0 8px}.sub{color:#666;margin-bottom:22px}label{display:block;font-weight:800;margin:12px 0 6px}input{width:100%;box-sizing:border-box;padding:13px;border:1px solid #ddd;border-radius:12px;font-size:16px}button,.back,.register{display:block;width:100%;box-sizing:border-box;margin-top:16px;padding:14px;border:0;border-radius:12px;background:#111;color:#fff;font-weight:900;font-size:16px;text-align:center;text-decoration:none}.register{background:#16a34a}.back{background:#eee;color:#111}.err{background:#fee2e2;color:#991b1b;padding:11px;border-radius:10px;margin-bottom:12px}.ok{background:#dcfce7;color:#166534;padding:11px;border-radius:10px;margin-bottom:12px}</style></head><body><div class="box"><div class="card"><h1>🐨 Espace marchand</h1><div class="sub">Connexion Koala Store</div>${error ? `<div class="err">${error}</div>` : ""}${success ? `<div class="ok">${success}</div>` : ""}<form method="post" action="/merchant/login"><label>E-mail</label><input type="email" name="email" autocomplete="username" required><label>Mot de passe</label><input type="password" name="password" autocomplete="current-password" required><button type="submit">Se connecter</button></form><a class="register" href="/merchant/register">Créer un compte marchand</a><a class="back" href="/">Retour au magasin</a></div></div></body></html>`;
}

function merchantRegisterPage(error = "") {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Créer un compte marchand</title><style>body{margin:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#151515}.box{max-width:430px;margin:40px auto;padding:20px}.card{background:#fff;border-radius:22px;padding:24px;box-shadow:0 8px 30px rgba(0,0,0,.08)}h1{margin:0 0 8px}.sub{color:#666;margin-bottom:22px}label{display:block;font-weight:800;margin:12px 0 6px}input{width:100%;box-sizing:border-box;padding:13px;border:1px solid #ddd;border-radius:12px;font-size:16px}button,.back{display:block;width:100%;box-sizing:border-box;margin-top:16px;padding:14px;border:0;border-radius:12px;background:#16a34a;color:#fff;font-weight:900;font-size:16px;text-align:center;text-decoration:none}.back{background:#eee;color:#111}.err{background:#fee2e2;color:#991b1b;padding:11px;border-radius:10px;margin-bottom:12px}</style></head><body><div class="box"><div class="card"><h1>🏪 Créer un compte</h1><div class="sub">Inscription marchand Koala Store</div>${error ? `<div class="err">${error}</div>` : ""}<form method="post" action="/merchant/register"><label>Nom du commerce</label><input name="business_name" maxlength="120" required><label>E-mail</label><input type="email" name="email" autocomplete="username" required><label>Mot de passe</label><input type="password" name="password" minlength="8" autocomplete="new-password" required><button type="submit">Créer mon compte marchand</button></form><a class="back" href="/merchant/login">J’ai déjà un compte</a></div></div></body></html>`;
}

async function merchantCollectedAmount(merchantId) {
  const result = await pool.query(`
    SELECT COALESCE(SUM(
      CASE
        WHEN so.payment_method = 'crypto' THEN COALESCE((
          SELECT SUM(ki.amount_eur)
          FROM koala_installments ki
          WHERE ki.order_id = CASE
            WHEN so.external_reference ~ '^[0-9]+$' THEN so.external_reference::bigint
            ELSE NULL
          END
          AND (ki.paid_at IS NOT NULL OR UPPER(COALESCE(ki.status,'')) IN ('PAYE','PAYÉ','PAID','CONFIRMED'))
        ),0)
        ELSE COALESCE(so.paid_amount_eur,0)
      END
    ),0)::numeric AS collected
    FROM store_orders so
    WHERE so.merchant_id = $1
  `, [merchantId]);
  return Number(result.rows[0]?.collected || 0);
}

async function merchantReservedOrPaidPayouts(merchantId) {
  const result = await pool.query(`
    SELECT COALESCE(SUM(amount_eur),0)::numeric AS total
    FROM store_payout_requests
    WHERE merchant_id = $1
      AND status IN ('requested','processing','paid')
  `, [merchantId]);
  return Number(result.rows[0]?.total || 0);
}

async function merchantAvailableBalance(merchantId) {
  const collected = await merchantCollectedAmount(merchantId);
  const reserved = await merchantReservedOrPaidPayouts(merchantId);
  return Math.max(collected - reserved, 0);
}

async function merchantDashboardPage(session) {
  let orderCount = 0;
  let collected = 0;
  let toReceive = 0;
  let availableBalance = 0;
  let payoutRequests = [];
  let orders = [];

  if (pool) {
    const result = await pool.query(`
      SELECT
        so.id, so.payment_method, so.amount_eur, so.installments_count,
        so.status, so.external_reference, so.created_at,
        CASE
          WHEN so.payment_method = 'crypto' THEN COALESCE((
            SELECT SUM(ki.amount_eur)
            FROM koala_installments ki
            WHERE ki.order_id = CASE
              WHEN so.external_reference ~ '^[0-9]+$' THEN so.external_reference::bigint
              ELSE NULL
            END
            AND (ki.paid_at IS NOT NULL OR UPPER(COALESCE(ki.status,'')) IN ('PAYE','PAYÉ','PAID','CONFIRMED'))
          ),0)
          ELSE COALESCE(so.paid_amount_eur,0)
        END::numeric AS collected_eur,
        CASE WHEN so.payment_method = 'crypto' THEN (
          SELECT COUNT(*)::int
          FROM koala_installments ki
          WHERE ki.order_id = CASE
            WHEN so.external_reference ~ '^[0-9]+$' THEN so.external_reference::bigint
            ELSE NULL
          END
          AND (ki.paid_at IS NOT NULL OR UPPER(COALESCE(ki.status,'')) IN ('PAYE','PAYÉ','PAID','CONFIRMED'))
        ) ELSE NULL END AS paid_installments,
        CASE WHEN so.payment_method = 'crypto' THEN (
          SELECT ki.amount_eur
          FROM koala_installments ki
          WHERE ki.order_id = CASE
            WHEN so.external_reference ~ '^[0-9]+$' THEN so.external_reference::bigint
            ELSE NULL
          END
          AND NOT (ki.paid_at IS NOT NULL OR UPPER(COALESCE(ki.status,'')) IN ('PAYE','PAYÉ','PAID','CONFIRMED'))
          ORDER BY ki.number ASC
          LIMIT 1
        ) ELSE NULL END AS next_amount,
        CASE WHEN so.payment_method = 'crypto' THEN (
          SELECT ki.due_date
          FROM koala_installments ki
          WHERE ki.order_id = CASE
            WHEN so.external_reference ~ '^[0-9]+$' THEN so.external_reference::bigint
            ELSE NULL
          END
          AND NOT (ki.paid_at IS NOT NULL OR UPPER(COALESCE(ki.status,'')) IN ('PAYE','PAYÉ','PAID','CONFIRMED'))
          ORDER BY ki.number ASC
          LIMIT 1
        ) ELSE NULL END AS next_due_date
      FROM store_orders so
      WHERE so.merchant_id = $1
      ORDER BY so.created_at DESC
      LIMIT 50
    `, [session.merchant_id]);

    orders = result.rows;
    orderCount = orders.length;
    collected = orders.reduce((sum,o) => sum + Number(o.collected_eur || 0), 0);
    toReceive = orders.reduce((sum,o) => sum + Math.max(Number(o.amount_eur || 0) - Number(o.collected_eur || 0), 0), 0);
    availableBalance = await merchantAvailableBalance(session.merchant_id);

    const payouts = await pool.query(`
      SELECT id,amount_eur,status,created_at,processed_at,payout_reference
      FROM store_payout_requests
      WHERE merchant_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `, [session.merchant_id]);
    payoutRequests = payouts.rows;
  }

  const payoutRows = payoutRequests.length
    ? payoutRequests.map(p => {
        const labels = {requested:"Demandé",processing:"En traitement",paid:"Versé",rejected:"Refusé"};
        return `<div class="payoutRow"><span>Versement #${p.id} · ${new Date(p.created_at).toLocaleDateString("fr-FR")}</span><b>${money(p.amount_eur)} € · ${labels[p.status] || p.status}</b></div>`;
      }).join("")
    : `<div class="muted">Aucune demande de versement.</div>`;

  const orderRows = orders.length ? orders.map(order => {
    const total = Number(order.amount_eur || 0);
    const paid = Math.min(total, Number(order.collected_eur || 0));
    const remaining = Math.max(total - paid, 0);
    const statusText = paid >= total && total > 0 ? "Payée" : paid > 0 ? "Partiellement payée" : "En attente";
    const nextDate = order.next_due_date
      ? new Date(order.next_due_date).toLocaleDateString("fr-FR")
      : "—";

    return `
      <div class="orderCard">
        <div class="orderHead"><b>Commande #${order.id}</b><span class="badge">${statusText}</span></div>
        <div class="muted">${new Date(order.created_at).toLocaleString("fr-FR")}</div>
        <div class="details">
          <div><span>Total</span><b>${money(total)} €</b></div>
          <div><span>Encaissé</span><b>${money(paid)} €</b></div>
          <div><span>Reste à recevoir</span><b>${money(remaining)} €</b></div>
          <div><span>Paiement</span><b>${order.payment_method === "crypto" ? "Koala Crypto" : "Carte bancaire"}</b></div>
          ${order.payment_method === "crypto" ? `
            <div><span>Échéances</span><b>${Number(order.paid_installments || 0)} / ${Number(order.installments_count || 0)} payée(s)</b></div>
            <div><span>Prochaine échéance</span><b>${order.next_amount != null ? money(order.next_amount) + " €" : "—"}</b></div>
            <div><span>Date</span><b>${nextDate}</b></div>
          ` : ""}
        </div>
      </div>`;
  }).join("") : `<div class="muted">Aucune commande enregistrée pour le moment.</div>`;

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tableau de bord marchand</title><style>
  body{margin:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#151515}
  .wrap{max-width:900px;margin:auto;padding:20px}.top{display:flex;justify-content:space-between;align-items:center;gap:12px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:20px}.card,.orderCard{background:#fff;border-radius:18px;padding:18px;border:1px solid #eee}
  .value{font-size:26px;font-weight:950;margin-top:8px}.muted{color:#666}.btn{display:inline-block;background:#111;color:#fff;padding:11px 14px;border-radius:11px;text-decoration:none;font-weight:800}
  .orders{margin-top:14px}.orderCard{margin-top:12px}.orderHead{display:flex;justify-content:space-between;gap:10px;align-items:center}.badge{background:#f3f4f6;padding:6px 9px;border-radius:999px;font-size:12px;font-weight:900}
  .details{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:14px}.details div{background:#f8fafc;border-radius:11px;padding:10px;display:flex;flex-direction:column;gap:4px}.details span{font-size:12px;color:#666}.payoutBox{margin-top:14px}.payoutForm{display:flex;gap:8px;margin-top:12px}.payoutForm input{flex:1;padding:12px;border:1px solid #ddd;border-radius:10px;font-size:16px}.payoutForm button{border:0;background:#16a34a;color:#fff;border-radius:10px;padding:12px 14px;font-weight:900}.payoutRow{display:flex;justify-content:space-between;gap:10px;padding:11px 0;border-bottom:1px solid #eee}
  @media(max-width:600px){.grid{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}.details{grid-template-columns:1fr}}
  </style></head><body><div class="wrap"><div class="top"><div><h1>🏪 ${session.business_name}</h1><div class="muted">${session.email}</div></div><a class="btn" href="/merchant/logout">Déconnexion</a></div>
  <div class="grid"><div class="card"><b>Commandes</b><div class="value">${orderCount}</div></div><div class="card"><b>Encaissé</b><div class="value">${money(collected)} €</div><div class="muted">Paiements confirmés.</div></div><div class="card"><b>À recevoir</b><div class="value">${money(toReceive)} €</div><div class="muted">Solde restant.</div></div><div class="card"><b>Solde disponible</b><div class="value">${money(availableBalance)} €</div><div class="muted">Disponible pour une demande de versement.</div></div></div>
  <div class="card payoutBox"><h2>Demander un versement</h2><div class="muted">Cette étape enregistre la demande. Le virement bancaire Stripe Connect sera branché ensuite.</div><form class="payoutForm" method="post" action="/merchant/payout"><input name="amount" type="number" min="0.01" step="0.01" max="${money(availableBalance)}" placeholder="Montant en €" required><button type="submit">Demander</button></form><h3>Historique</h3>${payoutRows}</div>
  <div class="card orders"><h2>Détail des commandes</h2>${orderRows}</div><p><a class="btn" href="/">Voir Koala Store</a></p></div></body></html>`;
}

function readForm(req) {
  return new Promise((resolve,reject) => {
    let body="";
    req.on("data", c => {
      body += c;
      if (body.length > 1000000) req.destroy();
    });
    req.on("end", () => {
      const p = new URLSearchParams(body);
      resolve(Object.fromEntries(p.entries()));
    });
    req.on("error", reject);
  });
}

// ============================================================
// OUTILS HTTP
// ============================================================

function send(res, status, type, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    ...headers
  });

  res.end(body);
}

function json(res, status, data) {
  send(
    res,
    status,
    "application/json; charset=utf-8",
    JSON.stringify(data)
  );
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk;

      if (body.length > 1000000) {
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

function money(value) {
  return Number(value || 0).toFixed(2);
}

// ============================================================
// PAGE KOALA STORE
// ============================================================

function pageHtml(url) {
  const cryptoSuccess =
    url.searchParams.get("status") === "paid";

  const stripeSuccess =
    url.searchParams.get("stripe") === "success";

  const stripeCancelled =
    url.searchParams.get("stripe") === "cancel";

  const orderId =
    url.searchParams.get("order_id") || "";

  const amount =
    url.searchParams.get("amount") || "";

  return `<!doctype html>
<html lang="fr">

<head>

<meta charset="utf-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1,maximum-scale=1"
>

<title>Koala Store</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #f5f5f5;
  color: #151515;
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Arial,
    sans-serif;
  padding-bottom: 90px;
}

button,
input {
  font: inherit;
}

button {
  cursor: pointer;
}

.top {
  position: sticky;
  top: 0;
  z-index: 100;
  background: white;
  padding: 14px 12px 10px;
  border-bottom: 1px solid #eee;
}

.topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.logo {
  font-size: 22px;
  font-weight: 950;
}

.cart-top {
  border: 0;
  background: #111;
  color: white;
  border-radius: 999px;
  padding: 8px 12px;
  font-weight: 800;
}

.search {
  display: flex;
  align-items: center;
  border: 2px solid #111;
  border-radius: 999px;
  overflow: hidden;
  background: white;
}

.search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  padding: 12px 15px;
  font-size: 16px;
}

.search button {
  border: 0;
  background: #111;
  color: white;
  padding: 12px 17px;
}

.notice {
  margin: 12px;
  padding: 14px;
  border-radius: 14px;
  background: #ecfdf5;
  border: 1px solid #86efac;
  color: #166534;
  font-weight: 800;
}

.notice.cancel {
  background: #fff7ed;
  border-color: #fdba74;
  color: #9a3412;
}

.promo {
  margin: 12px;
  border-radius: 18px;
  padding: 18px;
  background: linear-gradient(
    135deg,
    #111827,
    #374151
  );
  color: white;
}

.promo-title {
  font-size: 27px;
  font-weight: 950;
}

.promo-text {
  margin-top: 6px;
  opacity: .88;
}

.promo-badge {
  display: inline-block;
  margin-top: 12px;
  background: white;
  color: #111827;
  border-radius: 999px;
  padding: 7px 11px;
  font-weight: 900;
}

.categories {
  display: flex;
  gap: 9px;
  overflow-x: auto;
  padding: 4px 12px 13px;
}

.category {
  flex: 0 0 auto;
  border: 1px solid #ddd;
  background: white;
  border-radius: 999px;
  padding: 9px 14px;
  font-weight: 750;
}

.category.active {
  background: #111;
  color: white;
  border-color: #111;
}

.section-title {
  padding: 4px 12px 10px;
  font-size: 20px;
  font-weight: 950;
}

.products {
  display: grid;
  grid-template-columns: repeat(2,1fr);
  gap: 8px;
  padding: 0 8px 16px;
}

.product {
  background: white;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid #eee;
}

.product-image {
  height: 190px;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 74px;
  background: linear-gradient(
    145deg,
    #f8fafc,
    #e5e7eb
  );
}

.product-info {
  padding: 10px;
}

.product-name {
  font-weight: 750;
  font-size: 14px;
  min-height: 35px;
}

.rating {
  font-size: 12px;
  margin: 5px 0;
  color: #f59e0b;
}

.sold {
  color: #777;
}

.old-price {
  font-size: 12px;
  color: #888;
  text-decoration: line-through;
}

.product-price {
  font-size: 20px;
  font-weight: 950;
}

.discount {
  display: inline-block;
  font-size: 11px;
  background: #fee2e2;
  color: #dc2626;
  padding: 3px 5px;
  border-radius: 5px;
  font-weight: 850;
}

.add {
  width: 100%;
  margin-top: 8px;
  padding: 10px;
  border: 0;
  border-radius: 9px;
  background: #111;
  color: white;
  font-weight: 850;
}


.product-detail-overlay {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 650;
  background: #f5f5f5;
  overflow-y: auto;
}
.product-detail-overlay.show { display: block; }
.product-detail-page {
  max-width: 760px;
  margin: 0 auto;
  min-height: 100vh;
  background: white;
  padding-bottom: 30px;
}
.product-detail-top {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px;
  background: rgba(255,255,255,.96);
  border-bottom: 1px solid #eee;
}
.product-detail-back {
  border: 0;
  background: #f1f5f9;
  border-radius: 999px;
  width: 40px;
  height: 40px;
  font-size: 20px;
}
.product-detail-title { font-weight: 950; font-size: 18px; }
.product-detail-hero {
  height: 330px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 120px;
  background: linear-gradient(145deg,#f8fafc,#e5e7eb);
}
.product-detail-body { padding: 20px; }
.product-detail-name { font-size: 28px; font-weight: 950; }
.product-detail-category { color: #666; margin-top: 5px; }
.product-detail-price { font-size: 30px; font-weight: 950; margin-top: 16px; }
.product-detail-old { color: #888; text-decoration: line-through; margin-left: 8px; font-size: 16px; }
.product-detail-description {
  margin-top: 20px; line-height: 1.55; color: #444;
}
.product-detail-specs {
  margin-top: 18px; background: #f8fafc; border-radius: 16px; padding: 16px;
}
.product-detail-specs div {
  padding: 9px 0; border-bottom: 1px solid #e5e7eb;
  display: flex; justify-content: space-between; gap: 15px;
}
.product-detail-specs div:last-child { border-bottom: 0; }
.product-detail-add {
  width: 100%; margin-top: 20px; padding: 16px; border: 0;
  border-radius: 13px; background: #111; color: white;
  font-size: 17px; font-weight: 950;
}

.overlay {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 500;
  background: rgba(0,0,0,.5);
  align-items: flex-end;
}

.overlay.show {
  display: flex;
}

.sheet {
  width: 100%;
  max-height: 92vh;
  overflow-y: auto;
  background: white;
  border-radius: 24px 24px 0 0;
  padding: 18px;
  padding-bottom: 35px;
}

.handle {
  width: 45px;
  height: 5px;
  background: #ddd;
  border-radius: 999px;
  margin: 0 auto 15px;
}

.close {
  float: right;
  border: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  font-size: 20px;
  background: #eee;
}

.cart-row {
  display: grid;
  grid-template-columns: 55px 1fr auto;
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px solid #eee;
  align-items: center;
}

.cart-icon {
  width: 55px;
  height: 55px;
  background: #f1f5f9;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 29px;
}

.cart-name {
  font-weight: 850;
}

.cart-price {
  font-weight: 900;
  margin-top: 4px;
}

.quantity {
  display: flex;
  align-items: center;
  gap: 7px;
}

.quantity button {
  border: 0;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  font-weight: 950;
}

.total {
  display: flex;
  justify-content: space-between;
  font-size: 23px;
  font-weight: 950;
  padding: 18px 0;
}

.payment-title {
  font-size: 17px;
  font-weight: 900;
  margin-bottom: 10px;
}

.payment-methods {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}

.payment-method {
  border: 2px solid #e5e7eb;
  background: white;
  padding: 13px 8px;
  border-radius: 12px;
  font-weight: 850;
}

.payment-method.selected {
  border-color: #111;
  background: #f3f4f6;
}

.plans {
  display: none;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
  margin-top: 10px;
}

.plans.show {
  display: grid;
}

.plan {
  border: 2px solid #ddd;
  background: white;
  border-radius: 12px;
  padding: 12px;
  font-weight: 850;
}

.plan.selected {
  border-color: #16a34a;
  background: #f0fdf4;
}

.plan-small {
  display: block;
  font-size: 11px;
  margin-top: 4px;
  color: #666;
}

.pay {
  width: 100%;
  border: 0;
  margin-top: 14px;
  padding: 15px;
  border-radius: 13px;
  background: #111;
  color: white;
  font-weight: 950;
  font-size: 17px;
}

.pay.crypto {
  background: #16a34a;
}

.pay:disabled {
  opacity: .45;
}

.message {
  margin-top: 10px;
  font-size: 13px;
  color: #555;
}

.bottom-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 300;
  height: 70px;
  background: white;
  border-top: 1px solid #ddd;
  display: grid;
  grid-template-columns: repeat(4,1fr);
}

.nav-item {
  border: 0;
  background: white;
  font-size: 11px;
  font-weight: 750;
}

.nav-icon {
  display: block;
  font-size: 22px;
}

@media (min-width:800px) {
  body {
    max-width: 1100px;
    margin: auto;
  }

  .products {
    grid-template-columns: repeat(4,1fr);
  }
}

</style>

</head>

<body>

<div class="top">

<div class="topline">

<div class="logo">
🐨 Koala Store
</div>

<button
  class="cart-top"
  onclick="openCart()"
>
🛒 <span id="top-count">0</span>
</button>

</div>

<div class="search">

<input
  id="search"
  type="search"
  placeholder="Rechercher dans Koala Store"
  oninput="renderProducts()"
>

<button>
🔍
</button>

</div>

</div>

${cryptoSuccess
  ? '<div class="notice">Paiement Koala Crypto confirmé ✅' +
    (orderId ? '<br>Commande ' + orderId : '') +
    (amount ? ' · ' + money(amount) + ' €' : '') +
    '</div>'
  : ''
}

${stripeSuccess
  ? '<div class="notice">Paiement par carte confirmé ✅</div>'
  : ''
}

${stripeCancelled
  ? '<div class="notice cancel">Paiement par carte annulé.</div>'
  : ''
}

<div class="promo">

<div class="promo-title">
Koala Store
</div>

<div class="promo-text">
Mode, accessoires, maison et technologie.
</div>

<div class="promo-badge">
Paiement CB ou Koala Crypto
</div>

</div>

<div class="categories" id="categories">

<button
  class="category active"
  onclick="setCategory('Tous',this)"
>
Tout
</button>

<button
  class="category"
  onclick="setCategory('Mode',this)"
>
👕 Mode
</button>

<button
  class="category"
  onclick="setCategory('Maison',this)"
>
🏠 Maison
</button>

<button
  class="category"
  onclick="setCategory('Tech',this)"
>
🎧 Tech
</button>

<button
  class="category"
  onclick="setCategory('Accessoires',this)"
>
👜 Accessoires
</button>

</div>

<div class="section-title">
Meilleurs choix
</div>

<div class="products" id="products"></div>


<div class="product-detail-overlay" id="product-detail-overlay">
  <div class="product-detail-page">
    <div class="product-detail-top">
      <button class="product-detail-back" onclick="closeProductDetail()">←</button>
      <div class="product-detail-title">Détail du produit</div>
    </div>
    <div id="product-detail-content"></div>
  </div>
</div>

<div class="overlay" id="cart-overlay">

<div class="sheet">

<div class="handle"></div>

<button
  class="close"
  onclick="closeCart()"
>
×
</button>

<h2>
Votre panier
</h2>

<div id="cart-content"></div>

<div class="total">

<span>Total</span>

<span id="cart-total">
0,00 €
</span>

</div>

<div class="payment-title">
Moyen de paiement
</div>

<div class="payment-methods">

<button
  class="payment-method selected"
  id="payment-card"
  onclick="selectPayment('card')"
>
💳<br>
Carte bancaire
</button>

<button
  class="payment-method"
  id="payment-crypto"
  onclick="selectPayment('crypto')"
>
🐨<br>
Koala Crypto
</button>

</div>

<div class="plans" id="plans">

<button
  class="plan selected"
  id="plan-3"
  onclick="selectPlan(3)"
>
Paiement 3x

<span
  class="plan-small"
  id="amount-3"
></span>

</button>

<button
  class="plan"
  id="plan-4"
  onclick="selectPlan(4)"
>
Paiement 4x

<span
  class="plan-small"
  id="amount-4"
></span>

</button>

</div>

<button
  class="pay"
  id="pay-button"
  onclick="pay()"
  disabled
>
Payer par carte
</button>

<div
  class="message"
  id="payment-message"
></div>

</div>

</div>

<div class="bottom-nav">

<button class="nav-item">

<span class="nav-icon">
🏠
</span>

Accueil

</button>

<button
  class="nav-item"
  onclick="document.getElementById('categories').scrollIntoView()"
>

<span class="nav-icon">
▦
</span>

Catégories

</button>

<button
  class="nav-item"
  onclick="openCart()"
>

<span class="nav-icon">
🛒
</span>

Panier
<span id="bottom-count">0</span>

</button>

<button
  class="nav-item"
  onclick="window.location.href='/merchant/login'"
>

<span class="nav-icon">
👤
</span>

Compte

</button>

</div>

<script>

// ============================================================
// PRODUITS
// ============================================================

const products = [

{
  id:1,
  name:"T-shirt Koala Premium",
  category:"Mode",
  price:19.99,
  oldPrice:29.99,
  emoji:"👕",
  sold:"1,2 k+ vendus"
},

{
  id:2,
  name:"Sweat Koala Urban",
  category:"Mode",
  price:39.99,
  oldPrice:59.99,
  emoji:"🧥",
  sold:"860+ vendus"
},

{
  id:3,
  name:"Casquette Koala",
  category:"Accessoires",
  price:14.99,
  oldPrice:22.99,
  emoji:"🧢",
  sold:"740+ vendus"
},

{
  id:4,
  name:"Sac Koala City",
  category:"Accessoires",
  price:27.99,
  oldPrice:39.99,
  emoji:"👜",
  sold:"2 k+ vendus"
},

{
  id:7,
  name:"Lampe design",
  category:"Maison",
  price:18.99,
  oldPrice:28.99,
  emoji:"💡",
  sold:"520+ vendus"
},

{
  id:8,
  name:"Coussin Koala",
  category:"Maison",
  price:16.99,
  oldPrice:25.99,
  emoji:"🛋️",
  sold:"1,4 k+ vendus"
},

{
  id:9,
  name:"Lunettes tendance",
  category:"Accessoires",
  price:12.99,
  oldPrice:19.99,
  emoji:"🕶️",
  sold:"680+ vendus"
},

{
  id:10,
  name:"Baskets Urban",
  category:"Mode",
  price:42.99,
  oldPrice:69.99,
  emoji:"👟",
  sold:"1,1 k+ vendus"
},

{
  id:12,
  name:"Mug Koala",
  category:"Maison",
  price:9.99,
  oldPrice:14.99,
  emoji:"☕",
  sold:"2,3 k+ vendus"
},

{
  id:101,
  name:"iPhone 18 Pro",
  category:"Tech",
  price:1479,
  oldPrice:1599,
  emoji:"📱",
  sold:"Nouveau"
},

{
  id:102,
  name:"iPhone 18 Pro Max",
  category:"Tech",
  price:1599,
  oldPrice:1749,
  emoji:"📱",
  sold:"Nouveau"
},

{
  id:103,
  name:"iPhone 17",
  category:"Tech",
  price:1119,
  oldPrice:1249,
  emoji:"📱",
  sold:"Populaire"
},

{
  id:104,
  name:"iPhone 17e",
  category:"Tech",
  price:869,
  oldPrice:999,
  emoji:"📱",
  sold:"Nouveau"
},

{
  id:105,
  name:"iPhone Air",
  category:"Tech",
  price:1329,
  oldPrice:1449,
  emoji:"📱",
  sold:"Nouveau"
},

{
  id:106,
  name:"MacBook Neo",
  category:"Tech",
  price:799,
  oldPrice:899,
  emoji:"💻",
  sold:"Nouveau"
},

{
  id:107,
  name:"MacBook Air M5",
  category:"Tech",
  price:1399,
  oldPrice:1549,
  emoji:"💻",
  sold:"Populaire"
},

{
  id:108,
  name:"MacBook Pro M5",
  category:"Tech",
  price:2199,
  oldPrice:2399,
  emoji:"💻",
  sold:"Pro"
},

{
  id:109,
  name:"Mac mini",
  category:"Tech",
  price:1049,
  oldPrice:1149,
  emoji:"🖥️",
  sold:"Nouveau"
},

{
  id:110,
  name:"Mac Studio",
  category:"Tech",
  price:2999,
  oldPrice:3299,
  emoji:"🖥️",
  sold:"Pro"
},

{
  id:111,
  name:"iPad Pro",
  category:"Tech",
  price:1319,
  oldPrice:1449,
  emoji:"📱",
  sold:"Pro"
},

{
  id:112,
  name:"iPad Air 13 pouces M4",
  category:"Tech",
  price:1019,
  oldPrice:1149,
  emoji:"📱",
  sold:"Nouveau"
},

{
  id:113,
  name:"iPad A16",
  category:"Tech",
  price:409,
  oldPrice:459,
  emoji:"📱",
  sold:"Populaire"
},

{
  id:114,
  name:"iPad mini A17 Pro",
  category:"Tech",
  price:609,
  oldPrice:679,
  emoji:"📱",
  sold:"Compact"
},

{
  id:115,
  name:"Apple Watch Series 12",
  category:"Tech",
  price:449,
  oldPrice:499,
  emoji:"⌚",
  sold:"Nouveau"
},

{
  id:116,
  name:"Apple Watch Ultra 4",
  category:"Tech",
  price:899,
  oldPrice:999,
  emoji:"⌚",
  sold:"Ultra"
},

{
  id:117,
  name:"Apple Watch SE 3",
  category:"Tech",
  price:279,
  oldPrice:329,
  emoji:"⌚",
  sold:"Populaire"
},

{
  id:118,
  name:"AirPods 5",
  category:"Tech",
  price:149,
  oldPrice:179,
  emoji:"🎧",
  sold:"Nouveau"
},

{
  id:119,
  name:"AirPods Pro 3",
  category:"Tech",
  price:249,
  oldPrice:279,
  emoji:"🎧",
  sold:"Pro"
},

{
  id:120,
  name:"AirPods Max 2",
  category:"Tech",
  price:579,
  oldPrice:629,
  emoji:"🎧",
  sold:"Premium"
}

];

let cart = {};
let category = "Tous";
let payment = "card";
let plan = 3;

// ============================================================
// EURO
// ============================================================

function eur(value) {

  return Number(value).toLocaleString(
    "fr-FR",
    {
      minimumFractionDigits:2,
      maximumFractionDigits:2
    }
  ) + " €";
}

// ============================================================
// PRODUITS
// ============================================================

function renderProducts() {

  const query =
    document
      .getElementById("search")
      .value
      .toLowerCase()
      .trim();

  const list =
    products.filter(function(product) {

      const categoryOk =
        category === "Tous" ||
        product.category === category;

      const searchOk =
        !query ||
        product.name
          .toLowerCase()
          .includes(query);

      return categoryOk && searchOk;
    });

  document
    .getElementById("products")
    .innerHTML =
      list.map(function(product) {

        const discount =
          Math.round(
            (
              1 -
              product.price /
              product.oldPrice
            ) *
            100
          );

        return (
          '<div class="product" onclick="openProductDetail(' + product.id + ')">' +

            '<div class="product-image">' +
              product.emoji +
            '</div>' +

            '<div class="product-info">' +

              '<div class="product-name">' +
                product.name +
              '</div>' +

              '<div class="rating">' +
                '★★★★★ ' +
                '<span class="sold">' +
                  product.sold +
                '</span>' +
              '</div>' +

              '<span class="old-price">' +
                eur(product.oldPrice) +
              '</span> ' +

              '<span class="discount">-' +
                discount +
                '%</span>' +

              '<div class="product-price">' +
                eur(product.price) +
              '</div>' +

              '<button class="add" onclick="event.stopPropagation();addProduct(' +
                product.id +
                ')">' +
                'Ajouter au panier' +
              '</button>' +

            '</div>' +

          '</div>'
        );

      }).join("");
}


function productDescription(product) {
  const name = product.name.toLowerCase();

  if (name.includes("iphone")) return "Un smartphone Apple pensé pour accompagner les usages du quotidien : communication, photos, vidéos, applications, navigation et divertissement. Cette fiche Koala Store vous permet de retrouver le produit, son positionnement dans la gamme et son prix avant de l’ajouter au panier.";
  if (name.includes("macbook")) return "Un ordinateur portable Apple conçu pour combiner mobilité, confort d’utilisation et polyvalence. Il convient aux études, au travail, à la navigation, au multimédia et aux tâches créatives, tout en conservant le format pratique d’un ordinateur portable.";
  if (name.includes("mac mini")) return "Un ordinateur de bureau Apple au format compact, pensé pour créer un poste de travail discret et polyvalent. Il peut être associé à votre écran, clavier et souris pour une installation adaptée au bureau comme à la maison.";
  if (name.includes("mac studio")) return "Un Mac de bureau orienté vers les utilisateurs qui recherchent une station de travail compacte pour des usages soutenus et créatifs. Son format permet de construire un espace de travail complet avec les périphériques de votre choix.";
  if (name.includes("ipad")) return "Une tablette Apple polyvalente adaptée à la consultation de contenus, aux applications, à la vidéo, à la prise de notes et à de nombreux usages créatifs. Son format tactile permet une utilisation aussi bien à la maison qu’en déplacement.";
  if (name.includes("watch")) return "Une montre connectée Apple conçue pour garder les informations et fonctions utiles directement au poignet. Elle complète l’expérience mobile avec les notifications, les applications compatibles et les fonctions proposées par la gamme Apple Watch.";
  if (name.includes("airpods max")) return "Un casque audio sans fil Apple destiné à une écoute confortable et immersive au quotidien. Il s’intègre à l’écosystème Apple et convient à la musique, aux vidéos, aux appels et aux déplacements.";
  if (name.includes("airpods")) return "Des écouteurs sans fil Apple pensés pour écouter de la musique, regarder des vidéos et passer des appels sans câble. Leur format compact facilite leur utilisation quotidienne et leur transport.";

  if (name.includes("t-shirt")) return "Un t-shirt Koala au style simple et facile à porter au quotidien. Il peut être associé à un jean, un pantalon ou un short pour composer une tenue décontractée. Une pièce polyvalente de la collection Mode Koala Store.";
  if (name.includes("sweat")) return "Un sweat Koala au look urbain, pensé pour compléter une tenue décontractée. Facile à porter au quotidien, il peut être utilisé seul ou en superposition selon la saison.";
  if (name.includes("baskets")) return "Des baskets au style urbain conçues pour compléter facilement une tenue quotidienne. Leur silhouette polyvalente s’accorde avec différentes pièces de la collection Mode Koala Store.";
  if (name.includes("casquette")) return "Une casquette Koala pensée comme un accessoire simple pour compléter une tenue décontractée. Son style polyvalent permet de l’associer facilement aux vêtements de la boutique.";
  if (name.includes("sac")) return "Un sac Koala City pratique pour transporter les essentiels du quotidien. Son style urbain en fait un accessoire adapté aux sorties, aux déplacements et à une utilisation régulière.";
  if (name.includes("lunettes")) return "Des lunettes tendance conçues pour apporter une touche supplémentaire à une tenue. Un accessoire léger et facile à associer avec différents styles proposés dans Koala Store.";
  if (name.includes("lampe")) return "Une lampe décorative pensée pour apporter un éclairage d’ambiance et compléter l’aménagement d’une pièce. Son design permet de l’intégrer facilement dans un bureau, une chambre ou un espace de vie.";
  if (name.includes("coussin")) return "Un coussin décoratif Koala conçu pour apporter une touche chaleureuse à un canapé, un fauteuil ou une chambre. Il complète facilement une décoration intérieure décontractée.";
  if (name.includes("mug")) return "Un mug Koala destiné aux boissons chaudes ou froides du quotidien. Son design en fait aussi un petit accessoire décoratif pour la maison ou le bureau.";

  if (product.category === "Mode") return "Un article de mode Koala Store pensé pour une utilisation quotidienne et facile à associer avec différentes tenues.";
  if (product.category === "Maison") return "Un article Koala Store destiné à compléter l’équipement ou la décoration de votre intérieur.";
  if (product.category === "Accessoires") return "Un accessoire Koala Store pensé pour compléter votre équipement ou votre tenue au quotidien.";
  return "Produit disponible dans Koala Store. Consultez sa présentation, son prix et ses informations avant de l’ajouter au panier.";
}

function productHighlights(product) {
  const name = product.name.toLowerCase();
  let items = [];

  if (name.includes("iphone")) items = ["Smartphone de la gamme Apple", "Pensé pour les usages mobiles du quotidien", "Photo, vidéo, applications et communication", "Intégration à l’écosystème Apple"];
  else if (name.includes("macbook")) items = ["Ordinateur portable Apple", "Format adapté à la mobilité", "Travail, études et multimédia", "Intégration à l’écosystème Apple"];
  else if (name.includes("mac mini") || name.includes("mac studio")) items = ["Ordinateur de bureau Apple", "Format compact", "Compatible avec un poste de travail complet", "Pensé pour une utilisation fixe"];
  else if (name.includes("ipad")) items = ["Tablette tactile Apple", "Format mobile et polyvalent", "Applications, vidéo et navigation", "Adaptée au travail comme au divertissement"];
  else if (name.includes("watch")) items = ["Montre connectée Apple", "Informations accessibles au poignet", "Notifications et applications compatibles", "Complément de l’écosystème Apple"];
  else if (name.includes("airpods max")) items = ["Casque audio sans fil", "Écoute, appels et multimédia", "Utilisation mobile", "Intégration à l’écosystème Apple"];
  else if (name.includes("airpods")) items = ["Écouteurs sans fil", "Format compact", "Musique, vidéo et appels", "Intégration à l’écosystème Apple"];
  else if (product.category === "Mode") items = ["Style décontracté", "Facile à associer", "Pensé pour le quotidien", "Collection Mode Koala Store"];
  else if (product.category === "Maison") items = ["Pour la maison", "Usage quotidien", "Design décoratif", "Collection Maison Koala Store"];
  else items = ["Accessoire pratique", "Usage quotidien", "Style polyvalent", "Collection Koala Store"];

  return '<div class="product-detail-specs"><h3 style="margin:0 0 8px">Points forts</h3>' +
    items.map(function(item) { return '<div><span>✓</span><b style="text-align:right">' + item + '</b></div>'; }).join("") +
    '</div>';
}

function productExtraSpecs(product) {
  const name = product.name.toLowerCase();
  const rows = [];

  if (name.includes("iphone")) rows.push(["Type", "Smartphone"], ["Usage", "Mobile / multimédia"], ["Écosystème", "Apple"]);
  else if (name.includes("macbook")) rows.push(["Type", "Ordinateur portable"], ["Usage", "Travail / études / création"], ["Écosystème", "Apple"]);
  else if (name.includes("mac mini") || name.includes("mac studio")) rows.push(["Type", "Ordinateur de bureau"], ["Installation", "Poste fixe"], ["Écosystème", "Apple"]);
  else if (name.includes("ipad")) rows.push(["Type", "Tablette tactile"], ["Usage", "Mobilité / création / multimédia"], ["Écosystème", "Apple"]);
  else if (name.includes("watch")) rows.push(["Type", "Montre connectée"], ["Usage", "Poignet / mobilité"], ["Écosystème", "Apple"]);
  else if (name.includes("airpods max")) rows.push(["Type", "Casque sans fil"], ["Usage", "Audio / appels"], ["Écosystème", "Apple"]);
  else if (name.includes("airpods")) rows.push(["Type", "Écouteurs sans fil"], ["Usage", "Audio / appels"], ["Écosystème", "Apple"]);
  else rows.push(["Type", product.category], ["Collection", "Koala Store"], ["Usage", "Quotidien"]);

  return rows.map(function(row) {
    return '<div><span>' + row[0] + '</span><b>' + row[1] + '</b></div>';
  }).join("");
}

function appleFamily(product) {
  const n = product.name.toLowerCase();
  if (n.includes("iphone")) return "iPhone";
  if (n.includes("mac")) return "Mac";
  if (n.includes("ipad")) return "iPad";
  if (n.includes("watch")) return "Apple Watch";
  if (n.includes("airpods")) return "AirPods";
  return "Apple";
}

function openProductDetail(id) {
  const product = products.find(function(item) { return item.id === id; });
  if (!product) return;

  const discount = Math.round((1 - product.price / product.oldPrice) * 100);
  const isApple = product.category === "Tech";

  document.getElementById("product-detail-content").innerHTML =
    '<div class="product-detail-hero">' + product.emoji + '</div>' +
    '<div class="product-detail-body">' +
      '<div class="product-detail-name">' + product.name + '</div>' +
      '<div class="product-detail-category">' + (isApple ? 'Apple · ' : '') + product.category + '</div>' +
      '<div class="product-detail-price">' + eur(product.price) +
        '<span class="product-detail-old">' + eur(product.oldPrice) + '</span></div>' +
      '<div class="discount">-' + discount + '%</div>' +
      '<div class="product-detail-description"><h3 style="margin:0 0 8px;color:#151515">Description</h3>' + productDescription(product) + '</div>' +
      productHighlights(product) +
      '<div class="product-detail-specs">' +
        '<h3 style="margin:0 0 8px">Informations produit</h3>' +
        '<div><span>Marque</span><b>' + (isApple ? 'Apple' : 'Koala Store') + '</b></div>' +
        '<div><span>Famille</span><b>' + (isApple ? appleFamily(product) : product.category) + '</b></div>' +
        '<div><span>Catégorie</span><b>' + product.category + '</b></div>' +
        productExtraSpecs(product) +
        '<div><span>Disponibilité</span><b>En stock</b></div>' +
      '</div>' +
      '<div class="product-detail-specs">' +
        '<h3 style="margin:0 0 8px">Achat sur Koala Store</h3>' +
        '<div><span>Paiement</span><b>Carte bancaire ou Koala Crypto</b></div>' +
        '<div><span>Panier</span><b>Ajout immédiat</b></div>' +
      '</div>' +
      '<button class="product-detail-add" onclick="addProduct(' + product.id + ');openCart()">Ajouter au panier · ' + eur(product.price) + '</button>' +
    '</div>';

  document.getElementById("product-detail-overlay").classList.add("show");
  document.body.style.overflow = "hidden";
}

function closeProductDetail() {
  document.getElementById("product-detail-overlay").classList.remove("show");
  document.body.style.overflow = "";
}


// ============================================================
// CATEGORIES
// ============================================================

function setCategory(value, button) {

  category = value;

  document
    .querySelectorAll(".category")
    .forEach(function(item) {
      item.classList.remove("active");
    });

  button.classList.add("active");

  renderProducts();
}

// ============================================================
// PANIER
// ============================================================

function addProduct(id) {

  cart[id] =
    (cart[id] || 0) + 1;

  updateCart();
}

function removeProduct(id) {

  if (!cart[id]) {
    return;
  }

  if (cart[id] > 1) {
    cart[id]--;
  } else {
    delete cart[id];
  }

  updateCart();
}

function getCount() {

  return Object
    .values(cart)
    .reduce(function(a,b) {
      return a + b;
    },0);
}

function getTotal() {

  return products.reduce(
    function(total,product) {

      return total +
        (
          cart[product.id] || 0
        ) *
        product.price;

    },
    0
  );
}

function updateCart() {

  const count =
    getCount();

  document
    .getElementById("top-count")
    .textContent =
      count;

  document
    .getElementById("bottom-count")
    .textContent =
      count;

  renderCart();
}

function renderCart() {

  const selected =
    products.filter(function(product) {
      return cart[product.id];
    });

  const html =
    selected.map(function(product) {

      return (
        '<div class="cart-row">' +

          '<div class="cart-icon">' +
            product.emoji +
          '</div>' +

          '<div>' +

            '<div class="cart-name">' +
              product.name +
            '</div>' +

            '<div class="cart-price">' +
              eur(product.price) +
            '</div>' +

          '</div>' +

          '<div class="quantity">' +

            '<button onclick="removeProduct(' +
              product.id +
              ')">−</button>' +

            '<b>' +
              cart[product.id] +
            '</b>' +

            '<button onclick="addProduct(' +
              product.id +
              ')">+</button>' +

          '</div>' +

        '</div>'
      );

    }).join("");

  document
    .getElementById("cart-content")
    .innerHTML =
      html ||
      '<div>Votre panier est vide.</div>';

  const total =
    getTotal();

  document
    .getElementById("cart-total")
    .textContent =
      eur(total);

  document
    .getElementById("amount-3")
    .textContent =
      eur(total / 3) +
      " par paiement";

  document
    .getElementById("amount-4")
    .textContent =
      eur(total / 4) +
      " par paiement";

  document
    .getElementById("pay-button")
    .disabled =
      total <= 0;
}

function openCart() {

  renderCart();

  document
    .getElementById("cart-overlay")
    .classList
    .add("show");
}

function closeCart() {

  document
    .getElementById("cart-overlay")
    .classList
    .remove("show");
}

// ============================================================
// MODE DE PAIEMENT
// ============================================================

function selectPayment(value) {

  payment = value;

  document
    .getElementById("payment-card")
    .classList
    .toggle(
      "selected",
      value === "card"
    );

  document
    .getElementById("payment-crypto")
    .classList
    .toggle(
      "selected",
      value === "crypto"
    );

  document
    .getElementById("plans")
    .classList
    .toggle(
      "show",
      value === "crypto"
    );

  const button =
    document
      .getElementById("pay-button");

  if (value === "crypto") {

    button.textContent =
      "Continuer vers Koala Crypto";

    button.className =
      "pay crypto";

  } else {

    button.textContent =
      "Payer par carte";

    button.className =
      "pay";
  }
}

// ============================================================
// 3X / 4X
// ============================================================

function selectPlan(value) {

  plan = value;

  document
    .getElementById("plan-3")
    .classList
    .toggle(
      "selected",
      value === 3
    );

  document
    .getElementById("plan-4")
    .classList
    .toggle(
      "selected",
      value === 4
    );
}

// ============================================================
// PAYER
// ============================================================

async function pay() {

  const total =
    getTotal();

  if (total <= 0) {
    return;
  }

  const button =
    document
      .getElementById("pay-button");

  const message =
    document
      .getElementById(
        "payment-message"
      );

  button.disabled = true;

  message.textContent =
    payment === "crypto"
      ? "Ouverture de Koala Crypto…"
      : "Ouverture du paiement sécurisé…";

  try {

    const items =
      products
        .filter(function(product) {
          return cart[product.id];
        })
        .map(function(product) {

          return {
            id:product.id,
            name:product.name,
            price:product.price,
            quantity:cart[product.id]
          };

        });

    const endpoint =
      payment === "crypto"
        ? "/api/koala/checkout"
        : "/api/stripe/checkout";

    const response =
      await fetch(
        endpoint,
        {
          method:"POST",

          headers:{
            "Content-Type":
              "application/json"
          },

          body:JSON.stringify({
            amountEur:total,
            installmentsCount:plan,
            items:items
          })
        }
      );

    const data =
      await response.json();

    if (!response.ok) {

      throw new Error(
        data.error ||
        "Erreur de paiement."
      );
    }

    if (!data.url) {

      throw new Error(
        "Lien de paiement manquant."
      );
    }

    window.location.href =
      data.url;

  } catch (error) {

    message.textContent =
      error.message;

    button.disabled =
      false;
  }
}

renderProducts();
updateCart();

</script>

</body>
</html>`;
}

async function saveStoreOrder({ merchantId, paymentMethod, amountEur, installmentsCount = null, status = "created", externalReference = null, items = [] }) {
  if (!pool) return null;

  const merchantCheck = await pool.query(
    "SELECT id FROM store_merchants WHERE id = $1 LIMIT 1",
    [merchantId]
  );

  if (!merchantCheck.rows[0]) {
    throw new Error("Compte marchand introuvable.");
  }

  const result = await pool.query(`
    INSERT INTO store_orders
      (merchant_id,payment_method,amount_eur,installments_count,status,external_reference,items_json)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
    RETURNING id
  `, [
    merchantId,
    paymentMethod,
    Number(amountEur).toFixed(2),
    installmentsCount,
    status,
    externalReference,
    JSON.stringify(Array.isArray(items) ? items : [])
  ]);

  return result.rows[0]?.id || null;
}

// ============================================================
// STRIPE CHECKOUT
// ============================================================

async function createStripeCheckout(req,res) {

  if (!stripe) {

    return json(
      res,
      503,
      {
        error:
          "STRIPE_SECRET_KEY non configurée dans Render."
      }
    );
  }

  const body =
    await readJson(req);

  const merchantId = Number(body.merchantId || 1);

  const amount =
    Math.round(
      Number(body.amountEur) * 100
    );

  if (
    !Number.isFinite(amount) ||
    amount < 50
  ) {

    return json(
      res,
      400,
      {
        error:"Montant invalide."
      }
    );
  }

  const session =
    await stripe
      .checkout
      .sessions
      .create({

        mode:"payment",

        payment_method_types:[
          "card"
        ],

        line_items:[
          {
            price_data:{
              currency:"eur",

              product_data:{
                name:
                  "Commande Koala Store"
              },

              unit_amount:
                amount
            },

            quantity:1
          }
        ],

        success_url:
          `${KOALA_STORE_URL}/?stripe=success&session_id={CHECKOUT_SESSION_ID}`,

        cancel_url:
          `${KOALA_STORE_URL}/?stripe=cancel`
      });

  await saveStoreOrder({
    merchantId,
    paymentMethod:"card",
    amountEur:Number(body.amountEur),
    status:"created",
    externalReference:session.id,
    items:body.items
  });

  return json(
    res,
    200,
    {
      url:session.url
    }
  );
}

async function confirmStripeSessionPayment(sessionId) {
  if (!stripe || !pool || !sessionId) return false;

  const session = await stripe.checkout.sessions.retrieve(String(sessionId));
  if (session.payment_status !== "paid") return false;

  const result = await pool.query(`
    UPDATE store_orders
    SET status = 'paid',
        paid_amount_eur = amount_eur,
        paid_at = COALESCE(paid_at, NOW()),
        updated_at = NOW()
    WHERE payment_method = 'card'
      AND external_reference = $1
    RETURNING id
  `, [String(sessionId)]);

  return result.rowCount > 0;
}

// ============================================================
// KOALA CRYPTO CHECKOUT
// ============================================================

async function createKoalaCheckout(req,res) {

  const body =
    await readJson(req);

  const amountEur =
    Number(body.amountEur);

  const merchantId =
    Number(body.merchantId || 1);

  const installmentsCount =
    Number(
      body.installmentsCount || 3
    );

  if (
    !Number.isFinite(amountEur) ||
    amountEur <= 0
  ) {

    return json(
      res,
      400,
      {
        error:"Montant invalide."
      }
    );
  }

  if (
    ![3,4].includes(
      installmentsCount
    )
  ) {

    return json(
      res,
      400,
      {
        error:
          "Choisissez 3x ou 4x."
      }
    );
  }

  // ==========================================================
  // KOALA STORE -> KOALA CRYPTO
  // ==========================================================

  const payload = {

    merchantId:merchantId,

    amountEur:
      amountEur,

    crypto:"BTC",

    installmentsCount:
      installmentsCount,

    returnUrl:
      KOALA_STORE_URL +
      "/store/success"
  };

  console.log(
    "Envoi vers Koala Crypto:",
    JSON.stringify(payload)
  );

  // ==========================================================
  // IMPORTANT :
  // NOUVELLE API KOALA CRYPTO POUR KOALA STORE
  // ==========================================================

  const response =
    await fetch(
      KOALA_CRYPTO_URL +
      "/api/store/orders",
      {
        method:"POST",

        headers:{
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(payload)
      }
    );

  const rawResponse = await response.text();

  console.log(
    "Statut Koala Crypto:",
    response.status
  );

  console.log(
    "Réponse brute Koala Crypto:",
    rawResponse
  );

  let data = {};

  try {
    data = rawResponse ? JSON.parse(rawResponse) : {};
  } catch (error) {
    return json(
      res,
      502,
      {
        error:
          "Koala Crypto a répondu HTTP " +
          response.status +
          " avec une réponse non JSON : " +
          (rawResponse || "(réponse vide)")
      }
    );
  }

  console.log(
    "Réponse Koala Crypto:",
    JSON.stringify(data)
  );

  if (!response.ok) {

    return json(
      res,
      response.status,
      {
        error:
          data.error ||
          data.message ||
          "Koala Crypto a refusé la commande."
      }
    );
  }

  // ==========================================================
  // PAYMENT TOKEN
  // ==========================================================

  let token =
    data.paymentToken ||
    data.payment_token ||
    data.firstPaymentToken ||
    data.first_payment_token ||
    null;

  if (
    !token &&
    data.order
  ) {

    token =
      data.order.paymentToken ||
      data.order.payment_token ||
      data.order.firstPaymentToken ||
      data.order.first_payment_token ||
      null;
  }

  if (
    !token &&
    Array.isArray(
      data.installments
    ) &&
    data.installments.length > 0
  ) {

    token =
      data.installments[0]
        .paymentToken ||
      data.installments[0]
        .payment_token ||
      null;
  }

  if (
    !token &&
    data.order &&
    Array.isArray(
      data.order.installments
    ) &&
    data.order.installments.length > 0
  ) {

    token =
      data.order
        .installments[0]
        .paymentToken ||

      data.order
        .installments[0]
        .payment_token ||

      null;
  }

  // ==========================================================
  // URL DIRECTE
  // ==========================================================

  let directUrl =
    data.paymentUrl ||
    data.payment_url ||
    data.checkoutUrl ||
    data.checkout_url ||
    data.url ||
    null;

  if (
    !directUrl &&
    data.order
  ) {

    directUrl =
      data.order.paymentUrl ||
      data.order.payment_url ||
      data.order.checkoutUrl ||
      data.order.checkout_url ||
      data.order.url ||
      null;
  }

  // ==========================================================
  // PAGE KOALA CRYPTO
  // ==========================================================

  const target =
    directUrl ||
    (
      token
        ? KOALA_CRYPTO_URL +
          "/pay/" +
          encodeURIComponent(token)
        : null
    );

  if (!target) {

    console.error(
      "TOKEN INTROUVABLE. Réponse:",
      JSON.stringify(data)
    );

    return json(
      res,
      502,
      {
        error:
          "Koala Crypto n'a pas renvoyé le token de paiement."
      }
    );
  }

  console.log(
    "Token Koala Crypto:",
    token || "URL directe"
  );

  console.log(
    "Redirection vers:",
    target
  );

  const externalReference =
    data.orderId ||
    data.order_id ||
    (data.order && (data.order.id || data.order.orderId || data.order.order_id)) ||
    token ||
    null;

  await saveStoreOrder({
    merchantId,
    paymentMethod:"crypto",
    amountEur,
    installmentsCount,
    status:"created",
    externalReference:externalReference ? String(externalReference) : null,
    items:body.items
  });

  return json(
    res,
    200,
    {
      url:target
    }
  );
}

// ============================================================
// SERVEUR
// ============================================================

const server =
  http.createServer(
    async function(req,res) {

      try {

        const url =
          new URL(
            req.url,
            KOALA_STORE_URL
          );

        if (req.method === "GET" && url.pathname === "/" && url.searchParams.get("stripe") === "success") {
          const sessionId = url.searchParams.get("session_id") || "";
          if (sessionId) {
            try {
              await confirmStripeSessionPayment(sessionId);
            } catch (error) {
              console.error("Vérification Stripe impossible :", error.message);
            }
          }
          return send(res,200,"text/html; charset=utf-8",pageHtml(url));
        }

        if (req.method === "GET" && url.pathname === "/merchant/login") {
          if (await merchantSession(req)) {
            res.writeHead(302,{Location:"/merchant"});
            return res.end();
          }
          return send(res,200,"text/html; charset=utf-8",merchantLoginPage());
        }

        if (req.method === "GET" && url.pathname === "/merchant/register") {
          if (await merchantSession(req)) {
            res.writeHead(302,{Location:"/merchant"});
            return res.end();
          }
          return send(res,200,"text/html; charset=utf-8",merchantRegisterPage());
        }

        if (req.method === "POST" && url.pathname === "/merchant/register") {
          if (!pool) {
            return send(res,503,"text/html; charset=utf-8",merchantRegisterPage("DATABASE_URL n’est pas configurée sur Koala Store."));
          }

          const form = await readForm(req);
          const businessName = String(form.business_name || "").trim();
          const email = String(form.email || "").trim().toLowerCase();
          const password = String(form.password || "");

          if (!businessName || !email || password.length < 8) {
            return send(res,400,"text/html; charset=utf-8",merchantRegisterPage("Remplissez tous les champs. Le mot de passe doit contenir au moins 8 caractères."));
          }

          try {
            await pool.query(`
              INSERT INTO store_merchants (business_name,email,password_hash)
              VALUES ($1,$2,$3)
            `, [businessName,email,hashPassword(password)]);
          } catch (error) {
            if (error && error.code === "23505") {
              return send(res,409,"text/html; charset=utf-8",merchantRegisterPage("Un compte marchand existe déjà avec cet e-mail."));
            }
            throw error;
          }

          return send(res,200,"text/html; charset=utf-8",merchantLoginPage("", "Compte marchand créé. Vous pouvez maintenant vous connecter."));
        }

        if (req.method === "POST" && url.pathname === "/merchant/login") {
          if (!pool) {
            return send(res,503,"text/html; charset=utf-8",merchantLoginPage("DATABASE_URL n’est pas configurée sur Koala Store."));
          }

          const form = await readForm(req);
          const email = String(form.email || "").trim().toLowerCase();
          const password = String(form.password || "");

          const result = await pool.query(`
            SELECT id,business_name,email,password_hash
            FROM store_merchants
            WHERE email = $1
            LIMIT 1
          `, [email]);

          const merchant = result.rows[0];

          if (!merchant || !verifyPassword(password, merchant.password_hash)) {
            return send(res,401,"text/html; charset=utf-8",merchantLoginPage("E-mail ou mot de passe incorrect."));
          }

          const token = crypto.randomBytes(32).toString("hex");

          await pool.query(`
            INSERT INTO store_sessions (token,merchant_id,expires_at)
            VALUES ($1,$2,NOW() + INTERVAL '1 day')
          `, [token,merchant.id]);

          res.writeHead(302,{
            Location:"/merchant",
            "Set-Cookie":`koala_merchant_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`
          });
          return res.end();
        }

        if (req.method === "GET" && url.pathname === "/merchant") {
          const session = await merchantSession(req);
          if (!session) {
            res.writeHead(302,{Location:"/merchant/login"});
            return res.end();
          }
          return send(res,200,"text/html; charset=utf-8",await merchantDashboardPage(session));
        }

        if (req.method === "POST" && url.pathname === "/merchant/payout") {
          const session = await merchantSession(req);
          if (!session) {
            res.writeHead(302,{Location:"/merchant/login"});
            return res.end();
          }
          if (!pool) return send(res,503,"text/plain; charset=utf-8","DATABASE_URL non configurée.");

          const form = await readForm(req);
          const amount = Math.round(Number(form.amount) * 100) / 100;
          const available = await merchantAvailableBalance(session.merchant_id);

          if (!Number.isFinite(amount) || amount <= 0 || amount > available) {
            return send(res,400,"text/html; charset=utf-8",
              `<meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:Arial;padding:25px"><h2>Montant de versement invalide</h2><p>Solde disponible : ${money(available)} €</p><a href="/merchant">Retour au tableau de bord</a></div>`);
          }

          await pool.query(`
            INSERT INTO store_payout_requests (merchant_id,amount_eur,status)
            VALUES ($1,$2,'requested')
          `, [session.merchant_id, amount.toFixed(2)]);

          res.writeHead(302,{Location:"/merchant"});
          return res.end();
        }

        if (req.method === "GET" && url.pathname === "/merchant/logout") {
          const token = parseCookies(req).koala_merchant_session;
          if (pool && token) {
            await pool.query("DELETE FROM store_sessions WHERE token = $1",[token]);
          }
          res.writeHead(302,{
            Location:"/merchant/login",
            "Set-Cookie":"koala_merchant_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
          });
          return res.end();
        }

        if (
          req.method === "GET" &&
          url.pathname === "/"
        ) {

          return send(
            res,
            200,
            "text/html; charset=utf-8",
            pageHtml(url)
          );
        }

        if (
          req.method === "GET" &&
          url.pathname ===
            "/store/success"
        ) {

          return send(
            res,
            200,
            "text/html; charset=utf-8",
            pageHtml(url)
          );
        }

        if (
          req.method === "GET" &&
          url.pathname === "/health"
        ) {

          return json(
            res,
            200,
            {
              app:"Koala Store",
              status:"online",
              stripe:!!stripe,
              koalaCrypto:
                KOALA_CRYPTO_URL,
              store:
                KOALA_STORE_URL
            }
          );
        }

        if (
          req.method === "POST" &&
          url.pathname ===
            "/api/stripe/checkout"
        ) {

          return await createStripeCheckout(
            req,
            res
          );
        }

        if (
          req.method === "POST" &&
          url.pathname ===
            "/api/koala/checkout"
        ) {

          return await createKoalaCheckout(
            req,
            res
          );
        }

        return json(
          res,
          404,
          {
            error:"Route introuvable"
          }
        );

      } catch (error) {

        console.error(
          "Erreur Koala Store:",
          error
        );

        return json(
          res,
          500,
          {
            error:
              error.message ||
              "Erreur serveur"
          }
        );
      }
    }
  );

// ============================================================
// DEMARRAGE
// ============================================================

async function start() {
  if (pool) {
    await pool.query("SELECT 1");
    console.log("PostgreSQL partagé connecté.");
    await initStoreDatabase();
  }

  server.listen(
  PORT,
  function() {

    console.log(
      "Koala Store démarré sur le port " +
      PORT
    );

    console.log(
      "Stripe configuré : " +
      (stripe ? "oui" : "non")
    );

    console.log(
      "Koala Crypto : " +
      KOALA_CRYPTO_URL
    );

    console.log(
      "Koala Store : " +
      KOALA_STORE_URL
    );

    console.log(
      "API Koala Store -> Crypto : /api/store/orders"
    );
  }
  );
}

start().catch(error => {
  console.error("Impossible de démarrer Koala Store :", error);
  process.exit(1);
});