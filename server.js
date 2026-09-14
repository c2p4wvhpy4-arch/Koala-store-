const http = require("http");

const PORT = process.env.PORT || 10000;

const KOALA_CRYPTO_URL = "https://koala6.onrender.com";

function send(res, status, type, body) {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function pageHtml() {
  return `
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
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

    .topbar {
      background: #ffffff;
      padding: 18px 20px;
      border-bottom: 1px solid #e5e7eb;
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .brand {
      font-size: 24px;
      font-weight: 800;
    }

    .wrap {
      max-width: 760px;
      margin: 0 auto;
      padding: 24px 18px 50px;
    }

    .hero {
      background: linear-gradient(135deg, #111827, #374151);
      color: white;
      border-radius: 22px;
      padding: 28px 22px;
      margin-bottom: 22px;
    }

    .hero h1 {
      margin: 0 0 10px;
      font-size: 30px;
    }

    .hero p {
      margin: 0;
      opacity: .85;
      line-height: 1.5;
    }

    .card {
      background: white;
      border-radius: 20px;
      padding: 20px;
      box-shadow: 0 8px 30px rgba(0,0,0,.06);
    }

    .product {
      display: flex;
      gap: 16px;
      align-items: center;
    }

    .image {
      width: 95px;
      height: 95px;
      border-radius: 18px;
      background: #eef2ff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 42px;
    }

    .info {
      flex: 1;
    }

    .title {
      font-size: 20px;
      font-weight: 800;
      margin-bottom: 6px;
    }

    .price {
      font-size: 24px;
      font-weight: 800;
      margin-top: 8px;
    }

    .small {
      color: #6b7280;
      font-size: 14px;
    }

    .button {
      display: block;
      width: 100%;
      margin-top: 20px;
      text-align: center;
      text-decoration: none;
      padding: 16px;
      border-radius: 14px;
      background: #111827;
      color: white;
      font-weight: 800;
      font-size: 16px;
    }

    .status {
      margin-top: 20px;
      padding: 16px;
      border-radius: 14px;
      background: #ecfdf5;
      color: #065f46;
      font-weight: 700;
      display: none;
    }

    .status.show {
      display: block;
    }
  </style>
</head>

<body>
  <div class="topbar">
    <div class="brand">Koala Store</div>
  </div>

  <main class="wrap">
    <section class="hero">
      <h1>Bienvenue sur Koala Store</h1>
      <p>
        Boutique de démonstration connectée à Koala Crypto.
      </p>
    </section>

    <section class="card">
      <div class="product">
        <div class="image">🎧</div>

        <div class="info">
          <div class="title">Casque Koala</div>
          <div class="small">
            Produit de démonstration
          </div>
          <div class="price">20,00 €</div>
        </div>
      </div>

      <a
        id="payButton"
        class="button"
        href="#"
      >
        Payer avec Koala Crypto
      </a>

      <div id="paymentStatus" class="status">
        Paiement confirmé ✅
      </div>
    </section>
  </main>

  <script>
    const params = new URLSearchParams(window.location.search);

    const status = params.get("status");
    const orderId = params.get("order_id");
    const amount = params.get("amount");

    if (status === "paid") {
      document
        .getElementById("paymentStatus")
        .classList.add("show");
    }

    const successUrl =
      window.location.origin +
      "/store/success";

    const paymentUrl =
      new URL("${KOALA_CRYPTO_URL}");

    paymentUrl.searchParams.set(
      "merchant",
      "Koala Store"
    );

    paymentUrl.searchParams.set(
      "amount",
      "20.00"
    );

    paymentUrl.searchParams.set(
      "success_url",
      successUrl
    );

    document.getElementById(
      "payButton"
    ).href = paymentUrl.toString();
  </script>
</body>
</html>
  `;
}

const server = http.createServer((req, res) => {
  const url = new URL(
    req.url,
    "http://localhost"
  );

  if (url.pathname === "/") {
    return send(
      res,
      200,
      "text/html; charset=utf-8",
      pageHtml()
    );
  }

  if (url.pathname === "/store/success") {
    return send(
      res,
      200,
      "text/html; charset=utf-8",
      pageHtml()
    );
  }

  if (url.pathname === "/health") {
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
});

server.listen(PORT, () => {
  console.log(
    "Koala Store démarré sur le port " +
    PORT
  );
});