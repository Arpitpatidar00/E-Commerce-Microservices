import { describe, it, expect, vi, beforeEach } from 'vitest';
import { inventoryService } from '../inventoryService';
import { inventoryRepository } from '../../repositories/inventoryRepository';

vi.mock('../../repositories/inventoryRepository', () => ({
  inventoryRepository: {
    findByProductId: vi.fn(),
    setStock: vi.fn(),
    reserveStock: vi.fn(),
  },
}));

describe('InventoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('reserveStock', () => {
    it('should successfully reserve stock when available', async () => {
      vi.mocked(inventoryRepository.reserveStock).mockResolvedValue({
        productId: 'prod1',
        quantity: 10,
        reserved: 2,
        updatedAt: new Date()
      } as any);

      const result = await inventoryService.reserveStock('prod1', 2);
      expect(result).toBeDefined();
      expect(inventoryRepository.reserveStock).toHaveBeenCalledWith('prod1', 2);
    });

    it('should throw ConflictError when stock is insufficient', async () => {
      vi.mocked(inventoryRepository.reserveStock).mockResolvedValue(null);

      await expect(inventoryService.reserveStock('prod1', 5)).rejects.toThrow('Insufficient stock or product not found');
    });
  });
});
