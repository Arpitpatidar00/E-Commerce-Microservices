import { inventoryRepository } from '../repositories/inventoryRepository';

export class InventoryService {
  async getStock(productId: string) {
    const inventory = await inventoryRepository.findByProductId(productId);
    if (!inventory) {
      throw new Error('Inventory not found');
    }
    return inventory;
  }

  async setStock(productId: string, quantity: number) {
    return inventoryRepository.setStock(productId, quantity);
  }

  async reserveStock(productId: string, quantity: number) {
    const updatedInventory = await inventoryRepository.reserveStock(productId, quantity);
    
    if (!updatedInventory) {
      throw new Error('Insufficient stock or product not found');
    }
    
    return updatedInventory;
  }
}

export const inventoryService = new InventoryService();
