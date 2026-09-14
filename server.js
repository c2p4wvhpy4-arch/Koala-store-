const express=require("express");
const path=require("path");
const Stripe=require("stripe");
const app=express();
const PORT=Number(process.env.PORT||10000);
const BASE_URL=(process.env.BASE_URL||`http://localhost:${PORT}`).replace(/\/+$/,"");
const KOALA_CRYPTO_URL=(process.env.KOALA_CRYPTO_URL||"https://koala6.onrender.com").replace(/\/+$/,"");
const stripe=process.env.STRIPE_SECRET_KEY?new Stripe(process.env.STRIPE_SECRET_KEY):null;
app.use(express.json()); app.use(express.static(path.join(__dirname,"public")));
const products=[
{id:1,name:"Robe fluide élégante",price:29.99,image:"https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=900&q=80"},
{id:2,name:"Ensemble casual premium",price:34.90,image:"https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80"},
{id:3,name:"Sweat oversize",price:26.50,image:"https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=900&q=80"},
{id:4,name:"Baskets minimalistes",price:39.99,image:"https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80"}
];
app.get("/api/products",(q,r)=>r.json(products));
app.post("/api/create-checkout-session",async(req,res)=>{
 try{
  if(!stripe)return res.status(503).json({error:"Stripe non configuré"});
  const items=req.body.items||[];
  const line_items=items.map(i=>{const p=products.find(x=>x.id==i.id);return{quantity:i.qty||1,price_data:{currency:"eur",unit_amount:Math.round(p.price*100),product_data:{name:p.name,images:[p.image]}}}});
  const s=await stripe.checkout.sessions.create({mode:"payment",line_items,success_url:`${BASE_URL}/success.html`,cancel_url:`${BASE_URL}/cart.html`});
  res.json({url:s.url});
 }catch(e){res.status(500).json({error:e.message})}
});
app.post("/api/koala-crypto/create-order",async(req,res)=>{
 try{
  const items=req.body.items||[];
  const amountEur=Number(items.reduce((s,i)=>{const p=products.find(x=>x.id==i.id);return s+(p?p.price*(i.qty||1):0)},0).toFixed(2));
  const response=await fetch(`${KOALA_CRYPTO_URL}/api/orders`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({merchantId:1,amountEur,crypto:req.body.crypto||"BTC",installmentsCount:Number(req.body.installmentsCount)||3})});
  const d=await response.json().catch(()=>({}));
  if(!response.ok)return res.status(response.status).json({error:d.error||d.message||"Koala Crypto a refusé la commande"});
  const token=d.paymentToken||d.payment_token||d.firstPaymentToken||d.installments?.[0]?.paymentToken||d.installments?.[0]?.payment_token;
  const paymentUrl=d.paymentUrl||d.payment_url||(token?`${KOALA_CRYPTO_URL}/pay/${encodeURIComponent(token)}`:null);
  if(!paymentUrl)return res.status(502).json({error:"Aucun lien de paiement reçu de Koala Crypto"});
  res.json({paymentUrl});
 }catch(e){res.status(500).json({error:"Impossible de joindre Koala Crypto: "+e.message})}
});
app.get("/health",(q,r)=>r.json({app:"Koala Store",status:"online",stripe:!!stripe,koalaCrypto:KOALA_CRYPTO_URL}));
app.listen(PORT,"0.0.0.0",()=>console.log("Koala Store sur",PORT));