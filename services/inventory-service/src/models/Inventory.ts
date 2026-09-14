import mongoose from 'mongoose';

const inventorySchema = new mongoose.Schema({
  productId: { type: String, required: true, unique: true },
  availableStock: { type: Number, required: true, default: 0 },
  reservedStock: { type: Number, required: true, default: 0 },
}, { timestamps: true });

export const Inventory = mongoose.model('Inventory', inventorySchema);
