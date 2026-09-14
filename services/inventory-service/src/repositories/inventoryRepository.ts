import { Inventory } from '../models/Inventory';

export class InventoryRepository {
  async findByProductId(productId: string) {
    return Inventory.findOne({ productId });
  }

  async setStock(productId: string, quantity: number) {
    return Inventory.findOneAndUpdate(
      { productId },
      { $set: { availableStock: quantity } },
      { upsert: true, new: true }
    );
  }

  async reserveStock(productId: string, quantity: number) {
    return Inventory.findOneAndUpdate(
      { productId, availableStock: { $gte: quantity } },
      { 
        $inc: { 
          availableStock: -quantity, 
          reservedStock: quantity 
        } 
      },
      { new: true }
    );
  }
}

export const inventoryRepository = new InventoryRepository();
