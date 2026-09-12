/** Typed application errors mapped to PRD section 20 error codes. */
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  unauthorized: (msg = 'Authentication required') => new AppError('UNAUTHORIZED', msg, 401),
  forbidden: (msg = 'You do not have permission to perform this action') => new AppError('FORBIDDEN', msg, 403),
  validation: (msg = 'Validation failed') => new AppError('VALIDATION_ERROR', msg, 400),
  notFound: (msg = 'Resource not found') => new AppError('NOT_FOUND', msg, 404),
  conflict: (msg = 'Conflict') => new AppError('CONFLICT', msg, 409),
  productNotFound: () => new AppError('PRODUCT_NOT_FOUND', 'Product tidak ditemukan', 404),
  productInactive: (sku?: string) =>
    new AppError('PRODUCT_INACTIVE', `Product inactive tidak dapat dijual${sku ? `: ${sku}` : ''}`, 400),
  insufficientStock: (sku: string, available: number) =>
    new AppError('INSUFFICIENT_STOCK', `Stok tidak cukup untuk ${sku}. Tersedia: ${available}`, 400),
  saleNotFound: () => new AppError('SALE_NOT_FOUND', 'Transaksi tidak ditemukan', 404),
  saleCancelled: () => new AppError('SALE_ALREADY_CANCELLED', 'Transaksi sudah dibatalkan', 400),
  invalidPayment: (msg = 'Pembayaran tidak valid') => new AppError('INVALID_PAYMENT', msg, 400),
  duplicateSku: (sku: string) => new AppError('DUPLICATE_SKU', `SKU sudah digunakan: ${sku}`, 409),
  duplicateBarcode: (barcode: string) =>
    new AppError('DUPLICATE_BARCODE', `Barcode sudah digunakan: ${barcode}`, 409),
  internal: (msg = 'Terjadi kesalahan internal') => new AppError('INTERNAL_ERROR', msg, 500),
};
