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
// OUTILS
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
// PAGE PRINCIPALE
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

/* ==========================================================
   HEADER
   ========================================================== */

.top {
  position: sticky;
  top: 0;
  z-index: 100;
  background: white;
  padding:
    max(12px, env(safe-area-inset-top))
    12px
    10px;
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
  font-weight: 900;
}

/* ==========================================================
   MESSAGES
   ========================================================== */

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

/* ==========================================================
   PROMOTION
   ========================================================== */

.promo {
  margin: 12px;
  border-radius: 18px;
  padding: 18px;
  background:
    linear-gradient(
      135deg,
      #111827,
      #374151
    );
  color: white;
}

.promo-title {
  font-size: 27px;
  font-weight: 950;
  margin-bottom: 6px;
}

.promo-text {
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

/* ==========================================================
   CATEGORIES
   ========================================================== */

.categories {
  display: flex;
  gap: 9px;
  overflow-x: auto;
  padding: 4px 12px 13px;
  scrollbar-width: none;
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

/* ==========================================================
   TITRE
   ========================================================== */

.section-title {
  padding: 4px 12px 10px;
  font-size: 20px;
  font-weight: 950;
}

/* ==========================================================
   PRODUITS
   ========================================================== */

.products {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
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
  background:
    linear-gradient(
      145deg,
      #f8fafc,
      #e5e7eb
    );
  cursor: pointer;
}

.product-info {
  padding: 10px;
}

.product-name {
  font-weight: 750;
  font-size: 14px;
  line-height: 1.25;
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
  margin-top: 2px;
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

/* ==========================================================
   MODAL PRODUIT / PANIER
   ========================================================== */

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
  padding-bottom:
    calc(25px + env(safe-area-inset-bottom));
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

.detail-image {
  height: 260px;
  border-radius: 18px;
  background: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 110px;
  margin-bottom: 16px;
}

.detail-name {
  font-size: 23px;
  font-weight: 950;
}

.detail-price {
  font-size: 28px;
  font-weight: 950;
  margin: 8px 0;
}

.detail-description {
  color: #555;
  line-height: 1.45;
}

/* ==========================================================
   OPTIONS
   ========================================================== */

.option-title {
  margin-top: 18px;
  font-weight: 900;
}

.options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 9px;
}

.option {
  border: 1px solid #ddd;
  background: white;
  border-radius: 9px;
  padding: 9px 13px;
  font-weight: 700;
}

.option.selected {
  border: 2px solid #111;
}

/* ==========================================================
   PANIER
   ========================================================== */

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

/* ==========================================================
   PAIEMENT
   ========================================================== */

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

/* ==========================================================
   NAVIGATION BAS
   ========================================================== */

.bottom-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 300;
  height:
    calc(67px + env(safe-area-inset-bottom));
  padding-bottom:
    env(safe-area-inset-bottom);
  background: white;
  border-top: 1px solid #ddd;
  display: grid;
  grid-template-columns:
    repeat(4, 1fr);
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
  margin-bottom: 2px;
}

.nav-item.active {
  font-weight: 950;
}

/* ==========================================================
   DESKTOP
   ========================================================== */

@media (min-width: 800px) {

  body {
    max-width: 1100px;
    margin: auto;
  }

  .products {
    grid-template-columns:
      repeat(4, 1fr);
    gap: 14px;
  }

  .product-image {
    height: 240px;
  }

  .sheet {
    max-width: 600px;
    margin: auto;
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
      🛒
      <span id="top-count">0</span>
    </button>

  </div>

  <div class="search">

    <input
      id="search"
      type="search"
      placeholder="Rechercher dans Koala Store"
      oninput="searchProducts()"
    >

    <button onclick="searchProducts()">
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
  ? '<div class="notice">Paiement par carte Stripe confirmé ✅</div>'
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
    Découvrez nos nouveautés et ajoutez
    vos articles préférés au panier.
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
    Pour vous
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
  Sélection pour vous
</div>

<div
  class="products"
  id="products"
></div>

<!-- ========================================================
     MODAL PRODUIT
     ======================================================== -->

<div
  class="overlay"
  id="product-overlay"
  onclick="overlayClose(event,'product-overlay')"
>

  <div class="sheet">

    <div class="handle"></div>

    <button
      class="close"
      onclick="closeProduct()"
    >
      ×
    </button>

    <div id="product-detail"></div>

  </div>

</div>

<!-- ========================================================
     PANIER
     ======================================================== -->

<div
  class="overlay"
  id="cart-overlay"
  onclick="overlayClose(event,'cart-overlay')"
>

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

      <span>
        Total
      </span>

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

    <div
      class="plans"
      id="plans"
    >

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

<!-- ========================================================
     NAVIGATION
     ======================================================== -->

<div class="bottom-nav">

  <button
    class="nav-item active"
    onclick="goHome()"
  >
    <span class="nav-icon">🏠</span>
    Accueil
  </button>

  <button
    class="nav-item"
    onclick="focusCategories()"
  >
    <span class="nav-icon">▦</span>
    Catégories
  </button>

  <button
    class="nav-item"
    onclick="openCart()"
  >
    <span class="nav-icon">🛒</span>
    Panier
    <span id="bottom-count">0</span>
  </button>

  <button
    class="nav-item"
    onclick="showAccount()"
  >
    <span class="nav-icon">👤</span>
    Compte
  </button>

</div>

<script>

// ============================================================
// PRODUITS
// ============================================================

const products = [

  {
    id: 1,
    name: "T-shirt Koala Premium",
    category: "Mode",
    price: 19.99,
    oldPrice: 29.99,
    emoji: "👕",
    rating: "★★★★★",
    sold: "1,2 k+ vendus",
    description:
      "T-shirt confortable au style Koala Store. Coupe moderne et tissu doux."
  },

  {
    id: 2,
    name: "Sweat Koala Urban",
    category: "Mode",
    price: 39.99,
    oldPrice: 59.99,
    emoji: "🧥",
    rating: "★★★★★",
    sold: "860+ vendus",
    description:
      "Sweat confortable pour tous les jours avec finition premium."
  },

  {
    id: 3,
    name: "Casquette Koala",
    category: "Accessoires",
    price: 14.99,
    oldPrice: 22.99,
    emoji: "🧢",
    rating: "★★★★☆",
    sold: "740+ vendus",
    description:
      "Casquette légère avec réglage arrière."
  },

  {
    id: 4,
    name: "Sac Koala City",
    category: "Accessoires",
    price: 27.99,
    oldPrice: 39.99,
    emoji: "👜",
    rating: "★★★★★",
    sold: "2 k+ vendus",
    description:
      "Sac pratique pour la ville et les déplacements quotidiens."
  },

  {
    id: 5,
    name: "Écouteurs sans fil",
    category: "Tech",
    price: 24.99,
    oldPrice: 39.99,
    emoji: "🎧",
    rating: "★★★★☆",
    sold: "3,1 k+ vendus",
    description:
      "Écouteurs Bluetooth compacts avec boîtier de recharge."
  },

  {
    id: 6,
    name: "Montre connectée",
    category: "Tech",
    price: 34.99,
    oldPrice: 54.99,
    emoji: "⌚",
    rating: "★★★★★",
    sold: "950+ vendus",
    description:
      "Montre connectée avec suivi d'activité et notifications."
  },

  {
    id: 7,
    name: "Lampe design",
    category: "Maison",
    price: 18.99,
    oldPrice: 28.99,
    emoji: "💡",
    rating: "★★★★☆",
    sold: "520+ vendus",
    description:
      "Lampe décorative compacte pour chambre ou salon."
  },

  {
    id: 8,
    name: "Coussin Koala",
    category: "Maison",
    price: 16.99,
    oldPrice: 25.99,
    emoji: "🛋️",
    rating: "★★★★★",
    sold: "1,4 k+ vendus",
    description:
      "Coussin doux et confortable pour votre intérieur."
  },

  {
    id: 9,
    name: "Lunettes tendance",
    category: "Accessoires",
    price: 12.99,
    oldPrice: 19.99,
    emoji: "🕶️",
    rating: "★★★★☆",
    sold: "680+ vendus",
    description:
      "Lunettes au design moderne pour compléter votre tenue."
  },

  {
    id: 10,
    name: "Baskets Urban",
    category: "Mode",
    price: 42.99,
    oldPrice: 69.99,
    emoji: "👟",
    rating: "★★★★★",
    sold: "1,1 k+ vendus",
    description:
      "Baskets légères et confortables pour un usage quotidien."
  },

  {
    id: 11,
    name: "Enceinte Bluetooth",
    category: "Tech",
    price: 29.99,
    oldPrice: 44.99,
    emoji: "🔊",
    rating: "★★★★☆",
    sold: "790+ vendus",
    description:
      "Enceinte portable Bluetooth avec batterie rechargeable."
  },

  {
    id: 12,
    name: "Mug Koala",
    category: "Maison",
    price: 9.99,
    oldPrice: 14.99,
    emoji: "☕",
    rating: "★★★★★",
    sold: "2,3 k+ vendus",
    description:
      "Mug Koala Store pour boissons chaudes et froides."
  }

];

// ============================================================
// ETAT
// ============================================================

let cart = {};

let category = "Tous";

let payment = "card";

let plan = 3;

let selectedProductId = null;

// ============================================================
// EURO
// ============================================================

function eur(value) {

  return Number(value).toLocaleString(
    "fr-FR",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  ) + " €";
}

// ============================================================
// PRODUITS FILTRES
// ============================================================

function filteredProducts() {

  const query =
    document
      .getElementById("search")
      .value
      .trim()
      .toLowerCase();

  return products.filter(function(product) {

    const categoryOk =
      category === "Tous" ||
      product.category === category;

    const searchOk =
      !query ||
      product.name
        .toLowerCase()
        .includes(query) ||
      product.category
        .toLowerCase()
        .includes(query);

    return categoryOk && searchOk;
  });
}

// ============================================================
// AFFICHAGE PRODUITS
// ============================================================

function renderProducts() {

  const list =
    filteredProducts();

  const html =
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

          '<div class="product-image" ' +
            'onclick="openProduct(' +
            product.id +
            ')">' +
            product.emoji +
          '</div>' +

          '<div class="product-info">' +

            '<div class="product-name">' +
              product.name +
            '</div>' +

            '<div class="rating">' +
              product.rating +
              ' <span class="sold">' +
              product.sold +
              '</span>' +
            '</div>' +

            '<div>' +
              '<span class="old-price">' +
                eur(product.oldPrice) +
              '</span> ' +
              '<span class="discount">-' +
                discount +
                '%</span>' +
            '</div>' +

            '<div class="product-price">' +
              eur(product.price) +
            '</div>' +

            '<button class="add" ' +
              'onclick="addProduct(' +
              product.id +
              ')">' +
              'Ajouter au panier' +
            '</button>' +

          '</div>' +

        '</div>'
      );

    }).join("");

  document
    .getElementById("products")
    .innerHTML =
      html ||
      '<div style="padding:20px">Aucun produit trouvé.</div>';
}

// ============================================================
// RECHERCHE
// ============================================================

function searchProducts() {
  renderProducts();
}

// ============================================================
// CATEGORIE
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
// FICHE PRODUIT
// ============================================================

function openProduct(id) {

  selectedProductId = id;

  const product =
    products.find(function(item) {
      return item.id === id;
    });

  if (!product) {
    return;
  }

  document
    .getElementById("product-detail")
    .innerHTML =

      '<div class="detail-image">' +
        product.emoji +
      '</div>' +

      '<div class="detail-name">' +
        product.name +
      '</div>' +

      '<div class="rating">' +
        product.rating +
        ' ' +
        product.sold +
      '</div>' +

      '<div class="detail-price">' +
        eur(product.price) +
      '</div>' +

      '<div class="detail-description">' +
        product.description +
      '</div>' +

      '<div class="option-title">' +
        'Couleur' +
      '</div>' +

      '<div class="options">' +

        '<button class="option selected">' +
          'Noir' +
        '</button>' +

        '<button class="option">' +
          'Blanc' +
        '</button>' +

        '<button class="option">' +
          'Beige' +
        '</button>' +

      '</div>' +

      '<div class="option-title">' +
        'Taille' +
      '</div>' +

      '<div class="options">' +

        '<button class="option">' +
          'S' +
        '</button>' +

        '<button class="option selected">' +
          'M' +
        '</button>' +

        '<button class="option">' +
          'L' +
        '</button>' +

        '<button class="option">' +
          'XL' +
        '</button>' +

      '</div>' +

      '<button class="pay" ' +
        'onclick="addProductAndClose(' +
        product.id +
        ')">' +
        'Ajouter au panier · ' +
        eur(product.price) +
      '</button>';

  document
    .getElementById("product-overlay")
    .classList
    .add("show");
}

function closeProduct() {

  document
    .getElementById("product-overlay")
    .classList
    .remove("show");
}

function addProductAndClose(id) {

  addProduct(id);

  closeProduct();

  openCart();
}

// ============================================================
// PANIER
// ============================================================

function addProduct(id) {

  cart[id] =
    (cart[id] || 0) + 1;

  updateCartCounters();

  renderCart();
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

  updateCartCounters();

  renderCart();
}

function getCount() {

  return Object
    .values(cart)
    .reduce(function(total, quantity) {
      return total + quantity;
    }, 0);
}

function getTotal() {

  return products.reduce(
    function(total, product) {

      return total +
        (
          cart[product.id] || 0
        ) *
        product.price;

    },
    0
  );
}

function updateCartCounters() {

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
      '<div style="padding:25px 0;color:#777">' +
        'Votre panier est vide.' +
      '</div>';

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
// PAIEMENT
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
    document.getElementById("pay-button");

  button.textContent =
    value === "crypto"
      ? "Continuer vers Koala Crypto"
      : "Payer par carte";

  button.className =
    value === "crypto"
      ? "pay crypto"
      : "pay";
}

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
// ENVOI PAIEMENT
// ============================================================

async function pay() {

  const total =
    getTotal();

  if (total <= 0) {
    return;
  }

  const button =
    document.getElementById(
      "pay-button"
    );

  const message =
    document.getElementById(
      "payment-message"
    );

  button.disabled = true;

  message.textContent =
    "Préparation du paiement…";

  try {

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

    const endpoint =
      payment === "crypto"
        ? "/api/koala/checkout"
        : "/api/stripe/checkout";

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
        "Impossible de préparer le paiement."
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

// ============================================================
// NAVIGATION
// ============================================================

function goHome() {

  closeCart();
  closeProduct();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function focusCategories() {

  closeCart();

  document
    .getElementById("categories")
    .scrollIntoView({
      behavior: "smooth"
    });
}

function showAccount() {

  alert(
    "L'espace client Koala Store sera disponible ici."
  );
}

function overlayClose(event, id) {

  if (event.target.id === id) {

    document
      .getElementById(id)
      .classList
      .remove("show");
  }
}

// ============================================================
// DEMARRAGE FRONT
// ============================================================

renderProducts();

renderCart();

updateCartCounters();

</script>

</body>

</html>`;
}

// ============================================================
// STRIPE
// ============================================================

async function createStripeCheckout(req, res) {

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
        error:
          "Montant invalide."
      }
    );
  }

  const session =
    await stripe.checkout.sessions.create({

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
// KOALA CRYPTO
// ============================================================

async function createKoalaCheckout(req, res) {

  const body =
    await readJson(req);

  const amountEur =
    Number(body.amountEur);

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
          "Choisissez le paiement 3x ou 4x."
      }
    );
  }

  // ==========================================================
  // KOALA STORE -> KOALA CRYPTO
  // BTC est actuellement utilisé pour le paiement opérationnel.
  //
  // IMPORTANT :
  // returnUrl indique à Koala Crypto où revenir
  // après confirmation du paiement.
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

  console.log(
    "Création commande Koala Crypto:",
    payload
  );

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
          JSON.stringify(payload)
      }
    );

  const data =
    await response
      .json()
      .catch(function() {
        return {};
      });

  if (!response.ok) {

    console.error(
      "Erreur Koala Crypto:",
      data
    );

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
  // RECUPERATION DU TOKEN
  // ==========================================================

  let token =
    data.paymentToken ||
    data.payment_token ||
    null;

  if (
    !token &&
    data.installments &&
    data.installments.length
  ) {

    token =
      data.installments[0].paymentToken ||
      data.installments[0].payment_token ||
      null;
  }

  // ==========================================================
  // URL DIRECTE EVENTUELLEMENT FOURNIE PAR KOALA CRYPTO
  // ==========================================================

  const directUrl =
    data.paymentUrl ||
    data.payment_url ||
    data.url ||
    null;

  // ==========================================================
  // REDIRECTION KOALA STORE -> KOALA CRYPTO
  // ==========================================================

  const target =
    directUrl ||
    (
      token
        ? `${KOALA_CRYPTO_URL}/pay/${encodeURIComponent(token)}`
        : null
    );

  if (!target) {

    console.error(
      "Réponse Koala Crypto sans URL:",
      data
    );

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
// SERVEUR
// ============================================================

const server =
  http.createServer(
    async function(req, res) {

      try {

        const url =
          new URL(
            req.url,
            KOALA_STORE_URL
          );

        // ====================================================
        // ACCUEIL
        // ====================================================

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

        // ====================================================
        // RETOUR DE KOALA CRYPTO
        // ====================================================

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

              koalaCrypto:
                KOALA_CRYPTO_URL,

              store:
                KOALA_STORE_URL
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
// DEMARRAGE
// ============================================================

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
  }
);