const http = require("http");

const PORT = process.env.PORT || 10000;

const KOALA_CRYPTO_URL =
  "https://koala6.onrender.com";

// ============================================================
// HTTP
// ============================================================

function send(res, status, type, body) {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store"
  });

  res.end(body);
}

// ============================================================
// PAGE
// ============================================================

function pageHtml() {
  return `
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  />

  <title>Koala Store</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      background: #f6f7fb;
      color: #111827;
    }

    button {
      font-family: inherit;
    }

    .topbar {
      background: white;
      border-bottom: 1px solid #e5e7eb;
      position: sticky;
      top: 0;
      z-index: 20;
    }

    .topbar-inner {
      max-width: 900px;
      margin: auto;
      padding: 16px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .brand {
      font-size: 23px;
      font-weight: 900;
    }

    .cart-badge {
      background: #111827;
      color: white;
      border-radius: 999px;
      padding: 8px 12px;
      font-weight: 800;
      font-size: 14px;
    }

    .wrap {
      max-width: 900px;
      margin: auto;
      padding: 24px 18px 60px;
    }

    .hero {
      background:
        linear-gradient(
          135deg,
          #111827,
          #374151
        );
      color: white;
      border-radius: 24px;
      padding: 28px 22px;
      margin-bottom: 24px;
    }

    .hero h1 {
      margin: 0 0 8px;
    }

    .hero p {
      margin: 0;
      opacity: .86;
      line-height: 1.5;
    }

    .status {
      display: none;
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      color: #065f46;
      border-radius: 16px;
      padding: 16px;
      margin-bottom: 20px;
      font-weight: 800;
    }

    .status.show {
      display: block;
    }

    .section-title {
      font-size: 21px;
      font-weight: 900;
      margin: 24px 0 14px;
    }

    .products {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }

    .product {
      background: white;
      border-radius: 20px;
      padding: 18px;
      box-shadow:
        0 8px 30px rgba(0,0,0,.05);
    }

    .product-image {
      height: 120px;
      border-radius: 16px;
      background: #eef2ff;
      display: flex;
      justify-content: center;
      align-items: center;
      font-size: 52px;
      margin-bottom: 14px;
    }

    .product-name {
      font-size: 18px;
      font-weight: 900;
    }

    .product-desc {
      margin-top: 5px;
      color: #6b7280;
      font-size: 14px;
    }

    .product-price {
      margin-top: 10px;
      font-size: 22px;
      font-weight: 900;
    }

    .add {
      width: 100%;
      border: none;
      border-radius: 13px;
      margin-top: 13px;
      padding: 13px;
      background: #111827;
      color: white;
      font-weight: 800;
      cursor: pointer;
    }

    .checkout {
      background: white;
      border-radius: 22px;
      padding: 20px;
      box-shadow:
        0 8px 30px rgba(0,0,0,.05);
    }

    .empty {
      background: #f9fafb;
      color: #6b7280;
      border-radius: 14px;
      padding: 18px;
      text-align: center;
    }

    .cart-row {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 14px;
      padding: 14px 0;
      border-bottom: 1px solid #f1f1f1;
    }

    .cart-name {
      font-weight: 800;
    }

    .cart-line {
      font-size: 14px;
      color: #6b7280;
      margin-top: 4px;
    }

    .qty {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .qty button {
      width: 34px;
      height: 34px;
      border: none;
      border-radius: 10px;
      background: #f3f4f6;
      cursor: pointer;
      font-size: 18px;
      font-weight: 900;
    }

    .summary {
      padding-top: 16px;
    }

    .summary-line {
      display: flex;
      justify-content: space-between;
      margin: 10px 0;
      color: #4b5563;
    }

    .summary-total {
      display: flex;
      justify-content: space-between;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      font-size: 23px;
      font-weight: 900;
    }

    .payment-title {
      margin-top: 26px;
      font-size: 19px;
      font-weight: 900;
    }

    .payment-method {
      width: 100%;
      border: 2px solid #e5e7eb;
      background: white;
      border-radius: 16px;
      padding: 17px;
      margin-top: 12px;
      cursor: pointer;
      display: flex;
      gap: 14px;
      align-items: center;
      text-align: left;
    }

    .payment-method.active {
      border-color: #111827;
      background: #f9fafb;
    }

    .payment-icon {
      font-size: 28px;
    }

    .payment-name {
      font-weight: 900;
      font-size: 17px;
    }

    .payment-desc {
      color: #6b7280;
      font-size: 13px;
      margin-top: 3px;
    }

    .plans {
      display: none;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 14px;
    }

    .plans.show {
      display: grid;
    }

    .plan {
      border: 2px solid #e5e7eb;
      background: white;
      border-radius: 14px;
      padding: 14px;
      font-weight: 900;
      cursor: pointer;
    }

    .plan.active {
      background: #111827;
      border-color: #111827;
      color: white;
    }

    .plan small {
      display: block;
      margin-top: 5px;
      font-weight: 600;
      opacity: .8;
    }

    .pay {
      width: 100%;
      border: none;
      border-radius: 15px;
      margin-top: 20px;
      padding: 17px;
      font-size: 16px;
      font-weight: 900;
      background: #111827;
      color: white;
      cursor: pointer;
    }

    .pay:disabled {
      background: #d1d5db;
      color: #6b7280;
      cursor: not-allowed;
    }

    .notice {
      background: #fff7ed;
      border: 1px solid #fed7aa;
      color: #9a3412;
      padding: 13px;
      border-radius: 13px;
      margin-top: 12px;
      font-size: 13px;
      display: none;
    }

    .notice.show {
      display: block;
    }

    @media (max-width: 650px) {
      .products {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>

<body>

<header class="topbar">
  <div class="topbar-inner">

    <div class="brand">
      🐨 Koala Store
    </div>

    <div
      id="cartBadge"
      class="cart-badge"
    >
      Panier : 0
    </div>

  </div>
</header>

<main class="wrap">

  <section class="hero">

    <h1>
      Koala Store
    </h1>

    <p>
      Faites vos achats puis choisissez votre
      moyen de paiement.
    </p>

  </section>

  <div
    id="statusBox"
    class="status"
  >
    Paiement confirmé ✅

    <div
      id="statusDetails"
      style="
        margin-top:6px;
        font-size:14px;
        font-weight:600;
      "
    ></div>

  </div>

  <div class="section-title">
    Produits
  </div>

  <section
    id="products"
    class="products"
  ></section>

  <div class="section-title">
    Votre panier
  </div>

  <section class="checkout">

    <div id="cart"></div>

    <div class="summary">

      <div class="summary-line">

        <span>
          Articles
        </span>

        <strong id="count">
          0
        </strong>

      </div>

      <div class="summary-total">

        <span>
          Total
        </span>

        <span id="total">
          0,00 €
        </span>

      </div>

    </div>

    <div class="payment-title">
      Choisissez votre moyen de paiement
    </div>

    <button
      id="cardMethod"
      class="payment-method active"
      onclick="selectPayment('card')"
      type="button"
    >

      <span class="payment-icon">
        💳
      </span>

      <span>

        <div class="payment-name">
          Carte bancaire
        </div>

        <div class="payment-desc">
          Visa, Mastercard et cartes compatibles
        </div>

      </span>

    </button>

    <button
      id="cryptoMethod"
      class="payment-method"
      onclick="selectPayment('crypto')"
      type="button"
    >

      <span class="payment-icon">
        🐨
      </span>

      <span>

        <div class="payment-name">
          Koala Crypto
        </div>

        <div class="payment-desc">
          BTC, USDC ou USDT en 3 ou 4 fois
        </div>

      </span>

    </button>

    <div
      id="plans"
      class="plans"
    >

      <button
        id="plan3"
        class="plan active"
        type="button"
        onclick="selectPlan(3)"
      >
        3x

        <small id="plan3Amount">
          0,00 €
        </small>

      </button>

      <button
        id="plan4"
        class="plan"
        type="button"
        onclick="selectPlan(4)"
      >
        4x

        <small id="plan4Amount">
          0,00 €
        </small>

      </button>

    </div>

    <button
      id="payButton"
      class="pay"
      type="button"
      disabled
      onclick="pay()"
    >
      Payer par carte bancaire
    </button>

    <div
      id="cardNotice"
      class="notice"
    >
      Le bouton carte bancaire est prêt dans
      l'interface. La connexion Stripe sera ajoutée
      à l'étape suivante pour accepter réellement
      les paiements CB.
    </div>

  </section>

</main>

<script>

// ============================================================
// PRODUITS
// ============================================================

const products = [
  {
    id: 1,
    name: "Casque Koala",
    description: "Casque audio sans fil",
    price: 20.00,
    icon: "🎧"
  },
  {
    id: 2,
    name: "Enceinte Koala",
    description: "Enceinte Bluetooth portable",
    price: 29.90,
    icon: "🔊"
  },
  {
    id: 3,
    name: "Montre Koala",
    description: "Montre connectée",
    price: 39.90,
    icon: "⌚"
  },
  {
    id: 4,
    name: "Sac Koala",
    description: "Sac urbain",
    price: 24.90,
    icon: "🎒"
  }
];

let cart = {};

let paymentMethod = "card";

let installments = 3;

// ============================================================
// EURO
// ============================================================

function euro(value) {
  return Number(value).toLocaleString(
    "fr-FR",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  ) + " €";
}

// ============================================================
// PRODUITS
// ============================================================

function renderProducts() {

  const el =
    document.getElementById("products");

  el.innerHTML = "";

  products.forEach(product => {

    const card =
      document.createElement("div");

    card.className =
      "product";

    card.innerHTML = \`
      <div class="product-image">
        \${product.icon}
      </div>

      <div class="product-name">
        \${product.name}
      </div>

      <div class="product-desc">
        \${product.description}
      </div>

      <div class="product-price">
        \${euro(product.price)}
      </div>

      <button
        class="add"
        type="button"
        onclick="addProduct(\${product.id})"
      >
        Ajouter au panier
      </button>
    \`;

    el.appendChild(card);

  });
}

// ============================================================
// AJOUT
// ============================================================

function addProduct(id) {

  cart[id] =
    (cart[id] || 0) + 1;

  renderCart();
}

// ============================================================
// RETRAIT
// ============================================================

function removeProduct(id) {

  if (!cart[id]) {
    return;
  }

  cart[id]--;

  if (cart[id] <= 0) {
    delete cart[id];
  }

  renderCart();
}

// ============================================================
// TOTAL
// ============================================================

function getTotal() {

  let total = 0;

  products.forEach(product => {

    const quantity =
      cart[product.id] || 0;

    total +=
      product.price * quantity;

  });

  return total;
}

// ============================================================
// NB ARTICLES
// ============================================================

function getCount() {

  return Object
    .values(cart)
    .reduce(
      (sum, qty) =>
        sum + qty,
      0
    );
}

// ============================================================
// PANIER
// ============================================================

function renderCart() {

  const el =
    document.getElementById("cart");

  const count =
    getCount();

  const total =
    getTotal();

  el.innerHTML = "";

  if (count === 0) {

    el.innerHTML = \`
      <div class="empty">
        Votre panier est vide.
      </div>
    \`;

  } else {

    products.forEach(product => {

      const qty =
        cart[product.id] || 0;

      if (qty === 0) {
        return;
      }

      const row =
        document.createElement("div");

      row.className =
        "cart-row";

      row.innerHTML = \`

        <div>

          <div class="cart-name">
            \${product.icon}
            \${product.name}
          </div>

          <div class="cart-line">
            \${euro(product.price)}
            ×
            \${qty}
          </div>

        </div>

        <div class="qty">

          <button
            onclick="removeProduct(\${product.id})"
            type="button"
          >
            −
          </button>

          <strong>
            \${qty}
          </strong>

          <button
            onclick="addProduct(\${product.id})"
            type="button"
          >
            +
          </button>

        </div>

      \`;

      el.appendChild(row);

    });

  }

  document.getElementById(
    "count"
  ).textContent = count;

  document.getElementById(
    "total"
  ).textContent =
    euro(total);

  document.getElementById(
    "cartBadge"
  ).textContent =
    "Panier : " + count;

  document.getElementById(
    "payButton"
  ).disabled =
    total <= 0;

  updatePlans();
}

// ============================================================
// MÉTHODE DE PAIEMENT
// ============================================================

function selectPayment(method) {

  paymentMethod =
    method;

  document.getElementById(
    "cardMethod"
  ).classList.toggle(
    "active",
    method === "card"
  );

  document.getElementById(
    "cryptoMethod"
  ).classList.toggle(
    "active",
    method === "crypto"
  );

  document.getElementById(
    "plans"
  ).classList.toggle(
    "show",
    method === "crypto"
  );

  const button =
    document.getElementById(
      "payButton"
    );

  if (method === "card") {

    button.textContent =
      "Payer par carte bancaire";

  } else {

    button.textContent =
      "Payer avec Koala Crypto";

  }

  document.getElementById(
    "cardNotice"
  ).classList.remove("show");
}

// ============================================================
// 3X / 4X
// ============================================================

function selectPlan(value) {

  installments =
    value;

  document.getElementById(
    "plan3"
  ).classList.toggle(
    "active",
    value === 3
  );

  document.getElementById(
    "plan4"
  ).classList.toggle(
    "active",
    value === 4
  );

  updatePlans();
}

function updatePlans() {

  const total =
    getTotal();

  document.getElementById(
    "plan3Amount"
  ).textContent =
    euro(total / 3) +
    " / paiement";

  document.getElementById(
    "plan4Amount"
  ).textContent =
    euro(total / 4) +
    " / paiement";
}

// ============================================================
// PAYER
// ============================================================

function pay() {

  const total =
    getTotal();

  if (total <= 0) {
    return;
  }

  // ==========================================================
  // CARTE BANCAIRE
  // ==========================================================

  if (
    paymentMethod === "card"
  ) {

    document.getElementById(
      "cardNotice"
    ).classList.add("show");

    return;
  }

  // ==========================================================
  // KOALA CRYPTO
  // ==========================================================

  const successUrl =
    window.location.origin +
    "/store/success";

  const paymentUrl =
    new URL(
      "${KOALA_CRYPTO_URL}"
    );

  paymentUrl.searchParams.set(
    "merchant",
    "Koala Store"
  );

  paymentUrl.searchParams.set(
    "amount",
    total.toFixed(2)
  );

  paymentUrl.searchParams.set(
    "installments",
    String(installments)
  );

  paymentUrl.searchParams.set(
    "installments_count",
    String(installments)
  );

  paymentUrl.searchParams.set(
    "success_url",
    successUrl
  );

  window.location.href =
    paymentUrl.toString();
}

// ============================================================
// RETOUR PAIEMENT
// ============================================================

function checkReturn() {

  const params =
    new URLSearchParams(
      window.location.search
    );

  const status =
    params.get("status");

  const orderId =
    params.get("order_id");

  const amount =
    params.get("amount");

  if (status === "paid") {

    document.getElementById(
      "statusBox"
    ).classList.add("show");

    let text = "";

    if (amount) {
      text +=
        "Montant : " +
        euro(amount);
    }

    if (orderId) {

      if (text) {
        text += " • ";
      }

      text +=
        "Commande n°" +
        orderId;
    }

    document.getElementById(
      "statusDetails"
    ).textContent = text;

  }
}

// ============================================================
// INIT
// ============================================================

renderProducts();

renderCart();

checkReturn();

</script>

</body>
</html>
  `;
}

// ============================================================
// SERVEUR
// ============================================================

const server =
  http.createServer(
    (req, res) => {

      const url =
        new URL(
          req.url,
          "http://localhost"
        );

      if (
        url.pathname === "/"
      ) {

        return send(
          res,
          200,
          "text/html; charset=utf-8",
          pageHtml()
        );
      }

      if (
        url.pathname ===
        "/store/success"
      ) {

        return send(
          res,
          200,
          "text/html; charset=utf-8",
          pageHtml()
        );
      }

      if (
        url.pathname ===
        "/health"
      ) {

        return send(
          res,
          200,
          "application/json; charset=utf-8",
          JSON.stringify({
            app: "Koala Store",
            status: "online"
          })
        );
      }

      return send(
        res,
        404,
        "text/plain; charset=utf-8",
        "Not Found"
      );
    }
  );

server.listen(
  PORT,
  () => {

    console.log(
      "Koala Store démarré sur le port " +
      PORT
    );
  }
);