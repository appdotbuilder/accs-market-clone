import { 
  pgTable, 
  uuid, 
  text, 
  timestamp, 
  pgEnum, 
  numeric, 
  integer, 
  boolean, 
  jsonb,
  unique,
  index
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const userRoleEnum = pgEnum('user_role', ['buyer', 'seller', 'admin']);
export const verificationStatusEnum = pgEnum('verification_status', ['none', 'pending', 'verified']);
export const listingStatusEnum = pgEnum('listing_status', ['available', 'sold', 'delisted']);
export const orderStatusEnum = pgEnum('order_status', ['pending', 'paid', 'delivered', 'disputed', 'complete', 'refunded']);
export const transactionStatusEnum = pgEnum('transaction_status', ['initiated', 'succeeded', 'failed']);
export const paymentProviderEnum = pgEnum('payment_provider', ['stripe']);
export const disputeStatusEnum = pgEnum('dispute_status', ['open', 'resolved_buyer', 'resolved_seller', 'refunded']);
export const payoutStatusEnum = pgEnum('payout_status', ['requested', 'processing', 'paid', 'failed']);

// Users table
export const usersTable = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  role: userRoleEnum('role').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Profiles table
export const profilesTable = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => usersTable.id),
  rating: numeric('rating', { precision: 2, scale: 1 }).default('0').notNull(),
  verification_status: verificationStatusEnum('verification_status').default('none').notNull(),
  payout_info_json: jsonb('payout_info_json')
}, (table) => ({
  userIdUnique: unique().on(table.user_id)
}));

// Categories table
export const categoriesTable = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique()
});

// Listings table
export const listingsTable = pgTable('listings', {
  id: uuid('id').primaryKey().defaultRandom(),
  seller_id: uuid('seller_id').notNull().references(() => usersTable.id),
  category_id: uuid('category_id').notNull().references(() => categoriesTable.id),
  title: text('title').notNull(),
  description: text('description').notNull(),
  price_cents: integer('price_cents').notNull(),
  currency: text('currency').default('USD').notNull(),
  status: listingStatusEnum('status').default('available').notNull(),
  has_secure_payload: boolean('has_secure_payload').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  priceIdx: index('listings_price_idx').on(table.price_cents),
  statusIdx: index('listings_status_idx').on(table.status)
}));

// Listing secure payloads table
export const listingSecurePayloadsTable = pgTable('listing_secure_payloads', {
  id: uuid('id').primaryKey().defaultRandom(),
  listing_id: uuid('listing_id').notNull().references(() => listingsTable.id),
  cipher_text: text('cipher_text').notNull(), // Store as base64 encoded text
  nonce: text('nonce').notNull(), // Store as base64 encoded text
  created_at: timestamp('created_at').defaultNow().notNull()
}, (table) => ({
  listingIdUnique: unique().on(table.listing_id)
}));

// Orders table
export const ordersTable = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  buyer_id: uuid('buyer_id').notNull().references(() => usersTable.id),
  listing_id: uuid('listing_id').notNull().references(() => listingsTable.id),
  total_cents: integer('total_cents').notNull(),
  currency: text('currency').notNull(),
  status: orderStatusEnum('status').default('pending').notNull(),
  expires_at: timestamp('expires_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Transactions table
export const transactionsTable = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  order_id: uuid('order_id').notNull().references(() => ordersTable.id),
  provider: paymentProviderEnum('provider').notNull(),
  provider_ref: text('provider_ref').notNull(),
  amount_cents: integer('amount_cents').notNull(),
  status: transactionStatusEnum('status').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Reviews table
export const reviewsTable = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  order_id: uuid('order_id').notNull().references(() => ordersTable.id),
  seller_id: uuid('seller_id').notNull().references(() => usersTable.id),
  buyer_id: uuid('buyer_id').notNull().references(() => usersTable.id),
  rating: integer('rating').notNull(),
  comment: text('comment').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull()
}, (table) => ({
  orderIdUnique: unique().on(table.order_id)
}));

// Disputes table
export const disputesTable = pgTable('disputes', {
  id: uuid('id').primaryKey().defaultRandom(),
  order_id: uuid('order_id').notNull().references(() => ordersTable.id),
  opener_id: uuid('opener_id').notNull().references(() => usersTable.id),
  reason: text('reason').notNull(),
  status: disputeStatusEnum('status').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  orderIdUnique: unique().on(table.order_id)
}));

// Payouts table
export const payoutsTable = pgTable('payouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  seller_id: uuid('seller_id').notNull().references(() => usersTable.id),
  amount_cents: integer('amount_cents').notNull(),
  status: payoutStatusEnum('status').notNull(),
  provider_ref: text('provider_ref'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Relations
export const usersRelations = relations(usersTable, ({ one, many }) => ({
  profile: one(profilesTable, {
    fields: [usersTable.id],
    references: [profilesTable.user_id]
  }),
  listings: many(listingsTable),
  buyerOrders: many(ordersTable, { relationName: 'buyer_orders' }),
  sellerReviews: many(reviewsTable, { relationName: 'seller_reviews' }),
  buyerReviews: many(reviewsTable, { relationName: 'buyer_reviews' }),
  disputes: many(disputesTable),
  payouts: many(payoutsTable)
}));

export const profilesRelations = relations(profilesTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [profilesTable.user_id],
    references: [usersTable.id]
  })
}));

export const categoriesRelations = relations(categoriesTable, ({ many }) => ({
  listings: many(listingsTable)
}));

export const listingsRelations = relations(listingsTable, ({ one, many }) => ({
  seller: one(usersTable, {
    fields: [listingsTable.seller_id],
    references: [usersTable.id]
  }),
  category: one(categoriesTable, {
    fields: [listingsTable.category_id],
    references: [categoriesTable.id]
  }),
  securePayload: one(listingSecurePayloadsTable, {
    fields: [listingsTable.id],
    references: [listingSecurePayloadsTable.listing_id]
  }),
  orders: many(ordersTable)
}));

export const listingSecurePayloadsRelations = relations(listingSecurePayloadsTable, ({ one }) => ({
  listing: one(listingsTable, {
    fields: [listingSecurePayloadsTable.listing_id],
    references: [listingsTable.id]
  })
}));

export const ordersRelations = relations(ordersTable, ({ one, many }) => ({
  buyer: one(usersTable, {
    fields: [ordersTable.buyer_id],
    references: [usersTable.id],
    relationName: 'buyer_orders'
  }),
  listing: one(listingsTable, {
    fields: [ordersTable.listing_id],
    references: [listingsTable.id]
  }),
  transactions: many(transactionsTable),
  review: one(reviewsTable, {
    fields: [ordersTable.id],
    references: [reviewsTable.order_id]
  }),
  dispute: one(disputesTable, {
    fields: [ordersTable.id],
    references: [disputesTable.order_id]
  })
}));

export const transactionsRelations = relations(transactionsTable, ({ one }) => ({
  order: one(ordersTable, {
    fields: [transactionsTable.order_id],
    references: [ordersTable.id]
  })
}));

export const reviewsRelations = relations(reviewsTable, ({ one }) => ({
  order: one(ordersTable, {
    fields: [reviewsTable.order_id],
    references: [ordersTable.id]
  }),
  seller: one(usersTable, {
    fields: [reviewsTable.seller_id],
    references: [usersTable.id],
    relationName: 'seller_reviews'
  }),
  buyer: one(usersTable, {
    fields: [reviewsTable.buyer_id],
    references: [usersTable.id],
    relationName: 'buyer_reviews'
  })
}));

export const disputesRelations = relations(disputesTable, ({ one }) => ({
  order: one(ordersTable, {
    fields: [disputesTable.order_id],
    references: [ordersTable.id]
  }),
  opener: one(usersTable, {
    fields: [disputesTable.opener_id],
    references: [usersTable.id]
  })
}));

export const payoutsRelations = relations(payoutsTable, ({ one }) => ({
  seller: one(usersTable, {
    fields: [payoutsTable.seller_id],
    references: [usersTable.id]
  })
}));

// Export all tables for proper query building
export const tables = {
  users: usersTable,
  profiles: profilesTable,
  categories: categoriesTable,
  listings: listingsTable,
  listingSecurePayloads: listingSecurePayloadsTable,
  orders: ordersTable,
  transactions: transactionsTable,
  reviews: reviewsTable,
  disputes: disputesTable,
  payouts: payoutsTable
};