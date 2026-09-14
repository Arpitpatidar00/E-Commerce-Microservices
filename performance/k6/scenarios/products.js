import { get } from '../lib/http.js';
import { checkResponse } from '../lib/checks.js';
import { sleep } from 'k6';

export function browseProducts() {
  const res = get('/products');
  checkResponse(res);
  
  // optionally get a specific product if items exist
  let products = [];
  try {
    const body = res.json();
    products = body.data || body; // Depends on Api Response format
  } catch(e) {}
  
  if (products && products.length > 0) {
    const randomProduct = products[Math.floor(Math.random() * products.length)];
    const singleRes = get(`/products/${randomProduct._id || randomProduct.id}`);
    checkResponse(singleRes);
  }
  
  sleep(1);
}
