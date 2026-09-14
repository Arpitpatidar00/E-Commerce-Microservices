import { ProductDocumentModel } from '../models/Product';
import { CreateProductRequest, ProductDocument } from '../types/product.types';

export class ProductRepository {
  async findAll({ page = 1, limit = 10 }: { page?: number; limit?: number } = {}) {
    const skip = (page - 1) * limit;
    const items = await ProductDocumentModel.find().select('-stock').skip(skip).limit(limit) as ProductDocument[];
    const total = await ProductDocumentModel.countDocuments();
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async findById(id: string): Promise<ProductDocument | null> {
    return ProductDocumentModel.findById(id).select('-stock');
  }

  async create(data: CreateProductRequest): Promise<ProductDocument> {
    const product = new ProductDocumentModel({ ...data, stock: 0 }); // Default stock, to be managed by inventory-service later
    await product.save();
    return product;
  }
}

export const productRepository = new ProductRepository();
