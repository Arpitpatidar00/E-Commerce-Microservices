import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: '../../services/product-service/.env' });

const productSchema = new mongoose.Schema({
  name: String,
  description: String,
  price: Number,
  stock: Number,
  category: String,
  createdAt: { type: Date, default: Date.now }
});

const Product = mongoose.model('Product', productSchema);

async function seed() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ecommerce_product';
  await mongoose.connect(uri);
  console.log('Connected to DB');
  
  await Product.deleteMany({});
  console.log('Cleared existing products');

  const products = [];
  for (let i = 0; i < 10000; i++) {
    products.push({
      name: `Performance Product ${i}`,
      description: `Description for product ${i}`,
      price: Math.floor(Math.random() * 1000) + 1,
      stock: 1000,
      category: 'Electronics'
    });
  }

  await Product.insertMany(products);
  console.log('Successfully seeded 10,000 products for performance testing');

  await mongoose.disconnect();
}

seed().catch(console.error);
