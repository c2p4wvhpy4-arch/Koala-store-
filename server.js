
const express = require("express");
const path = require("path");
const Stripe = require("stripe");

const app = express();
const PORT = Number(process.env.PORT || 10000);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const products = [
  { id: 1, name: "Robe fluide élégante", category: "Femme", price: 29.99, oldPrice: 39.99, rating: 4.8, badge: "-25%", image: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=900&q=80", colors:["Noir","Beige","Rouge"], sizes:["XS","S","M","L","XL"]},
  { id: 2, name: "Ensemble casual premium", category: "Femme", price: 34.90, oldPrice: 44.90, rating: 4.7, badge: "Tendance", image: "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80", colors:["Beige","Noir"], sizes:["S","M","L","XL"]},
  { id: 3, name: "Sweat oversize unisexe", category: "Homme", price: 26.50, oldPrice: 32.50, rating: 4.6, badge: "Best-seller", image: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=900&q=80", colors:["Gris","Noir","Vert"], sizes:["S","M","L","XL","XXL"]},
  { id: 4, name: "Chemise urbaine", category: "Homme", price: 24.99, oldPrice: 29.99, rating: 4.5, badge: "-17%", image: "https://images.unsplash.com/photo-1603252109303-2751441dd157?auto=format&fit=crop&w=900&q=80", colors:["Blanc","Bleu","Noir"], sizes:["S","M","L","XL"]},
  { id: 5, name: "Baskets minimalistes", category: "Chaussures", price: 39.99, oldPrice: 49.99, rating: 4.9, badge: "Nouveau", image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80", colors:["Blanc","Noir"], sizes:["36","37","38","39","40","41","42","43"]},
  { id: 6, name: "Sac bandoulière chic", category: "Accessoires", price: 22.90, oldPrice: 28.90, rating: 4.8, badge: "Top ventes", image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=80", colors:["Noir","Camel","Crème"], sizes:["Unique"]},
  { id: 7, name: "Veste denim moderne", category: "Femme", price: 42.00, oldPrice: 52.00, rating: 4.7, badge: "-19%", image: "https://images.unsplash.com/photo-1544966503-7cc5ac882d5f?auto=format&fit=crop&w=900&q=80", colors:["Bleu","Noir"], sizes:["S","M","L","XL"]},
  { id: 8, name: "Pantalon cargo street", category: "Homme", price: 31.99, oldPrice: 38.99, rating: 4.6, badge: "Tendance", image: "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?auto=format&fit=crop&w=900&q=80", colors:["Kaki","Noir","Beige"], sizes:["S","M","L","XL"]}
];

app.get("/api/products", (req, res) => {
  const q = String(req.query.q || "").toLowerCase();
  const category = String(req.query.category || "");
  let result = products;
  if (q) result = result.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
  if (category && category !== "Tous") result = result.filter(p => p.category === category);
  res.json(result);
});

app.get("/api/products/:id", (req, res) => {
  const product = products.find(p => p.id === Number(req.params.id));
  if (!product) return res.status(404).json({ error: "Produit introuvable" });
  res.json(product);
});

app.post("/api/create-checkout-session", async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: "Panier vide" });
    if (!stripe) return res.status(503).json({ error: "Stripe non configuré sur Render." });

    const line_items = items.map(item => {
      const p = products.find(x => x.id === Number(item.id));
      if (!p) throw new Error("Produit introuvable");
      const qty = Math.max(1, Math.min(10, Number(item.qty) || 1));
      return {
        quantity: qty,
        price_data: {
          currency: "eur",
          unit_amount: Math.round(p.price * 100),
          product_data: {
            name: p.name,
            images: [p.image],
            metadata: {
              color: item.color || "",
              size: item.size || ""
            }
          }
        }
      };
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: `${BASE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/cart.html`,
      billing_address_collection: "required",
      shipping_address_collection: { allowed_countries: ["FR","BE","LU","DE","ES","IT","NL","PT"] }
    });

    res.json({ url: session.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "Erreur Stripe" });
  }
});

app.get("/health", (req, res) => res.json({ app: "Koala Store", status: "online", stripe: !!stripe }));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Koala Store démarré sur le port ${PORT}`);
});
