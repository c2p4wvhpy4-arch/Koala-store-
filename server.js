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
  onclick="alert('Espace client bientôt disponible')"
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

  return json(
    res,
    200,
    {
      url:session.url
    }
  );
}

// ============================================================
// KOALA CRYPTO CHECKOUT
// ============================================================

async function createKoalaCheckout(req,res) {

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

    merchantId:1,

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