import { inventoryRepository } from '../repositories/inventoryRepository';
import { NotFoundError, ConflictError } from '@ecommerce/shared';

export class InventoryService {
  async getStock(productId: string) {
    const inventory = await inventoryRepository.findByProductId(productId);
    if (!inventory) {
      throw new NotFoundError('Inventory not found');
    }
    return inventory;
  }

  async setStock(productId: string, quantity: number) {
    return inventoryRepository.setStock(productId, quantity);
  }

  async reserveStock(productId: string, quantity: number) {
    const updatedInventory = await inventoryRepository.reserveStock(productId, quantity);
    
    if (!updatedInventory) {
      throw new ConflictError('Insufficient stock or product not found');
    }
    
    return updatedInventory;
  }
}

export const inventoryService = new InventoryService();
