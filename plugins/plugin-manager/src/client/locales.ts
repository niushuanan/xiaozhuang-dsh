/** Product identity shared by all interface languages. */
export const en = { 'brand.name': 'Xiaozhuang DSH' }

/** Product-brand dictionary keys. */
export type ProductBrandKey = keyof typeof en

/** Chinese product identity. */
export const zh: Record<ProductBrandKey, string> = { 'brand.name': 'Xiaozhuang DSH' }
