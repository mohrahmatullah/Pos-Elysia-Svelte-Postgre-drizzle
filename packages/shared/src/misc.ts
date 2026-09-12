export const DEFAULT_CURRENCY = 'IDR';
export const DEFAULT_TIMEZONE = 'Asia/Jakarta';
export const DEFAULT_TAX_RATE = '11'; // percent, PPN default Indonesia
export const API_VERSION = 'v1';

export const ERROR_CODES = [
  'UNAUTHORIZED',
  'FORBIDDEN',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'PRODUCT_NOT_FOUND',
  'PRODUCT_INACTIVE',
  'INSUFFICIENT_STOCK',
  'SALE_NOT_FOUND',
  'SALE_ALREADY_CANCELLED',
  'INVALID_PAYMENT',
  'DUPLICATE_SKU',
  'DUPLICATE_BARCODE',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
