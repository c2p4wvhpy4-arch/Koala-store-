const http = require("http");

const PORT = process.env.PORT || 10000;

const KOALA_CRYPTO_URL =
  "https://koala6.onrender.com";

// ============================================================
// OUTIL HTTP
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
// PAGE KOALA STORE
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

      font-family:
        Arial,
        Helvetica,
        sans-serif;

      background: #f6f7fb;

      color: #111827;
    }

    button,
    select {
      font-family: inherit;
    }

    /* ========================================================
       BARRE DU HAUT
    ======================================================== */

    .topbar {
      background: #ffffff;

      border-bottom:
        1px solid #e5e7eb;

      position: sticky;

      top: 0;

      z-index: 20;
    }

    .topbar-inner {
      max-width: 1100px;

      margin: 0 auto;

      padding:
        17px 18px;

      display: flex;

      align-items: center;

      justify-content:
        space-between;

      gap: 16px;
    }

    .brand {
      font-size: 23px;

      font-weight: 900;
    }

    .cart-indicator {
      background: #111827;

      color: white;

      border-radius: 999px;

      padding:
        9px 13px;

      font-size: 14px;

      font-weight: 800;
    }

    /* ========================================================
       CONTENU
    ======================================================== */

    .wrap {
      max-width: 1100px;

      margin: 0 auto;

      padding:
        24px 18px 60px;
    }

    /* ========================================================
       HERO
    ======================================================== */

    .hero {
      background:
        linear-gradient(
          135deg,
          #111827,
          #374151
        );

      color: white;

      border-radius: 24px;

      padding:
        30px 24px;

      margin-bottom: 24px;
    }

    .hero h1 {
      margin:
        0 0 10px;

      font-size:
        clamp(
          27px,
          6vw,
          38px
        );
    }

    .hero p {
      margin: 0;

      opacity: .87;

      line-height: 1.55;
    }

    /* ========================================================
       STATUT PAIEMENT
    ======================================================== */

    .payment-status {
      display: none;

      background: #ecfdf5;

      color: #065f46;

      border:
        1px solid #a7f3d0;

      border-radius: 18px;

      padding: 18px;

      margin-bottom: 22px;

      font-weight: 800;

      line-height: 1.5;
    }

    .payment-status.show {
      display: block;
    }

    /* ========================================================
       TITRES
    ======================================================== */

    .section-title {
      font-size: 22px;

      font-weight: 900;

      margin:
        8px 0 16px;
    }

    /* ========================================================
       PRODUITS
    ======================================================== */

    .products {
      display: grid;

      grid-template-columns:
        repeat(
          2,
          minmax(
            0,
            1fr
          )
        );

      gap: 16px;

      margin-bottom: 28px;
    }

    .product-card {
      background: white;

      border-radius: 20px;

      padding: 18px;

      box-shadow:
        0 8px 30px
        rgba(
          0,
          0,
          0,
          .055
        );
    }

    .product-image {
      height: 130px;

      border-radius: 18px;

      background: #eef2ff;

      display: flex;

      align-items: center;

      justify-content: center;

      font-size: 55px;

      margin-bottom: 16px;
    }

    .product-title {
      font-size: 19px;

      font-weight: 900;

      margin-bottom: 5px;
    }

    .product-description {
      color: #6b7280;

      font-size: 14px;

      min-height: 35px;

      line-height: 1.35;
    }

    .product-price {
      font-size: 23px;

      font-weight: 900;

      margin-top: 12px;
    }

    .add-button {
      width: 100%;

      border: none;

      cursor: pointer;

      margin-top: 14px;

      padding: 13px;

      border-radius: 13px;

      background: #111827;

      color: white;

      font-size: 15px;

      font-weight: 800;
    }

    .add-button:active {
      transform: scale(.98);
    }

    /* ========================================================
       PANIER
    ======================================================== */

    .cart-card {
      background: white;

      border-radius: 22px;

      padding: 20px;

      box-shadow:
        0 8px 30px
        rgba(
          0,
          0,
          0,
          .055
        );
    }

    .empty-cart {
      background: #f9fafb;

      border-radius: 14px;

      padding: 18px;

      color: #6b7280;

      text-align: center;
    }

    .cart-row {
      display: grid;

      grid-template-columns:
        1fr auto;

      gap: 14px;

      align-items: center;

      padding:
        15px 0;

      border-bottom:
        1px solid #f0f1f3;
    }

    .cart-product-name {
      font-weight: 800;

      margin-bottom: 5px;
    }

    .cart-product-price {
      color: #6b7280;

      font-size: 14px;
    }

    .quantity-box {
      display: flex;

      align-items: center;

      gap: 8px;
    }

    .quantity-button {
      width: 34px;

      height: 34px;

      border: none;

      border-radius: 10px;

      background: #f3f4f6;

      color: #111827;

      font-size: 19px;

      font-weight: 800;

      cursor: pointer;
    }

    .quantity {
      min-width: 25px;

      text-align: center;

      font-weight: 900;
    }

    /* ========================================================
       TOTAL
    ======================================================== */

    .summary {
      margin-top: 18px;

      padding-top: 2px;
    }

    .summary-row {
      display: flex;

      align-items: center;

      justify-content:
        space-between;

      gap: 12px;

      margin:
        12px 0;

      color: #4b5563;
    }

    .total-row {
      padding-top: 14px;

      border-top:
        1px solid #e5e7eb;

      color: #111827;

      font-size: 22px;

      font-weight: 900;
    }

    /* ========================================================
       CHOIX 3X / 4X
    ======================================================== */

    .installments-box {
      margin-top: 20px;

      background: #f9fafb;

      border-radius: 16px;

      padding: 16px;
    }

    .installments-title {
      font-weight: 900;

      margin-bottom: 12px;
    }

    .plans {
      display: grid;

      grid-template-columns:
        1fr 1fr;

      gap: 10px;
    }

    .plan-button {
      border:
        2px solid #e5e7eb;

      border-radius: 14px;

      padding:
        14px 10px;

      background: white;

      cursor: pointer;

      font-weight: 900;

      font-size: 16px;

      color: #111827;
    }

    .plan-button.active {
      border-color: #111827;

      background: #111827;

      color: white;
    }

    .plan-detail {
      display: block;

      font-size: 12px;

      font-weight: 600;

      margin-top: 4px;

      opacity: .8;
    }

    /* ========================================================
       PAIEMENT
    ======================================================== */

    .pay-button {
      width: 100%;

      border: none;

      cursor: pointer;

      margin-top: 20px;

      padding: 17px;

      border-radius: 15px;

      background: #111827;

      color: white;

      font-size: 17px;

      font-weight: 900;
    }

    .pay-button:disabled {
      background: #d1d5db;

      color: #6b7280;

      cursor: not-allowed;
    }

    .crypto-note {
      text-align: center;

      color: #6b7280;

      font-size: 13px;

      line-height: 1.5;

      margin-top: 12px;
    }

    /* ========================================================
       MOBILE
    ======================================================== */

    @media (
      max-width: 650px
    ) {

      .products {
        grid-template-columns:
          1fr;
      }

      .product-image {
        height: 115px;
      }

      .hero {
        padding:
          25px 20px;
      }

    }

  </style>

</head>

<body>

  <!-- ======================================================
       BARRE SUPÉRIEURE
  ======================================================= -->

  <header class="topbar">

    <div class="topbar-inner">

      <div class="brand">
        🐨 Koala Store
      </div>

      <div
        id="cartIndicator"
        class="cart-indicator"
      >
        Panier : 0
      </div>

    </div>

  </header>

  <!-- ======================================================
       CONTENU
  ======================================================= -->

  <main class="wrap">

    <section class="hero">

      <h1>
        Bienvenue sur Koala Store
      </h1>

      <p>
        Choisissez vos produits
        et payez avec Koala Crypto
        en 3 ou 4 fois.
      </p>

    </section>

    <!-- ====================================================
         CONFIRMATION
    ===================================================== -->

    <div
      id="paymentStatus"
      class="payment-status"
    >

      Paiement confirmé ✅

      <div
        id="paymentDetails"
        style="
          margin-top:6px;
          font-weight:600;
          font-size:14px;
        "
      ></div>

    </div>

    <!-- ====================================================
         PRODUITS
    ===================================================== -->

    <div class="section-title">
      Nos produits
    </div>

    <section
      id="products"
      class="products"
    ></section>

    <!-- ====================================================
         PANIER
    ===================================================== -->

    <div class="section-title">
      Votre panier
    </div>

    <section class="cart-card">

      <div id="cart"></div>

      <div class="summary">

        <div class="summary-row">

          <span>
            Articles
          </span>

          <strong
            id="articleCount"
          >
            0
          </strong>

        </div>

        <div
          class="
            summary-row
            total-row
          "
        >

          <span>
            Total
          </span>

          <span
            id="total"
          >
            0,00 €
          </span>

        </div>

      </div>

      <!-- ==================================================
           CHOIX DU NOMBRE DE PAIEMENTS
      =================================================== -->

      <div class="installments-box">

        <div class="installments-title">
          Paiement Koala Crypto
        </div>

        <div class="plans">

          <button
            id="plan3"
            class="
              plan-button
              active
            "
            type="button"
            onclick="selectPlan(3)"
          >

            3x

            <span
              id="plan3Amount"
              class="plan-detail"
            >
              0,00 € / paiement
            </span>

          </button>

          <button
            id="plan4"
            class="plan-button"
            type="button"
            onclick="selectPlan(4)"
          >

            4x

            <span
              id="plan4Amount"
              class="plan-detail"
            >
              0,00 € / paiement
            </span>

          </button>

        </div>

      </div>

      <!-- ==================================================
           BOUTON KOALA CRYPTO
      =================================================== -->

      <button
        id="payButton"
        class="pay-button"
        type="button"
        disabled
        onclick="payWithKoala()"
      >

        Payer avec Koala Crypto

      </button>

      <div class="crypto-note">

        Paiement disponible en
        BTC, USDC ou USDT.

      </div>

    </section>

  </main>

  <script>

    // ======================================================
    // PRODUITS
    // ======================================================

    const products = [

      {
        id: 1,

        name:
          "Casque Koala",

        description:
          "Casque audio sans fil",

        price:
          20.00,

        image:
          "🎧"
      },

      {
        id: 2,

        name:
          "Enceinte Koala",

        description:
          "Enceinte Bluetooth portable",

        price:
          29.90,

        image:
          "🔊"
      },

      {
        id: 3,

        name:
          "Montre Koala",

        description:
          "Montre connectée",

        price:
          39.90,

        image:
          "⌚"
      },

      {
        id: 4,

        name:
          "Sac Koala",

        description:
          "Sac urbain Koala Store",

        price:
          24.90,

        image:
          "🎒"
      }

    ];

    // ======================================================
    // PANIER
    // ======================================================

    let cart = {};

    let installments = 3;

    // ======================================================
    // FORMAT EURO
    // ======================================================

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

    // ======================================================
    // AFFICHER LES PRODUITS
    // ======================================================

    function renderProducts() {

      const container =
        document.getElementById(
          "products"
        );

      container.innerHTML =
        "";

      products.forEach(
        product => {

          const card =
            document.createElement(
              "div"
            );

          card.className =
            "product-card";

          card.innerHTML =
            \`
              <div
                class="product-image"
              >
                \${product.image}
              </div>

              <div
                class="product-title"
              >
                \${product.name}
              </div>

              <div
                class="product-description"
              >
                \${product.description}
              </div>

              <div
                class="product-price"
              >
                \${euro(product.price)}
              </div>

              <button
                class="add-button"
                type="button"
                onclick="addToCart(\${product.id})"
              >
                Ajouter au panier
              </button>
            \`;

          container.appendChild(
            card
          );

        }
      );

    }

    // ======================================================
    // AJOUTER
    // ======================================================

    function addToCart(
      productId
    ) {

      if (
        !cart[
          productId
        ]
      ) {

        cart[
          productId
        ] = 0;

      }

      cart[
        productId
      ]++;

      renderCart();

    }

    // ======================================================
    // RETIRER UNE UNITÉ
    // ======================================================

    function removeFromCart(
      productId
    ) {

      if (
        !cart[
          productId
        ]
      ) {

        return;

      }

      cart[
        productId
      ]--;

      if (
        cart[
          productId
        ] <= 0
      ) {

        delete cart[
          productId
        ];

      }

      renderCart();

    }

    // ======================================================
    // TOTAL
    // ======================================================

    function getTotal() {

      let total = 0;

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

    // ======================================================
    // NOMBRE D'ARTICLES
    // ======================================================

    function getArticleCount() {

      return Object
        .values(
          cart
        )
        .reduce(
          (
            total,
            quantity
          ) =>
            total +
            quantity,
          0
        );

    }

    // ======================================================
    // AFFICHER PANIER
    // ======================================================

    function renderCart() {

      const container =
        document.getElementById(
          "cart"
        );

      const total =
        getTotal();

      const count =
        getArticleCount();

      container.innerHTML =
        "";

      if (
        count === 0
      ) {

        container.innerHTML =
          \`
            <div class="empty-cart">
              Votre panier est vide.
            </div>
          \`;

      } else {

        products.forEach(
          product => {

            const quantity =
              cart[
                product.id
              ] || 0;

            if (
              quantity <= 0
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
                    class="cart-product-name"
                  >
                    \${product.image}
                    \${product.name}
                  </div>

                  <div
                    class="cart-product-price"
                  >
                    \${euro(product.price)}
                    ×
                    \${quantity}
                  </div>

                </div>

                <div
                  class="quantity-box"
                >

                  <button
                    class="quantity-button"
                    type="button"
                    onclick="removeFromCart(\${product.id})"
                  >
                    −
                  </button>

                  <span
                    class="quantity"
                  >
                    \${quantity}
                  </span>

                  <button
                    class="quantity-button"
                    type="button"
                    onclick="addToCart(\${product.id})"
                  >
                    +
                  </button>

                </div>
              \`;

            container.appendChild(
              row
            );

          }
        );

      }

      document.getElementById(
        "total"
      ).textContent =
        euro(
          total
        );

      document.getElementById(
        "articleCount"
      ).textContent =
        count;

      document.getElementById(
        "cartIndicator"
      ).textContent =
        "Panier : " +
        count;

      document.getElementById(
        "payButton"
      ).disabled =
        total <= 0;

      updatePlanAmounts();

    }

    // ======================================================
    // CHOIX 3X / 4X
    // ======================================================

    function selectPlan(
      count
    ) {

      installments =
        count;

      document
        .getElementById(
          "plan3"
        )
        .classList.toggle(
          "active",
          count === 3
        );

      document
        .getElementById(
          "plan4"
        )
        .classList.toggle(
          "active",
          count === 4
        );

      updatePlanAmounts();

    }

    // ======================================================
    // MONTANTS PAR ÉCHÉANCE
    // ======================================================

    function updatePlanAmounts() {

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

    // ======================================================
    // PAIEMENT KOALA CRYPTO
    // ======================================================

    function payWithKoala() {

      const total =
        getTotal();

      if (
        total <= 0
      ) {

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

    // ======================================================
    // RETOUR APRÈS PAIEMENT
    // ======================================================

    function checkPaymentReturn() {

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

        const statusBox =
          document.getElementById(
            "paymentStatus"
          );

        statusBox.classList.add(
          "show"
        );

        let details = "";

        if (
          amount
        ) {

          details +=
            "Montant : " +
            euro(
              Number(
                amount
              )
            );

        }

        if (
          orderId
        ) {

          if (
            details
          ) {

            details +=
              " • ";

          }

          details +=
            "Commande n°" +
            orderId;

        }

        document.getElementById(
          "paymentDetails"
        ).textContent =
          details;

      }

    }

    // ======================================================
    // DÉMARRAGE PAGE
    // ======================================================

    renderProducts();

    renderCart();

    checkPaymentReturn();

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
    (
      req,
      res
    ) => {

      const url =
        new URL(
          req.url,
          "http://localhost"
        );

      // ======================================================
      // ACCUEIL
      // ======================================================

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

      // ======================================================
      // RETOUR APRÈS PAIEMENT
      // ======================================================

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

      // ======================================================
      // HEALTH
      // ======================================================

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

      // ======================================================
      // 404
      // ======================================================

      return send(
        res,
        404,
        "text/plain; charset=utf-8",
        "Not Found"
      );

    }
  );

// ============================================================
// DÉMARRAGE
// ============================================================

server.listen(
  PORT,
  () => {

    console.log(
      "Koala Store démarré sur le port " +
      PORT
    );

  }
);