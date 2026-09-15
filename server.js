const http = require("http");
const { URL } = require("url");
const Stripe = require("stripe");

// ============================================================
// CONFIGURATION
// ============================================================

const PORT = Number(process.env.PORT || 10000);

const KOALA_CRYPTO_URL = (
  process.env.KOALA_CRYPTO_URL ||
  "https://koala6.onrender.com"
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
// OUTILS HTTP
// ============================================================

function send(
  res,
  status,
  type,
  body,
  headers = {}
) {
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

      if (body.length > 1_000_000) {
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(
          body
            ? JSON.parse(body)
            : {}
        );
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
  const success =
    url.searchParams.get("status") === "paid";

  const orderId =
    url.searchParams.get("order_id") || "";

  const amount =
    url.searchParams.get("amount") || "";

  const merchant =
    url.searchParams.get("merchant") ||
    "Koala Store";

  const stripeSuccess =
    url.searchParams.get("stripe") === "success";

  const cancelled =
    url.searchParams.get("stripe") === "cancel";

  return `<!doctype html>
<html lang="fr">

<head>

<meta charset="utf-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>Koala Store</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Arial,
    sans-serif;
  background: #f5f7fb;
  color: #111827;
}

header {
  position: sticky;
  top: 0;
  z-index: 5;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  padding: 16px 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.brand {
  font-weight: 900;
  font-size: 22px;
}

.badge {
  background: #111827;
  color: white;
  border-radius: 999px;
  padding: 7px 11px;
  font-weight: 800;
}

main {
  max-width: 1000px;
  margin: auto;
  padding: 18px;
}

.hero {
  background:
    linear-gradient(
      135deg,
      #111827,
      #374151
    );
  color: #fff;
  border-radius: 22px;
  padding: 24px;
  margin-bottom: 18px;
}

.hero h1 {
  margin: 0 0 8px;
  font-size: 30px;
}

.hero p {
  margin: 0;
  opacity: .85;
}

.notice {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
  padding: 14px;
  border-radius: 14px;
  margin-bottom: 16px;
  font-weight: 700;
}

.warn {
  background: #fff7ed;
  border-color: #fed7aa;
  color: #9a3412;
}

.grid {
  display: grid;
  grid-template-columns:
    repeat(2, 1fr);
  gap: 14px;
}

.card,
.checkout {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  padding: 16px;
  box-shadow:
    0 5px 20px rgba(0,0,0,.04);
}

.product-img {
  height: 130px;
  border-radius: 14px;
  background: #eef2ff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
}

h3 {
  margin: 12px 0 5px;
}

.price {
  font-weight: 900;
  font-size: 20px;
}

.btn {
  width: 100%;
  border: 0;
  border-radius: 13px;
  padding: 13px 14px;
  font-size: 16px;
  font-weight: 800;
  cursor: pointer;
  background: #111827;
  color: #fff;
  margin-top: 10px;
}

.btn.secondary {
  background: #eef2f7;
  color: #111827;
}

.btn.crypto {
  background: #16a34a;
}

.btn:disabled {
  opacity: .45;
}

.checkout {
  margin-top: 18px;
}

.line {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid #eee;
}

.qty {
  display: flex;
  gap: 7px;
  align-items: center;
}

.mini {
  border: 0;
  border-radius: 9px;
  padding: 7px 10px;
  font-weight: 900;
}

.total {
  font-size: 23px;
  font-weight: 900;
  display: flex;
  justify-content: space-between;
  padding: 16px 0;
}

.methods {
  display: grid;
  grid-template-columns:
    1fr 1fr;
  gap: 10px;
}

.method,
.plan {
  border: 2px solid #e5e7eb;
  background: #fff;
  border-radius: 13px;
  padding: 13px;
  font-weight: 800;
}

.selected {
  border-color: #111827;
  background: #f3f4f6;
}

.plans {
  display: none;
  grid-template-columns:
    1fr 1fr;
  gap: 10px;
  margin-top: 10px;
}

.plans.show {
  display: grid;
}

.small {
  font-size: 13px;
  color: #6b7280;
  margin-top: 7px;
}

@media (min-width:760px) {

  .grid {
    grid-template-columns:
      repeat(4, 1fr);
  }

  .layout {
    display: grid;
    grid-template-columns:
      1.6fr 1fr;
    gap: 18px;
  }

  .checkout {
    margin-top: 0;
    height: max-content;
    position: sticky;
    top: 80px;
  }

}

</style>

</head>

<body>

<header>

<div class="brand">
🐨 Koala Store
</div>

<div class="badge">
Panier
<span id="count">0</span>
</div>

</header>

<main>

${success
  ? '<div class="notice">Paiement Koala Crypto confirmé ✅<br><span style="font-weight:500">Commande ' +
    orderId +
    ' · ' +
    (amount
      ? money(amount) + ' € · '
      : '') +
    merchant +
    '</span></div>'
  : ''
}

${stripeSuccess
  ? '<div class="notice">Paiement par carte confirmé ✅</div>'
  : ''
}

${cancelled
  ? '<div class="notice warn">Paiement par carte annulé.</div>'
  : ''
}

<div class="hero">

<h1>
Koala Store
</h1>

<p>
Choisissez vos articles puis payez
par carte bancaire ou avec
Koala Crypto.
</p>

</div>

<div class="layout">

<section>

<div
  class="grid"
  id="products"
></div>

</section>

<aside class="checkout">

<h2 style="margin-top:0">
Votre panier
</h2>

<div id="cart">

<div class="small">
Votre panier est vide.
</div>

</div>

<div class="total">

<span>
Total
</span>

<span id="total">
0,00 €
</span>

</div>

<div class="methods">

<button
  class="method selected"
  id="m-card"
  onclick="selectPayment('card')"
>
💳 Carte bancaire
</button>

<button
  class="method"
  id="m-crypto"
  onclick="selectPayment('crypto')"
>
₿ Koala Crypto
</button>

</div>

<div
  class="plans"
  id="plans"
>

<button
  class="plan selected"
  id="p-3"
  onclick="selectPlan(3)"
>
3x
<br>
<span
  id="p3"
  class="small"
></span>
</button>

<button
  class="plan"
  id="p-4"
  onclick="selectPlan(4)"
>
4x
<br>
<span
  id="p4"
  class="small"
></span>
</button>

</div>

<button
  class="btn"
  id="pay"
  onclick="pay()"
  disabled
>
Payer par carte
</button>

<div
  class="small"
  id="msg"
></div>

</aside>

</div>

</main>

<script>

// ============================================================
// PRODUITS
// ============================================================

const products = [
  {
    id: 1,
    name: "T-shirt Koala",
    price: 20,
    emoji: "👕"
  },
  {
    id: 2,
    name: "Sweat Koala",
    price: 45,
    emoji: "🧥"
  },
  {
    id: 3,
    name: "Casquette Koala",
    price: 18,
    emoji: "🧢"
  },
  {
    id: 4,
    name: "Sac Koala",
    price: 30,
    emoji: "👜"
  }
];

let cart = {};

let payment = "card";

let plan = 3;

// ============================================================
// FORMAT EURO
// ============================================================

function eur(number) {

  return Number(number)
    .toLocaleString(
      "fr-FR",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    ) + " €";
}

// ============================================================
// AFFICHER PRODUITS
// ============================================================

function renderProducts() {

  document
    .getElementById("products")
    .innerHTML =
      products
        .map(function(p) {

          return (
            '<div class="card">' +

              '<div class="product-img">' +
                p.emoji +
              '</div>' +

              '<h3>' +
                p.name +
              '</h3>' +

              '<div class="price">' +
                eur(p.price) +
              '</div>' +

              '<button ' +
                'class="btn" ' +
                'onclick="addProduct(' +
                p.id +
                ')">' +
                'Ajouter au panier' +
              '</button>' +

            '</div>'
          );

        })
        .join("");
}

// ============================================================
// AJOUTER PRODUIT
// ============================================================

function addProduct(id) {

  cart[id] =
    (cart[id] || 0) + 1;

  renderCart();
}

// ============================================================
// RETIRER PRODUIT
// ============================================================

function removeProduct(id) {

  if (cart[id] > 1) {

    cart[id]--;

  } else {

    delete cart[id];

  }

  renderCart();
}

// ============================================================
// TOTAL
// ============================================================

function getTotal() {

  return products.reduce(
    function(sum, product) {

      return (
        sum +
        (cart[product.id] || 0) *
        product.price
      );

    },
    0
  );
}

// ============================================================
// NOMBRE ARTICLES
// ============================================================

function getCount() {

  return Object
    .values(cart)
    .reduce(
      function(a, b) {
        return a + b;
      },
      0
    );
}

// ============================================================
// PANIER
// ============================================================

function renderCart() {

  const rows =
    products
      .filter(function(product) {

        return cart[product.id];

      })
      .map(function(product) {

        return (
          '<div class="line">' +

            '<div>' +

              '<b>' +
                product.name +
              '</b>' +

              '<div class="small">' +
                eur(product.price) +
                ' × ' +
                cart[product.id] +
              '</div>' +

            '</div>' +

            '<div class="qty">' +

              '<button ' +
                'class="mini" ' +
                'onclick="removeProduct(' +
                product.id +
                ')">' +
                '−' +
              '</button>' +

              '<b>' +
                cart[product.id] +
              '</b>' +

              '<button ' +
                'class="mini" ' +
                'onclick="addProduct(' +
                product.id +
                ')">' +
                '+' +
              '</button>' +

            '</div>' +

          '</div>'
        );

      })
      .join("");

  document
    .getElementById("cart")
    .innerHTML =
      rows ||
      '<div class="small">Votre panier est vide.</div>';

  document
    .getElementById("total")
    .textContent =
      eur(getTotal());

  document
    .getElementById("count")
    .textContent =
      getCount();

  document
    .getElementById("pay")
    .disabled =
      getTotal() <= 0;

  updatePlans();
}

// ============================================================
// MODE DE PAIEMENT
// ============================================================

function selectPayment(value) {

  payment = value;

  document
    .getElementById("m-card")
    .classList
    .toggle(
      "selected",
      value === "card"
    );

  document
    .getElementById("m-crypto")
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

  document
    .getElementById("pay")
    .className =
      "btn" +
      (
        value === "crypto"
          ? " crypto"
          : ""
      );

  document
    .getElementById("pay")
    .textContent =
      value === "crypto"
        ? "Payer avec Koala Crypto"
        : "Payer par carte";
}

// ============================================================
// CHOIX 3X / 4X
// ============================================================

function selectPlan(number) {

  plan = number;

  document
    .getElementById("p-3")
    .classList
    .toggle(
      "selected",
      number === 3
    );

  document
    .getElementById("p-4")
    .classList
    .toggle(
      "selected",
      number === 4
    );
}

// ============================================================
// CALCUL 3X / 4X
// ============================================================

function updatePlans() {

  const total =
    getTotal();

  document
    .getElementById("p3")
    .textContent =
      eur(total / 3) +
      " / paiement";

  document
    .getElementById("p4")
    .textContent =
      eur(total / 4) +
      " / paiement";
}

// ============================================================
// PAYER
// ============================================================

async function pay() {

  const total =
    getTotal();

  if (!total) {
    return;
  }

  const button =
    document.getElementById("pay");

  const message =
    document.getElementById("msg");

  button.disabled = true;

  message.textContent =
    "Préparation du paiement…";

  try {

    const endpoint =
      payment === "card"
        ? "/api/stripe/checkout"
        : "/api/koala/checkout";

    const items =
      products
        .filter(function(product) {

          return cart[product.id];

        })
        .map(function(product) {

          return {
            id: product.id,
            name: product.name,
            price: product.price,
            quantity:
              cart[product.id]
          };

        });

    const response =
      await fetch(
        endpoint,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              amountEur: total,
              installmentsCount: plan,
              items: items
            })
        }
      );

    const data =
      await response.json();

    if (!response.ok) {

      throw new Error(
        data.error ||
        "Erreur paiement"
      );
    }

    if (data.url) {

      location.href =
        data.url;

    } else {

      throw new Error(
        "Lien de paiement manquant"
      );
    }

  } catch (error) {

    message.textContent =
      error.message;

    button.disabled =
      false;
  }
}

// ============================================================
// INITIALISATION
// ============================================================

renderProducts();

renderCart();

</script>

</body>

</html>`;
}

// ============================================================
// STRIPE CHECKOUT
// ============================================================

async function createStripeCheckout(
  req,
  res
) {

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

  const amount =
    Math.round(
      Number(body.amountEur) *
      100
    );

  if (
    !Number.isFinite(amount) ||
    amount < 50
  ) {

    return json(
      res,
      400,
      {
        error:
          "Montant invalide."
      }
    );
  }

  const session =
    await stripe
      .checkout
      .sessions
      .create({

        mode: "payment",

        payment_method_types: [
          "card"
        ],

        line_items: [
          {
            price_data: {

              currency: "eur",

              product_data: {
                name:
                  "Commande Koala Store"
              },

              unit_amount:
                amount
            },

            quantity: 1
          }
        ],

        success_url:
          `${KOALA_STORE_URL}/?stripe=success&session_id={CHECKOUT_SESSION_ID}`,

        cancel_url:
          `${KOALA_STORE_URL}/?stripe=cancel`
      });

  return json(
    res,
    200,
    {
      url: session.url
    }
  );
}

// ============================================================
// KOALA CRYPTO CHECKOUT
// ============================================================

async function createKoalaCheckout(
  req,
  res
) {

  const body =
    await readJson(req);

  const amountEur =
    Number(body.amountEur);

  const installmentsCount =
    Number(
      body.installmentsCount ||
      3
    );

  if (
    !Number.isFinite(amountEur) ||
    amountEur <= 0
  ) {

    return json(
      res,
      400,
      {
        error:
          "Montant invalide."
      }
    );
  }

  if (
    ![3, 4].includes(
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
  // BTC actuellement opérationnel
  // ==========================================================

  const payload = {

    merchantId: 1,

    amountEur:
      amountEur,

    crypto:
      "BTC",

    installmentsCount:
      installmentsCount,

    returnUrl:
      `${KOALA_STORE_URL}/store/success`
  };

  const response =
    await fetch(
      `${KOALA_CRYPTO_URL}/api/orders`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(
            payload
          )
      }
    );

  const data =
    await response
      .json()
      .catch(
        () => ({})
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

  const token =
    data.paymentToken ||
    data.payment_token ||
    (
      data.installments &&
      data.installments[0] &&
      (
        data.installments[0]
          .paymentToken ||
        data.installments[0]
          .payment_token
      )
    );

  const direct =
    data.paymentUrl ||
    data.payment_url ||
    data.url;

  const target =
    direct ||
    (
      token
        ? `${KOALA_CRYPTO_URL}/pay/${encodeURIComponent(token)}`
        : null
    );

  if (!target) {

    return json(
      res,
      502,
      {
        error:
          "Koala Crypto n'a pas renvoyé de lien de paiement."
      }
    );
  }

  return json(
    res,
    200,
    {
      url: target
    }
  );
}

// ============================================================
// SERVEUR HTTP
// ============================================================

const server =
  http.createServer(
    async (req, res) => {

      try {

        const url =
          new URL(
            req.url,
            KOALA_STORE_URL
          );

        // ====================================================
        // PAGE PRINCIPALE
        // ====================================================

        if (
          req.method === "GET" &&
          (
            url.pathname === "/" ||
            url.pathname ===
              "/store/success"
          )
        ) {

          return send(
            res,
            200,
            "text/html; charset=utf-8",
            pageHtml(url)
          );
        }

        // ====================================================
        // HEALTH
        // ====================================================

        if (
          req.method === "GET" &&
          url.pathname === "/health"
        ) {

          return json(
            res,
            200,
            {
              app:
                "Koala Store",

              status:
                "online",

              stripe:
                !!stripe,

              koala_crypto:
                KOALA_CRYPTO_URL
            }
          );
        }

        // ====================================================
        // STRIPE
        // ====================================================

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

        // ====================================================
        // KOALA CRYPTO
        // ====================================================

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

        // ====================================================
        // 404
        // ====================================================

        return json(
          res,
          404,
          {
            error:
              "Route introuvable"
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
// DÉMARRAGE
// ============================================================

server.listen(
  PORT,
  () => {

    console.log(
      `Koala Store démarré sur le port ${PORT}`
    );

    console.log(
      `Stripe configuré : ${stripe ? "oui" : "non"}`
    );

    console.log(
      `Koala Crypto : ${KOALA_CRYPTO_URL}`
    );
  }
);