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

async function merchantDashboardPage(session) {
  let orderCount = 0;
  let revenue = 0;
  let orders = [];

  if (pool) {
    const stats = await pool.query(`
      SELECT
        COUNT(*)::int AS order_count,
        COALESCE(SUM(
          CASE
            WHEN payment_method = 'crypto' THEN (
              SELECT COALESCE(SUM(i.amount_eur),0)
              FROM koala_installments i
              WHERE i.order_id = CASE
                WHEN store_orders.external_reference ~ '^[0-9]+$'
                THEN store_orders.external_reference::integer
                ELSE NULL
              END
              AND (i.paid_at IS NOT NULL OR UPPER(COALESCE(i.status,'')) IN ('PAYE','PAYÉ','PAID','CONFIRMED'))
            )
            ELSE COALESCE(paid_amount_eur,0)
          END
        ),0)::numeric AS revenue
      FROM store_orders
      WHERE merchant_id = $1
    `, [session.merchant_id]);

    orderCount = Number(stats.rows[0]?.order_count || 0);
    revenue = Number(stats.rows[0]?.revenue || 0);

    const recent = await pool.query(`
      SELECT id,payment_method,amount_eur,installments_count,status,external_reference,created_at
      FROM store_orders
      WHERE merchant_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `, [session.merchant_id]);

    orders = recent.rows;
  }

  const orderRows = orders.length
    ? orders.map(order => `
      <div class="order">
        <div><b>Commande #${order.id}</b><div class="muted">${new Date(order.created_at).toLocaleString("fr-FR")}</div></div>
        <div><b>${money(order.amount_eur)} €</b><div class="muted">${order.payment_method === "crypto" ? "Koala Crypto" : "Carte bancaire"}${order.installments_count ? " · " + order.installments_count + "x" : ""}</div></div>
      </div>
    `).join("")
    : `<div class="muted">Aucune commande enregistrée pour le moment.</div>`;

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tableau de bord marchand</title><style>body{margin:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#151515}.wrap{max-width:900px;margin:auto;padding:20px}.top{display:flex;justify-content:space-between;align-items:center;gap:12px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:20px}.card{background:#fff;border-radius:18px;padding:18px;border:1px solid #eee}.value{font-size:26px;font-weight:950;margin-top:8px}.muted{color:#666}.btn{display:inline-block;background:#111;color:#fff;padding:11px 14px;border-radius:11px;text-decoration:none;font-weight:800}.orders{margin-top:14px}.order{display:flex;justify-content:space-between;gap:12px;padding:13px 0;border-bottom:1px solid #eee}.order:last-child{border-bottom:0}@media(max-width:600px){.grid{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}.order{flex-direction:column}}</style></head><body><div class="wrap"><div class="top"><div><h1>🏪 ${session.business_name}</h1><div class="muted">${session.email}</div></div><a class="btn" href="/merchant/logout">Déconnexion</a></div><div class="grid"><div class="card"><b>Commandes</b><div class="value">${orderCount}</div><div class="muted">Commandes enregistrées pour ce marchand.</div></div><div class="card"><b>Encaissé réel</b><div class="value">${money(revenue)} €</div><div class="muted">Uniquement les paiements réellement confirmés.</div></div><div class="card"><b>Paiements CB</b><div class="value">${stripe ? "Stripe actif" : "Stripe non configuré"}</div></div><div class="card"><b>Koala Crypto</b><div class="value">Actif</div><div class="muted">Compte marchand #${session.merchant_id}</div></div></div><div class="card orders"><h2>Dernières commandes</h2>${orderRows}</div><p><a class="btn" href="/">Voir Koala Store</a></p></div></body></html>`;
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
  id:5,
  name:"Écouteurs sans fil",
  category:"Tech",
  price:24.99,
  oldPrice:39.99,
  emoji:"🎧",
  sold:"3,1 k+ vendus"
},

{
  id:6,
  name:"Montre connectée",
  category:"Tech",
  price:34.99,
  oldPrice:54.99,
  emoji:"⌚",
  sold:"950+ vendus"
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
  id:11,
  name:"Enceinte Bluetooth",
  category:"Tech",
  price:29.99,
  oldPrice:44.99,
  emoji:"🔊",
  sold:"790+ vendus"
},

{
  id:12,
  name:"Mug Koala",
  category:"Maison",
  price:9.99,
  oldPrice:14.99,
  emoji:"☕",
  sold:"2,3 k+ vendus"
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
          '<div class="product">' +

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

              '<button class="add" onclick="addProduct(' +
                product.id +
                ')">' +
                'Ajouter au panier' +
              '</button>' +

            '</div>' +

          '</div>'
        );

      }).join("");
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