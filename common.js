
const CART_KEY = "koala_cart_v1";
function getCart(){ try{return JSON.parse(localStorage.getItem(CART_KEY)||"[]")}catch{return []}}
function setCart(c){localStorage.setItem(CART_KEY,JSON.stringify(c));updateCartCount()}
function updateCartCount(){const n=getCart().reduce((s,x)=>s+(x.qty||1),0);document.querySelectorAll("[data-cart-count]").forEach(e=>e.textContent=n)}
function money(v){return new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(v)}
function addCart(item){
 const c=getCart(); const k=`${item.id}|${item.size||""}|${item.color||""}`; const found=c.find(x=>x.key===k);
 if(found) found.qty=Math.min(10,(found.qty||1)+1); else c.push({...item,key:k,qty:1});
 setCart(c); alert("Produit ajouté au panier");
}
document.addEventListener("DOMContentLoaded",updateCartCount);
