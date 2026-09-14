const http = require("http");

const PORT = process.env.PORT || 10000;

const KOALA_CRYPTO_URL =
  "https://koala6.onrender.com";

const STORE_URL =
  "https://koala-store-1.onrender.com";

const BUSINESS = {
  name: "Olivier Kreutzenberger",
  status: "Entrepreneur individuel – micro-entrepreneur",
  siret: "513 232 421 00026",
  siren: "513 232 421",
  address:
    "143 rue Armand Guillebaud, 92160 Antony, France",
  email:
    "Koalastore@outlook.fr",

  // À compléter avant mise en production
  phone:
    "À compléter",

  mediator:
    "À compléter après adhésion à un médiateur de la consommation"
};

// ============================================================
// HTTP
// ============================================================

function send(
  res,
  status,
  type,
  body
) {
  res.writeHead(
    status,
    {
      "Content-Type": type,
      "Cache-Control": "no-store"
    }
  );

  res.end(body);
}

// ============================================================
// STYLE COMMUN
// ============================================================

function commonStyles() {
  return `
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family:
        Arial,
        Helvetica,
        sans-serif;
      background: #f6f7fb;
      color: #111827;
    }

    a {
      color: inherit;
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
      gap: 14px;
    }

    .brand {
      font-size: 23px;
      font-weight: 900;
      text-decoration: none;
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

    .legal-card {
      background: white;
      border-radius: 20px;
      padding: 22px;
      box-shadow:
        0 8px 30px
        rgba(0,0,0,.05);
      line-height: 1.65;
    }

    .legal-card h2 {
      margin-top: 30px;
      margin-bottom: 10px;
    }

    .legal-card h2:first-child {
      margin-top: 0;
    }

    .legal-card p {
      margin: 9px 0;
    }

    .legal-card ul {
      padding-left: 22px;
    }

    .back {
      display: inline-block;
      margin-bottom: 18px;
      text-decoration: none;
      font-weight: 800;
    }

    footer {
      margin-top: 42px;
      background: #111827;
      color: white;
    }

    .footer-inner {
      max-width: 900px;
      margin: auto;
      padding: 30px 18px;
    }

    .footer-brand {
      font-size: 20px;
      font-weight: 900;
      margin-bottom: 14px;
    }

    .footer-links {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 18px;
      margin-bottom: 18px;
    }

    .footer-links a {
      color: white;
      text-decoration: none;
      font-size: 14px;
    }

    .footer-small {
      color: #d1d5db;
      font-size: 12px;
      line-height: 1.5;
    }
  `;
}

// ============================================================
// HEADER
// ============================================================

function headerHtml(
  showCart = false
) {
  return `
    <header class="topbar">
      <div class="topbar-inner">

        <a
          href="/"
          class="brand"
        >
          🐨 Koala Store
        </a>

        ${
          showCart
            ? `
              <div
                id="cartBadge"
                class="cart-badge"
              >
                Panier : 0
              </div>
            `
            : ""
        }

      </div>
    </header>
  `;
}

// ============================================================
// FOOTER
// ============================================================

function footerHtml() {
  return `
    <footer>
      <div class="footer-inner">

        <div class="footer-brand">
          🐨 Koala Store
        </div>

        <div class="footer-links">

          <a href="/mentions-legales">
            Mentions légales
          </a>

          <a href="/cgv">
            CGV
          </a>

          <a href="/confidentialite">
            Confidentialité
          </a>

          <a href="/livraison-retours">
            Livraison & retours
          </a>

          <a href="/contact">
            Contact
          </a>

        </div>

        <div class="footer-small">
          ${BUSINESS.name} EI •
          SIRET ${BUSINESS.siret}<br>
          ${BUSINESS.address}<br>
          ${BUSINESS.email}
        </div>

      </div>
    </footer>
  `;
}

// ============================================================
// PAGE BOUTIQUE
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

    ${commonStyles()}

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
      grid-template-columns:
        repeat(
          2,
          1fr
        );
      gap: 16px;
    }

    .product {
      background: white;
      border-radius: 20px;
      padding: 18px;
      box-shadow:
        0 8px 30px
        rgba(0,0,0,.05);
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
        0 8px 30px
        rgba(0,0,0,.05);
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
      grid-template-columns:
        1fr auto;
      align-items: center;
      gap: 14px;
      padding: 14px 0;
      border-bottom:
        1px solid #f1f1f1;
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
      justify-content:
        space-between;
      margin: 10px 0;
      color: #4b5563;
    }

    .summary-total {
      display: flex;
      justify-content:
        space-between;
      margin-top: 16px;
      padding-top: 16px;
      border-top:
        1px solid #e5e7eb;
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
      border:
        2px solid #e5e7eb;
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
      grid-template-columns:
        1fr 1fr;
      gap: 10px;
      margin-top: 14px;
    }

    .plans.show {
      display: grid;
    }

    .plan {
      border:
        2px solid #e5e7eb;
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

    .terms-note {
      font-size: 12px;
      color: #6b7280;
      line-height: 1.5;
      margin-top: 16px;
      text-align: center;
    }

    .terms-note a {
      font-weight: 700;
    }

    @media (
      max-width: 650px
    ) {

      .products {
        grid-template-columns:
          1fr;
      }

    }

  </style>

</head>

<body>

${headerHtml(true)}

<main class="wrap">

  <section class="hero">

    <h1>
      Koala Store
    </h1>

    <p>
      Faites vos achats puis choisissez
      votre moyen de paiement.
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
      Le paiement par carte bancaire
      sera connecté à Stripe à l'étape suivante.
    </div>

    <div class="terms-note">
      En poursuivant votre commande,
      vous reconnaissez avoir pris connaissance
      des
      <a href="/cgv">
        conditions générales de vente
      </a>
      et acceptez que la commande implique
      une obligation de paiement.
    </div>

  </section>

</main>

${footerHtml()}

<script>

const products = [
  {
    id: 1,
    name: "Casque Koala",
    description:
      "Casque audio sans fil",
    price: 20.00,
    icon: "🎧"
  },
  {
    id: 2,
    name: "Enceinte Koala",
    description:
      "Enceinte Bluetooth portable",
    price: 29.90,
    icon: "🔊"
  },
  {
    id: 3,
    name: "Montre Koala",
    description:
      "Montre connectée",
    price: 39.90,
    icon: "⌚"
  },
  {
    id: 4,
    name: "Sac Koala",
    description:
      "Sac urbain",
    price: 24.90,
    icon: "🎒"
  }
];

let cart = {};

let paymentMethod =
  "card";

let installments =
  3;

function euro(
  value
) {

  return Number(
    value
  ).toLocaleString(
    "fr-FR",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  ) + " €";

}

function renderProducts() {

  const el =
    document.getElementById(
      "products"
    );

  el.innerHTML =
    "";

  products.forEach(
    product => {

      const card =
        document.createElement(
          "div"
        );

      card.className =
        "product";

      card.innerHTML =
        \`
          <div
            class="product-image"
          >
            \${product.icon}
          </div>

          <div
            class="product-name"
          >
            \${product.name}
          </div>

          <div
            class="product-desc"
          >
            \${product.description}
          </div>

          <div
            class="product-price"
          >
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

      el.appendChild(
        card
      );

    }
  );

}

function addProduct(
  id
) {

  cart[id] =
    (cart[id] || 0) + 1;

  renderCart();

}

function removeProduct(
  id
) {

  if (!cart[id]) {
    return;
  }

  cart[id]--;

  if (
    cart[id] <= 0
  ) {
    delete cart[id];
  }

  renderCart();

}

function getTotal() {

  let total =
    0;

  products.forEach(
    product => {

      const quantity =
        cart[
          product.id
        ] || 0;

      total +=
        product.price *
        quantity;

    }
  );

  return total;

}

function getCount() {

  return Object
    .values(
      cart
    )
    .reduce(
      (
        sum,
        qty
      ) =>
        sum + qty,
      0
    );

}

function renderCart() {

  const el =
    document.getElementById(
      "cart"
    );

  const count =
    getCount();

  const total =
    getTotal();

  el.innerHTML =
    "";

  if (
    count === 0
  ) {

    el.innerHTML =
      \`
        <div class="empty">
          Votre panier est vide.
        </div>
      \`;

  } else {

    products.forEach(
      product => {

        const qty =
          cart[
            product.id
          ] || 0;

        if (
          qty === 0
        ) {
          return;
        }

        const row =
          document.createElement(
            "div"
          );

        row.className =
          "cart-row";

        row.innerHTML =
          \`

            <div>

              <div
                class="cart-name"
              >
                \${product.icon}
                \${product.name}
              </div>

              <div
                class="cart-line"
              >
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

        el.appendChild(
          row
        );

      }
    );

  }

  document.getElementById(
    "count"
  ).textContent =
    count;

  document.getElementById(
    "total"
  ).textContent =
    euro(
      total
    );

  document.getElementById(
    "cartBadge"
  ).textContent =
    "Panier : " +
    count;

  document.getElementById(
    "payButton"
  ).disabled =
    total <= 0;

  updatePlans();

}

function selectPayment(
  method
) {

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

  if (
    method === "card"
  ) {

    button.textContent =
      "Payer par carte bancaire";

  } else {

    button.textContent =
      "Payer avec Koala Crypto";

  }

  document.getElementById(
    "cardNotice"
  ).classList.remove(
    "show"
  );

}

function selectPlan(
  value
) {

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
    euro(
      total / 3
    ) +
    " / paiement";

  document.getElementById(
    "plan4Amount"
  ).textContent =
    euro(
      total / 4
    ) +
    " / paiement";

}

function pay() {

  const total =
    getTotal();

  if (
    total <= 0
  ) {
    return;
  }

  if (
    paymentMethod ===
    "card"
  ) {

    document.getElementById(
      "cardNotice"
    ).classList.add(
      "show"
    );

    return;

  }

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
    total.toFixed(
      2
    )
  );

  paymentUrl.searchParams.set(
    "installments",
    String(
      installments
    )
  );

  paymentUrl.searchParams.set(
    "installments_count",
    String(
      installments
    )
  );

  paymentUrl.searchParams.set(
    "success_url",
    successUrl
  );

  window.location.href =
    paymentUrl.toString();

}

function checkReturn() {

  const params =
    new URLSearchParams(
      window.location.search
    );

  const status =
    params.get(
      "status"
    );

  const orderId =
    params.get(
      "order_id"
    );

  const amount =
    params.get(
      "amount"
    );

  if (
    status === "paid"
  ) {

    document.getElementById(
      "statusBox"
    ).classList.add(
      "show"
    );

    let text =
      "";

    if (
      amount
    ) {

      text +=
        "Montant : " +
        euro(
          amount
        );

    }

    if (
      orderId
    ) {

      if (
        text
      ) {
        text +=
          " • ";
      }

      text +=
        "Commande n°" +
        orderId;

    }

    document.getElementById(
      "statusDetails"
    ).textContent =
      text;

  }

}

renderProducts();

renderCart();

checkReturn();

</script>

</body>

</html>
  `;
}

// ============================================================
// GABARIT PAGE JURIDIQUE
// ============================================================

function legalPage(
  title,
  content
) {
  return `
<!doctype html>

<html lang="fr">

<head>

  <meta charset="utf-8" />

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  />

  <title>
    ${title} - Koala Store
  </title>

  <style>
    ${commonStyles()}
  </style>

</head>

<body>

${headerHtml(false)}

<main class="wrap">

  <a
    href="/"
    class="back"
  >
    ← Retour à Koala Store
  </a>

  <section class="hero">

    <h1>
      ${title}
    </h1>

    <p>
      Informations relatives à Koala Store.
    </p>

  </section>

  <section class="legal-card">

    ${content}

  </section>

</main>

${footerHtml()}

</body>

</html>
  `;
}

// ============================================================
// MENTIONS LÉGALES
// ============================================================

function legalNoticeHtml() {

  return legalPage(
    "Mentions légales",
    `

      <h2>
        Éditeur du site
      </h2>

      <p>
        <strong>
          ${BUSINESS.name}
          EI
        </strong>
      </p>

      <p>
        ${BUSINESS.status}
      </p>

      <p>
        SIREN :
        ${BUSINESS.siren}
      </p>

      <p>
        SIRET :
        ${BUSINESS.siret}
      </p>

      <p>
        Adresse :
        ${BUSINESS.address}
      </p>

      <p>
        Email :
        <a
          href="mailto:${BUSINESS.email}"
        >
          ${BUSINESS.email}
        </a>
      </p>

      <p>
        Téléphone :
        ${BUSINESS.phone}
      </p>

      <h2>
        Hébergement
      </h2>

      <p>
        Le site est hébergé
        par Render Services, Inc.
      </p>

      <p>
        525 Brannan Street,
        Suite 300,
        San Francisco,
        CA 94107,
        États-Unis.
      </p>

      <h2>
        Propriété intellectuelle
      </h2>

      <p>
        Les contenus, textes,
        éléments graphiques et
        éléments de présentation
        propres à Koala Store ne
        peuvent être reproduits
        sans autorisation,
        sous réserve des droits
        appartenant à leurs
        titulaires respectifs.
      </p>

    `
  );

}

// ============================================================
// CGV
// ============================================================

function cgvHtml() {

  return legalPage(
    "Conditions générales de vente",
    `

      <h2>
        1. Vendeur
      </h2>

      <p>
        Koala Store est exploité par
        ${BUSINESS.name} EI,
        micro-entrepreneur,
        SIRET ${BUSINESS.siret}.
      </p>

      <p>
        Contact :
        ${BUSINESS.email}
      </p>

      <h2>
        2. Produits
      </h2>

      <p>
        Les caractéristiques
        essentielles et le prix
        des produits sont présentés
        sur Koala Store avant
        la validation de la commande.
      </p>

      <h2>
        3. Prix
      </h2>

      <p>
        Les prix affichés sont
        exprimés en euros.
        Le montant total dû est
        présenté au client avant
        la validation définitive
        de sa commande.
      </p>

      <h2>
        4. Commande
      </h2>

      <p>
        Le client sélectionne les
        produits qu'il souhaite
        acheter et vérifie le contenu
        de son panier avant de procéder
        au paiement.
      </p>

      <p>
        La validation du paiement
        entraîne une obligation
        de paiement.
      </p>

      <h2>
        5. Paiement
      </h2>

      <p>
        Koala Store peut proposer
        différents moyens de paiement
        disponibles au moment
        de la commande.
      </p>

      <p>
        Le paiement par carte bancaire
        sera traité par le prestataire
        de paiement sélectionné
        par Koala Store.
      </p>

      <p>
        Lorsque Koala Crypto est proposé,
        le client est redirigé vers
        l'interface Koala Crypto.
      </p>

      <h2>
        6. Livraison
      </h2>

      <p>
        Les modalités,
        éventuels frais et délais
        de livraison applicables
        à la commande doivent être
        communiqués au client avant
        la validation définitive
        de celle-ci.
      </p>

      <h2>
        7. Droit de rétractation
      </h2>

      <p>
        Pour les ventes à distance
        de biens pour lesquelles
        le droit de rétractation
        s'applique, le consommateur
        dispose d'un délai légal
        de 14 jours à compter
        de la réception du bien
        pour notifier sa décision
        de se rétracter.
      </p>

      <p>
        Le consommateur dispose ensuite
        d'un délai maximal de 14 jours
        pour retourner le bien après
        avoir notifié sa rétractation.
      </p>

      <p>
        Certaines catégories de biens
        ou services peuvent être exclues
        du droit de rétractation
        dans les cas prévus par la loi.
      </p>

      <h2>
        Formulaire de rétractation
      </h2>

      <p>
        Pour exercer votre droit,
        vous pouvez envoyer à
        ${BUSINESS.email}
        une déclaration indiquant :
      </p>

      <ul>
        <li>vos nom et prénom ;</li>
        <li>votre adresse ;</li>
        <li>le numéro de commande ;</li>
        <li>
          les produits concernés ;
        </li>
        <li>
          votre décision claire
          de vous rétracter.
        </li>
      </ul>

      <h2>
        8. Garanties légales
      </h2>

      <p>
        Les produits vendus aux
        consommateurs bénéficient,
        lorsque les conditions légales
        sont réunies, des garanties
        légales applicables,
        notamment la garantie légale
        de conformité et la garantie
        contre les vices cachés.
      </p>

      <h2>
        9. Réclamations
      </h2>

      <p>
        Toute réclamation peut
        être adressée à :
        ${BUSINESS.email}
      </p>

      <h2>
        10. Médiation
      </h2>

      <p>
        En cas de litige non résolu
        après une réclamation préalable,
        le consommateur peut recourir
        gratuitement au médiateur
        de la consommation dont
        relève le vendeur.
      </p>

      <p>
        <strong>
          Médiateur :
          ${BUSINESS.mediator}
        </strong>
      </p>

    `
  );

}

// ============================================================
// CONFIDENTIALITÉ
// ============================================================

function privacyHtml() {

  return legalPage(
    "Politique de confidentialité",
    `

      <h2>
        Responsable du traitement
      </h2>

      <p>
        Le responsable du traitement
        des données collectées dans
        le cadre de Koala Store est
        ${BUSINESS.name} EI.
      </p>

      <p>
        Contact :
        ${BUSINESS.email}
      </p>

      <h2>
        Données susceptibles
        d'être traitées
      </h2>

      <p>
        Dans le cadre d'une commande,
        peuvent notamment être traitées
        les informations nécessaires
        à l'identification du client,
        à la livraison,
        à la facturation,
        au paiement et au suivi
        de la commande.
      </p>

      <h2>
        Finalités
      </h2>

      <ul>
        <li>
          traitement et suivi
          des commandes ;
        </li>

        <li>
          exécution des paiements ;
        </li>

        <li>
          livraison des produits ;
        </li>

        <li>
          gestion du service client ;
        </li>

        <li>
          respect des obligations
          comptables et légales.
        </li>

      </ul>

      <h2>
        Destinataires
      </h2>

      <p>
        Certaines données peuvent être
        transmises aux prestataires
        strictement nécessaires
        au fonctionnement du service,
        notamment les prestataires
        d'hébergement,
        de paiement et,
        le cas échéant,
        de livraison.
      </p>

      <h2>
        Durée de conservation
      </h2>

      <p>
        Les données sont conservées
        pendant les durées nécessaires
        à la réalisation des finalités
        pour lesquelles elles ont
        été collectées ainsi que
        pendant les durées imposées
        par la réglementation
        comptable, fiscale ou
        commerciale lorsqu'elles
        s'appliquent.
      </p>

      <h2>
        Vos droits
      </h2>

      <p>
        Vous pouvez exercer,
        selon les conditions prévues
        par la réglementation,
        vos droits d'accès,
        de rectification,
        d'effacement,
        de limitation,
        d'opposition et,
        lorsqu'il s'applique,
        votre droit à la portabilité.
      </p>

      <p>
        Vous pouvez envoyer
        votre demande à :
        ${BUSINESS.email}
      </p>

      <h2>
        Cookies et stockage local
      </h2>

      <p>
        Les technologies strictement
        nécessaires au fonctionnement
        du panier ou du service peuvent
        être utilisées sans finalité
        publicitaire.
      </p>

      <p>
        Si Koala Store ajoute
        ultérieurement des outils
        publicitaires ou d'autres
        traceurs soumis au consentement,
        un mécanisme de consentement
        sera mis en place avant
        leur utilisation.
      </p>

    `
  );

}

// ============================================================
// LIVRAISON ET RETOURS
// ============================================================

function deliveryHtml() {

  return legalPage(
    "Livraison & retours",
    `

      <h2>
        Livraison
      </h2>

      <p>
        Les modes,
        frais éventuels et délais
        de livraison disponibles
        doivent être indiqués
        avant la validation définitive
        de la commande.
      </p>

      <p>
        Koala Store doit respecter
        le délai annoncé au client
        lors de la commande.
      </p>

      <h2>
        Réception
      </h2>

      <p>
        Le client est invité à vérifier
        l'état du colis et du produit
        dès sa réception et à contacter
        rapidement Koala Store
        en cas de difficulté.
      </p>

      <h2>
        Retours
      </h2>

      <p>
        Lorsque le droit de rétractation
        s'applique,
        le consommateur dispose
        de 14 jours à compter
        de la réception pour informer
        Koala Store de sa décision.
      </p>

      <p>
        La demande peut être adressée
        à :
        ${BUSINESS.email}
      </p>

      <p>
        Les modalités pratiques
        et l'adresse de retour
        seront communiquées au client.
      </p>

    `
  );

}

// ============================================================
// CONTACT
// ============================================================

function contactHtml() {

  return legalPage(
    "Contact",
    `

      <h2>
        Koala Store
      </h2>

      <p>
        ${BUSINESS.name} EI
      </p>

      <p>
        ${BUSINESS.address}
      </p>

      <p>
        SIRET :
        ${BUSINESS.siret}
      </p>

      <p>
        Email :
        <a
          href="mailto:${BUSINESS.email}"
        >
          ${BUSINESS.email}
        </a>
      </p>

      <p>
        Téléphone :
        ${BUSINESS.phone}
      </p>

    `
  );

}

// ============================================================
// SERVEUR
// ============================================================

const server =
  http.createServer(
    (
      req,
      res
    ) => {

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
        "/mentions-legales"
      ) {

        return send(
          res,
          200,
          "text/html; charset=utf-8",
          legalNoticeHtml()
        );

      }

      if (
        url.pathname ===
        "/cgv"
      ) {

        return send(
          res,
          200,
          "text/html; charset=utf-8",
          cgvHtml()
        );

      }

      if (
        url.pathname ===
        "/confidentialite"
      ) {

        return send(
          res,
          200,
          "text/html; charset=utf-8",
          privacyHtml()
        );

      }

      if (
        url.pathname ===
        "/livraison-retours"
      ) {

        return send(
          res,
          200,
          "text/html; charset=utf-8",
          deliveryHtml()
        );

      }

      if (
        url.pathname ===
        "/contact"
      ) {

        return send(
          res,
          200,
          "text/html; charset=utf-8",
          contactHtml()
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
          JSON.stringify(
            {
              app:
                "Koala Store",
              status:
                "online"
            }
          )
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