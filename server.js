const http = require("http");
const https = require("https");
const crypto = require("crypto");
const { Pool } = require("pg");
const QRCode = require("qrcode");

// ============================================================
// CONFIGURATION
// ============================================================

const PORT =
  Number(
    process.env.PORT ||
    10000
  );

const DATABASE_URL =
  (
    process.env.DATABASE_URL ||
    ""
  ).trim();

const BASE_URL =
  (
    process.env.BASE_URL ||
    "https://koala-2-trqv.onrender.com"
  ).replace(/\/+$/, "");

const SESSION_SECRET =
  (
    process.env.SESSION_SECRET ||
    process.env.TOKEN_SECRET ||
    process.env.JWT_SECRET ||
    "koala-change-moi-en-production"
  ).trim();

const ADMIN_API_KEY =
  (
    process.env.ADMIN_API_KEY ||
    ""
  ).trim();

// ============================================================
// MARQETA — CARTE KOALA
// ============================================================

const MARQETA_BASE_URL =
  (
    process.env.MARQETA_BASE_URL ||
    "https://sandbox-api.marqeta.com/v3/"
  ).replace(/\/+$/, "") + "/";

const MARQETA_APPLICATION_TOKEN =
  (
    process.env.MARQETA_APPLICATION_TOKEN ||
    ""
  ).trim();

const MARQETA_ADMIN_ACCESS_TOKEN =
  (
    process.env.MARQETA_ADMIN_ACCESS_TOKEN ||
    ""
  ).trim();

function isMarqetaConfigured() {
  return Boolean(
    MARQETA_BASE_URL &&
    MARQETA_APPLICATION_TOKEN &&
    MARQETA_ADMIN_ACCESS_TOKEN
  );
}

function ensureMarqetaConfigured() {
  if (
    !isMarqetaConfigured()
  ) {
    const error =
      new Error(
        "Marqeta Sandbox n'est pas configuré."
      );

    error.statusCode =
      503;

    throw error;
  }
}

// ============================================================
// STRIPE — ANCIEN SUPPORT
// ============================================================

const STRIPE_SECRET_KEY =
  (
    process.env.STRIPE_SECRET_KEY ||
    ""
  ).trim();

const KOALA_STORE_URL =
  (
    process.env.KOALA_STORE_URL ||
    "https://koala-store-1.onrender.com"
  ).replace(/\/+$/, "");

function ensureStripePayments() {
  if (!STRIPE_SECRET_KEY) {
    const error = new Error(
      "STRIPE_SECRET_KEY non configurée."
    );
    error.statusCode = 503;
    throw error;
  }

  if (
    !STRIPE_SECRET_KEY.startsWith("sk_test_") &&
    !STRIPE_SECRET_KEY.startsWith("sk_live_")
  ) {
    const error = new Error(
      "Clé secrète Stripe invalide."
    );
    error.statusCode = 503;
    throw error;
  }
}

function stripeRequest(method, path, params = null) {
  return new Promise((resolve, reject) => {
    const body = params
      ? new URLSearchParams(params).toString()
      : "";

    const request = https.request(
      {
        hostname: "api.stripe.com",
        port: 443,
        path,
        method,
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          ...(body
            ? {
                "Content-Type":
                  "application/x-www-form-urlencoded",
                "Content-Length": Buffer.byteLength(body),
              }
            : {}),
        },
      },
      (response) => {
        let data = "";

        response.on("data", (chunk) => {
          data += chunk;
        });

        response.on("end", () => {
          let json;

          try {
            json = JSON.parse(data || "{}");
          } catch {
            return reject(
              new Error("Réponse Stripe invalide.")
            );
          }

          if (
            response.statusCode >= 200 &&
            response.statusCode < 300
          ) {
            return resolve(json);
          }

          return reject(
            new Error(
              json?.error?.message || "Erreur Stripe."
            )
          );
        });
      }
    );

    request.on("error", reject);

    if (body) {
      request.write(body);
    }

    request.end();
  });
}

function ensureStripeIssuingTest() {
  if (
    !STRIPE_SECRET_KEY
  ) {
    const error =
      new Error(
        "STRIPE_SECRET_KEY non configurée."
      );

    error.statusCode =
      503;

    throw error;
  }

  if (
    !STRIPE_SECRET_KEY.startsWith(
      "sk_test_"
    )
  ) {
    const error =
      new Error(
        "Stripe Issuing est limité au mode test."
      );

    error.statusCode =
      403;

    throw error;
  }
}

// ============================================================
// WALLETS CRYPTO
// ============================================================

const BTC_RECEIVE_ADDRESS =
  (
    process.env.BTC_RECEIVE_ADDRESS ||
    process.env.BTC_WALLET_ADDRESS ||
    ""
  ).trim();

const ETH_WALLET_ADDRESS =
  (
    process.env.ETH_WALLET_ADDRESS ||
    ""
  ).trim();

const USDC_WALLET_ADDRESS =
  (
    process.env.USDC_WALLET_ADDRESS ||
    ""
  ).trim();

const USDT_WALLET_ADDRESS =
  (
    process.env.USDT_WALLET_ADDRESS ||
    ""
  ).trim();

// ============================================================
// BLOCKCHAIN
// ============================================================

const BTC_MIN_CONFIRMATIONS =
  Math.max(
    1,
    Number(
      process.env
        .BTC_MIN_CONFIRMATIONS ||
      1
    )
  );

const BSC_RPC_URL =
  (
    process.env.BSC_RPC_URL ||
    "https://bsc-dataseed.binance.org/"
  ).trim();

const BSC_MIN_CONFIRMATIONS =
  Math.max(
    1,
    Number(
      process.env
        .BSC_MIN_CONFIRMATIONS ||
      3
    )
  );

const USDC_BSC_CONTRACT =
  (
    process.env.USDC_BSC_CONTRACT ||
    "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"
  ).trim();

const USDT_BSC_CONTRACT =
  (
    process.env.USDT_BSC_CONTRACT ||
    "0x55d398326f99059fF775485246999027B3197955"
  ).trim();

// ============================================================
// MARCHANDS
// ============================================================

const MERCHANTS = [
  {
    id: 1,
    name: "Koala Store",
    email:
      "merchant1@koala.local",
  },
  {
    id: 2,
    name: "Koala Market",
    email:
      "merchant2@koala.local",
  },
];

// ============================================================
// POSTGRESQL
// ============================================================

if (
  !DATABASE_URL
) {
  console.error(
    "DATABASE_URL non configurée."
  );
}

const pool =
  new Pool({
    connectionString:
      DATABASE_URL ||
      undefined,

    ssl:
      DATABASE_URL
        ? {
            rejectUnauthorized:
              false,
          }
        : false,
  });

// ============================================================
// OUTILS HTTP
// ============================================================

function sendJson(
  res,
  statusCode,
  data
) {
  const json =
    JSON.stringify(
      data
    );

  res.writeHead(
    statusCode,
    {
      "Content-Type":
        "application/json; charset=utf-8",

      "Content-Length":
        Buffer.byteLength(
          json
        ),

      "Access-Control-Allow-Origin":
        "*",

      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-Admin-Api-Key",

      "Access-Control-Allow-Methods":
        "GET, POST, OPTIONS",
    }
  );

  res.end(
    json
  );
}

function sendHtml(
  res,
  statusCode,
  html
) {
  res.writeHead(
    statusCode,
    {
      "Content-Type":
        "text/html; charset=utf-8",

      "Content-Length":
        Buffer.byteLength(
          html
        ),

      "Access-Control-Allow-Origin":
        "*",
    }
  );

  res.end(
    html
  );
}

async function readJsonBody(
  req
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      let body =
        "";

      req.on(
        "data",
        (
          chunk
        ) => {
          body +=
            chunk;

          if (
            body.length >
            1_000_000
          ) {
            reject(
              new Error(
                "Corps de requête trop volumineux."
              )
            );

            req.destroy();
          }
        }
      );

      req.on(
        "end",
        () => {
          if (
            !body
          ) {
            resolve(
              {}
            );

            return;
          }

          try {
            resolve(
              JSON.parse(
                body
              )
            );
          } catch {
            reject(
              new Error(
                "JSON invalide."
              )
            );
          }
        }
      );

      req.on(
        "error",
        reject
      );
    }
  );
}

function parseUrl(
  req
) {
  return new URL(
    req.url,
    BASE_URL
  );
}

// ============================================================
// OUTILS GÉNÉRAUX
// ============================================================

function randomHex(
  bytes = 16
) {
  return crypto
    .randomBytes(
      bytes
    )
    .toString(
      "hex"
    );
}

function nowIso() {
  return new Date()
    .toISOString();
}

function normalizeEmail(
  value
) {
  return String(
    value ||
    ""
  )
    .trim()
    .toLowerCase();
}

function normalizeAddress(
  value
) {
  return String(
    value ||
    ""
  )
    .trim()
    .toLowerCase();
}

function roundCrypto(
  value
) {
  return Number(
    Number(
      value
    ).toFixed(
      8
    )
  );
}

function roundEur(
  value
) {
  return Number(
    Number(
      value
    ).toFixed(
      2
    )
  );
}

function addMonths(
  date,
  months
) {
  const result =
    new Date(
      date
    );

  result.setMonth(
    result.getMonth() +
    months
  );

  return result;
}

function getMerchantById(
  merchantId
) {
  return (
    MERCHANTS.find(
      (
        merchant
      ) =>
        Number(
          merchant.id
        ) ===
        Number(
          merchantId
        )
    ) ||
    null
  );
}

// ============================================================
// MOTS DE PASSE
// ============================================================

function hashPassword(
  password
) {
  const salt =
    crypto
      .randomBytes(
        16
      )
      .toString(
        "hex"
      );

  const hash =
    crypto
      .scryptSync(
        password,
        salt,
        64
      )
      .toString(
        "hex"
      );

  return `${salt}:${hash}`;
}

function verifyPassword(
  password,
  stored,
  legacySalt = null
) {
  if (
    !stored
  ) {
    return false;
  }

  if (
    stored.includes(
      ":"
    )
  ) {
    const parts =
      stored.split(
        ":"
      );

    if (
      parts.length !==
      2
    ) {
      return false;
    }

    const [
      salt,
      storedHash,
    ] = parts;

    const testHash =
      crypto
        .scryptSync(
          password,
          salt,
          64
        )
        .toString(
          "hex"
        );

    try {
      return crypto
        .timingSafeEqual(
          Buffer.from(
            storedHash,
            "hex"
          ),
          Buffer.from(
            testHash,
            "hex"
          )
        );
    } catch {
      return false;
    }
  }

  if (
    legacySalt
  ) {
    try {
      const testHash =
        crypto
          .scryptSync(
            password,
            legacySalt,
            64
          )
          .toString(
            "hex"
          );

      return crypto
        .timingSafeEqual(
          Buffer.from(
            stored,
            "hex"
          ),
          Buffer.from(
            testHash,
            "hex"
          )
        );
    } catch {
      return false;
    }
  }

  return false;
}

// ============================================================
// SESSION
// ============================================================

function signToken(
  payload
) {
  const body =
    Buffer.from(
      JSON.stringify(
        payload
      )
    ).toString(
      "base64url"
    );

  const signature =
    crypto
      .createHmac(
        "sha256",
        SESSION_SECRET
      )
      .update(
        body
      )
      .digest(
        "base64url"
      );

  return `${body}.${signature}`;
}

function verifyToken(
  token
) {
  if (
    !token
  ) {
    return null;
  }

  const parts =
    token.split(
      "."
    );

  if (
    parts.length !==
    2
  ) {
    return null;
  }

  const [
    body,
    signature,
  ] = parts;

  const expected =
    crypto
      .createHmac(
        "sha256",
        SESSION_SECRET
      )
      .update(
        body
      )
      .digest(
        "base64url"
      );

  try {
    if (
      !crypto
        .timingSafeEqual(
          Buffer.from(
            signature
          ),
          Buffer.from(
            expected
          )
        )
    ) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const payload =
      JSON.parse(
        Buffer.from(
          body,
          "base64url"
        ).toString(
          "utf8"
        )
      );

    if (
      payload.exp &&
      Date.now() >
      Number(
        payload.exp
      )
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function createSessionToken(
  user
) {
  return signToken({
    userId:
      user.id,

    email:
      user.email,

    role:
      user.role ||
      "client",

    merchantId:
      user.merchant_id ||
      null,

    exp:
      Date.now() +
      1000 *
      60 *
      60 *
      24 *
      30,
  });
}

// ============================================================
// AUTHENTIFICATION
// ============================================================

async function authenticate(
  req
) {
  const authorization =
    (
      req.headers
        .authorization ||
      ""
    ).trim();

  if (
    !authorization.startsWith(
      "Bearer "
    )
  ) {
    const error =
      new Error(
        "Connexion requise."
      );

    error.statusCode =
      401;

    throw error;
  }

  const payload =
    verifyToken(
      authorization
        .slice(
          7
        )
        .trim()
    );

  if (
    !payload
  ) {
    const error =
      new Error(
        "Session expirée ou invalide."
      );

    error.statusCode =
      401;

    throw error;
  }

  const result =
    await pool.query(
      `
      SELECT
        id,
        email,
        role,
        merchant_id,
        created_at,
        updated_at

      FROM koala_users

      WHERE id = $1

      LIMIT 1
      `,
      [
        payload.userId,
      ]
    );

  if (
    result.rows.length ===
    0
  ) {
    const error =
      new Error(
        "Utilisateur introuvable."
      );

    error.statusCode =
      401;

    throw error;
  }

  return result
    .rows[0];
}

async function authenticateMerchant(
  req
) {
  const user =
    await authenticate(
      req
    );

  if (
    user.role !==
      "merchant" ||
    !user.merchant_id
  ) {
    const error =
      new Error(
        "Compte marchand requis."
      );

    error.statusCode =
      403;

    throw error;
  }

  return user;
}

function authenticateAdmin(
  req
) {
  if (
    !ADMIN_API_KEY
  ) {
    const error =
      new Error(
        "ADMIN_API_KEY non configurée."
      );

    error.statusCode =
      500;

    throw error;
  }

  const suppliedKey =
    (
      req.headers[
        "x-admin-api-key"
      ] ||
      ""
    ).trim();

  if (
    !suppliedKey ||
    suppliedKey !==
      ADMIN_API_KEY
  ) {
    const error =
      new Error(
        "Accès administrateur refusé."
      );

    error.statusCode =
      401;

    throw error;
  }

  return true;
}

// ============================================================
// INITIALISATION / MIGRATIONS POSTGRESQL
// ============================================================

async function initDatabase() {

  // ==========================================================
  // UTILISATEURS
  // ==========================================================

  await pool.query(`
    CREATE TABLE IF NOT EXISTS koala_users (
      id SERIAL PRIMARY KEY,

      email TEXT
      UNIQUE
      NOT NULL,

      password_hash TEXT,

      role TEXT
      NOT NULL
      DEFAULT 'client',

      merchant_id INTEGER,

      created_at TIMESTAMPTZ
      NOT NULL
      DEFAULT NOW(),

      updated_at TIMESTAMPTZ
      NOT NULL
      DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE koala_users
    ADD COLUMN IF NOT EXISTS
    password_hash TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_users
    ADD COLUMN IF NOT EXISTS
    role TEXT
    DEFAULT 'client';
  `);

  await pool.query(`
    ALTER TABLE koala_users
    ADD COLUMN IF NOT EXISTS
    merchant_id INTEGER;
  `);

  await pool.query(`
    ALTER TABLE koala_users
    ADD COLUMN IF NOT EXISTS
    created_at TIMESTAMPTZ
    DEFAULT NOW();
  `);

  await pool.query(`
    ALTER TABLE koala_users
    ADD COLUMN IF NOT EXISTS
    updated_at TIMESTAMPTZ
    DEFAULT NOW();
  `);

  // Compatibilité ancienne version.

  await pool
    .query(`
      ALTER TABLE koala_users
      ALTER COLUMN password_salt
      DROP NOT NULL;
    `)
    .catch(
      () => {}
    );

  await pool
    .query(`
      ALTER TABLE koala_users
      ALTER COLUMN password_hash
      DROP NOT NULL;
    `)
    .catch(
      () => {}
    );

  // ==========================================================
  // SOLDE KOALA
  //
  // Le solde est exprimé en EUR.
  // La crypto reste enregistrée séparément dans les mouvements.
  // ==========================================================

  await pool.query(`
    CREATE TABLE IF NOT EXISTS koala_wallets (
      id SERIAL PRIMARY KEY,

      user_id INTEGER
      NOT NULL
      UNIQUE
      REFERENCES koala_users(id)
      ON DELETE CASCADE,

      balance_eur NUMERIC(16,2)
      NOT NULL
      DEFAULT 0,

      reserved_eur NUMERIC(16,2)
      NOT NULL
      DEFAULT 0,

      currency TEXT
      NOT NULL
      DEFAULT 'EUR',

      created_at TIMESTAMPTZ
      NOT NULL
      DEFAULT NOW(),

      updated_at TIMESTAMPTZ
      NOT NULL
      DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE koala_wallets
    ADD COLUMN IF NOT EXISTS
    balance_eur NUMERIC(16,2)
    DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE koala_wallets
    ADD COLUMN IF NOT EXISTS
    reserved_eur NUMERIC(16,2)
    DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE koala_wallets
    ADD COLUMN IF NOT EXISTS
    currency TEXT
    DEFAULT 'EUR';
  `);

  await pool.query(`
    ALTER TABLE koala_wallets
    ADD COLUMN IF NOT EXISTS
    created_at TIMESTAMPTZ
    DEFAULT NOW();
  `);

  await pool.query(`
    ALTER TABLE koala_wallets
    ADD COLUMN IF NOT EXISTS
    updated_at TIMESTAMPTZ
    DEFAULT NOW();
  `);

  await pool.query(`
    UPDATE koala_wallets
    SET
      balance_eur =
        COALESCE(
          balance_eur,
          0
        ),

      reserved_eur =
        COALESCE(
          reserved_eur,
          0
        ),

      currency =
        COALESCE(
          currency,
          'EUR'
        ),

      updated_at =
        COALESCE(
          updated_at,
          NOW()
        );
  `);

  // Crée automatiquement un portefeuille
  // pour chaque utilisateur existant.

  await pool.query(`
    INSERT INTO koala_wallets (
      user_id,
      balance_eur,
      reserved_eur,
      currency,
      created_at,
      updated_at
    )

    SELECT
      u.id,
      0,
      0,
      'EUR',
      NOW(),
      NOW()

    FROM koala_users u

    WHERE NOT EXISTS (
      SELECT 1

      FROM koala_wallets w

      WHERE w.user_id =
        u.id
    );
  `);

  // ==========================================================
  // MOUVEMENTS DU SOLDE KOALA
  // ==========================================================

  await pool.query(`
    CREATE TABLE IF NOT EXISTS koala_wallet_movements (
      id BIGSERIAL PRIMARY KEY,

      user_id INTEGER
      NOT NULL
      REFERENCES koala_users(id)
      ON DELETE CASCADE,

      wallet_id INTEGER
      REFERENCES koala_wallets(id)
      ON DELETE CASCADE,

      movement_type TEXT
      NOT NULL,

      direction TEXT
      NOT NULL,

      amount_eur NUMERIC(16,2)
      NOT NULL,

      balance_before_eur NUMERIC(16,2),

      balance_after_eur NUMERIC(16,2),

      crypto TEXT,

      crypto_amount NUMERIC(30,12),

      crypto_rate_eur NUMERIC(24,8),

      txid TEXT,

      network TEXT,

      order_id INTEGER,

      installment_id INTEGER,

      card_id INTEGER,

      reference TEXT,

      status TEXT
      NOT NULL
      DEFAULT 'completed',

      description TEXT,

      created_at TIMESTAMPTZ
      NOT NULL
      DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE koala_wallet_movements
    ADD COLUMN IF NOT EXISTS
    wallet_id INTEGER;
  `);

  await pool.query(`
    ALTER TABLE koala_wallet_movements
    ADD COLUMN IF NOT EXISTS
    movement_type TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_wallet_movements
    ADD COLUMN IF NOT EXISTS
    direction TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_wallet_movements
    ADD COLUMN IF NOT EXISTS
    amount_eur NUMERIC(16,2);
  `);

  await pool.query(`
    ALTER TABLE koala_wallet_movements
    ADD COLUMN IF NOT EXISTS
    balance_before_eur NUMERIC(16,2);
  `);

  await pool.query(`
    ALTER TABLE koala_wallet_movements
    ADD COLUMN IF NOT EXISTS
    balance_after_eur NUMERIC(16,2);
  `);

  await pool.query(`
    ALTER TABLE koala_wallet_movements
    ADD COLUMN IF NOT EXISTS
    crypto TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_wallet_movements
    ADD COLUMN IF NOT EXISTS
    crypto_amount NUMERIC(30,12);
  `);

  await pool.query(`
    ALTER TABLE koala_wallet_movements
    ADD COLUMN IF NOT EXISTS
    crypto_rate_eur NUMERIC(24,8);
  `);

  await pool.query(`
    ALTER TABLE koala_wallet_movements
    ADD COLUMN IF NOT EXISTS
    txid TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_wallet_movements
    ADD COLUMN IF NOT EXISTS
    network TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_wallet_movements
    ADD COLUMN IF NOT EXISTS
    order_id INTEGER;
  `);

  await pool.query(`
    ALTER TABLE koala_wallet_movements
    ADD COLUMN IF NOT EXISTS
    installment_id INTEGER;
  `);

  await pool.query(`
    ALTER TABLE koala_wallet_movements
    ADD COLUMN IF NOT EXISTS
    card_id INTEGER;
  `);

  await pool.query(`
    ALTER TABLE koala_wallet_movements
    ADD COLUMN IF NOT EXISTS
    reference TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_wallet_movements
    ADD COLUMN IF NOT EXISTS
    status TEXT
    DEFAULT 'completed';
  `);

  await pool.query(`
    ALTER TABLE koala_wallet_movements
    ADD COLUMN IF NOT EXISTS
    description TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_wallet_movements
    ADD COLUMN IF NOT EXISTS
    created_at TIMESTAMPTZ
    DEFAULT NOW();
  `);

  // ==========================================================
  // DÉPÔTS CRYPTO VERS SOLDE KOALA
  // ==========================================================

  await pool.query(`
    CREATE TABLE IF NOT EXISTS koala_crypto_deposits (
      id BIGSERIAL PRIMARY KEY,

      user_id INTEGER
      NOT NULL
      REFERENCES koala_users(id)
      ON DELETE CASCADE,

      crypto TEXT
      NOT NULL,

      network TEXT
      NOT NULL,

      payment_address TEXT
      NOT NULL,

      expected_crypto_amount NUMERIC(30,12),

      received_crypto_amount NUMERIC(30,12)
      DEFAULT 0,

      crypto_rate_eur NUMERIC(24,8),

      credited_eur NUMERIC(16,2)
      DEFAULT 0,

      deposit_token TEXT
      UNIQUE
      NOT NULL,

      txid TEXT,

      confirmations INTEGER
      DEFAULT 0,

      status TEXT
      NOT NULL
      DEFAULT 'pending',

      detected_at TIMESTAMPTZ,

      confirmed_at TIMESTAMPTZ,

      credited_at TIMESTAMPTZ,

      created_at TIMESTAMPTZ
      NOT NULL
      DEFAULT NOW(),

      updated_at TIMESTAMPTZ
      NOT NULL
      DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE koala_crypto_deposits
    ADD COLUMN IF NOT EXISTS
    expected_crypto_amount NUMERIC(30,12);
  `);

  await pool.query(`
    ALTER TABLE koala_crypto_deposits
    ADD COLUMN IF NOT EXISTS
    received_crypto_amount NUMERIC(30,12)
    DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE koala_crypto_deposits
    ADD COLUMN IF NOT EXISTS
    crypto_rate_eur NUMERIC(24,8);
  `);

  await pool.query(`
    ALTER TABLE koala_crypto_deposits
    ADD COLUMN IF NOT EXISTS
    credited_eur NUMERIC(16,2)
    DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE koala_crypto_deposits
    ADD COLUMN IF NOT EXISTS
    deposit_token TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_crypto_deposits
    ADD COLUMN IF NOT EXISTS
    txid TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_crypto_deposits
    ADD COLUMN IF NOT EXISTS
    confirmations INTEGER
    DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE koala_crypto_deposits
    ADD COLUMN IF NOT EXISTS
    status TEXT
    DEFAULT 'pending';
  `);

  await pool.query(`
    ALTER TABLE koala_crypto_deposits
    ADD COLUMN IF NOT EXISTS
    detected_at TIMESTAMPTZ;
  `);

  await pool.query(`
    ALTER TABLE koala_crypto_deposits
    ADD COLUMN IF NOT EXISTS
    confirmed_at TIMESTAMPTZ;
  `);

  await pool.query(`
    ALTER TABLE koala_crypto_deposits
    ADD COLUMN IF NOT EXISTS
    credited_at TIMESTAMPTZ;
  `);

  await pool.query(`
    ALTER TABLE koala_crypto_deposits
    ADD COLUMN IF NOT EXISTS
    created_at TIMESTAMPTZ
    DEFAULT NOW();
  `);

  await pool.query(`
    ALTER TABLE koala_crypto_deposits
    ADD COLUMN IF NOT EXISTS
    updated_at TIMESTAMPTZ
    DEFAULT NOW();
  `);

  // ==========================================================
  // OPÉRATIONS CARTE KOALA
  //
  // Sandbox aujourd'hui.
  // Permet d'enregistrer les autorisations/débits carte
  // contre le solde Koala.
  // ==========================================================

  await pool.query(`
    CREATE TABLE IF NOT EXISTS koala_card_transactions (
      id BIGSERIAL PRIMARY KEY,

      user_id INTEGER
      NOT NULL
      REFERENCES koala_users(id)
      ON DELETE CASCADE,

      card_id INTEGER,

      marqeta_card_token TEXT,

      marqeta_transaction_token TEXT,

      merchant_name TEXT,

      merchant_category_code TEXT,

      amount_eur NUMERIC(16,2)
      NOT NULL,

      transaction_type TEXT
      NOT NULL
      DEFAULT 'purchase',

      status TEXT
      NOT NULL
      DEFAULT 'pending',

      wallet_movement_id BIGINT,

      reference TEXT,

      created_at TIMESTAMPTZ
      NOT NULL
      DEFAULT NOW(),

      updated_at TIMESTAMPTZ
      NOT NULL
      DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE koala_card_transactions
    ADD COLUMN IF NOT EXISTS
    card_id INTEGER;
  `);

  await pool.query(`
    ALTER TABLE koala_card_transactions
    ADD COLUMN IF NOT EXISTS
    marqeta_card_token TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_card_transactions
    ADD COLUMN IF NOT EXISTS
    marqeta_transaction_token TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_card_transactions
    ADD COLUMN IF NOT EXISTS
    merchant_name TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_card_transactions
    ADD COLUMN IF NOT EXISTS
    merchant_category_code TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_card_transactions
    ADD COLUMN IF NOT EXISTS
    amount_eur NUMERIC(16,2);
  `);

  await pool.query(`
    ALTER TABLE koala_card_transactions
    ADD COLUMN IF NOT EXISTS
    transaction_type TEXT
    DEFAULT 'purchase';
  `);

  await pool.query(`
    ALTER TABLE koala_card_transactions
    ADD COLUMN IF NOT EXISTS
    status TEXT
    DEFAULT 'pending';
  `);

  await pool.query(`
    ALTER TABLE koala_card_transactions
    ADD COLUMN IF NOT EXISTS
    wallet_movement_id BIGINT;
  `);

  await pool.query(`
    ALTER TABLE koala_card_transactions
    ADD COLUMN IF NOT EXISTS
    reference TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_card_transactions
    ADD COLUMN IF NOT EXISTS
    created_at TIMESTAMPTZ
    DEFAULT NOW();
  `);

  await pool.query(`
    ALTER TABLE koala_card_transactions
    ADD COLUMN IF NOT EXISTS
    updated_at TIMESTAMPTZ
    DEFAULT NOW();
  `);

  // ==========================================================
  // COMMANDES
  // ==========================================================

  await pool.query(`
    CREATE TABLE IF NOT EXISTS koala_orders (
      id SERIAL PRIMARY KEY,

      user_id INTEGER
      REFERENCES koala_users(id)
      ON DELETE CASCADE,

      merchant_id INTEGER,

      merchant_name TEXT,

      amount_eur NUMERIC(14,2),

      crypto TEXT,

      installments_count INTEGER,

      crypto_price_eur NUMERIC(24,8),

      total_crypto NUMERIC(30,12),

      payment_address TEXT,

      status TEXT
      DEFAULT 'created',

      created_at TIMESTAMPTZ
      DEFAULT NOW(),

      updated_at TIMESTAMPTZ
      DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE koala_orders
    ADD COLUMN IF NOT EXISTS
    user_id INTEGER;
  `);

  await pool.query(`
    ALTER TABLE koala_orders
    ADD COLUMN IF NOT EXISTS
    merchant_id INTEGER;
  `);

  await pool.query(`
    ALTER TABLE koala_orders
    ADD COLUMN IF NOT EXISTS
    merchant_name TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_orders
    ADD COLUMN IF NOT EXISTS
    amount_eur NUMERIC(14,2);
  `);

  await pool.query(`
    ALTER TABLE koala_orders
    ADD COLUMN IF NOT EXISTS
    crypto TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_orders
    ADD COLUMN IF NOT EXISTS
    installments_count INTEGER;
  `);

  await pool.query(`
    ALTER TABLE koala_orders
    ADD COLUMN IF NOT EXISTS
    crypto_price_eur NUMERIC(24,8);
  `);

  await pool.query(`
    ALTER TABLE koala_orders
    ADD COLUMN IF NOT EXISTS
    total_crypto NUMERIC(30,12);
  `);

  await pool.query(`
    ALTER TABLE koala_orders
    ADD COLUMN IF NOT EXISTS
    payment_address TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_orders
    ADD COLUMN IF NOT EXISTS
    status TEXT
    DEFAULT 'created';
  `);

  await pool.query(`
    ALTER TABLE koala_orders
    ADD COLUMN IF NOT EXISTS
    created_at TIMESTAMPTZ
    DEFAULT NOW();
  `);

  await pool.query(`
    ALTER TABLE koala_orders
    ADD COLUMN IF NOT EXISTS
    updated_at TIMESTAMPTZ
    DEFAULT NOW();
  `);

  // ==========================================================
  // ÉCHÉANCES
  // ==========================================================

  await pool.query(`
    CREATE TABLE IF NOT EXISTS koala_installments (
      id SERIAL PRIMARY KEY,

      order_id INTEGER
      REFERENCES koala_orders(id)
      ON DELETE CASCADE,

      number INTEGER,

      amount_eur NUMERIC(14,2),

      crypto_amount NUMERIC(30,12),

      due_date TIMESTAMPTZ,

      crypto_rate_eur NUMERIC(24,8),

      payment_address TEXT,

      payment_token TEXT,

      status TEXT
      DEFAULT 'A_PAYER',

      txid TEXT,

      confirmations INTEGER
      DEFAULT 0,

      declared_at TIMESTAMPTZ,

      detected_at TIMESTAMPTZ,

      paid_at TIMESTAMPTZ,

      created_at TIMESTAMPTZ
      DEFAULT NOW(),

      updated_at TIMESTAMPTZ
      DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE koala_installments
    ADD COLUMN IF NOT EXISTS
    order_id INTEGER;
  `);

  await pool.query(`
    ALTER TABLE koala_installments
    ADD COLUMN IF NOT EXISTS
    number INTEGER;
  `);

  await pool.query(`
    ALTER TABLE koala_installments
    ADD COLUMN IF NOT EXISTS
    amount_eur NUMERIC(14,2);
  `);

  await pool.query(`
    ALTER TABLE koala_installments
    ADD COLUMN IF NOT EXISTS
    crypto_amount NUMERIC(30,12);
  `);

  await pool.query(`
    ALTER TABLE koala_installments
    ADD COLUMN IF NOT EXISTS
    due_date TIMESTAMPTZ;
  `);

  await pool.query(`
    UPDATE koala_installments

    SET due_date =
      COALESCE(
        due_date,
        created_at,
        NOW()
      )

    WHERE due_date IS NULL;
  `);

  await pool.query(`
    ALTER TABLE koala_installments
    ADD COLUMN IF NOT EXISTS
    crypto_rate_eur NUMERIC(24,8);
  `);

  await pool.query(`
    ALTER TABLE koala_installments
    ADD COLUMN IF NOT EXISTS
    payment_address TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_installments
    ADD COLUMN IF NOT EXISTS
    payment_token TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_installments
    ADD COLUMN IF NOT EXISTS
    status TEXT
    DEFAULT 'A_PAYER';
  `);

  await pool.query(`
    ALTER TABLE koala_installments
    ADD COLUMN IF NOT EXISTS
    txid TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_installments
    ADD COLUMN IF NOT EXISTS
    confirmations INTEGER
    DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE koala_installments
    ADD COLUMN IF NOT EXISTS
    declared_at TIMESTAMPTZ;
  `);

  await pool.query(`
    ALTER TABLE koala_installments
    ADD COLUMN IF NOT EXISTS
    detected_at TIMESTAMPTZ;
  `);

  await pool.query(`
    ALTER TABLE koala_installments
    ADD COLUMN IF NOT EXISTS
    paid_at TIMESTAMPTZ;
  `);

  await pool.query(`
    ALTER TABLE koala_installments
    ADD COLUMN IF NOT EXISTS
    created_at TIMESTAMPTZ
    DEFAULT NOW();
  `);

  await pool.query(`
    ALTER TABLE koala_installments
    ADD COLUMN IF NOT EXISTS
    updated_at TIMESTAMPTZ
    DEFAULT NOW();
  `);

  // ==========================================================
  // RÈGLEMENTS MARCHANDS
  // ==========================================================

  await pool.query(`
    CREATE TABLE IF NOT EXISTS koala_merchant_settlements (
      id SERIAL PRIMARY KEY,

      order_id INTEGER,

      merchant_id INTEGER,

      merchant_name TEXT,

      received_eur NUMERIC(14,2)
      DEFAULT 0,

      refunded_eur NUMERIC(14,2)
      DEFAULT 0,

      payable_eur NUMERIC(14,2)
      DEFAULT 0,

      status TEXT
      DEFAULT 'pending',

      payout_requested_at TIMESTAMPTZ,

      paid_at TIMESTAMPTZ,

      payout_reference TEXT,

      created_at TIMESTAMPTZ
      DEFAULT NOW(),

      updated_at TIMESTAMPTZ
      DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE koala_merchant_settlements
    ADD COLUMN IF NOT EXISTS
    order_id INTEGER;
  `);

  await pool.query(`
    ALTER TABLE koala_merchant_settlements
    ADD COLUMN IF NOT EXISTS
    merchant_id INTEGER;
  `);

  await pool.query(`
    ALTER TABLE koala_merchant_settlements
    ADD COLUMN IF NOT EXISTS
    merchant_name TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_merchant_settlements
    ADD COLUMN IF NOT EXISTS
    received_eur NUMERIC(14,2)
    DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE koala_merchant_settlements
    ADD COLUMN IF NOT EXISTS
    refunded_eur NUMERIC(14,2)
    DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE koala_merchant_settlements
    ADD COLUMN IF NOT EXISTS
    payable_eur NUMERIC(14,2)
    DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE koala_merchant_settlements
    ADD COLUMN IF NOT EXISTS
    status TEXT
    DEFAULT 'pending';
  `);

  await pool.query(`
    ALTER TABLE koala_merchant_settlements
    ADD COLUMN IF NOT EXISTS
    payout_requested_at TIMESTAMPTZ;
  `);

  await pool.query(`
    ALTER TABLE koala_merchant_settlements
    ADD COLUMN IF NOT EXISTS
    paid_at TIMESTAMPTZ;
  `);

  await pool.query(`
    ALTER TABLE koala_merchant_settlements
    ADD COLUMN IF NOT EXISTS
    payout_reference TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_merchant_settlements
    ADD COLUMN IF NOT EXISTS
    created_at TIMESTAMPTZ
    DEFAULT NOW();
  `);

  await pool.query(`
    ALTER TABLE koala_merchant_settlements
    ADD COLUMN IF NOT EXISTS
    updated_at TIMESTAMPTZ
    DEFAULT NOW();
  `);

  await pool.query(`
    UPDATE koala_merchant_settlements

    SET
      received_eur =
        COALESCE(
          received_eur,
          0
        ),

      refunded_eur =
        COALESCE(
          refunded_eur,
          0
        ),

      payable_eur =
        COALESCE(
          payable_eur,
          0
        ),

      status =
        COALESCE(
          status,
          'pending'
        ),

      created_at =
        COALESCE(
          created_at,
          NOW()
        ),

      updated_at =
        COALESCE(
          updated_at,
          NOW()
        );
  `);

  // L'index reste partiel.
  // Les requêtes ON CONFLICT de la Partie 2
  // utiliseront le même prédicat WHERE.

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS
    koala_settlement_order_unique_idx

    ON koala_merchant_settlements(
      order_id
    )

    WHERE order_id IS NOT NULL;
  `);

  // ==========================================================
  // REMBOURSEMENTS
  // ==========================================================

  await pool.query(`
    CREATE TABLE IF NOT EXISTS koala_refunds (
      id SERIAL PRIMARY KEY,

      order_id INTEGER,

      merchant_id INTEGER,

      amount_eur NUMERIC(14,2),

      reason TEXT,

      status TEXT
      DEFAULT 'pending',

      reference TEXT,

      completed_at TIMESTAMPTZ,

      created_at TIMESTAMPTZ
      DEFAULT NOW(),

      updated_at TIMESTAMPTZ
      DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE koala_refunds
    ADD COLUMN IF NOT EXISTS
    order_id INTEGER;
  `);

  await pool.query(`
    ALTER TABLE koala_refunds
    ADD COLUMN IF NOT EXISTS
    merchant_id INTEGER;
  `);

  await pool.query(`
    ALTER TABLE koala_refunds
    ADD COLUMN IF NOT EXISTS
    amount_eur NUMERIC(14,2);
  `);

  await pool.query(`
    ALTER TABLE koala_refunds
    ADD COLUMN IF NOT EXISTS
    reason TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_refunds
    ADD COLUMN IF NOT EXISTS
    status TEXT
    DEFAULT 'pending';
  `);

  await pool.query(`
    ALTER TABLE koala_refunds
    ADD COLUMN IF NOT EXISTS
    reference TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_refunds
    ADD COLUMN IF NOT EXISTS
    completed_at TIMESTAMPTZ;
  `);

  await pool.query(`
    ALTER TABLE koala_refunds
    ADD COLUMN IF NOT EXISTS
    created_at TIMESTAMPTZ
    DEFAULT NOW();
  `);

  await pool.query(`
    ALTER TABLE koala_refunds
    ADD COLUMN IF NOT EXISTS
    updated_at TIMESTAMPTZ
    DEFAULT NOW();
  `);

  // ==========================================================
  // CARTE KOALA
  // ==========================================================

  await pool.query(`
    CREATE TABLE IF NOT EXISTS koala_cards (
      id SERIAL PRIMARY KEY,

      user_id INTEGER
      UNIQUE
      REFERENCES koala_users(id)
      ON DELETE CASCADE,

      stripe_cardholder_id TEXT,

      stripe_card_id TEXT,

      holder_name TEXT,

      phone_number TEXT,

      address_line1 TEXT,

      address_line2 TEXT,

      postal_code TEXT,

      city TEXT,

      country TEXT
      DEFAULT 'FR',

      brand TEXT,

      last4 TEXT,

      exp_month INTEGER,

      exp_year INTEGER,

      currency TEXT
      DEFAULT 'eur',

      card_type TEXT
      DEFAULT 'virtual',

      status TEXT
      DEFAULT 'inactive',

      livemode BOOLEAN
      DEFAULT FALSE,

      created_at TIMESTAMPTZ
      DEFAULT NOW(),

      updated_at TIMESTAMPTZ
      DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE koala_cards
    ADD COLUMN IF NOT EXISTS
    card_provider TEXT
    DEFAULT 'stripe';
  `);

  await pool.query(`
    ALTER TABLE koala_cards
    ADD COLUMN IF NOT EXISTS
    marqeta_user_token TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_cards
    ADD COLUMN IF NOT EXISTS
    marqeta_card_token TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_cards
    ADD COLUMN IF NOT EXISTS
    marqeta_card_product_token TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_cards
    ADD COLUMN IF NOT EXISTS
    holder_name TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_cards
    ADD COLUMN IF NOT EXISTS
    phone_number TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_cards
    ADD COLUMN IF NOT EXISTS
    address_line1 TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_cards
    ADD COLUMN IF NOT EXISTS
    address_line2 TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_cards
    ADD COLUMN IF NOT EXISTS
    postal_code TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_cards
    ADD COLUMN IF NOT EXISTS
    city TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_cards
    ADD COLUMN IF NOT EXISTS
    country TEXT
    DEFAULT 'FR';
  `);

  await pool.query(`
    ALTER TABLE koala_cards
    ADD COLUMN IF NOT EXISTS
    brand TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_cards
    ADD COLUMN IF NOT EXISTS
    last4 TEXT;
  `);

  await pool.query(`
    ALTER TABLE koala_cards
    ADD COLUMN IF NOT EXISTS
    exp_month INTEGER;
  `);

  await pool.query(`
    ALTER TABLE koala_cards
    ADD COLUMN IF NOT EXISTS
    exp_year INTEGER;
  `);

  await pool.query(`
    ALTER TABLE koala_cards
    ADD COLUMN IF NOT EXISTS
    currency TEXT
    DEFAULT 'eur';
  `);

  await pool.query(`
    ALTER TABLE koala_cards
    ADD COLUMN IF NOT EXISTS
    card_type TEXT
    DEFAULT 'virtual';
  `);

  await pool.query(`
    ALTER TABLE koala_cards
    ADD COLUMN IF NOT EXISTS
    status TEXT
    DEFAULT 'inactive';
  `);

  await pool.query(`
    ALTER TABLE koala_cards
    ADD COLUMN IF NOT EXISTS
    livemode BOOLEAN
    DEFAULT FALSE;
  `);

  await pool.query(`
    ALTER TABLE koala_cards
    ADD COLUMN IF NOT EXISTS
    created_at TIMESTAMPTZ
    DEFAULT NOW();
  `);

  await pool.query(`
    ALTER TABLE koala_cards
    ADD COLUMN IF NOT EXISTS
    updated_at TIMESTAMPTZ
    DEFAULT NOW();
  `);

  // ==========================================================
  // TOKENS DE PAIEMENT MANQUANTS
  // ==========================================================

  const missingTokens =
    await pool.query(`
      SELECT id

      FROM koala_installments

      WHERE
        payment_token IS NULL
        OR payment_token = ''
    `);

  for (
    const row of
    missingTokens.rows
  ) {
    await pool.query(
      `
      UPDATE koala_installments

      SET payment_token =
        $1

      WHERE id =
        $2
      `,
      [
        randomHex(
          24
        ),
        row.id,
      ]
    );
  }

  // ==========================================================
  // INDEX
  // ==========================================================

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS
    koala_installments_payment_token_idx

    ON koala_installments(
      payment_token
    )

    WHERE payment_token IS NOT NULL;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    koala_orders_user_idx

    ON koala_orders(
      user_id
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    koala_orders_merchant_idx

    ON koala_orders(
      merchant_id
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    koala_installments_order_idx

    ON koala_installments(
      order_id
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    koala_settlements_merchant_idx

    ON koala_merchant_settlements(
      merchant_id
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    koala_refunds_merchant_idx

    ON koala_refunds(
      merchant_id
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    koala_cards_user_idx

    ON koala_cards(
      user_id
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS
    koala_cards_marqeta_card_idx

    ON koala_cards(
      marqeta_card_token
    )

    WHERE marqeta_card_token IS NOT NULL;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    koala_wallet_movements_user_idx

    ON koala_wallet_movements(
      user_id,
      created_at DESC
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    koala_wallet_movements_order_idx

    ON koala_wallet_movements(
      order_id
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    koala_crypto_deposits_user_idx

    ON koala_crypto_deposits(
      user_id,
      created_at DESC
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS
    koala_crypto_deposits_token_idx

    ON koala_crypto_deposits(
      deposit_token
    )

    WHERE deposit_token IS NOT NULL;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS
    koala_crypto_deposits_txid_idx

    ON koala_crypto_deposits(
      txid
    )

    WHERE txid IS NOT NULL;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    koala_card_transactions_user_idx

    ON koala_card_transactions(
      user_id,
      created_at DESC
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS
    koala_card_transactions_marqeta_idx

    ON koala_card_transactions(
      marqeta_transaction_token
    )

    WHERE
      marqeta_transaction_token
      IS NOT NULL;
  `);

  console.log(
    "Base de données Koala Crypto prête."
  );

  console.log(
    "Solde Koala : activé."
  );
}
// ============================================================
// OUTILS CRYPTO
// ============================================================

function getWalletForCrypto(
  symbol
) {
  switch (
    String(
      symbol || ""
    )
      .trim()
      .toUpperCase()
  ) {
    case "BTC":
      return BTC_RECEIVE_ADDRESS;

    case "ETH":
      return ETH_WALLET_ADDRESS;

    case "USDC":
      return USDC_WALLET_ADDRESS;

    case "USDT":
      return USDT_WALLET_ADDRESS;

    default:
      return "";
  }
}

function getNetworkForCrypto(
  symbol
) {
  switch (
    String(
      symbol || ""
    )
      .trim()
      .toUpperCase()
  ) {
    case "BTC":
      return "Bitcoin";

    case "ETH":
      return "Ethereum";

    case "USDC":
    case "USDT":
      return "BNB Smart Chain (BEP20)";

    default:
      return "";
  }
}

function isSupportedCrypto(
  symbol
) {
  return [
    "BTC",
    "ETH",
    "USDC",
    "USDT",
  ].includes(
    String(
      symbol || ""
    )
      .trim()
      .toUpperCase()
  );
}

// ============================================================
// FETCH JSON
// ============================================================

async function fetchJson(
  url,
  options = {}
) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
      15000
    );

  try {
    const response =
      await fetch(
        url,
        {
          ...options,

          signal:
            controller.signal,

          headers: {
            Accept:
              "application/json",

            ...(options.headers ||
              {}),
          },
        }
      );

    const text =
      await response.text();

    let data = null;

    try {
      data =
        text
          ? JSON.parse(
              text
            )
          : null;
    } catch {
      data =
        text;
    }

    if (
      !response.ok
    ) {
      throw new Error(
        `HTTP ${response.status} sur ${url}`
      );
    }

    return data;
  } finally {
    clearTimeout(
      timeout
    );
  }
}

// ============================================================
// MARQETA REQUEST
// ============================================================

async function marqetaRequest(
  method,
  path,
  body = null
) {
  ensureMarqetaConfigured();

  const cleanPath =
    String(
      path || ""
    ).replace(
      /^\/+/,
      ""
    );

  const url =
    `${MARQETA_BASE_URL}${cleanPath}`;

  const credentials =
    Buffer.from(
      `${MARQETA_APPLICATION_TOKEN}:${MARQETA_ADMIN_ACCESS_TOKEN}`
    ).toString(
      "base64"
    );

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
      15000
    );

  try {
    const options = {
      method,

      signal:
        controller.signal,

      headers: {
        Authorization:
          `Basic ${credentials}`,

        Accept:
          "application/json",

        "Content-Type":
          "application/json",
      },
    };

    if (
      body !== null &&
      method !== "GET"
    ) {
      options.body =
        JSON.stringify(
          body
        );
    }

    const response =
      await fetch(
        url,
        options
      );

    const text =
      await response.text();

    let data = {};

    try {
      data =
        text
          ? JSON.parse(
              text
            )
          : {};
    } catch {
      data = {
        raw:
          text,
      };
    }

    if (
      !response.ok
    ) {
      const error =
        new Error(
          data?.error_message ||
          data?.message ||
          data?.error ||
          `Erreur Marqeta HTTP ${response.status}.`
        );

      error.statusCode =
        response.status >=
        500
          ? 502
          : response.status;

      error.marqetaCode =
        data?.error_code ||
        data?.code ||
        null;

      throw error;
    }

    return data;
  } catch (
    error
  ) {
    if (
      error.name ===
      "AbortError"
    ) {
      const timeoutError =
        new Error(
          "Délai de connexion Marqeta dépassé."
        );

      timeoutError.statusCode =
        504;

      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(
      timeout
    );
  }
}

// ============================================================
// PRODUIT CARTE MARQETA
// ============================================================

async function getMarqetaCardProduct() {
  const result =
    await marqetaRequest(
      "GET",
      "cardproducts?count=10"
    );

  const products =
    Array.isArray(
      result?.data
    )
      ? result.data
      : [];

  if (
    products.length ===
    0
  ) {
    const error =
      new Error(
        "Aucun produit carte Marqeta disponible."
      );

    error.statusCode =
      503;

    throw error;
  }

  const virtualProduct =
    products.find(
      (
        product
      ) =>
        product?.active !==
          false &&
        String(
          product
            ?.config
            ?.fulfillment
            ?.payment_instrument ||
          ""
        ).toUpperCase() ===
          "VIRTUAL_PAN"
    );

  return (
    virtualProduct ||
    products.find(
      (
        product
      ) =>
        product?.active !==
        false
    ) ||
    products[0]
  );
}

// ============================================================
// NOM TITULAIRE
// ============================================================

function splitHolderName(
  fullName
) {
  const parts =
    String(
      fullName || ""
    )
      .trim()
      .split(
        /\s+/
      )
      .filter(
        Boolean
      );

  if (
    parts.length ===
    0
  ) {
    return {
      firstName:
        "Koala",

      lastName:
        "User",
    };
  }

  if (
    parts.length ===
    1
  ) {
    return {
      firstName:
        parts[0],

      lastName:
        "User",
    };
  }

  return {
    firstName:
      parts[0],

    lastName:
      parts
        .slice(
          1
        )
        .join(
          " "
        ),
  };
}

// ============================================================
// CRÉATION UTILISATEUR MARQETA
// ============================================================

async function createMarqetaUser({
  user,
  name,
}) {
  const {
    firstName,
    lastName,
  } =
    splitHolderName(
      name
    );

  return marqetaRequest(
    "POST",
    "users",
    {
      token:
        `koala-user-${user.id}-${randomHex(
          5
        )}`.slice(
          0,
          36
        ),

      first_name:
        firstName,

      last_name:
        lastName,

      email:
        user.email,

      active:
        true,

      metadata: {
        koala_user_id:
          String(
            user.id
          ),
      },
    }
  );
}

// ============================================================
// CRÉATION CARTE MARQETA
// ============================================================

async function createMarqetaVirtualCard({
  marqetaUserToken,
  cardProductToken,
}) {
  return marqetaRequest(
    "POST",
    "cards",
    {
      user_token:
        marqetaUserToken,

      card_product_token:
        cardProductToken,
    }
  );
}

// ============================================================
// BLOQUER / RÉACTIVER CARTE MARQETA
// ============================================================

async function updateMarqetaCardStatus(
  cardToken,
  state
) {
  if (
    ![
      "ACTIVE",
      "SUSPENDED",
    ].includes(
      state
    )
  ) {
    const error =
      new Error(
        "État Marqeta invalide."
      );

    error.statusCode =
      400;

    throw error;
  }

  const isSuspending =
    state ===
    "SUSPENDED";

  return marqetaRequest(
    "POST",
    "cardtransitions",
    {
      card_token:
        cardToken,

      state,

      channel:
        "API",

      reason_code:
        isSuspending
          ? "01"
          : "32",

      reason:
        isSuspending
          ? "Suspension temporaire demandée depuis Koala Crypto."
          : "Réactivation demandée depuis Koala Crypto.",
    }
  );
}

// ============================================================
// COURS CRYPTO
// ============================================================

async function getCryptoPriceEur(
  symbol
) {
  const cryptoSymbol =
    String(
      symbol || ""
    )
      .trim()
      .toUpperCase();

  if (
    !isSupportedCrypto(
      cryptoSymbol
    )
  ) {
    const error =
      new Error(
        "Crypto non supportée."
      );

    error.statusCode =
      400;

    throw error;
  }

  const ids = {
    BTC:
      "bitcoin",

    ETH:
      "ethereum",

    USDC:
      "usd-coin",

    USDT:
      "tether",
  };

  const coinId =
    ids[
      cryptoSymbol
    ];

  // ----------------------------------------------------------
  // COINGECKO
  // ----------------------------------------------------------

  try {
    const data =
      await fetchJson(
        `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
          coinId
        )}&vs_currencies=eur`
      );

    const price =
      Number(
        data?.[
          coinId
        ]?.eur
      );

    if (
      Number.isFinite(
        price
      ) &&
      price > 0
    ) {
      return price;
    }
  } catch (
    error
  ) {
    console.error(
      "Erreur CoinGecko :",
      error.message
    );
  }

  // ----------------------------------------------------------
  // COINBASE EN SECOURS
  // ----------------------------------------------------------

  try {
    const data =
      await fetchJson(
        `https://api.coinbase.com/v2/prices/${cryptoSymbol}-EUR/spot`
      );

    const price =
      Number(
        data?.data
          ?.amount
      );

    if (
      Number.isFinite(
        price
      ) &&
      price > 0
    ) {
      return price;
    }
  } catch (
    error
  ) {
    console.error(
      "Erreur Coinbase :",
      error.message
    );
  }

  // ----------------------------------------------------------
  // STABLECOINS
  // ----------------------------------------------------------

  if (
    cryptoSymbol ===
      "USDC" ||
    cryptoSymbol ===
      "USDT"
  ) {
    return 1;
  }

  const error =
    new Error(
      `Impossible de récupérer le cours ${cryptoSymbol}.`
    );

  error.statusCode =
    503;

  throw error;
}

// ============================================================
// SOLDE KOALA
// ============================================================

function formatKoalaWallet(
  row
) {
  if (
    !row
  ) {
    return null;
  }

  const balance =
    Number(
      row.balance_eur ||
      0
    );

  const reserved =
    Number(
      row.reserved_eur ||
      0
    );

  return {
    id:
      row.id,

    user_id:
      row.user_id,

    currency:
      row.currency ||
      "EUR",

    balance_eur:
      roundEur(
        balance
      ),

    reserved_eur:
      roundEur(
        reserved
      ),

    available_eur:
      roundEur(
        Math.max(
          0,
          balance -
          reserved
        )
      ),

    created_at:
      row.created_at,

    updated_at:
      row.updated_at,
  };
}

function formatWalletMovement(
  row
) {
  if (
    !row
  ) {
    return null;
  }

  return {
    id:
      row.id,

    user_id:
      row.user_id,

    wallet_id:
      row.wallet_id,

    movement_type:
      row.movement_type,

    direction:
      row.direction,

    amount_eur:
      Number(
        row.amount_eur ||
        0
      ),

    balance_before_eur:
      Number(
        row.balance_before_eur ||
        0
      ),

    balance_after_eur:
      Number(
        row.balance_after_eur ||
        0
      ),

    crypto:
      row.crypto,

    crypto_amount:
      row.crypto_amount ===
      null
        ? null
        : Number(
            row.crypto_amount
          ),

    crypto_rate_eur:
      row.crypto_rate_eur ===
      null
        ? null
        : Number(
            row.crypto_rate_eur
          ),

    txid:
      row.txid,

    network:
      row.network,

    order_id:
      row.order_id,

    installment_id:
      row.installment_id,

    card_id:
      row.card_id,

    reference:
      row.reference,

    status:
      row.status,

    description:
      row.description,

    created_at:
      row.created_at,
  };
}

async function ensureUserWallet(
  userId
) {
  await pool.query(
    `
    INSERT INTO koala_wallets (
      user_id,
      balance_eur,
      reserved_eur,
      currency,
      created_at,
      updated_at
    )

    VALUES (
      $1,
      0,
      0,
      'EUR',
      NOW(),
      NOW()
    )

    ON CONFLICT (
      user_id
    )
    DO NOTHING
    `,
    [
      userId,
    ]
  );

  const result =
    await pool.query(
      `
      SELECT *

      FROM koala_wallets

      WHERE user_id =
        $1

      LIMIT 1
      `,
      [
        userId,
      ]
    );

  return (
    result.rows[0] ||
    null
  );
}

async function getKoalaWallet(
  userId
) {
  return ensureUserWallet(
    userId
  );
}

async function getWalletMovements(
  userId,
  limit = 100
) {
  const safeLimit =
    Math.min(
      200,
      Math.max(
        1,
        Number(
          limit ||
          100
        )
      )
    );

  const result =
    await pool.query(
      `
      SELECT *

      FROM koala_wallet_movements

      WHERE user_id =
        $1

      ORDER BY
        created_at DESC

      LIMIT $2
      `,
      [
        userId,
        safeLimit,
      ]
    );

  return result.rows.map(
    formatWalletMovement
  );
}

// ============================================================
// CRÉER DEMANDE DE DÉPÔT CRYPTO
// ============================================================

function formatCryptoDeposit(
  row
) {
  if (
    !row
  ) {
    return null;
  }

  return {
    id:
      row.id,

    user_id:
      row.user_id,

    crypto:
      row.crypto,

    network:
      row.network,

    payment_address:
      row.payment_address,

    expected_crypto_amount:
      Number(
        row.expected_crypto_amount ||
        0
      ),

    received_crypto_amount:
      Number(
        row.received_crypto_amount ||
        0
      ),

    crypto_rate_eur:
      Number(
        row.crypto_rate_eur ||
        0
      ),

    credited_eur:
      Number(
        row.credited_eur ||
        0
      ),

    deposit_token:
      row.deposit_token,

    txid:
      row.txid,

    confirmations:
      Number(
        row.confirmations ||
        0
      ),

    status:
      row.status,

    detected_at:
      row.detected_at,

    confirmed_at:
      row.confirmed_at,

    credited_at:
      row.credited_at,

    created_at:
      row.created_at,

    updated_at:
      row.updated_at,
  };
}

async function createCryptoDeposit({
  userId,
  cryptoSymbol,
  amountEur,
}) {
  const symbol =
    String(
      cryptoSymbol ||
      ""
    )
      .trim()
      .toUpperCase();

  if (
    !isSupportedCrypto(
      symbol
    )
  ) {
    const error =
      new Error(
        "Crypto non supportée."
      );

    error.statusCode =
      400;

    throw error;
  }

  if (
    symbol ===
    "ETH"
  ) {
    const error =
      new Error(
        "Les dépôts ETH automatiques ne sont pas encore activés."
      );

    error.statusCode =
      400;

    throw error;
  }

  const amount =
    roundEur(
      Number(
        amountEur
      )
    );

  if (
    !Number.isFinite(
      amount
    ) ||
    amount <= 0
  ) {
    const error =
      new Error(
        "Montant du dépôt invalide."
      );

    error.statusCode =
      400;

    throw error;
  }

  const walletAddress =
    getWalletForCrypto(
      symbol
    );

  if (
    !walletAddress
  ) {
    const error =
      new Error(
        `Adresse ${symbol} non configurée.`
      );

    error.statusCode =
      503;

    throw error;
  }

  const rate =
    await getCryptoPriceEur(
      symbol
    );

  const expectedCrypto =
    roundCrypto(
      amount /
      rate
    );

  const depositToken =
    randomHex(
      24
    );

  await ensureUserWallet(
    userId
  );

  const result =
    await pool.query(
      `
      INSERT INTO koala_crypto_deposits (
        user_id,
        crypto,
        network,
        payment_address,
        expected_crypto_amount,
        received_crypto_amount,
        crypto_rate_eur,
        credited_eur,
        deposit_token,
        confirmations,
        status,
        created_at,
        updated_at
      )

      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        0,
        $6,
        0,
        $7,
        0,
        'pending',
        NOW(),
        NOW()
      )

      RETURNING *
      `,
      [
        userId,
        symbol,
        getNetworkForCrypto(
          symbol
        ),
        walletAddress,
        expectedCrypto,
        rate,
        depositToken,
      ]
    );

  return formatCryptoDeposit(
    result.rows[0]
  );
}

async function getCryptoDepositByToken(
  userId,
  depositToken
) {
  const result =
    await pool.query(
      `
      SELECT *

      FROM koala_crypto_deposits

      WHERE
        user_id = $1
        AND deposit_token = $2

      LIMIT 1
      `,
      [
        userId,
        depositToken,
      ]
    );

  return (
    result.rows[0] ||
    null
  );
}

// ============================================================
// BITCOIN
// ============================================================

async function getBitcoinAddressTransactions(
  address
) {
  return fetchJson(
    `https://blockstream.info/api/address/${encodeURIComponent(
      address
    )}/txs`
  );
}

async function getBitcoinTransaction(
  txid
) {
  return fetchJson(
    `https://blockstream.info/api/tx/${encodeURIComponent(
      txid
    )}`
  );
}

async function getBitcoinTipHeight() {
  const response =
    await fetch(
      "https://blockstream.info/api/blocks/tip/height"
    );

  if (
    !response.ok
  ) {
    throw new Error(
      `Blockstream HTTP ${response.status}`
    );
  }

  return Number(
    (
      await response.text()
    ).trim()
  );
}

function btcToSatoshis(
  btc
) {
  return Math.round(
    Number(
      btc
    ) *
    100000000
  );
}

function bitcoinTxReceivedSats(
  tx,
  address
) {
  let total =
    0;

  for (
    const output of
    tx?.vout ||
    []
  ) {
    if (
      output
        ?.scriptpubkey_address ===
      address
    ) {
      total +=
        Number(
          output.value ||
          0
        );
    }
  }

  return total;
}

// ============================================================
// VÉRIFICATION BITCOIN — ÉCHÉANCE
// ============================================================

async function checkBitcoinPayment(
  installment
) {
  const address =
    installment
      .payment_address;

  const expectedBtc =
    Number(
      installment
        .crypto_amount ||
      0
    );

  const expectedSats =
    btcToSatoshis(
      expectedBtc
    );

  if (
    !address ||
    expectedSats <=
    0
  ) {
    return {
      paid:
        false,

      detected:
        false,

      confirmations:
        0,

      message:
        "Paiement Bitcoin non configuré.",
    };
  }

  const transactions =
    await getBitcoinAddressTransactions(
      address
    );

  const txs =
    Array.isArray(
      transactions
    )
      ? transactions
      : [];

  let bestDetected =
    null;

  for (
    const tx of
    txs
  ) {
    const receivedSats =
      bitcoinTxReceivedSats(
        tx,
        address
      );

    if (
      receivedSats <
      expectedSats
    ) {
      continue;
    }

    let confirmations =
      0;

    if (
      tx?.status
        ?.confirmed
    ) {
      try {
        const tipHeight =
          await getBitcoinTipHeight();

        const blockHeight =
          Number(
            tx?.status
              ?.block_height ||
            0
          );

        if (
          tipHeight &&
          blockHeight
        ) {
          confirmations =
            Math.max(
              1,
              tipHeight -
              blockHeight +
              1
            );
        } else {
          confirmations =
            1;
        }
      } catch {
        confirmations =
          1;
      }
    }

    bestDetected = {
      txid:
        tx.txid,

      confirmations,

      received_sats:
        receivedSats,
    };

    if (
      confirmations >=
      BTC_MIN_CONFIRMATIONS
    ) {
      break;
    }
  }

  if (
    !bestDetected
  ) {
    return {
      paid:
        false,

      detected:
        false,

      confirmations:
        0,

      message:
        "Aucune transaction Bitcoin correspondante détectée.",
    };
  }

  return {
    paid:
      bestDetected
        .confirmations >=
      BTC_MIN_CONFIRMATIONS,

    detected:
      true,

    txid:
      bestDetected.txid,

    confirmations:
      bestDetected
        .confirmations,

    message:
      bestDetected
        .confirmations >=
      BTC_MIN_CONFIRMATIONS
        ? "Paiement Bitcoin confirmé."
        : "Paiement Bitcoin détecté, en attente de confirmations.",
  };
}

// ============================================================
// VÉRIFICATION DÉPÔT BTC PAR TXID
// ============================================================

async function checkBitcoinDeposit(
  deposit,
  txid
) {
  if (
    !txid
  ) {
    return {
      paid:
        false,

      detected:
        false,

      confirmations:
        0,

      message:
        "Identifiant de transaction Bitcoin requis.",
    };
  }

  const tx =
    await getBitcoinTransaction(
      txid
    );

  const expectedSats =
    btcToSatoshis(
      deposit
        .expected_crypto_amount
    );

  const receivedSats =
    bitcoinTxReceivedSats(
      tx,
      deposit
        .payment_address
    );

  if (
    receivedSats <
    expectedSats
  ) {
    return {
      paid:
        false,

      detected:
        false,

      confirmations:
        0,

      message:
        "La transaction ne contient pas le montant Bitcoin attendu.",
    };
  }

  let confirmations =
    0;

  if (
    tx?.status
      ?.confirmed
  ) {
    try {
      const tipHeight =
        await getBitcoinTipHeight();

      const blockHeight =
        Number(
          tx?.status
            ?.block_height ||
          0
        );

      confirmations =
        blockHeight
          ? Math.max(
              1,
              tipHeight -
              blockHeight +
              1
            )
          : 1;
    } catch {
      confirmations =
        1;
    }
  }

  return {
    paid:
      confirmations >=
      BTC_MIN_CONFIRMATIONS,

    detected:
      true,

    txid,

    confirmations,

    received_crypto_amount:
      receivedSats /
      100000000,

    message:
      confirmations >=
      BTC_MIN_CONFIRMATIONS
        ? "Dépôt Bitcoin confirmé."
        : "Dépôt Bitcoin détecté, en attente de confirmations.",
  };
}

// ============================================================
// BSC JSON-RPC
// ============================================================

let bscRpcId =
  1;

async function bscRpc(
  method,
  params = []
) {
  const response =
    await fetch(
      BSC_RPC_URL,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            jsonrpc:
              "2.0",

            id:
              bscRpcId++,

            method,

            params,
          }),
      }
    );

  if (
    !response.ok
  ) {
    throw new Error(
      `BSC RPC HTTP ${response.status}`
    );
  }

  const data =
    await response.json();

  if (
    data.error
  ) {
    throw new Error(
      data.error
        .message ||
      "Erreur RPC BSC."
    );
  }

  return data.result;
}

function normalizeHexAddress(
  address
) {
  return (
    "0x" +
    normalizeAddress(
      address
    ).replace(
      /^0x/,
      ""
    )
  );
}

function padTopicAddress(
  address
) {
  const normalized =
    normalizeAddress(
      address
    ).replace(
      /^0x/,
      ""
    );

  return (
    "0x" +
    normalized.padStart(
      64,
      "0"
    )
  );
}

function hexToBigInt(
  value
) {
  if (
    !value
  ) {
    return 0n;
  }

  try {
    return BigInt(
      value
    );
  } catch {
    return 0n;
  }
}

function decimalToUnits(
  value,
  decimals
) {
  const normalized =
    String(
      value
    );

  const [
    wholeRaw,
    fractionRaw = "",
  ] =
    normalized.split(
      "."
    );

  const whole =
    wholeRaw ||
    "0";

  const fraction =
    fractionRaw
      .padEnd(
        decimals,
        "0"
      )
      .slice(
        0,
        decimals
      );

  return BigInt(
    `${whole}${fraction}`
  );
}

function unitsToDecimal(
  units,
  decimals
) {
  const value =
    BigInt(
      units
    );

  const divisor =
    10n **
    BigInt(
      decimals
    );

  const whole =
    value /
    divisor;

  const fraction =
    (
      value %
      divisor
    )
      .toString()
      .padStart(
        decimals,
        "0"
      )
      .replace(
        /0+$/,
        ""
      );

  return Number(
    fraction
      ? `${whole}.${fraction}`
      : String(
          whole
        )
  );
}

const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// ============================================================
// VÉRIFICATION USDC / USDT BSC — ÉCHÉANCE
// ============================================================

async function checkBscTokenPayment(
  installment,
  symbol
) {
  const cryptoSymbol =
    String(
      symbol || ""
    )
      .trim()
      .toUpperCase();

  const contract =
    cryptoSymbol ===
    "USDC"
      ? USDC_BSC_CONTRACT
      : cryptoSymbol ===
        "USDT"
        ? USDT_BSC_CONTRACT
        : "";

  if (
    !contract
  ) {
    return {
      paid:
        false,

      detected:
        false,

      confirmations:
        0,

      message:
        `${cryptoSymbol} non configuré.`,
    };
  }

  const address =
    normalizeHexAddress(
      installment
        .payment_address
    );

  if (
    !/^0x[a-f0-9]{40}$/i.test(
      address
    )
  ) {
    return {
      paid:
        false,

      detected:
        false,

      confirmations:
        0,

      message:
        "Adresse BSC invalide.",
    };
  }

  const expectedUnits =
    decimalToUnits(
      installment
        .crypto_amount,
      18
    );

  const latestHex =
    await bscRpc(
      "eth_blockNumber",
      []
    );

  const latestBlock =
    Number(
      hexToBigInt(
        latestHex
      )
    );

  const fromBlock =
    Math.max(
      0,
      latestBlock -
      5000
    );

  const logs =
    await bscRpc(
      "eth_getLogs",
      [
        {
          fromBlock:
            "0x" +
            fromBlock.toString(
              16
            ),

          toBlock:
            "latest",

          address:
            contract,

          topics: [
            ERC20_TRANSFER_TOPIC,
            null,
            padTopicAddress(
              address
            ),
          ],
        },
      ]
    );

  const normalizedLogs =
    Array.isArray(
      logs
    )
      ? logs
      : [];

  let detected =
    null;

  for (
    const log of
    normalizedLogs
  ) {
    const value =
      hexToBigInt(
        log.data
      );

    if (
      value <
      expectedUnits
    ) {
      continue;
    }

    const blockNumber =
      Number(
        hexToBigInt(
          log.blockNumber
        )
      );

    const confirmations =
      Math.max(
        0,
        latestBlock -
        blockNumber +
        1
      );

    detected = {
      txid:
        log.transactionHash,

      confirmations,
    };

    if (
      confirmations >=
      BSC_MIN_CONFIRMATIONS
    ) {
      break;
    }
  }

  if (
    !detected
  ) {
    return {
      paid:
        false,

      detected:
        false,

      confirmations:
        0,

      message:
        `Aucun paiement ${cryptoSymbol} détecté.`,
    };
  }

  return {
    paid:
      detected
        .confirmations >=
      BSC_MIN_CONFIRMATIONS,

    detected:
      true,

    txid:
      detected.txid,

    confirmations:
      detected
        .confirmations,

    message:
      detected
        .confirmations >=
      BSC_MIN_CONFIRMATIONS
        ? `Paiement ${cryptoSymbol} confirmé.`
        : `Paiement ${cryptoSymbol} détecté, en attente de confirmations.`,
  };
}

// ============================================================
// VÉRIFICATION DÉPÔT USDC / USDT PAR TXID
// ============================================================

async function checkBscTokenDeposit(
  deposit,
  txid
) {
  const symbol =
    String(
      deposit.crypto ||
      ""
    ).toUpperCase();

  const contract =
    symbol ===
    "USDC"
      ? USDC_BSC_CONTRACT
      : symbol ===
        "USDT"
        ? USDT_BSC_CONTRACT
        : "";

  if (
    !txid
  ) {
    return {
      paid:
        false,

      detected:
        false,

      confirmations:
        0,

      message:
        "Hash de transaction requis.",
    };
  }

  const receipt =
    await bscRpc(
      "eth_getTransactionReceipt",
      [
        txid,
      ]
    );

  if (
    !receipt
  ) {
    return {
      paid:
        false,

      detected:
        false,

      confirmations:
        0,

      message:
        "Transaction BSC non trouvée.",
    };
  }

  const targetAddress =
    normalizeHexAddress(
      deposit
        .payment_address
    );

  const expected =
    decimalToUnits(
      deposit
        .expected_crypto_amount,
      18
    );

  let received =
    0n;

  for (
    const log of
    receipt.logs ||
    []
  ) {
    if (
      normalizeAddress(
        log.address
      ) !==
      normalizeAddress(
        contract
      )
    ) {
      continue;
    }

    if (
      String(
        log.topics?.[0] ||
        ""
      ).toLowerCase() !==
      ERC20_TRANSFER_TOPIC
        .toLowerCase()
    ) {
      continue;
    }

    const destinationTopic =
      String(
        log.topics?.[2] ||
        ""
      ).toLowerCase();

    if (
      destinationTopic !==
      padTopicAddress(
        targetAddress
      ).toLowerCase()
    ) {
      continue;
    }

    received +=
      hexToBigInt(
        log.data
      );
  }

  if (
    received <
    expected
  ) {
    return {
      paid:
        false,

      detected:
        false,

      confirmations:
        0,

      message:
        `Le montant ${symbol} reçu est insuffisant.`,
    };
  }

  const latestHex =
    await bscRpc(
      "eth_blockNumber",
      []
    );

  const latestBlock =
    Number(
      hexToBigInt(
        latestHex
      )
    );

  const blockNumber =
    Number(
      hexToBigInt(
        receipt.blockNumber
      )
    );

  const confirmations =
    Math.max(
      0,
      latestBlock -
      blockNumber +
      1
    );

  return {
    paid:
      confirmations >=
      BSC_MIN_CONFIRMATIONS,

    detected:
      true,

    txid,

    confirmations,

    received_crypto_amount:
      unitsToDecimal(
        received,
        18
      ),

    message:
      confirmations >=
      BSC_MIN_CONFIRMATIONS
        ? `Dépôt ${symbol} confirmé.`
        : `Dépôt ${symbol} détecté, en attente de confirmations.`,
  };
}

// ============================================================
// CRÉDITER LE SOLDE APRÈS CONFIRMATION CRYPTO
// ============================================================

async function creditConfirmedCryptoDeposit(
  depositId,
  verification
) {
  const client =
    await pool.connect();

  try {
    await client.query(
      "BEGIN"
    );

    const depositResult =
      await client.query(
        `
        SELECT *

        FROM koala_crypto_deposits

        WHERE id = $1

        FOR UPDATE
        `,
        [
          depositId,
        ]
      );

    const deposit =
      depositResult
        .rows[0];

    if (
      !deposit
    ) {
      const error =
        new Error(
          "Dépôt introuvable."
        );

      error.statusCode =
        404;

      throw error;
    }

    // Déjà crédité :
    // surtout ne pas recréditer.

    if (
      deposit.credited_at
    ) {
      await client.query(
        "COMMIT"
      );

      return {
        deposit:
          formatCryptoDeposit(
            deposit
          ),

        already_credited:
          true,
      };
    }

    if (
      !verification.paid
    ) {
      const error =
        new Error(
          "Le dépôt n'est pas encore confirmé."
        );

      error.statusCode =
        400;

      throw error;
    }

    // Vérifie que le txid n'a pas déjà
    // servi pour un autre dépôt.

    const duplicate =
      await client.query(
        `
        SELECT id

        FROM koala_crypto_deposits

        WHERE
          txid = $1
          AND id <> $2

        LIMIT 1
        `,
        [
          verification.txid,
          deposit.id,
        ]
      );

    if (
      duplicate.rows.length >
      0
    ) {
      const error =
        new Error(
          "Cette transaction crypto a déjà été utilisée."
        );

      error.statusCode =
        409;

      throw error;
    }

    let receivedCrypto =
      Number(
        verification
          .received_crypto_amount ||
        deposit
          .expected_crypto_amount ||
        0
      );

    if (
      !Number.isFinite(
        receivedCrypto
      ) ||
      receivedCrypto <= 0
    ) {
      receivedCrypto =
        Number(
          deposit
            .expected_crypto_amount ||
          0
        );
    }

    const rate =
      Number(
        deposit
          .crypto_rate_eur ||
        0
      );

    const creditedEur =
      roundEur(
        receivedCrypto *
        rate
      );

    if (
      creditedEur <=
      0
    ) {
      const error =
        new Error(
          "Montant à créditer invalide."
        );

      error.statusCode =
        400;

      throw error;
    }

    await client.query(
      `
      INSERT INTO koala_wallets (
        user_id,
        balance_eur,
        reserved_eur,
        currency,
        created_at,
        updated_at
      )

      VALUES (
        $1,
        0,
        0,
        'EUR',
        NOW(),
        NOW()
      )

      ON CONFLICT (
        user_id
      )
      DO NOTHING
      `,
      [
        deposit.user_id,
      ]
    );

    const walletResult =
      await client.query(
        `
        SELECT *

        FROM koala_wallets

        WHERE user_id =
          $1

        FOR UPDATE
        `,
        [
          deposit.user_id,
        ]
      );

    const wallet =
      walletResult
        .rows[0];

    const before =
      roundEur(
        Number(
          wallet
            .balance_eur ||
          0
        )
      );

    const after =
      roundEur(
        before +
        creditedEur
      );

    const updatedWallet =
      await client.query(
        `
        UPDATE koala_wallets

        SET
          balance_eur =
            $1,

          updated_at =
            NOW()

        WHERE id =
          $2

        RETURNING *
        `,
        [
          after,
          wallet.id,
        ]
      );

    const reference =
      `KOALA-CRYPTO-${deposit.id}-${randomHex(
        4
      ).toUpperCase()}`;

    const movementResult =
      await client.query(
        `
        INSERT INTO koala_wallet_movements (
          user_id,
          wallet_id,
          movement_type,
          direction,
          amount_eur,
          balance_before_eur,
          balance_after_eur,
          crypto,
          crypto_amount,
          crypto_rate_eur,
          txid,
          network,
          reference,
          status,
          description,
          created_at
        )

        VALUES (
          $1,
          $2,
          'crypto_deposit',
          'credit',
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          'completed',
          $12,
          NOW()
        )

        RETURNING *
        `,
        [
          deposit.user_id,
          wallet.id,
          creditedEur,
          before,
          after,
          deposit.crypto,
          receivedCrypto,
          rate,
          verification.txid,
          deposit.network,
          reference,
          `Dépôt ${deposit.crypto} converti en solde Koala.`,
        ]
      );

    const updatedDeposit =
      await client.query(
        `
        UPDATE koala_crypto_deposits

        SET
          received_crypto_amount =
            $1,

          credited_eur =
            $2,

          txid =
            $3,

          confirmations =
            $4,

          status =
            'credited',

          detected_at =
            COALESCE(
              detected_at,
              NOW()
            ),

          confirmed_at =
            COALESCE(
              confirmed_at,
              NOW()
            ),

          credited_at =
            NOW(),

          updated_at =
            NOW()

        WHERE id =
          $5

        RETURNING *
        `,
        [
          receivedCrypto,
          creditedEur,
          verification.txid,
          Number(
            verification
              .confirmations ||
            0
          ),
          deposit.id,
        ]
      );

    await client.query(
      "COMMIT"
    );

    return {
      deposit:
        formatCryptoDeposit(
          updatedDeposit
            .rows[0]
        ),

      wallet:
        formatKoalaWallet(
          updatedWallet
            .rows[0]
        ),

      movement:
        formatWalletMovement(
          movementResult
            .rows[0]
        ),

      already_credited:
        false,
    };
  } catch (
    error
  ) {
    await client.query(
      "ROLLBACK"
    );

    throw error;
  } finally {
    client.release();
  }
}

// ============================================================
// VÉRIFIER UN DÉPÔT CRYPTO
// ============================================================

async function checkCryptoDeposit(
  deposit,
  txid
) {
  if (
    !deposit
  ) {
    const error =
      new Error(
        "Dépôt introuvable."
      );

    error.statusCode =
      404;

    throw error;
  }

  if (
    deposit.credited_at
  ) {
    const wallet =
      await getKoalaWallet(
        deposit.user_id
      );

    return {
      paid:
        true,

      detected:
        true,

      credited:
        true,

      deposit:
        formatCryptoDeposit(
          deposit
        ),

      wallet:
        formatKoalaWallet(
          wallet
        ),

      message:
        "Ce dépôt a déjà été crédité sur le solde Koala.",
    };
  }

  const symbol =
    String(
      deposit.crypto ||
      ""
    ).toUpperCase();

  let verification;

  if (
    symbol ===
    "BTC"
  ) {
    verification =
      await checkBitcoinDeposit(
        deposit,
        txid
      );
  } else if (
    symbol ===
      "USDC" ||
    symbol ===
      "USDT"
  ) {
    verification =
      await checkBscTokenDeposit(
        deposit,
        txid
      );
  } else if (
    symbol ===
    "ETH"
  ) {
    return {
      paid:
        false,

      detected:
        false,

      credited:
        false,

      message:
        "La vérification automatique des dépôts ETH n'est pas encore activée.",
    };
  } else {
    const error =
      new Error(
        "Crypto non supportée."
      );

    error.statusCode =
      400;

    throw error;
  }

  if (
    verification.detected
  ) {
    await pool.query(
      `
      UPDATE koala_crypto_deposits

      SET
        txid =
          COALESCE(
            $1,
            txid
          ),

        confirmations =
          $2,

        received_crypto_amount =
          COALESCE(
            $3,
            received_crypto_amount
          ),

        status =
          CASE
            WHEN $4
            THEN 'confirmed'
            ELSE 'detected'
          END,

        detected_at =
          COALESCE(
            detected_at,
            NOW()
          ),

        confirmed_at =
          CASE
            WHEN $4
            THEN COALESCE(
              confirmed_at,
              NOW()
            )
            ELSE confirmed_at
          END,

        updated_at =
          NOW()

      WHERE id =
        $5
      `,
      [
        verification.txid ||
          null,

        Number(
          verification
            .confirmations ||
          0
        ),

        verification
          .received_crypto_amount ||
        null,

        Boolean(
          verification.paid
        ),

        deposit.id,
      ]
    );
  }

  if (
    verification.paid
  ) {
    const creditResult =
      await creditConfirmedCryptoDeposit(
        deposit.id,
        verification
      );

    return {
      ...verification,

      credited:
        true,

      ...creditResult,
    };
  }

  const updated =
    await pool.query(
      `
      SELECT *

      FROM koala_crypto_deposits

      WHERE id =
        $1

      LIMIT 1
      `,
      [
        deposit.id,
      ]
    );

  return {
    ...verification,

    credited:
      false,

    deposit:
      formatCryptoDeposit(
        updated.rows[0]
      ),
  };
}

// ============================================================
// DÉBITER LE SOLDE KOALA
// ============================================================

async function debitKoalaWallet({
  userId,
  amountEur,
  movementType =
    "card_purchase",
  cardId = null,
  orderId = null,
  installmentId = null,
  reference = null,
  description = null,
}) {
  const amount =
    roundEur(
      Number(
        amountEur
      )
    );

  if (
    !Number.isFinite(
      amount
    ) ||
    amount <= 0
  ) {
    const error =
      new Error(
        "Montant du débit invalide."
      );

    error.statusCode =
      400;

    throw error;
  }

  const client =
    await pool.connect();

  try {
    await client.query(
      "BEGIN"
    );

    await client.query(
      `
      INSERT INTO koala_wallets (
        user_id,
        balance_eur,
        reserved_eur,
        currency,
        created_at,
        updated_at
      )

      VALUES (
        $1,
        0,
        0,
        'EUR',
        NOW(),
        NOW()
      )

      ON CONFLICT (
        user_id
      )
      DO NOTHING
      `,
      [
        userId,
      ]
    );

    const walletResult =
      await client.query(
        `
        SELECT *

        FROM koala_wallets

        WHERE user_id =
          $1

        FOR UPDATE
        `,
        [
          userId,
        ]
      );

    const wallet =
      walletResult
        .rows[0];

    const before =
      roundEur(
        Number(
          wallet
            .balance_eur ||
          0
        )
      );

    const reserved =
      roundEur(
        Number(
          wallet
            .reserved_eur ||
          0
        )
      );

    const available =
      roundEur(
        before -
        reserved
      );

    if (
      available <
      amount
    ) {
      const error =
        new Error(
          `Solde Koala insuffisant. Disponible : ${available.toFixed(
            2
          )} €`
        );

      error.statusCode =
        400;

      throw error;
    }

    const after =
      roundEur(
        before -
        amount
      );

    const updated =
      await client.query(
        `
        UPDATE koala_wallets

        SET
          balance_eur =
            $1,

          updated_at =
            NOW()

        WHERE id =
          $2

        RETURNING *
        `,
        [
          after,
          wallet.id,
        ]
      );

    const movementReference =
      reference ||
      `KOALA-DEBIT-${randomHex(
        6
      ).toUpperCase()}`;

    const movement =
      await client.query(
        `
        INSERT INTO koala_wallet_movements (
          user_id,
          wallet_id,
          movement_type,
          direction,
          amount_eur,
          balance_before_eur,
          balance_after_eur,
          order_id,
          installment_id,
          card_id,
          reference,
          status,
          description,
          created_at
        )

        VALUES (
          $1,
          $2,
          $3,
          'debit',
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          'completed',
          $11,
          NOW()
        )

        RETURNING *
        `,
        [
          userId,
          wallet.id,
          movementType,
          amount,
          before,
          after,
          orderId,
          installmentId,
          cardId,
          movementReference,
          description,
        ]
      );

    await client.query(
      "COMMIT"
    );

    return {
      wallet:
        formatKoalaWallet(
          updated.rows[0]
        ),

      movement:
        formatWalletMovement(
          movement.rows[0]
        ),
    };
  } catch (
    error
  ) {
    await client.query(
      "ROLLBACK"
    );

    throw error;
  } finally {
    client.release();
  }
}

// ============================================================
// SIMULATION ACHAT CARTE MARQETA SANDBOX
// ============================================================

async function simulateKoalaCardPurchase({
  userId,
  amountEur,
  merchantName,
}) {
  const card =
    await getKoalaCard(
      userId
    );

  if (
    !card
  ) {
    const error =
      new Error(
        "Carte Koala introuvable."
      );

    error.statusCode =
      404;

    throw error;
  }

  if (
    String(
      card.status ||
      ""
    ).toLowerCase() !==
    "active"
  ) {
    const error =
      new Error(
        "La Carte Koala n'est pas active."
      );

    error.statusCode =
      400;

    throw error;
  }

  const amount =
    roundEur(
      Number(
        amountEur
      )
    );

  if (
    !Number.isFinite(
      amount
    ) ||
    amount <= 0
  ) {
    const error =
      new Error(
        "Montant carte invalide."
      );

    error.statusCode =
      400;

    throw error;
  }

  const reference =
    `KOALA-CARD-${randomHex(
      6
    ).toUpperCase()}`;

  const debit =
    await debitKoalaWallet({
      userId,

      amountEur:
        amount,

      movementType:
        "card_purchase",

      cardId:
        card.id,

      reference,

      description:
        `Paiement Carte Koala chez ${
          merchantName ||
          "marchand"
        }.`,
    });

  const result =
    await pool.query(
      `
      INSERT INTO koala_card_transactions (
        user_id,
        card_id,
        marqeta_card_token,
        merchant_name,
        amount_eur,
        transaction_type,
        status,
        wallet_movement_id,
        reference,
        created_at,
        updated_at
      )

      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        'purchase',
        'approved',
        $6,
        $7,
        NOW(),
        NOW()
      )

      RETURNING *
      `,
      [
        userId,
        card.id,
        card.marqeta_card_token,
        String(
          merchantName ||
          "Marchand Sandbox"
        ),
        amount,
        debit
          .movement
          .id,
        reference,
      ]
    );

  return {
    success:
      true,

    sandbox:
      true,

    approved:
      true,

    transaction:
      result.rows[0],

    wallet:
      debit.wallet,

    movement:
      debit.movement,
  };
}

// ============================================================
// RÉCUPÉRATION ÉCHÉANCE
// ============================================================

async function getInstallmentByToken(
  token
) {
  const result =
    await pool.query(
      `
      SELECT *

      FROM koala_installments

      WHERE payment_token =
        $1

      LIMIT 1
      `,
      [
        token,
      ]
    );

  return (
    result.rows[0] ||
    null
  );
}

async function getInstallmentById(
  id
) {
  const result =
    await pool.query(
      `
      SELECT *

      FROM koala_installments

      WHERE id =
        $1

      LIMIT 1
      `,
      [
        id,
      ]
    );

  return (
    result.rows[0] ||
    null
  );
}

// ============================================================
// FORMATAGE COMMANDES
// ============================================================

function formatOrder(
  row
) {
  if (
    !row
  ) {
    return null;
  }

  return {
    id:
      row.id,

    user_id:
      row.user_id,

    merchant_id:
      row.merchant_id,

    merchant_name:
      row.merchant_name,

    amount_eur:
      Number(
        row.amount_eur ||
        0
      ),

    crypto:
      row.crypto,

    installments_count:
      Number(
        row.installments_count ||
        0
      ),

    crypto_price_eur:
      Number(
        row.crypto_price_eur ||
        0
      ),

    total_crypto:
      Number(
        row.total_crypto ||
        0
      ),

    payment_address:
      row.payment_address,

    status:
      row.status,

    created_at:
      row.created_at,

    updated_at:
      row.updated_at,
  };
}

// ============================================================
// FORMATAGE ÉCHÉANCES
// ============================================================

function formatInstallment(
  row
) {
  if (
    !row
  ) {
    return null;
  }

  return {
    id:
      row.id,

    order_id:
      row.order_id,

    number:
      Number(
        row.number ||
        0
      ),

    amount_eur:
      Number(
        row.amount_eur ||
        0
      ),

    crypto_amount:
      Number(
        row.crypto_amount ||
        0
      ),

    due_date:
      row.due_date,

    crypto_rate_eur:
      Number(
        row.crypto_rate_eur ||
        0
      ),

    payment_address:
      row.payment_address,

    payment_token:
      row.payment_token,

    status:
      row.status,

    txid:
      row.txid,

    confirmations:
      Number(
        row.confirmations ||
        0
      ),

    declared_at:
      row.declared_at,

    detected_at:
      row.detected_at,

    paid_at:
      row.paid_at,

    created_at:
      row.created_at,

    updated_at:
      row.updated_at,
  };
}

// ============================================================
// FORMATAGE RÈGLEMENTS
// ============================================================

function formatSettlement(
  row
) {
  if (
    !row
  ) {
    return null;
  }

  return {
    id:
      row.id,

    order_id:
      row.order_id,

    merchant_id:
      row.merchant_id,

    merchant_name:
      row.merchant_name,

    received_eur:
      Number(
        row.received_eur ||
        0
      ),

    refunded_eur:
      Number(
        row.refunded_eur ||
        0
      ),

    payable_eur:
      Number(
        row.payable_eur ||
        0
      ),

    status:
      row.status,

    payout_requested_at:
      row.payout_requested_at,

    paid_at:
      row.paid_at,

    payout_reference:
      row.payout_reference,

    created_at:
      row.created_at,

    updated_at:
      row.updated_at,
  };
}

// ============================================================
// FORMATAGE REMBOURSEMENTS
// ============================================================

function formatRefund(
  row
) {
  if (
    !row
  ) {
    return null;
  }

  return {
    id:
      row.id,

    order_id:
      row.order_id,

    merchant_id:
      row.merchant_id,

    amount_eur:
      Number(
        row.amount_eur ||
        0
      ),

    reason:
      row.reason,

    status:
      row.status,

    reference:
      row.reference,

    completed_at:
      row.completed_at,

    created_at:
      row.created_at,

    updated_at:
      row.updated_at,
  };
}

// ============================================================
// FORMATAGE CARTE KOALA
// ============================================================

function formatKoalaCard(
  row
) {
  if (
    !row
  ) {
    return null;
  }

  return {
    id:
      row.id,

    user_id:
      row.user_id,

    provider:
      row.card_provider ||
      (
        row.marqeta_card_token
          ? "marqeta"
          : "stripe"
      ),

    holder_name:
      row.holder_name,

    brand:
      row.brand,

    last4:
      row.last4,

    exp_month:
      Number(
        row.exp_month ||
        0
      ),

    exp_year:
      Number(
        row.exp_year ||
        0
      ),

    currency:
      row.currency,

    type:
      row.card_type,

    status:
      row.status,

    livemode:
      Boolean(
        row.livemode
      ),

    test_mode:
      !Boolean(
        row.livemode
      ),

    created_at:
      row.created_at,

    updated_at:
      row.updated_at,
  };
}

async function getKoalaCard(
  userId
) {
  const result =
    await pool.query(
      `
      SELECT *

      FROM koala_cards

      WHERE user_id =
        $1

      LIMIT 1
      `,
      [
        userId,
      ]
    );

  return (
    result.rows[0] ||
    null
  );
}

// ============================================================
// MISE À JOUR RÈGLEMENT MARCHAND
// ============================================================

async function updateMerchantSettlement(
  orderId
) {
  const orderResult =
    await pool.query(
      `
      SELECT *

      FROM koala_orders

      WHERE id =
        $1

      LIMIT 1
      `,
      [
        orderId,
      ]
    );

  if (
    orderResult.rows.length ===
    0
  ) {
    return null;
  }

  const order =
    orderResult
      .rows[0];

  const paidResult =
    await pool.query(
      `
      SELECT
        COALESCE(
          SUM(
            amount_eur
          ),
          0
        ) AS total

      FROM koala_installments

      WHERE
        order_id = $1
        AND UPPER(
          status
        )
        IN (
          'PAYEE',
          'PAID'
        )
      `,
      [
        orderId,
      ]
    );

  const refundResult =
    await pool.query(
      `
      SELECT
        COALESCE(
          SUM(
            amount_eur
          ),
          0
        ) AS total

      FROM koala_refunds

      WHERE
        order_id = $1
        AND LOWER(
          status
        ) =
          'completed'
      `,
      [
        orderId,
      ]
    );

  const received =
    roundEur(
      Number(
        paidResult
          .rows[0]
          ?.total ||
        0
      )
    );

  const refunded =
    roundEur(
      Number(
        refundResult
          .rows[0]
          ?.total ||
        0
      )
    );

  const payable =
    roundEur(
      Math.max(
        0,
        received -
        refunded
      )
    );

  let status =
    "pending";

  if (
    received > 0 &&
    received <
    Number(
      order.amount_eur ||
      0
    )
  ) {
    status =
      "accruing";
  }

  if (
    received >=
      Number(
        order.amount_eur ||
        0
      ) &&
    payable > 0
  ) {
    status =
      "ready";
  }

  const existing =
    await pool.query(
      `
      SELECT *

      FROM koala_merchant_settlements

      WHERE order_id =
        $1

      LIMIT 1
      `,
      [
        orderId,
      ]
    );

  if (
    existing.rows[0]
      ?.status ===
    "payout_requested"
  ) {
    status =
      "payout_requested";
  }

  if (
    existing.rows[0]
      ?.status ===
    "paid"
  ) {
    status =
      "paid";
  }

  const result =
    await pool.query(
      `
      INSERT INTO koala_merchant_settlements (
        order_id,
        merchant_id,
        merchant_name,
        received_eur,
        refunded_eur,
        payable_eur,
        status,
        created_at,
        updated_at
      )

      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        NOW(),
        NOW()
      )

      ON CONFLICT (
        order_id
      )
      WHERE
        order_id IS NOT NULL

      DO UPDATE SET

        merchant_id =
          EXCLUDED.merchant_id,

        merchant_name =
          EXCLUDED.merchant_name,

        received_eur =
          EXCLUDED.received_eur,

        refunded_eur =
          EXCLUDED.refunded_eur,

        payable_eur =
          EXCLUDED.payable_eur,

        status =
          EXCLUDED.status,

        updated_at =
          NOW()

      RETURNING *
      `,
      [
        order.id,
        order.merchant_id,
        order.merchant_name,
        received,
        refunded,
        payable,
        status,
      ]
    );

  return formatSettlement(
    result.rows[0]
  );
}

// ============================================================
// MISE À JOUR STATUT COMMANDE
// ============================================================

async function updateOrderStatus(
  orderId
) {
  const result =
    await pool.query(
      `
      SELECT status

      FROM koala_installments

      WHERE order_id =
        $1
      `,
      [
        orderId,
      ]
    );

  if (
    result.rows.length ===
    0
  ) {
    return;
  }

  const paid =
    result.rows.filter(
      (
        row
      ) =>
        [
          "PAYEE",
          "PAID",
        ].includes(
          String(
            row.status ||
            ""
          ).toUpperCase()
        )
    ).length;

  let status =
    "created";

  if (
    paid ===
    result.rows.length
  ) {
    status =
      "paid";
  } else if (
    paid > 0
  ) {
    status =
      "partially_paid";
  }

  await pool.query(
    `
    UPDATE koala_orders

    SET
      status =
        $1,

      updated_at =
        NOW()

    WHERE id =
      $2
    `,
    [
      status,
      orderId,
    ]
  );

  await updateMerchantSettlement(
    orderId
  );
}

// ============================================================
// CRÉATION D'UNE COMMANDE 3X / 4X
// ============================================================

async function createOrder({
  userId,
  merchantId,
  amountEur,
  cryptoSymbol,
  installmentsCount,
}) {
  const normalizedCrypto =
    String(
      cryptoSymbol ||
      ""
    )
      .trim()
      .toUpperCase();

  if (
    !isSupportedCrypto(
      normalizedCrypto
    )
  ) {
    const error =
      new Error(
        "Crypto non supportée."
      );

    error.statusCode =
      400;

    throw error;
  }

  const amount =
    Number(
      amountEur
    );

  if (
    !Number.isFinite(
      amount
    ) ||
    amount <= 0
  ) {
    const error =
      new Error(
        "Montant invalide."
      );

    error.statusCode =
      400;

    throw error;
  }

  const count =
    Number(
      installmentsCount
    );

  if (
    ![
      3,
      4,
    ].includes(
      count
    )
  ) {
    const error =
      new Error(
        "Le paiement doit être en 3x ou 4x."
      );

    error.statusCode =
      400;

    throw error;
  }

  const merchant =
    getMerchantById(
      merchantId
    );

  if (
    !merchant
  ) {
    const error =
      new Error(
        "Marchand introuvable."
      );

    error.statusCode =
      404;

    throw error;
  }

  const wallet =
    getWalletForCrypto(
      normalizedCrypto
    );

  if (
    !wallet
  ) {
    const error =
      new Error(
        `Adresse ${normalizedCrypto} non configurée.`
      );

    error.statusCode =
      503;

    throw error;
  }

  const cryptoPrice =
    await getCryptoPriceEur(
      normalizedCrypto
    );

  const totalCrypto =
    roundCrypto(
      amount /
      cryptoPrice
    );

  const client =
    await pool.connect();

  try {
    await client.query(
      "BEGIN"
    );

    const orderResult =
      await client.query(
        `
        INSERT INTO koala_orders (
          user_id,
          merchant_id,
          merchant_name,
          amount_eur,
          crypto,
          installments_count,
          crypto_price_eur,
          total_crypto,
          payment_address,
          status,
          created_at,
          updated_at
        )

        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          'created',
          NOW(),
          NOW()
        )

        RETURNING *
        `,
        [
          userId,
          merchant.id,
          merchant.name,
          roundEur(
            amount
          ),
          normalizedCrypto,
          count,
          cryptoPrice,
          totalCrypto,
          wallet,
        ]
      );

    const order =
      orderResult
        .rows[0];

    const totalCents =
      Math.round(
        amount *
        100
      );

    const baseCents =
      Math.floor(
        totalCents /
        count
      );

    const remainder =
      totalCents %
      count;

    const installments =
      [];

    for (
      let number =
        1;
      number <=
      count;
      number++
    ) {
      const cents =
        baseCents +
        (
          number <=
          remainder
            ? 1
            : 0
        );

      const installmentAmount =
        cents /
        100;

      const cryptoAmount =
        roundCrypto(
          installmentAmount /
          cryptoPrice
        );

      const paymentToken =
        randomHex(
          24
        );

      const dueDate =
        addMonths(
          new Date(),
          number -
          1
        );

      const installmentResult =
        await client.query(
          `
          INSERT INTO koala_installments (
            order_id,
            number,
            amount_eur,
            crypto_amount,
            due_date,
            crypto_rate_eur,
            payment_address,
            payment_token,
            status,
            confirmations,
            created_at,
            updated_at
          )

          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            'A_PAYER',
            0,
            NOW(),
            NOW()
          )

          RETURNING *
          `,
          [
            order.id,
            number,
            installmentAmount,
            cryptoAmount,
            dueDate,
            cryptoPrice,
            wallet,
            paymentToken,
          ]
        );

      installments.push(
        installmentResult
          .rows[0]
      );
    }

    await client.query(
      `
      INSERT INTO koala_merchant_settlements (
        order_id,
        merchant_id,
        merchant_name,
        received_eur,
        refunded_eur,
        payable_eur,
        status,
        created_at,
        updated_at
      )

      VALUES (
        $1,
        $2,
        $3,
        0,
        0,
        0,
        'pending',
        NOW(),
        NOW()
      )

      ON CONFLICT (
        order_id
      )
      WHERE
        order_id IS NOT NULL

      DO NOTHING
      `,
      [
        order.id,
        merchant.id,
        merchant.name,
      ]
    );

    await client.query(
      "COMMIT"
    );

    return {
      order:
        formatOrder(
          order
        ),

      payment: {
        crypto:
          normalizedCrypto,

        crypto_price_eur:
          Number(
            cryptoPrice
          ),

        total_crypto:
          totalCrypto,

        payment_address:
          wallet,

        network:
          getNetworkForCrypto(
            normalizedCrypto
          ),
      },

      installments:
        installments.map(
          formatInstallment
        ),
    };
  } catch (
    error
  ) {
    await client.query(
      "ROLLBACK"
    );

    throw error;
  } finally {
    client.release();
  }
}

// ============================================================
// COMMANDES UTILISATEUR
// ============================================================

async function getUserOrders(
  userId
) {
  const result =
    await pool.query(
      `
      SELECT *

      FROM koala_orders

      WHERE user_id =
        $1

      ORDER BY
        created_at DESC
      `,
      [
        userId,
      ]
    );

  return result.rows.map(
    formatOrder
  );
}

async function getUserOrder(
  userId,
  orderId
) {
  const orderResult =
    await pool.query(
      `
      SELECT *

      FROM koala_orders

      WHERE
        id = $1
        AND user_id = $2

      LIMIT 1
      `,
      [
        orderId,
        userId,
      ]
    );

  if (
    orderResult.rows.length ===
    0
  ) {
    return null;
  }

  const installmentsResult =
    await pool.query(
      `
      SELECT *

      FROM koala_installments

      WHERE order_id =
        $1

      ORDER BY
        number ASC
      `,
      [
        orderId,
      ]
    );

  return {
    order:
      formatOrder(
        orderResult
          .rows[0]
      ),

    installments:
      installmentsResult
        .rows.map(
          formatInstallment
        ),
  };
}

// ============================================================
// VÉRIFICATION D'UNE ÉCHÉANCE
// ============================================================

async function checkInstallmentPayment(
  installment
) {
  if (
    !installment
  ) {
    const error =
      new Error(
        "Échéance introuvable."
      );

    error.statusCode =
      404;

    throw error;
  }

  const orderResult =
    await pool.query(
      `
      SELECT *

      FROM koala_orders

      WHERE id =
        $1

      LIMIT 1
      `,
      [
        installment
          .order_id,
      ]
    );

  if (
    orderResult.rows.length ===
    0
  ) {
    const error =
      new Error(
        "Commande introuvable."
      );

    error.statusCode =
      404;

    throw error;
  }

  const order =
    orderResult
      .rows[0];

  const cryptoSymbol =
    String(
      order.crypto ||
      ""
    )
      .trim()
      .toUpperCase();

  let checkResult;

  if (
    cryptoSymbol ===
    "BTC"
  ) {
    checkResult =
      await checkBitcoinPayment(
        installment
      );
  } else if (
    cryptoSymbol ===
      "USDC" ||
    cryptoSymbol ===
      "USDT"
  ) {
    checkResult =
      await checkBscTokenPayment(
        installment,
        cryptoSymbol
      );
  } else if (
    cryptoSymbol ===
    "ETH"
  ) {
    checkResult = {
      paid:
        false,

      detected:
        false,

      confirmations:
        0,

      message:
        "La vérification automatique ETH n'est pas encore activée.",
    };
  } else {
    const error =
      new Error(
        "Crypto non supportée."
      );

    error.statusCode =
      400;

    throw error;
  }

  if (
    checkResult.detected
  ) {
    await pool.query(
      `
      UPDATE koala_installments

      SET
        txid =
          COALESCE(
            $1,
            txid
          ),

        confirmations =
          $2,

        detected_at =
          COALESCE(
            detected_at,
            NOW()
          ),

        updated_at =
          NOW()

      WHERE id =
        $3
      `,
      [
        checkResult.txid ||
          null,

        Number(
          checkResult
            .confirmations ||
          0
        ),

        installment.id,
      ]
    );
  }

  if (
    checkResult.paid
  ) {
    await pool.query(
      `
      UPDATE koala_installments

      SET
        status =
          'PAYEE',

        txid =
          COALESCE(
            $1,
            txid
          ),

        confirmations =
          $2,

        detected_at =
          COALESCE(
            detected_at,
            NOW()
          ),

        paid_at =
          COALESCE(
            paid_at,
            NOW()
          ),

        updated_at =
          NOW()

      WHERE id =
        $3
      `,
      [
        checkResult.txid ||
          null,

        Number(
          checkResult
            .confirmations ||
          0
        ),

        installment.id,
      ]
    );

    await updateOrderStatus(
      installment
        .order_id
    );
  }

  const updated =
    await getInstallmentById(
      installment.id
    );

  return {
    ...checkResult,

    installment:
      formatInstallment(
        updated
      ),
  };
}

// ============================================================
// PAGE DE PAIEMENT
// ============================================================

function paymentPage(
  installment,
  order
) {
  const cryptoSymbol =
    String(
      order.crypto ||
      ""
    ).toUpperCase();

  const address =
    installment
      .payment_address ||
    "";

  const cryptoAmount =
    Number(
      installment
        .crypto_amount ||
      0
    );

  const euroAmount =
    Number(
      installment
        .amount_eur ||
      0
    );

  const paymentToken =
    installment
      .payment_token;

  const network =
    getNetworkForCrypto(
      cryptoSymbol
    );

  const qrData =
    cryptoSymbol ===
    "BTC"
      ? `bitcoin:${address}?amount=${cryptoAmount.toFixed(
          8
        )}`
      : address;

  return `
<!DOCTYPE html>

<html lang="fr">

<head>

<meta charset="UTF-8">

<meta
name="viewport"
content="width=device-width,initial-scale=1,viewport-fit=cover"
>

<title>Koala Crypto</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 20px;
  background: #f3f7f5;
  color: #17211b;

  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Arial,
    sans-serif;
}

.container {
  width: 100%;
  max-width: 600px;
  margin: auto;
}

.card {
  background: white;
  border-radius: 24px;
  padding: 22px;
  margin-bottom: 18px;

  box-shadow:
    0 10px 30px
    rgba(0,0,0,.06);
}

.hero {
  background: #173c2d;
  color: white;
}

.amount {
  font-size: 38px;
  font-weight: 900;
  margin-top: 12px;
}

.crypto {
  font-size: 20px;
  font-weight: 700;
}

.address {
  word-break: break-all;
  background: #f3f7f5;
  padding: 14px;
  border-radius: 14px;
  margin-top: 16px;
}

img {
  width: 220px;
  height: 220px;
  display: block;
  margin: 20px auto;
}

button {
  width: 100%;
  border: 0;
  border-radius: 16px;
  padding: 16px;
  font-size: 16px;
  font-weight: 800;
  margin-top: 16px;
  background: #328354;
  color: white;
}

#status {
  margin-top: 15px;
  line-height: 1.5;
}

.small {
  opacity: .75;
  font-size: 14px;
}

</style>

</head>

<body>

<div class="container">

<div class="card hero">

<h2>
Koala Crypto
</h2>

<div class="amount">
${euroAmount.toFixed(2)} €
</div>

<p class="crypto">
${cryptoAmount.toFixed(8)}
${cryptoSymbol}
</p>

<p>
Échéance n°${Number(
    installment.number ||
    0
  )}
</p>

</div>

<div class="card">

<h2>
Paiement crypto
</h2>

<p>
${cryptoSymbol}
•
${network}
</p>

<img
id="qr"
alt="QR Code"
/>

<div class="address">
${address}
</div>

<p class="small">
Envoyez exactement le montant indiqué sur le réseau ${network}.
</p>

<button
onclick="checkPayment()"
>
Vérifier le paiement
</button>

<div id="status"></div>

</div>

</div>

<script>

const paymentToken =
${JSON.stringify(
  paymentToken
)};

const qrData =
${JSON.stringify(
  qrData
)};

async function loadQr() {

  try {

    const response =
      await fetch(
        "/api/qr?data=" +
        encodeURIComponent(
          qrData
        )
      );

    const data =
      await response.json();

    if (
      data.data_url
    ) {
      document
        .getElementById(
          "qr"
        )
        .src =
          data.data_url;
    }

  } catch (
    error
  ) {

    console.error(
      error
    );

  }

}

async function checkPayment() {

  const status =
    document
      .getElementById(
        "status"
      );

  status.textContent =
    "Vérification en cours...";

  try {

    const response =
      await fetch(
        "/api/installments/" +
        paymentToken +
        "/check"
      );

    const data =
      await response.json();

    if (
      data.paid
    ) {

      status.textContent =
        "✅ Paiement confirmé.";

      return;

    }

    if (
      data.detected
    ) {

      status.textContent =
        "⏳ Transaction détectée — " +
        (
          data.confirmations ||
          0
        ) +
        " confirmation(s).";

      return;

    }

    status.textContent =
      data.message ||
      "Paiement non détecté.";

  } catch (
    error
  ) {

    status.textContent =
      "Erreur pendant la vérification.";

  }

}

loadQr();

</script>

</body>

</html>
`; 
}
// ============================================================
// SERVEUR HTTP
// ============================================================

const server =
  http.createServer(
    async (
      req,
      res
    ) => {
      try {

        // ====================================================
        // CORS
        // ====================================================

        if (
          req.method ===
          "OPTIONS"
        ) {
          res.writeHead(
            204,
            {
              "Access-Control-Allow-Origin":
                "*",

              "Access-Control-Allow-Headers":
                "Content-Type, Authorization, X-Admin-Api-Key",

              "Access-Control-Allow-Methods":
                "GET, POST, OPTIONS",
            }
          );

          res.end();

          return;
        }

        const url =
          parseUrl(
            req
          );

        const pathname =
          url.pathname;

        // ====================================================
        // HOME
        // ====================================================

        if (
          req.method ===
            "GET" &&
          pathname ===
            "/"
        ) {
          return sendJson(
            res,
            200,
            {
              app:
                "Koala Crypto",

              status:
                "online",

              message:
                "Koala Crypto API fonctionne",

              wallet:
                true,

              card:
                true,

              crypto_to_card:
                true,
            }
          );
        }

        // ====================================================
        // KOALA STORE
        // ====================================================

        if (
          req.method === "GET" &&
          (pathname === "/store" || pathname === "/shop")
        ) {
          const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
<title>Koala Store</title>
<style>
  *{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f4f7f2;color:#132019}
  .top{background:#0f2b1e;color:#fff;padding:22px 18px 28px;position:sticky;top:0;z-index:10}.brand{display:flex;align-items:center;justify-content:space-between;gap:12px;max-width:980px;margin:auto}.logo{font-size:30px;font-weight:900}.logo span{display:block;font-size:12px;letter-spacing:4px;color:#7ac895}.cartBadge{background:#fff;color:#163b29;border:0;border-radius:18px;padding:12px 16px;font-weight:800}
  .wrap{max-width:980px;margin:auto;padding:22px 16px 60px}.hero{background:linear-gradient(135deg,#1f603d,#133d2a);color:#fff;padding:26px;border-radius:28px;margin-bottom:22px}.hero h1{margin:0 0 8px;font-size:34px}.hero p{margin:0;opacity:.85;line-height:1.45}
  .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.card{background:#fff;border-radius:22px;padding:16px;box-shadow:0 10px 25px rgba(20,50,32,.08)}.pic{height:130px;border-radius:18px;background:#edf3ea;display:flex;align-items:center;justify-content:center;font-size:62px;margin-bottom:14px}.name{font-weight:850;font-size:18px}.desc{font-size:13px;color:#69746d;min-height:38px;margin-top:6px}.price{font-size:22px;font-weight:900;margin:12px 0}.buy{width:100%;border:0;border-radius:16px;background:#2d7448;color:#fff;padding:13px;font-size:15px;font-weight:800}.buy:active{transform:scale(.99)}
  .panel{margin-top:22px;background:#fff;border-radius:24px;padding:18px;box-shadow:0 10px 25px rgba(20,50,32,.08)}.line{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid #eef0ed}.line:last-child{border:0}.total{font-size:22px;font-weight:900;margin-top:12px}.checkout{width:100%;border:0;border-radius:18px;background:#163f2b;color:#fff;padding:16px;font-size:17px;font-weight:850;margin-top:14px}.muted{color:#707b73;font-size:13px;line-height:1.45}
  .modal{display:none;position:fixed;inset:0;background:rgba(6,20,13,.58);z-index:30;padding:20px;align-items:flex-end}.modal.open{display:flex}.sheet{background:#fff;width:100%;max-width:620px;margin:0 auto;border-radius:28px;padding:22px;max-height:88vh;overflow:auto}.sheet h2{margin-top:0}.field{margin:12px 0}.field label{display:block;font-size:13px;font-weight:750;margin-bottom:6px}.field input,.field select{width:100%;padding:14px;border:1px solid #d7ddd8;border-radius:14px;font-size:16px;background:#fff}.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.primary{width:100%;border:0;border-radius:17px;background:#2b7147;color:#fff;padding:15px;font-size:16px;font-weight:850;margin-top:10px}.secondary{width:100%;border:0;background:#edf2ee;border-radius:17px;padding:14px;font-weight:800;margin-top:8px}.status{margin-top:12px;padding:12px;border-radius:14px;background:#f4f7f3;display:none;white-space:pre-wrap}.ok{background:#eaf7ee;color:#145b31}.bad{background:#fff0ef;color:#8b2722}
  @media(max-width:560px){.grid{grid-template-columns:1fr 1fr}.pic{height:105px;font-size:50px}.hero h1{font-size:29px}.name{font-size:16px}.price{font-size:19px}}
</style>
</head>
<body>
<header class="top"><div class="brand"><div class="logo">Koala Store<span>KOALA STORE</span></div><button class="cartBadge" onclick="scrollToCart()">Panier <b id="cartCount">0</b></button></div></header>
<main class="wrap">
  <section class="hero"><h1>Boutique test Koala</h1><p>Choisissez un objet puis testez un paiement en 3x ou 4x avec votre compte Koala Crypto.</p></section>
  <section class="grid" id="products"></section>
  <section class="panel" id="cartPanel">
    <h2>Votre panier</h2>
    <div id="cartLines"><p class="muted">Votre panier est vide.</p></div>
    <div class="total">Total : <span id="cartTotal">0,00 €</span></div>
    <button class="checkout" onclick="openCheckout()">Payer avec Koala</button>
    <button class="checkout" id="stripeButton" onclick="payWithCard()" style="background:#635bff">💳 Payer par carte bancaire</button>
    <p class="muted">Boutique de test. Aucun paiement n'est déclenché tant que vous ne validez pas une commande avec votre compte Koala.</p>
  </section>
</main>
<div class="modal" id="checkoutModal"><div class="sheet">
  <h2>Payer avec Koala</h2>
  <p class="muted">Connectez-vous avec le même compte client que dans Koala Crypto.</p>
  <div class="field"><label>Email Koala</label><input id="email" type="email" autocomplete="email" /></div>
  <div class="field"><label>Mot de passe</label><input id="password" type="password" autocomplete="current-password" /></div>
  <div class="row">
    <div class="field"><label>Échéances</label><select id="installments"><option value="3">3x</option><option value="4">4x</option></select></div>
    <div class="field"><label>Crypto</label><select id="crypto"><option value="BTC">BTC</option><option value="USDC">USDC</option><option value="USDT">USDT</option></select></div>
  </div>
  <button class="primary" id="payButton" onclick="payWithKoala()">Créer la commande Koala</button>
  <button class="secondary" onclick="closeCheckout()">Fermer</button>
  <div class="status" id="status"></div>
</div></div>
<script>
var PRODUCTS=[
 {id:1,name:'Écouteurs Nova',price:39.90,emoji:'🎧',desc:'Écouteurs sans fil compacts.'},
 {id:2,name:'Montre Pulse',price:79.90,emoji:'⌚️',desc:'Montre connectée de démonstration.'},
 {id:3,name:'Sac Urban',price:59.90,emoji:'🎒',desc:'Sac urbain léger et résistant.'},
 {id:4,name:'Enceinte Mini',price:49.90,emoji:'🔊',desc:'Petite enceinte Bluetooth.'}
];
var cart=[];
function euro(n){return Number(n).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';}
function renderProducts(){var root=document.getElementById('products');root.innerHTML='';PRODUCTS.forEach(function(p){var el=document.createElement('article');el.className='card';el.innerHTML='<div class="pic">'+p.emoji+'</div><div class="name">'+p.name+'</div><div class="desc">'+p.desc+'</div><div class="price">'+euro(p.price)+'</div><button class="buy">Ajouter</button>';el.querySelector('button').onclick=function(){addToCart(p.id)};root.appendChild(el);});}
function addToCart(id){var p=PRODUCTS.find(function(x){return x.id===id});if(!p)return;cart.push(p);renderCart();}
function renderCart(){var lines=document.getElementById('cartLines');var total=cart.reduce(function(s,p){return s+p.price},0);document.getElementById('cartCount').textContent=cart.length;document.getElementById('cartTotal').textContent=euro(total);if(!cart.length){lines.innerHTML='<p class="muted">Votre panier est vide.</p>';return;}lines.innerHTML='';cart.forEach(function(p,i){var d=document.createElement('div');d.className='line';d.innerHTML='<span>'+p.name+'</span><span>'+euro(p.price)+' <button aria-label="Retirer" style="border:0;background:none;font-size:18px">×</button></span>';d.querySelector('button').onclick=function(){cart.splice(i,1);renderCart()};lines.appendChild(d);});}
function scrollToCart(){document.getElementById('cartPanel').scrollIntoView({behavior:'smooth'});}
function openCheckout(){if(!cart.length){alert('Ajoutez au moins un objet au panier.');return;}document.getElementById('checkoutModal').classList.add('open');}
function closeCheckout(){document.getElementById('checkoutModal').classList.remove('open');}
function showStatus(text,kind){var el=document.getElementById('status');el.style.display='block';el.className='status '+(kind||'');el.textContent=text;}
async function payWithKoala(){
 var total=cart.reduce(function(s,p){return s+p.price},0);if(total<=0){showStatus('Panier vide.','bad');return;}
 var email=document.getElementById('email').value.trim();var password=document.getElementById('password').value;var count=Number(document.getElementById('installments').value);var crypto=document.getElementById('crypto').value;
 if(!email||!password){showStatus('Email et mot de passe requis.','bad');return;}
 var btn=document.getElementById('payButton');btn.disabled=true;btn.textContent='Connexion...';
 try{
  var loginRes=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email,password:password})});
  var login=await loginRes.json();if(!loginRes.ok||!login.token){throw new Error(login.error||'Connexion impossible.');}
  btn.textContent='Création de la commande...';
  var orderRes=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+login.token},body:JSON.stringify({merchant_id:1,amount_eur:Number(total.toFixed(2)),crypto:crypto,installments_count:count})});
  var order=await orderRes.json();if(!orderRes.ok){throw new Error(order.error||'Création de commande impossible.');}
  var msg='✅ Commande Koala créée.\nTotal : '+euro(total)+'\nPaiement : '+count+'x en '+crypto;
  if(order.order&&order.order.id){msg+='\nCommande n°'+order.order.id;} else if(order.id){msg+='\nCommande n°'+order.id;}
  showStatus(msg,'ok');cart=[];renderCart();
 }catch(e){showStatus('Erreur : '+e.message,'bad');}
 finally{btn.disabled=false;btn.textContent='Créer la commande Koala';}
}

async function payWithCard(){
 var total=cart.reduce(function(s,p){return s+p.price},0);
 if(total<=0){alert('Ajoutez au moins un objet au panier.');return;}
 var btn=document.getElementById('stripeButton');btn.disabled=true;btn.textContent='Connexion à Stripe...';
 try{
  var r=await fetch('/store/card',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_ids:cart.map(function(p){return p.id;})})});
  var data=await r.json();
  if(!r.ok||!data.url){throw new Error(data.error||'Impossible de créer le paiement Stripe.');}
  window.location.href=data.url;
 }catch(e){alert(e.message||'Erreur Stripe.');btn.disabled=false;btn.textContent='💳 Payer par carte bancaire';}
}

renderProducts();renderCart();
</script>
</body>
</html>`;
          return sendHtml(res, 200, html);
        }

        // ====================================================
        // KOALA STORE - STRIPE CARTE BANCAIRE
        // ====================================================


        if (
          req.method === "POST" &&
          pathname === "/store/card"
        ) {
          try {
            ensureStripePayments();
            const body = await readJsonBody(req);
            const productIds = Array.isArray(body.product_ids)
              ? body.product_ids.map(Number)
              : [];

            const catalog = {
              1: { name: "Écouteurs Nova", cents: 3990 },
              2: { name: "Montre Pulse", cents: 7990 },
              3: { name: "Sac Urban", cents: 5990 },
              4: { name: "Enceinte Mini", cents: 4990 },
            };

            const selected = productIds
              .map((id) => catalog[id])
              .filter(Boolean);

            if (!selected.length) {
              return sendJson(res, 400, { error: "Le panier est vide." });
            }

            const totalCents = selected.reduce(
              (sum, product) => sum + product.cents,
              0
            );

            const description = selected
              .map((product) => product.name)
              .join(", ");

            const session = await stripeRequest(
              "POST",
              "/v1/checkout/sessions",
              {
                "payment_method_types[0]": "card",
                mode: "payment",
                "line_items[0][price_data][currency]": "eur",
                "line_items[0][price_data][product_data][name]": "Panier Koala Store",
                "line_items[0][price_data][product_data][description]": description.slice(0, 500),
                "line_items[0][price_data][unit_amount]": String(totalCents),
                "line_items[0][quantity]": "1",
                success_url: `${KOALA_STORE_URL}/store/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${KOALA_STORE_URL}/store`,
                "metadata[merchant]": "Koala Store",
                "metadata[source]": "koala_store",
                "metadata[product_ids]": productIds.join(","),
              }
            );

            if (!session.url) {
              throw new Error("Stripe n'a pas retourné l'URL de paiement.");
            }

            return sendJson(res, 200, {
              ok: true,
              url: session.url,
              amount_eur: totalCents / 100,
            });
          } catch (error) {
            console.error("Stripe Checkout:", error);
            return sendJson(res, error.statusCode || 500, {
              error: error.message || "Impossible de créer le paiement Stripe.",
            });
          }
        }

        // ====================================================
        // KOALA STORE - RETOUR STRIPE
        // ====================================================

        if (
          req.method === "GET" &&
          pathname === "/store/stripe/success"
        ) {
          try {
            ensureStripePayments();

            const sessionId =
              url.searchParams.get("session_id");

            if (!sessionId) {
              return sendJson(res, 400, {
                error: "Session Stripe manquante.",
              });
            }

            const session = await stripeRequest(
              "GET",
              `/v1/checkout/sessions/${encodeURIComponent(
                sessionId
              )}`
            );

            if (session.payment_status !== "paid") {
              const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Paiement en attente</title>
</head>
<body style="font-family:Arial,sans-serif;background:#f5f7fa;padding:30px;">
  <div style="max-width:520px;margin:50px auto;background:white;padding:30px;border-radius:24px;text-align:center;">
    <div style="font-size:55px">🐨</div>
    <h1>Paiement en attente</h1>
    <p>Stripe n'a pas encore confirmé le paiement.</p>
    <a href="/store" style="display:block;padding:16px;background:#111827;color:white;border-radius:14px;text-decoration:none;font-weight:bold;">Retour à Koala Store</a>
  </div>
</body>
</html>
              `;

              return sendHtml(res, 200, html);
            }

            const amount =
              (Number(session.amount_total || 0) / 100).toFixed(2);

            const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Paiement accepté</title>
</head>
<body style="font-family:Arial,sans-serif;background:#f5f7fa;padding:30px;">
  <div style="max-width:520px;margin:50px auto;background:white;padding:30px;border-radius:24px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.08);">
    <div style="font-size:64px">✅</div>
    <h1>Paiement accepté</h1>
    <p>Votre paiement par carte bancaire a été confirmé par Stripe.</p>
    <div style="font-size:36px;font-weight:bold;margin:25px 0;">${amount.replace(".", ",")} €</div>
    <p>Koala Store</p>
    <a href="/store" style="display:block;padding:16px;background:#111827;color:white;border-radius:14px;text-decoration:none;font-weight:bold;margin-top:25px;">Retour à Koala Store</a>
  </div>
</body>
</html>
            `;

            return sendHtml(res, 200, html);
          } catch (error) {
            console.error("Vérification Stripe:", error);

            return sendJson(res, 500, {
              error:
                error.message ||
                "Impossible de vérifier le paiement.",
            });
          }
        }

        // ====================================================
        // KOALA STORE - RETOUR APRÈS PAIEMENT
        // ====================================================

        if (
          req.method === "GET" &&
          pathname === "/store/success"
        ) {
          const orderId = url.searchParams.get("order_id") || "";
          const amount = url.searchParams.get("amount") || "100.00";
          const merchant = url.searchParams.get("merchant") || "Koala Store";

          const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Paiement accepté - Koala Store</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; font-family: Arial, sans-serif; background: #f5f7fa; color: #111827; }
    .container { max-width: 600px; margin: 40px auto; }
    .card { background: white; border-radius: 24px; padding: 30px; box-shadow: 0 10px 30px rgba(0,0,0,.08); text-align: center; }
    .check { width: 76px; height: 76px; margin: 0 auto 18px; border-radius: 50%; display: grid; place-items: center; background: #e9f7ef; color: #16794b; font-size: 38px; font-weight: bold; }
    h1 { margin: 0 0 10px; font-size: 30px; }
    .amount { font-size: 34px; font-weight: 800; margin: 22px 0 8px; }
    .muted { color: #6b7280; line-height: 1.5; }
    .ref { margin-top: 18px; padding: 14px; background: #f3f5f4; border-radius: 14px; font-weight: 700; }
    .button { display: block; margin-top: 24px; padding: 16px; border-radius: 14px; background: #111827; color: white; text-decoration: none; font-weight: 800; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="check">✓</div>
      <h1>Paiement accepté avec Koala</h1>
      <p class="muted">Votre commande chez ${merchant} est confirmée.</p>
      <div class="amount">${amount.replace(".", ",")} €</div>
      ${orderId ? `<div class="ref">Commande Koala n°${orderId}</div>` : ""}
      <a class="button" href="/store">Retour à Koala Store</a>
    </div>
  </div>
</body>
</html>`;

          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
          });
          return res.end(html);
        }

        if (
          req.method === "GET" &&
          pathname === "/store/cancel"
        ) {
          const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Paiement annulé - Koala Store</title>
  <style>
    body { margin: 0; padding: 24px; font-family: Arial, sans-serif; background: #f5f7fa; color: #111827; }
    .card { max-width: 600px; margin: 40px auto; background: white; border-radius: 24px; padding: 30px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,.08); }
    .button { display: block; margin-top: 24px; padding: 16px; border-radius: 14px; background: #111827; color: white; text-decoration: none; font-weight: 800; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Paiement annulé</h1>
    <p>Votre commande n’a pas été débitée par Koala.</p>
    <a class="button" href="/store">Retour à Koala Store</a>
  </div>
</body>
</html>`;

          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
          });
          return res.end(html);
        }

        // ====================================================
        // KOALA CHECKOUT - CHOIX 3X / 4X
        // ====================================================

        if (
          req.method === "GET" &&
          (pathname === "/store/checkout" || pathname === "/shop/checkout")
        ) {
          const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Koala Crypto - Paiement</title>
  <style>
    body {
      margin: 0;
      padding: 24px;
      font-family: Arial, sans-serif;
      background: #f4f6f8;
      color: #111827;
    }
    .card {
      max-width: 500px;
      margin: 70px auto;
      background: white;
      padding: 30px;
      border-radius: 24px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.08);
    }
    h1 { font-size: 34px; margin-bottom: 10px; }
    .price {
      font-size: 42px;
      font-weight: bold;
      margin: 30px 0;
    }
    .choice {
      display: block;
      text-decoration: none;
      background: #111827;
      color: white;
      padding: 20px;
      border-radius: 16px;
      margin-top: 16px;
      text-align: center;
      font-size: 20px;
      font-weight: bold;
    }
    .detail {
      display: block;
      font-size: 15px;
      margin-top: 6px;
      opacity: 0.8;
    }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size:52px">🐨</div>
    <h1>Payer avec Koala</h1>
    <p>Choisissez votre paiement en plusieurs fois.</p>
    <div class="price">100,00 €</div>
    <a class="choice" href="/store/pay?installments=3">
      Payer en 3x
      <span class="detail">33,33 € × 3</span>
    </a>
    <a class="choice" href="/store/pay?installments=4">
      Payer en 4x
      <span class="detail">25,00 € × 4</span>
    </a>
  </div>
</body>
</html>
          `;

          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
          });

          return res.end(html);
        }

        // ====================================================
        // KOALA STORE - PAIEMENT 3X / 4X
        // ====================================================

        if (
          req.method === "GET" &&
          (pathname === "/store/pay" || pathname === "/shop/pay")
        ) {
          const installments = Number(
            url.searchParams.get("installments")
          );

          if (![3, 4].includes(installments)) {
            return sendJson(res, 400, {
              error: "Choisissez un paiement en 3x ou 4x.",
            });
          }

          const total = 100;
          const installmentAmount = total / installments;

          const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Koala Crypto - Paiement</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      font-family: Arial, sans-serif;
      background: #f4f6f8;
      color: #111827;
    }
    .card {
      max-width: 500px;
      margin: 40px auto;
      background: white;
      padding: 30px;
      border-radius: 24px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.08);
    }
    .koala { font-size: 52px; }
    h1 { font-size: 34px; margin-bottom: 10px; }
    .total {
      font-size: 42px;
      font-weight: bold;
      margin: 25px 0 10px;
    }
    .installment {
      font-size: 20px;
      color: #6b7280;
      margin-bottom: 30px;
    }
    .title {
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 15px;
    }
    .crypto {
      display: block;
      text-decoration: none;
      background: #111827;
      color: white;
      padding: 18px;
      border-radius: 16px;
      margin-top: 12px;
      text-align: center;
      font-size: 19px;
      font-weight: bold;
    }
    .back {
      display: block;
      text-align: center;
      margin-top: 25px;
      color: #6b7280;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="koala">🐨</div>
    <h1>Paiement en ${installments}x</h1>
    <div class="total">100,00 €</div>
    <div class="installment">
      ${installmentAmount.toFixed(2).replace(".", ",")} € × ${installments}
    </div>
    <div class="title">Choisissez votre crypto</div>
    <a class="crypto" href="/store/crypto?installments=${installments}&crypto=BTC">₿ Bitcoin (BTC)</a>
    <a class="crypto" href="/store/crypto?installments=${installments}&crypto=ETH">Ξ Ethereum (ETH)</a>
    <a class="crypto" href="/store/crypto?installments=${installments}&crypto=USDC">USDC</a>
    <a class="crypto" href="/store/crypto?installments=${installments}&crypto=USDT">USDT</a>
    <a class="back" href="/store/checkout">← Retour</a>
  </div>
</body>
</html>
          `;

          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
          });

          return res.end(html);
        }

        // ====================================================
        // STATUS GÉNÉRAL
        // ====================================================

        if (
          req.method ===
            "GET" &&
          pathname ===
            "/api/status"
        ) {
          return sendJson(
            res,
            200,
            {
              app:
                "Koala Crypto",

              status:
                "online",

              time:
                nowIso(),

              features: {
                installments:
                  true,

                wallet:
                  true,

                crypto_deposit:
                  true,

                card_wallet:
                  true,

                merchant:
                  true,
              },

              blockchain: {
                BTC:
                  Boolean(
                    BTC_RECEIVE_ADDRESS
                  ),

                ETH:
                  Boolean(
                    ETH_WALLET_ADDRESS
                  ),

                USDC:
                  Boolean(
                    USDC_WALLET_ADDRESS
                  ),

                USDT:
                  Boolean(
                    USDT_WALLET_ADDRESS
                  ),
              },

              issuing: {
                provider:
                  isMarqetaConfigured()
                    ? "marqeta"
                    : null,

                marqeta: {
                  configured:
                    isMarqetaConfigured(),

                  sandbox:
                    MARQETA_BASE_URL.includes(
                      "sandbox-api.marqeta.com"
                    ),
                },

                stripe: {
                  configured:
                    Boolean(
                      STRIPE_SECRET_KEY
                    ),

                  test_mode:
                    Boolean(
                      STRIPE_SECRET_KEY &&
                      STRIPE_SECRET_KEY.startsWith(
                        "sk_test_"
                      )
                    ),
                },
              },
            }
          );
        }

        // ====================================================
        // MARQETA STATUS
        // ====================================================

        if (
          req.method ===
            "GET" &&
          pathname ===
            "/api/marqeta/status"
        ) {
          ensureMarqetaConfigured();

          const product =
            await getMarqetaCardProduct();

          return sendJson(
            res,
            200,
            {
              success:
                true,

              provider:
                "marqeta",

              environment:
                MARQETA_BASE_URL.includes(
                  "sandbox-api.marqeta.com"
                )
                  ? "sandbox"
                  : "production",

              configured:
                true,

              connected:
                true,

              card_product: {
                name:
                  product.name ||
                  null,

                active:
                  Boolean(
                    product.active
                  ),

                payment_instrument:
                  product
                    ?.config
                    ?.fulfillment
                    ?.payment_instrument ||
                  null,
              },
            }
          );
        }

        // ====================================================
        // QR CODE
        // ====================================================

        if (
          req.method ===
            "GET" &&
          pathname ===
            "/api/qr"
        ) {
          const data =
            String(
              url.searchParams.get(
                "data"
              ) ||
              ""
            ).trim();

          if (
            !data
          ) {
            return sendJson(
              res,
              400,
              {
                error:
                  "Donnée QR manquante.",
              }
            );
          }

          const dataUrl =
            await QRCode.toDataURL(
              data,
              {
                width:
                  400,

                margin:
                  2,
              }
            );

          return sendJson(
            res,
            200,
            {
              data_url:
                dataUrl,
            }
          );
        }

        // ====================================================
        // MARCHANDS
        // ====================================================

        if (
          req.method ===
            "GET" &&
          pathname ===
            "/api/merchants"
        ) {
          return sendJson(
            res,
            200,
            {
              merchants:
                MERCHANTS.map(
                  (
                    merchant
                  ) => ({
                    id:
                      merchant.id,

                    name:
                      merchant.name,
                  })
                ),
            }
          );
        }

        // ====================================================
        // INSCRIPTION
        // ====================================================

        if (
          req.method ===
            "POST" &&
          pathname ===
            "/api/auth/register"
        ) {
          const body =
            await readJsonBody(
              req
            );

          const email =
            normalizeEmail(
              body.email
            );

          const password =
            String(
              body.password ||
              ""
            );

          if (
            !email ||
            !email.includes(
              "@"
            )
          ) {
            return sendJson(
              res,
              400,
              {
                error:
                  "Adresse email invalide.",
              }
            );
          }

          if (
            password.length <
            6
          ) {
            return sendJson(
              res,
              400,
              {
                error:
                  "Le mot de passe doit contenir au moins 6 caractères.",
              }
            );
          }

          const existing =
            await pool.query(
              `
              SELECT id

              FROM koala_users

              WHERE LOWER(email) =
                LOWER($1)

              LIMIT 1
              `,
              [
                email,
              ]
            );

          if (
            existing.rows.length >
            0
          ) {
            return sendJson(
              res,
              409,
              {
                error:
                  "Un compte existe déjà avec cette adresse email.",
              }
            );
          }

          const passwordHash =
            hashPassword(
              password
            );

          const result =
            await pool.query(
              `
              INSERT INTO koala_users (
                email,
                password_hash,
                role,
                merchant_id,
                created_at,
                updated_at
              )

              VALUES (
                $1,
                $2,
                'client',
                NULL,
                NOW(),
                NOW()
              )

              RETURNING *
              `,
              [
                email,
                passwordHash,
              ]
            );

          const user =
            result.rows[0];

          await ensureUserWallet(
            user.id
          );

          return sendJson(
            res,
            201,
            {
              success:
                true,

              token:
                createSessionToken(
                  user
                ),

              user: {
                id:
                  user.id,

                email:
                  user.email,

                role:
                  user.role,

                merchant_id:
                  user.merchant_id,
              },
            }
          );
        }

        // ====================================================
        // CONNEXION
        // ====================================================

        if (
          req.method ===
            "POST" &&
          pathname ===
            "/api/auth/login"
        ) {
          const body =
            await readJsonBody(
              req
            );

          const email =
            normalizeEmail(
              body.email
            );

          const password =
            String(
              body.password ||
              ""
            );

          const result =
            await pool.query(
              `
              SELECT *

              FROM koala_users

              WHERE LOWER(email) =
                LOWER($1)

              LIMIT 1
              `,
              [
                email,
              ]
            );

          if (
            result.rows.length ===
            0
          ) {
            return sendJson(
              res,
              401,
              {
                error:
                  "Email ou mot de passe incorrect.",
              }
            );
          }

          const user =
            result.rows[0];

          const validPassword =
            verifyPassword(
              password,
              user.password_hash,
              user.password_salt ||
                null
            );

          if (
            !validPassword
          ) {
            return sendJson(
              res,
              401,
              {
                error:
                  "Email ou mot de passe incorrect.",
              }
            );
          }

          await ensureUserWallet(
            user.id
          );

          return sendJson(
            res,
            200,
            {
              success:
                true,

              token:
                createSessionToken(
                  user
                ),

              user: {
                id:
                  user.id,

                email:
                  user.email,

                role:
                  user.role ||
                  "client",

                merchant_id:
                  user.merchant_id ||
                  null,
              },
            }
          );
        }

        // ====================================================
        // PROFIL
        // ====================================================

        if (
          req.method ===
            "GET" &&
          (
            pathname ===
              "/api/me" ||
            pathname ===
              "/api/auth/me"
          )
        ) {
          const user =
            await authenticate(
              req
            );

          const merchant =
            user.merchant_id
              ? getMerchantById(
                  user.merchant_id
                )
              : null;

          const wallet =
            await getKoalaWallet(
              user.id
            );

          return sendJson(
            res,
            200,
            {
              user: {
                id:
                  user.id,

                email:
                  user.email,

                role:
                  user.role,

                merchant_id:
                  user.merchant_id,

                merchant_name:
                  merchant
                    ?.name ||
                  null,
              },

              wallet:
                formatKoalaWallet(
                  wallet
                ),
            }
          );
        }

        // ====================================================
        // SOLDE KOALA
        // ====================================================

        if (
          req.method ===
            "GET" &&
          (
            pathname ===
              "/api/wallet" ||
            pathname ===
              "/api/balance"
          )
        ) {
          const user =
            await authenticate(
              req
            );

          const wallet =
            await getKoalaWallet(
              user.id
            );

          return sendJson(
            res,
            200,
            {
              success:
                true,

              wallet:
                formatKoalaWallet(
                  wallet
                ),
            }
          );
        }

        // ====================================================
        // HISTORIQUE SOLDE KOALA
        // ====================================================

        if (
          req.method ===
            "GET" &&
          (
            pathname ===
              "/api/wallet/movements" ||
            pathname ===
              "/api/wallet/transactions"
          )
        ) {
          const user =
            await authenticate(
              req
            );

          const limit =
            Number(
              url.searchParams.get(
                "limit"
              ) ||
              100
            );

          const movements =
            await getWalletMovements(
              user.id,
              limit
            );

          const wallet =
            await getKoalaWallet(
              user.id
            );

          return sendJson(
            res,
            200,
            {
              wallet:
                formatKoalaWallet(
                  wallet
                ),

              movements,
            }
          );
        }

        // ====================================================
        // CRÉER UN DÉPÔT CRYPTO VERS SOLDE KOALA
        // ====================================================

        if (
          req.method ===
            "POST" &&
          (
            pathname ===
              "/api/wallet/deposits" ||
            pathname ===
              "/api/wallet/deposit"
          )
        ) {
          const user =
            await authenticate(
              req
            );

          const body =
            await readJsonBody(
              req
            );

          const cryptoSymbol =
            body.crypto ??
            body.symbol;

          const amountEur =
            body.amount_eur ??
            body.amount ??
            body.amountEur;

          const deposit =
            await createCryptoDeposit({
              userId:
                user.id,

              cryptoSymbol,

              amountEur,
            });

          const qrData =
            String(
              deposit.crypto
            ).toUpperCase() ===
            "BTC"
              ? `bitcoin:${deposit.payment_address}?amount=${Number(
                  deposit.expected_crypto_amount
                ).toFixed(
                  8
                )}`
              : deposit.payment_address;

          return sendJson(
            res,
            201,
            {
              success:
                true,

              message:
                "Dépôt crypto créé.",

              deposit,

              payment: {
                crypto:
                  deposit.crypto,

                network:
                  deposit.network,

                address:
                  deposit.payment_address,

                amount:
                  deposit.expected_crypto_amount,

                qr_data:
                  qrData,
              },
            }
          );
        }

        // ====================================================
        // LISTE DES DÉPÔTS
        // ====================================================

        if (
          req.method ===
            "GET" &&
          pathname ===
            "/api/wallet/deposits"
        ) {
          const user =
            await authenticate(
              req
            );

          const result =
            await pool.query(
              `
              SELECT *

              FROM koala_crypto_deposits

              WHERE user_id =
                $1

              ORDER BY
                created_at DESC

              LIMIT 100
              `,
              [
                user.id,
              ]
            );

          return sendJson(
            res,
            200,
            {
              deposits:
                result.rows.map(
                  formatCryptoDeposit
                ),
            }
          );
        }

        // ====================================================
        // DÉTAIL D'UN DÉPÔT
        // ====================================================

        const depositMatch =
          pathname.match(
            /^\/api\/wallet\/deposits\/([a-zA-Z0-9_-]+)$/
          );

        if (
          req.method ===
            "GET" &&
          depositMatch
        ) {
          const user =
            await authenticate(
              req
            );

          const deposit =
            await getCryptoDepositByToken(
              user.id,
              depositMatch[1]
            );

          if (
            !deposit
          ) {
            return sendJson(
              res,
              404,
              {
                error:
                  "Dépôt introuvable.",
              }
            );
          }

          return sendJson(
            res,
            200,
            {
              deposit:
                formatCryptoDeposit(
                  deposit
                ),
            }
          );
        }

        // ====================================================
        // VÉRIFIER UN DÉPÔT CRYPTO
        // ====================================================

        const depositCheckMatch =
          pathname.match(
            /^\/api\/wallet\/deposits\/([a-zA-Z0-9_-]+)\/check$/
          );

        if (
          req.method ===
            "POST" &&
          depositCheckMatch
        ) {
          const user =
            await authenticate(
              req
            );

          const deposit =
            await getCryptoDepositByToken(
              user.id,
              depositCheckMatch[1]
            );

          if (
            !deposit
          ) {
            return sendJson(
              res,
              404,
              {
                error:
                  "Dépôt introuvable.",
              }
            );
          }

          const body =
            await readJsonBody(
              req
            );

          const txid =
            String(
              body.txid ||
              body.transaction_hash ||
              body.transactionHash ||
              ""
            ).trim();

          if (
            !txid
          ) {
            return sendJson(
              res,
              400,
              {
                error:
                  "Identifiant de transaction requis.",
              }
            );
          }

          const result =
            await checkCryptoDeposit(
              deposit,
              txid
            );

          return sendJson(
            res,
            200,
            result
          );
        }

        // GET également pour les tests

        if (
          req.method ===
            "GET" &&
          depositCheckMatch
        ) {
          const user =
            await authenticate(
              req
            );

          const deposit =
            await getCryptoDepositByToken(
              user.id,
              depositCheckMatch[1]
            );

          if (
            !deposit
          ) {
            return sendJson(
              res,
              404,
              {
                error:
                  "Dépôt introuvable.",
              }
            );
          }

          const txid =
            String(
              url.searchParams.get(
                "txid"
              ) ||
              ""
            ).trim();

          if (
            !txid
          ) {
            return sendJson(
              res,
              400,
              {
                error:
                  "Paramètre txid requis.",
              }
            );
          }

          const result =
            await checkCryptoDeposit(
              deposit,
              txid
            );

          return sendJson(
            res,
            200,
            result
          );
        }

        // ====================================================
        // LISTE DES CRYPTOS
        // ====================================================

        if (
          req.method ===
            "GET" &&
          pathname ===
            "/api/cryptos"
        ) {
          return sendJson(
            res,
            200,
            {
              cryptos: [
                {
                  symbol:
                    "BTC",

                  name:
                    "Bitcoin",

                  network:
                    "Bitcoin",

                  wallet_deposit:
                    true,

                  automatic_verification:
                    true,

                  configured:
                    Boolean(
                      BTC_RECEIVE_ADDRESS
                    ),
                },

                {
                  symbol:
                    "ETH",

                  name:
                    "Ethereum",

                  network:
                    "Ethereum",

                  wallet_deposit:
                    false,

                  automatic_verification:
                    false,

                  configured:
                    Boolean(
                      ETH_WALLET_ADDRESS
                    ),
                },

                {
                  symbol:
                    "USDC",

                  name:
                    "USD Coin",

                  network:
                    "BNB Smart Chain (BEP20)",

                  wallet_deposit:
                    true,

                  automatic_verification:
                    true,

                  configured:
                    Boolean(
                      USDC_WALLET_ADDRESS
                    ),
                },

                {
                  symbol:
                    "USDT",

                  name:
                    "Tether",

                  network:
                    "BNB Smart Chain (BEP20)",

                  wallet_deposit:
                    true,

                  automatic_verification:
                    true,

                  configured:
                    Boolean(
                      USDT_WALLET_ADDRESS
                    ),
                },
              ],
            }
          );
        }

        // ====================================================
        // COURS CRYPTO
        // ====================================================

        if (
          req.method ===
            "GET" &&
          (
            pathname ===
              "/api/crypto-quote" ||
            pathname ===
              "/api/quote"
          )
        ) {
          const cryptoSymbol =
            String(
              url.searchParams.get(
                "crypto"
              ) ||
              url.searchParams.get(
                "symbol"
              ) ||
              ""
            )
              .trim()
              .toUpperCase();

          if (
            !isSupportedCrypto(
              cryptoSymbol
            )
          ) {
            return sendJson(
              res,
              400,
              {
                error:
                  "Crypto non supportée.",
              }
            );
          }

          const price =
            await getCryptoPriceEur(
              cryptoSymbol
            );

          return sendJson(
            res,
            200,
            {
              crypto:
                cryptoSymbol,

              price_eur:
                Number(
                  price
                ),

              network:
                getNetworkForCrypto(
                  cryptoSymbol
                ),

              wallet_configured:
                Boolean(
                  getWalletForCrypto(
                    cryptoSymbol
                  )
                ),
            }
          );
        }

        // ====================================================
        // CRÉATION COMMANDE 3X / 4X
        // ====================================================

        if (
          req.method ===
            "POST" &&
          (
            pathname ===
              "/api/orders" ||
            pathname ===
              "/api/payments"
          )
        ) {
          const user =
            await authenticate(
              req
            );

          const body =
            await readJsonBody(
              req
            );

          const merchantId =
            body.merchant_id ??
            body.merchantId;

          const amountEur =
            body.amount_eur ??
            body.amount ??
            body.amountEur;

          const cryptoSymbol =
            body.crypto ??
            body.crypto_symbol ??
            body.symbol;

          const installmentsCount =
            body.installments_count ??
            body.installments ??
            body.installmentsCount;

          const result =
            await createOrder({
              userId:
                user.id,

              merchantId,

              amountEur,

              cryptoSymbol,

              installmentsCount,
            });

          return sendJson(
            res,
            201,
            result
          );
        }

        // ====================================================
        // COMMANDES CLIENT
        // ====================================================

        if (
          req.method ===
            "GET" &&
          pathname ===
            "/api/orders"
        ) {
          const user =
            await authenticate(
              req
            );

          const orders =
            await getUserOrders(
              user.id
            );

          return sendJson(
            res,
            200,
            {
              orders,
            }
          );
        }

        // ====================================================
        // DÉTAIL COMMANDE
        // ====================================================

        const orderMatch =
          pathname.match(
            /^\/api\/orders\/(\d+)$/
          );

        if (
          req.method ===
            "GET" &&
          orderMatch
        ) {
          const user =
            await authenticate(
              req
            );

          const orderId =
            Number(
              orderMatch[1]
            );

          const result =
            await getUserOrder(
              user.id,
              orderId
            );

          if (
            !result
          ) {
            return sendJson(
              res,
              404,
              {
                error:
                  "Commande introuvable.",
              }
            );
          }

          return sendJson(
            res,
            200,
            result
          );
        }

        // ====================================================
        // TRANSACTIONS CLIENT
        // ====================================================

        if (
          req.method ===
            "GET" &&
          pathname ===
            "/api/transactions"
        ) {
          const user =
            await authenticate(
              req
            );

          const installmentsResult =
            await pool.query(
              `
              SELECT
                i.*,
                o.crypto,
                o.merchant_name

              FROM koala_installments i

              INNER JOIN
                koala_orders o

              ON
                o.id =
                i.order_id

              WHERE
                o.user_id =
                $1

              ORDER BY
                i.created_at DESC
              `,
              [
                user.id,
              ]
            );

          const walletMovements =
            await getWalletMovements(
              user.id,
              100
            );

          const cardTransactions =
            await pool.query(
              `
              SELECT *

              FROM koala_card_transactions

              WHERE user_id =
                $1

              ORDER BY
                created_at DESC

              LIMIT 100
              `,
              [
                user.id,
              ]
            );

          return sendJson(
            res,
            200,
            {
              installments:
                installmentsResult
                  .rows
                  .map(
                    (
                      row
                    ) => ({
                      ...formatInstallment(
                        row
                      ),

                      crypto:
                        row.crypto,

                      merchant_name:
                        row.merchant_name,
                    })
                  ),

              wallet_movements:
                walletMovements,

              card_transactions:
                cardTransactions.rows,
            }
          );
        }

        // ====================================================
        // PAGE PUBLIQUE PAIEMENT
        // ====================================================

        const payMatch =
          pathname.match(
            /^\/pay\/([a-zA-Z0-9_-]+)$/
          );

        if (
          req.method ===
            "GET" &&
          payMatch
        ) {
          const paymentToken =
            payMatch[1];

          const installment =
            await getInstallmentByToken(
              paymentToken
            );

          if (
            !installment
          ) {
            return sendHtml(
              res,
              404,
              `
              <html>
              <body>
              <h1>Paiement introuvable</h1>
              </body>
              </html>
              `
            );
          }

          const orderResult =
            await pool.query(
              `
              SELECT *

              FROM koala_orders

              WHERE id =
                $1

              LIMIT 1
              `,
              [
                installment.order_id,
              ]
            );

          if (
            orderResult.rows.length ===
            0
          ) {
            return sendHtml(
              res,
              404,
              `
              <html>
              <body>
              <h1>Commande introuvable</h1>
              </body>
              </html>
              `
            );
          }

          return sendHtml(
            res,
            200,
            paymentPage(
              installment,
              orderResult.rows[0]
            )
          );
        }

        // ====================================================
        // DÉCLARER UNE ÉCHÉANCE PAYÉE — MODE TEST UNIQUEMENT
        // ====================================================

        const installmentDeclarePaidMatch =
          pathname.match(
            /^\/api\/installments\/([a-zA-Z0-9_-]+)\/declare-paid$/
          );

        if (
          req.method ===
            "POST" &&
          installmentDeclarePaidMatch
        ) {
          const testMode =
            String(
              process.env.KOALA_TEST_MODE ||
              ""
            )
              .trim()
              .toLowerCase() ===
            "true";

          if (!testMode) {
            return sendJson(
              res,
              403,
              {
                error:
                  "Mode test désactivé. Aucun paiement n'a été simulé.",
                paid: false,
                detected: false,
              }
            );
          }

          const installment =
            await getInstallmentByToken(
              installmentDeclarePaidMatch[1]
            );

          if (!installment) {
            return sendJson(
              res,
              404,
              {
                error:
                  "Échéance introuvable.",
              }
            );
          }

          // En mode test, les échéances sont validées dans l’ordre.
          // Un clic ne peut modifier que l’échéance correspondant à ce token.
          const previousUnpaid =
            await pool.query(
              `
              SELECT COUNT(*)::int AS count
              FROM koala_installments
              WHERE order_id = $1
                AND number < $2
                AND UPPER(COALESCE(status, '')) NOT IN ('PAYEE', 'PAID')
              `,
              [
                installment.order_id,
                installment.number,
              ]
            );

          if (Number(previousUnpaid.rows[0]?.count || 0) > 0) {
            return sendJson(
              res,
              409,
              {
                error:
                  "L’échéance précédente doit être payée avant celle-ci.",
                paid: false,
                detected: false,
                test_mode: true,
              }
            );
          }

          if (
            String(installment.status || "")
              .trim()
              .toUpperCase() !==
            "PAYEE"
          ) {
            await pool.query(
              `
              UPDATE koala_installments

              SET
                status = 'PAYEE',
                txid = COALESCE(txid, $1),
                confirmations = GREATEST(COALESCE(confirmations, 0), 1),
                detected_at = COALESCE(detected_at, NOW()),
                paid_at = COALESCE(paid_at, NOW()),
                updated_at = NOW()

              WHERE id = $2
              `,
              [
                "TEST-" +
                  String(installment.payment_token || installment.id),
                installment.id,
              ]
            );

            await updateOrderStatus(
              installment.order_id
            );
          }

          const updated =
            await getInstallmentById(
              installment.id
            );

          return sendJson(
            res,
            200,
            {
              success: true,
              paid: true,
              detected: true,
              automatic: false,
              test_mode: true,
              message:
                "Paiement simulé en mode test.",
              installment:
                formatInstallment(updated),
            }
          );
        }

        // ====================================================
        // VÉRIFIER ÉCHÉANCE
        // ====================================================

        const installmentCheckMatch =
          pathname.match(
            /^\/api\/installments\/([a-zA-Z0-9_-]+)\/check$/
          );

        if (
          (
            req.method ===
              "GET" ||
            req.method ===
              "POST"
          ) &&
          installmentCheckMatch
        ) {
          const installment =
            await getInstallmentByToken(
              installmentCheckMatch[1]
            );

          if (
            !installment
          ) {
            return sendJson(
              res,
              404,
              {
                error:
                  "Échéance introuvable.",
              }
            );
          }

          const result =
            await checkInstallmentPayment(
              installment
            );

          return sendJson(
            res,
            200,
            result
          );
        }

        // ====================================================
        // CARTE KOALA
        // ====================================================

        if (
          req.method ===
            "GET" &&
          pathname ===
            "/api/card"
        ) {
          const user =
            await authenticate(
              req
            );

          const card =
            await getKoalaCard(
              user.id
            );

          const wallet =
            await getKoalaWallet(
              user.id
            );

          return sendJson(
            res,
            200,
            {
              card:
                formatKoalaCard(
                  card
                ),

              wallet:
                formatKoalaWallet(
                  wallet
                ),

              provider:
                "marqeta",

              marqeta_configured:
                isMarqetaConfigured(),

              environment:
                MARQETA_BASE_URL.includes(
                  "sandbox-api.marqeta.com"
                )
                  ? "sandbox"
                  : "production",

              test_mode:
                MARQETA_BASE_URL.includes(
                  "sandbox-api.marqeta.com"
                ),
            }
          );
        }

        // ====================================================
        // CRÉER CARTE KOALA
        // ====================================================

        if (
          req.method ===
            "POST" &&
          pathname ===
            "/api/card/create"
        ) {
          const user =
            await authenticate(
              req
            );

          ensureMarqetaConfigured();

          const existing =
            await getKoalaCard(
              user.id
            );

          if (
            existing
          ) {
            return sendJson(
              res,
              409,
              {
                error:
                  "Une Carte Koala existe déjà.",

                card:
                  formatKoalaCard(
                    existing
                  ),
              }
            );
          }

          const body =
            await readJsonBody(
              req
            );

          const name =
            String(
              body.name ||
              body.holder_name ||
              ""
            ).trim();

          const phoneNumber =
            String(
              body.phone_number ||
              ""
            ).trim();

          const addressLine1 =
            String(
              body.address_line1 ||
              ""
            ).trim();

          const addressLine2 =
            String(
              body.address_line2 ||
              ""
            ).trim();

          const postalCode =
            String(
              body.postal_code ||
              ""
            ).trim();

          const city =
            String(
              body.city ||
              ""
            ).trim();

          const country =
            String(
              body.country ||
              "FR"
            )
              .trim()
              .toUpperCase();

          if (
            !name
          ) {
            return sendJson(
              res,
              400,
              {
                error:
                  "Nom du titulaire obligatoire.",
              }
            );
          }

          if (
            !addressLine1
          ) {
            return sendJson(
              res,
              400,
              {
                error:
                  "Adresse obligatoire.",
              }
            );
          }

          if (
            !postalCode
          ) {
            return sendJson(
              res,
              400,
              {
                error:
                  "Code postal obligatoire.",
              }
            );
          }

          if (
            !city
          ) {
            return sendJson(
              res,
              400,
              {
                error:
                  "Ville obligatoire.",
              }
            );
          }

          const product =
            await getMarqetaCardProduct();

          const marqetaUser =
            await createMarqetaUser({
              user,
              name,
            });

          const marqetaCard =
            await createMarqetaVirtualCard({
              marqetaUserToken:
                marqetaUser.token,

              cardProductToken:
                product.token,
            });

          const expiration =
            String(
              marqetaCard.expiration ||
              ""
            );

          let expMonth =
            null;

          let expYear =
            null;

          if (
            /^\d{4}$/.test(
              expiration
            )
          ) {
            expMonth =
              Number(
                expiration.slice(
                  0,
                  2
                )
              );

            expYear =
              2000 +
              Number(
                expiration.slice(
                  2
                )
              );
          }

          const cardStatus =
            String(
              marqetaCard.state ||
              "ACTIVE"
            ).toLowerCase();

          const result =
            await pool.query(
              `
              INSERT INTO koala_cards (
                user_id,

                card_provider,

                marqeta_user_token,

                marqeta_card_token,

                marqeta_card_product_token,

                holder_name,

                phone_number,

                address_line1,

                address_line2,

                postal_code,

                city,

                country,

                brand,

                last4,

                exp_month,

                exp_year,

                currency,

                card_type,

                status,

                livemode,

                created_at,

                updated_at
              )

              VALUES (
                $1,

                'marqeta',

                $2,

                $3,

                $4,

                $5,

                $6,

                $7,

                $8,

                $9,

                $10,

                $11,

                'Marqeta',

                $12,

                $13,

                $14,

                'eur',

                'virtual',

                $15,

                FALSE,

                NOW(),

                NOW()
              )

              RETURNING *
              `,
              [
                user.id,

                marqetaUser.token,

                marqetaCard.token,

                product.token,

                name,

                phoneNumber ||
                  null,

                addressLine1,

                addressLine2 ||
                  null,

                postalCode,

                city,

                country,

                marqetaCard.last_four ||
                  null,

                expMonth,

                expYear,

                cardStatus,
              ]
            );

          await ensureUserWallet(
            user.id
          );

          return sendJson(
            res,
            201,
            {
              success:
                true,

              provider:
                "marqeta",

              environment:
                "sandbox",

              message:
                "Carte Koala virtuelle créée avec Marqeta Sandbox.",

              card:
                formatKoalaCard(
                  result.rows[0]
                ),
            }
          );
        }

        // ====================================================
        // BLOQUER CARTE
        // ====================================================

        if (
          req.method ===
            "POST" &&
          pathname ===
            "/api/card/freeze"
        ) {
          const user =
            await authenticate(
              req
            );

          ensureMarqetaConfigured();

          const card =
            await getKoalaCard(
              user.id
            );

          if (
            !card
          ) {
            return sendJson(
              res,
              404,
              {
                error:
                  "Carte Koala introuvable.",
              }
            );
          }

          if (
            String(
              card.card_provider ||
              ""
            ).toLowerCase() !==
            "marqeta"
          ) {
            return sendJson(
              res,
              400,
              {
                error:
                  "Cette carte n'est pas une carte Marqeta.",
              }
            );
          }

          if (
            !card.marqeta_card_token
          ) {
            return sendJson(
              res,
              400,
              {
                error:
                  "Token Marqeta de la carte manquant.",
              }
            );
          }

          await updateMarqetaCardStatus(
            card.marqeta_card_token,
            "SUSPENDED"
          );

          const result =
            await pool.query(
              `
              UPDATE koala_cards

              SET
                status =
                  'suspended',

                updated_at =
                  NOW()

              WHERE user_id =
                $1

              RETURNING *
              `,
              [
                user.id,
              ]
            );

          return sendJson(
            res,
            200,
            {
              success:
                true,

              message:
                "Carte Koala bloquée temporairement.",

              card:
                formatKoalaCard(
                  result.rows[0]
                ),
            }
          );
        }

        // ====================================================
        // RÉACTIVER CARTE
        // ====================================================

        if (
          req.method ===
            "POST" &&
          (
            pathname ===
              "/api/card/unfreeze" ||
            pathname ===
              "/api/card/activate"
          )
        ) {
          const user =
            await authenticate(
              req
            );

          ensureMarqetaConfigured();

          const card =
            await getKoalaCard(
              user.id
            );

          if (
            !card
          ) {
            return sendJson(
              res,
              404,
              {
                error:
                  "Carte Koala introuvable.",
              }
            );
          }

          if (
            String(
              card.card_provider ||
              ""
            ).toLowerCase() !==
            "marqeta"
          ) {
            return sendJson(
              res,
              400,
              {
                error:
                  "Cette carte n'est pas une carte Marqeta.",
              }
            );
          }

          if (
            !card.marqeta_card_token
          ) {
            return sendJson(
              res,
              400,
              {
                error:
                  "Token Marqeta de la carte manquant.",
              }
            );
          }

          await updateMarqetaCardStatus(
            card.marqeta_card_token,
            "ACTIVE"
          );

          const result =
            await pool.query(
              `
              UPDATE koala_cards

              SET
                status =
                  'active',

                updated_at =
                  NOW()

              WHERE user_id =
                $1

              RETURNING *
              `,
              [
                user.id,
              ]
            );

          return sendJson(
            res,
            200,
            {
              success:
                true,

              message:
                "Carte Koala réactivée.",

              card:
                formatKoalaCard(
                  result.rows[0]
                ),
            }
          );
        }

        // ====================================================
        // SIMULER UN ACHAT CARTE — SANDBOX UNIQUEMENT
        // ====================================================

        if (
          req.method ===
            "POST" &&
          pathname ===
            "/api/card/simulate-purchase"
        ) {
          const user =
            await authenticate(
              req
            );

          if (
            !MARQETA_BASE_URL.includes(
              "sandbox-api.marqeta.com"
            )
          ) {
            return sendJson(
              res,
              403,
              {
                error:
                  "La simulation est disponible uniquement dans Marqeta Sandbox.",
              }
            );
          }

          const body =
            await readJsonBody(
              req
            );

          const amountEur =
            body.amount_eur ??
            body.amount ??
            body.amountEur;

          const merchantName =
            String(
              body.merchant_name ||
              body.merchant ||
              "Marchand Sandbox"
            ).trim();

          const result =
            await simulateKoalaCardPurchase({
              userId:
                user.id,

              amountEur,

              merchantName,
            });

          return sendJson(
            res,
            200,
            result
          );
        }

        // ====================================================
        // HISTORIQUE CARTE
        // ====================================================

        if (
          req.method ===
            "GET" &&
          pathname ===
            "/api/card/transactions"
        ) {
          const user =
            await authenticate(
              req
            );

          const result =
            await pool.query(
              `
              SELECT *

              FROM koala_card_transactions

              WHERE user_id =
                $1

              ORDER BY
                created_at DESC

              LIMIT 100
              `,
              [
                user.id,
              ]
            );

          return sendJson(
            res,
            200,
            {
              transactions:
                result.rows,
            }
          );
        }

        // ====================================================
        // ADMIN — ACTIVER MARCHAND
        // ====================================================

        if (
          req.method ===
            "POST" &&
          pathname ===
            "/api/admin/merchant/activate"
        ) {
          authenticateAdmin(
            req
          );

          const body =
            await readJsonBody(
              req
            );

          const email =
            normalizeEmail(
              body.email
            );

          const merchantId =
            Number(
              body.merchant_id
            );

          const merchant =
            getMerchantById(
              merchantId
            );

          if (
            !merchant
          ) {
            return sendJson(
              res,
              404,
              {
                error:
                  "Marchand introuvable.",
              }
            );
          }

          const result =
            await pool.query(
              `
              UPDATE koala_users

              SET
                role =
                  'merchant',

                merchant_id =
                  $1,

                updated_at =
                  NOW()

              WHERE LOWER(email) =
                LOWER($2)

              RETURNING *
              `,
              [
                merchantId,
                email,
              ]
            );

          if (
            result.rows.length ===
            0
          ) {
            return sendJson(
              res,
              404,
              {
                error:
                  "Utilisateur introuvable.",
              }
            );
          }

          return sendJson(
            res,
            200,
            {
              success:
                true,

              message:
                `Compte marchand activé pour ${merchant.name}.`,

              user: {
                id:
                  result.rows[0]
                    .id,

                email:
                  result.rows[0]
                    .email,

                role:
                  result.rows[0]
                    .role,

                merchant_id:
                  result.rows[0]
                    .merchant_id,
              },
            }
          );
        }

        // ====================================================
        // DASHBOARD MARCHAND
        // ====================================================

        if (
          req.method ===
            "GET" &&
          pathname ===
            "/api/merchant/dashboard"
        ) {
          const user =
            await authenticateMerchant(
              req
            );

          const ordersResult =
            await pool.query(
              `
              SELECT
                COUNT(*) AS count,

                COALESCE(
                  SUM(
                    amount_eur
                  ),
                  0
                ) AS total

              FROM koala_orders

              WHERE merchant_id =
                $1
              `,
              [
                user.merchant_id,
              ]
            );

          const settlementResult =
            await pool.query(
              `
              SELECT
                COALESCE(
                  SUM(
                    received_eur
                  ),
                  0
                ) AS received,

                COALESCE(
                  SUM(
                    refunded_eur
                  ),
                  0
                ) AS refunded,

                COALESCE(
                  SUM(
                    payable_eur
                  ),
                  0
                ) AS payable

              FROM koala_merchant_settlements

              WHERE merchant_id =
                $1
              `,
              [
                user.merchant_id,
              ]
            );

          const merchant =
            getMerchantById(
              user.merchant_id
            );

          return sendJson(
            res,
            200,
            {
              merchant: {
                id:
                  user.merchant_id,

                name:
                  merchant
                    ?.name ||
                  null,
              },

              summary: {
                orders_count:
                  Number(
                    ordersResult
                      .rows[0]
                      ?.count ||
                    0
                  ),

                sales_total_eur:
                  Number(
                    ordersResult
                      .rows[0]
                      ?.total ||
                    0
                  ),

                received_eur:
                  Number(
                    settlementResult
                      .rows[0]
                      ?.received ||
                    0
                  ),

                refunded_eur:
                  Number(
                    settlementResult
                      .rows[0]
                      ?.refunded ||
                    0
                  ),

                payable_eur:
                  Number(
                    settlementResult
                      .rows[0]
                      ?.payable ||
                    0
                  ),
              },
            }
          );
        }

        // ====================================================
        // COMMANDES MARCHAND
        // ====================================================

        if (
          req.method ===
            "GET" &&
          pathname ===
            "/api/merchant/orders"
        ) {
          const user =
            await authenticateMerchant(
              req
            );

          const result =
            await pool.query(
              `
              SELECT *

              FROM koala_orders

              WHERE merchant_id =
                $1

              ORDER BY
                created_at DESC
              `,
              [
                user.merchant_id,
              ]
            );

          return sendJson(
            res,
            200,
            {
              orders:
                result.rows.map(
                  formatOrder
                ),
            }
          );
        }

        // ====================================================
        // SETTLEMENTS MARCHAND
        // ====================================================

        if (
          req.method ===
            "GET" &&
          pathname ===
            "/api/merchant/settlements"
        ) {
          const user =
            await authenticateMerchant(
              req
            );

          const result =
            await pool.query(
              `
              SELECT *

              FROM koala_merchant_settlements

              WHERE merchant_id =
                $1

              ORDER BY
                created_at DESC
              `,
              [
                user.merchant_id,
              ]
            );

          return sendJson(
            res,
            200,
            {
              settlements:
                result.rows.map(
                  formatSettlement
                ),
            }
          );
        }

        // ====================================================
        // DEMANDE VERSEMENT MARCHAND
        // ====================================================

        const payoutMatch =
          pathname.match(
            /^\/api\/merchant\/settlements\/(\d+)\/request-payout$/
          );

        if (
          req.method ===
            "POST" &&
          payoutMatch
        ) {
          const user =
            await authenticateMerchant(
              req
            );

          const settlementId =
            Number(
              payoutMatch[1]
            );

          const settlementResult =
            await pool.query(
              `
              SELECT *

              FROM koala_merchant_settlements

              WHERE
                id = $1
                AND merchant_id = $2

              LIMIT 1
              `,
              [
                settlementId,
                user.merchant_id,
              ]
            );

          if (
            settlementResult.rows.length ===
            0
          ) {
            return sendJson(
              res,
              404,
              {
                error:
                  "Règlement marchand introuvable.",
              }
            );
          }

          const settlement =
            settlementResult.rows[0];

          if (
            Number(
              settlement.payable_eur ||
              0
            ) <= 0
          ) {
            return sendJson(
              res,
              400,
              {
                error:
                  "Aucun montant n'est disponible pour versement.",
              }
            );
          }

          if (
            settlement.status ===
            "paid"
          ) {
            return sendJson(
              res,
              400,
              {
                error:
                  "Ce règlement a déjà été versé.",
              }
            );
          }

          const reference =
            `KOALA-PAYOUT-${settlement.id}-${randomHex(
              4
            ).toUpperCase()}`;

          const updated =
            await pool.query(
              `
              UPDATE koala_merchant_settlements

              SET
                status =
                  'payout_requested',

                payout_requested_at =
                  NOW(),

                payout_reference =
                  COALESCE(
                    payout_reference,
                    $1
                  ),

                updated_at =
                  NOW()

              WHERE id =
                $2

              RETURNING *
              `,
              [
                reference,
                settlement.id,
              ]
            );

          return sendJson(
            res,
            200,
            {
              success:
                true,

              message:
                "Demande de versement enregistrée.",

              settlement:
                formatSettlement(
                  updated.rows[0]
                ),
            }
          );
        }

        // ====================================================
        // ANNULER COMMANDE MARCHAND
        // ====================================================

        const cancelOrderMatch =
          pathname.match(
            /^\/api\/merchant\/orders\/(\d+)\/cancel$/
          );

        if (
          req.method ===
            "POST" &&
          cancelOrderMatch
        ) {
          const user =
            await authenticateMerchant(
              req
            );

          const orderId =
            Number(
              cancelOrderMatch[1]
            );

          const orderResult =
            await pool.query(
              `
              SELECT *

              FROM koala_orders

              WHERE
                id = $1
                AND merchant_id = $2

              LIMIT 1
              `,
              [
                orderId,
                user.merchant_id,
              ]
            );

          if (
            orderResult.rows.length ===
            0
          ) {
            return sendJson(
              res,
              404,
              {
                error:
                  "Commande introuvable.",
              }
            );
          }

          const paidResult =
            await pool.query(
              `
              SELECT
                COUNT(*) AS count

              FROM koala_installments

              WHERE
                order_id = $1

                AND UPPER(
                  status
                )
                IN (
                  'PAYEE',
                  'PAID'
                )
              `,
              [
                orderId,
              ]
            );

          if (
            Number(
              paidResult
                .rows[0]
                ?.count ||
              0
            ) > 0
          ) {
            return sendJson(
              res,
              400,
              {
                error:
                  "Une commande déjà payée totalement ou partiellement ne peut pas être simplement annulée.",
              }
            );
          }

          await pool.query(
            `
            UPDATE koala_orders

            SET
              status =
                'cancelled',

              updated_at =
                NOW()

            WHERE id =
              $1
            `,
            [
              orderId,
            ]
          );

          await pool.query(
            `
            UPDATE koala_installments

            SET
              status =
                'ANNULEE',

              updated_at =
                NOW()

            WHERE order_id =
              $1
            `,
            [
              orderId,
            ]
          );

          await pool.query(
            `
            UPDATE koala_merchant_settlements

            SET
              status =
                'cancelled',

              payable_eur =
                0,

              updated_at =
                NOW()

            WHERE order_id =
              $1
            `,
            [
              orderId,
            ]
          );

          return sendJson(
            res,
            200,
            {
              success:
                true,

              message:
                "Commande annulée.",
            }
          );
        }

        // ====================================================
        // REMBOURSEMENT
        // ====================================================

        const refundOrderMatch =
          pathname.match(
            /^\/api\/merchant\/orders\/(\d+)\/refund$/
          );

        if (
          req.method ===
            "POST" &&
          refundOrderMatch
        ) {
          const user =
            await authenticateMerchant(
              req
            );

          const orderId =
            Number(
              refundOrderMatch[1]
            );

          const body =
            await readJsonBody(
              req
            );

          const amount =
            roundEur(
              Number(
                body.amount_eur ??
                body.amount ??
                0
              )
            );

          const reason =
            String(
              body.reason ||
              ""
            ).trim();

          if (
            !Number.isFinite(
              amount
            ) ||
            amount <=
            0
          ) {
            return sendJson(
              res,
              400,
              {
                error:
                  "Montant de remboursement invalide.",
              }
            );
          }

          const orderResult =
            await pool.query(
              `
              SELECT *

              FROM koala_orders

              WHERE
                id = $1
                AND merchant_id = $2

              LIMIT 1
              `,
              [
                orderId,
                user.merchant_id,
              ]
            );

          if (
            orderResult.rows.length ===
            0
          ) {
            return sendJson(
              res,
              404,
              {
                error:
                  "Commande introuvable.",
              }
            );
          }

          await updateMerchantSettlement(
            orderId
          );

          const settlementResult =
            await pool.query(
              `
              SELECT *

              FROM koala_merchant_settlements

              WHERE order_id =
                $1

              LIMIT 1
              `,
              [
                orderId,
              ]
            );

          const settlement =
            settlementResult.rows[0];

          const received =
            Number(
              settlement
                ?.received_eur ||
              0
            );

          const alreadyRefunded =
            Number(
              settlement
                ?.refunded_eur ||
              0
            );

          const maximumRefund =
            roundEur(
              Math.max(
                0,
                received -
                alreadyRefunded
              )
            );

          if (
            amount >
            maximumRefund
          ) {
            return sendJson(
              res,
              400,
              {
                error:
                  `Le remboursement maximum disponible est de ${maximumRefund.toFixed(
                    2
                  )} €`,
              }
            );
          }

          const reference =
            `KOALA-REFUND-${orderId}-${randomHex(
              5
            ).toUpperCase()}`;

          const refundResult =
            await pool.query(
              `
              INSERT INTO koala_refunds (
                order_id,
                merchant_id,
                amount_eur,
                reason,
                status,
                reference,
                completed_at,
                created_at,
                updated_at
              )

              VALUES (
                $1,
                $2,
                $3,
                $4,
                'completed',
                $5,
                NOW(),
                NOW(),
                NOW()
              )

              RETURNING *
              `,
              [
                orderId,
                user.merchant_id,
                amount,
                reason ||
                  null,
                reference,
              ]
            );

          await updateMerchantSettlement(
            orderId
          );

          return sendJson(
            res,
            201,
            {
              success:
                true,

              message:
                "Remboursement enregistré.",

              refund:
                formatRefund(
                  refundResult.rows[0]
                ),
            }
          );
        }

        // ====================================================
        // REMBOURSEMENTS MARCHAND
        // ====================================================

        if (
          req.method ===
            "GET" &&
          pathname ===
            "/api/merchant/refunds"
        ) {
          const user =
            await authenticateMerchant(
              req
            );

          const result =
            await pool.query(
              `
              SELECT *

              FROM koala_refunds

              WHERE merchant_id =
                $1

              ORDER BY
                created_at DESC
              `,
              [
                user.merchant_id,
              ]
            );

          return sendJson(
            res,
            200,
            {
              refunds:
                result.rows.map(
                  formatRefund
                ),
            }
          );
        }

        // ====================================================
        // RÉCONCILIATION
        // ====================================================

        if (
          req.method ===
            "GET" &&
          pathname ===
            "/api/merchant/reconciliation"
        ) {
          const user =
            await authenticateMerchant(
              req
            );

          const result =
            await pool.query(
              `
              SELECT
                o.id AS order_id,

                o.amount_eur,

                o.crypto,

                o.status,

                o.created_at,

                COALESCE(
                  s.received_eur,
                  0
                ) AS received_eur,

                COALESCE(
                  s.refunded_eur,
                  0
                ) AS refunded_eur,

                COALESCE(
                  s.payable_eur,
                  0
                ) AS payable_eur,

                s.status AS
                  settlement_status,

                s.payout_reference

              FROM koala_orders o

              LEFT JOIN
                koala_merchant_settlements s

              ON
                s.order_id =
                o.id

              WHERE
                o.merchant_id =
                $1

              ORDER BY
                o.created_at DESC
              `,
              [
                user.merchant_id,
              ]
            );

          return sendJson(
            res,
            200,
            {
              reconciliation:
                result.rows,
            }
          );
        }

        // ====================================================
        // ROUTE INTROUVABLE
        // ====================================================

        return sendJson(
          res,
          404,
          {
            error:
              "Route introuvable.",

            method:
              req.method,

            path:
              pathname,
          }
        );

      } catch (
        error
      ) {
        console.error(
          "Erreur serveur :",
          error
        );

        const statusCode =
          Number(
            error.statusCode ||
            500
          );

        const publicMessage =
          statusCode >=
          500
            ? "Une erreur est survenue."
            : error.message;

        return sendJson(
          res,
          statusCode,
          {
            error:
              publicMessage,

            marqeta_code:
              error.marqetaCode ||
              undefined,

            details:
              process.env.NODE_ENV ===
                "development"
                ? error.message
                : undefined,
          }
        );
      }
    }
  );

// ============================================================
// ARRÊT PROPRE
// ============================================================

async function shutdown(
  signal
) {
  console.log(
    `${signal} reçu. Arrêt de Koala Crypto...`
  );

  try {
    await new Promise(
      (
        resolve
      ) => {
        server.close(
          resolve
        );
      }
    );
  } catch (
    error
  ) {
    console.error(
      "Erreur fermeture serveur :",
      error.message
    );
  }

  try {
    await pool.end();
  } catch (
    error
  ) {
    console.error(
      "Erreur fermeture PostgreSQL :",
      error.message
    );
  }

  process.exit(
    0
  );
}

process.on(
  "SIGTERM",
  () => {
    shutdown(
      "SIGTERM"
    );
  }
);

process.on(
  "SIGINT",
  () => {
    shutdown(
      "SIGINT"
    );
  }
);

process.on(
  "unhandledRejection",
  (
    reason
  ) => {
    console.error(
      "Unhandled Rejection :",
      reason
    );
  }
);

process.on(
  "uncaughtException",
  (
    error
  ) => {
    console.error(
      "Uncaught Exception :",
      error
    );
  }
);

// ============================================================
// DÉMARRAGE
// ============================================================

async function start() {
  try {

    if (
      !DATABASE_URL
    ) {
      throw new Error(
        "DATABASE_URL n'est pas configurée."
      );
    }

    await pool.query(
      "SELECT NOW()"
    );

    console.log(
      "PostgreSQL connecté."
    );

    // ========================================================
    // MIGRATIONS
    // ========================================================

    await initDatabase();

    // ========================================================
    // CONFIGURATION
    // ========================================================

    console.log(
      "======================================"
    );

    console.log(
      "Koala Crypto"
    );

    console.log(
      "======================================"
    );

    console.log(
      "BTC :",
      BTC_RECEIVE_ADDRESS
        ? "OK"
        : "NON CONFIGURÉ"
    );

    console.log(
      "ETH :",
      ETH_WALLET_ADDRESS
        ? "OK"
        : "NON CONFIGURÉ"
    );

    console.log(
      "USDC :",
      USDC_WALLET_ADDRESS
        ? "OK"
        : "NON CONFIGURÉ"
    );

    console.log(
      "USDT :",
      USDT_WALLET_ADDRESS
        ? "OK"
        : "NON CONFIGURÉ"
    );

    console.log(
      "Marqeta :",
      isMarqetaConfigured()
        ? (
            MARQETA_BASE_URL.includes(
              "sandbox-api.marqeta.com"
            )
              ? "SANDBOX CONFIGURÉ"
              : "CONFIGURÉ"
          )
        : "NON CONFIGURÉ"
    );

    console.log(
      "Stripe :",
      STRIPE_SECRET_KEY
        ? (
            STRIPE_SECRET_KEY.startsWith(
              "sk_test_"
            )
              ? "TEST CONFIGURÉ"
              : "CONFIGURÉ"
          )
        : "NON CONFIGURÉ"
    );

    console.log(
      "Solde Koala : OK"
    );

    console.log(
      "Dépôts crypto : BTC / USDC / USDT"
    );

    console.log(
      "Carte Koala + solde : OK"
    );

    console.log(
      "Paiements 3x / 4x : OK"
    );

    console.log(
      "======================================"
    );

    // ========================================================
    // SERVEUR
    // ========================================================

    server.listen(
      PORT,
      "0.0.0.0",
      () => {
        console.log(
          `Koala Crypto API démarrée sur le port ${PORT}`
        );

        console.log(
          `URL : ${BASE_URL}`
        );
      }
    );

  } catch (
    error
  ) {
    console.error(
      "Impossible de démarrer Koala Crypto :",
      error
    );

    try {
      await pool.end();
    } catch {}

    process.exit(
      1
    );
  }
}

start();