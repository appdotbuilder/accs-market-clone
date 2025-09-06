import { z } from 'zod';

// Enums
export const userRoleSchema = z.enum(['buyer', 'seller', 'admin']);
export const verificationStatusSchema = z.enum(['none', 'pending', 'verified']);
export const listingStatusSchema = z.enum(['available', 'sold', 'delisted']);
export const orderStatusSchema = z.enum(['pending', 'paid', 'delivered', 'disputed', 'complete', 'refunded']);
export const transactionStatusSchema = z.enum(['initiated', 'succeeded', 'failed']);
export const paymentProviderSchema = z.enum(['stripe']);
export const disputeStatusSchema = z.enum(['open', 'resolved_buyer', 'resolved_seller', 'refunded']);
export const payoutStatusSchema = z.enum(['requested', 'processing', 'paid', 'failed']);

// User schemas
export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  password_hash: z.string(),
  role: userRoleSchema,
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type User = z.infer<typeof userSchema>;

export const registerInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: userRoleSchema
});

export type RegisterInput = z.infer<typeof registerInputSchema>;

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

export type LoginInput = z.infer<typeof loginInputSchema>;

// Profile schemas
export const profileSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  rating: z.number(),
  verification_status: verificationStatusSchema,
  payout_info_json: z.record(z.any()).nullable()
});

export type Profile = z.infer<typeof profileSchema>;

// Category schemas
export const categorySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string()
});

export type Category = z.infer<typeof categorySchema>;

export const createCategoryInputSchema = z.object({
  name: z.string(),
  slug: z.string()
});

export type CreateCategoryInput = z.infer<typeof createCategoryInputSchema>;

// Listing schemas
export const listingSchema = z.object({
  id: z.string().uuid(),
  seller_id: z.string().uuid(),
  category_id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  price_cents: z.number().int(),
  currency: z.string(),
  status: listingStatusSchema,
  has_secure_payload: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Listing = z.infer<typeof listingSchema>;

export const upsertListingInputSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string(),
  description: z.string(),
  category_id: z.string().uuid(),
  price_cents: z.number().int().positive()
});

export type UpsertListingInput = z.infer<typeof upsertListingInputSchema>;

export const setListingPayloadInputSchema = z.object({
  listing_id: z.string().uuid(),
  plaintext_credentials: z.string()
});

export type SetListingPayloadInput = z.infer<typeof setListingPayloadInputSchema>;

export const setListingStatusInputSchema = z.object({
  listing_id: z.string().uuid(),
  status: listingStatusSchema
});

export type SetListingStatusInput = z.infer<typeof setListingStatusInputSchema>;

export const searchListingsInputSchema = z.object({
  q: z.string().optional(),
  category_slug: z.string().optional(),
  min_price: z.number().int().nonnegative().optional(),
  max_price: z.number().int().positive().optional(),
  page: z.number().int().positive().default(1),
  page_size: z.number().int().positive().max(50).default(20)
});

export type SearchListingsInput = z.infer<typeof searchListingsInputSchema>;

// Listing secure payload schemas
export const listingSecurePayloadSchema = z.object({
  id: z.string().uuid(),
  listing_id: z.string().uuid(),
  cipher_text: z.string(), // Base64 encoded string
  nonce: z.string(), // Base64 encoded string  
  created_at: z.coerce.date()
});

export type ListingSecurePayload = z.infer<typeof listingSecurePayloadSchema>;

// Order schemas
export const orderSchema = z.object({
  id: z.string().uuid(),
  buyer_id: z.string().uuid(),
  listing_id: z.string().uuid(),
  total_cents: z.number().int(),
  currency: z.string(),
  status: orderStatusSchema,
  expires_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Order = z.infer<typeof orderSchema>;

export const createPaymentIntentInputSchema = z.object({
  listing_id: z.string().uuid()
});

export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentInputSchema>;

export const acknowledgeDeliveryInputSchema = z.object({
  order_id: z.string().uuid()
});

export type AcknowledgeDeliveryInput = z.infer<typeof acknowledgeDeliveryInputSchema>;

// Transaction schemas
export const transactionSchema = z.object({
  id: z.string().uuid(),
  order_id: z.string().uuid(),
  provider: paymentProviderSchema,
  provider_ref: z.string(),
  amount_cents: z.number().int(),
  status: transactionStatusSchema,
  created_at: z.coerce.date()
});

export type Transaction = z.infer<typeof transactionSchema>;

// Review schemas
export const reviewSchema = z.object({
  id: z.string().uuid(),
  order_id: z.string().uuid(),
  seller_id: z.string().uuid(),
  buyer_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string(),
  created_at: z.coerce.date()
});

export type Review = z.infer<typeof reviewSchema>;

export const createReviewInputSchema = z.object({
  order_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string()
});

export type CreateReviewInput = z.infer<typeof createReviewInputSchema>;

export const getSellerReviewsInputSchema = z.object({
  seller_id: z.string().uuid(),
  page: z.number().int().positive().default(1)
});

export type GetSellerReviewsInput = z.infer<typeof getSellerReviewsInputSchema>;

// Dispute schemas
export const disputeSchema = z.object({
  id: z.string().uuid(),
  order_id: z.string().uuid(),
  opener_id: z.string().uuid(),
  reason: z.string(),
  status: disputeStatusSchema,
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Dispute = z.infer<typeof disputeSchema>;

export const openDisputeInputSchema = z.object({
  order_id: z.string().uuid(),
  reason: z.string()
});

export type OpenDisputeInput = z.infer<typeof openDisputeInputSchema>;

export const resolveDisputeInputSchema = z.object({
  order_id: z.string().uuid(),
  resolution: z.enum(['buyer', 'seller', 'refund'])
});

export type ResolveDisputeInput = z.infer<typeof resolveDisputeInputSchema>;

// Payout schemas
export const payoutSchema = z.object({
  id: z.string().uuid(),
  seller_id: z.string().uuid(),
  amount_cents: z.number().int(),
  status: payoutStatusSchema,
  provider_ref: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Payout = z.infer<typeof payoutSchema>;

export const requestPayoutInputSchema = z.object({
  amount_cents: z.number().int().positive()
});

export type RequestPayoutInput = z.infer<typeof requestPayoutInputSchema>;

export const processPayoutInputSchema = z.object({
  payout_id: z.string().uuid(),
  action: z.enum(['mark_paid', 'fail'])
});

export type ProcessPayoutInput = z.infer<typeof processPayoutInputSchema>;

// Cart schemas
export const cartItemSchema = z.object({
  listing_id: z.string().uuid()
});

export type CartItem = z.infer<typeof cartItemSchema>;

// Pagination schemas
export const paginationInputSchema = z.object({
  page: z.number().int().positive().default(1),
  page_size: z.number().int().positive().max(50).default(20)
});

export type PaginationInput = z.infer<typeof paginationInputSchema>;

// Admin schemas
export const listUsersInputSchema = z.object({
  role: userRoleSchema.optional(),
  q: z.string().optional(),
  page: z.number().int().positive().default(1)
});

export type ListUsersInput = z.infer<typeof listUsersInputSchema>;

export const listDisputesInputSchema = z.object({
  status: disputeStatusSchema.optional(),
  page: z.number().int().positive().default(1)
});

export type ListDisputesInput = z.infer<typeof listDisputesInputSchema>;

// Common response schemas
export const paginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number().int(),
    page: z.number().int(),
    page_size: z.number().int(),
    total_pages: z.number().int()
  });

export const balanceResponseSchema = z.object({
  available_cents: z.number().int(),
  pending_cents: z.number().int()
});

export type BalanceResponse = z.infer<typeof balanceResponseSchema>;

export const paymentIntentResponseSchema = z.object({
  client_secret: z.string(),
  order_id: z.string().uuid()
});

export type PaymentIntentResponse = z.infer<typeof paymentIntentResponseSchema>;