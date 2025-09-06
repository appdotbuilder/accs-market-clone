import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, categoriesTable, listingsTable, ordersTable, transactionsTable } from '../db/schema';
import { type CreatePaymentIntentInput } from '../schema';
import { createPaymentIntent } from '../handlers/checkout';
import { eq } from 'drizzle-orm';

describe('createPaymentIntent', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Create test data
  let sellerId: string;
  let buyerId: string;
  let categoryId: string;
  let listingId: string;

  const setupTestData = async () => {
    // Create users
    const sellerResult = await db.insert(usersTable)
      .values({
        email: 'seller@test.com',
        password_hash: 'hashed_password',
        role: 'seller'
      })
      .returning()
      .execute();
    sellerId = sellerResult[0].id;

    const buyerResult = await db.insert(usersTable)
      .values({
        email: 'buyer@test.com',
        password_hash: 'hashed_password',
        role: 'buyer'
      })
      .returning()
      .execute();
    buyerId = buyerResult[0].id;

    // Create category
    const categoryResult = await db.insert(categoriesTable)
      .values({
        name: 'Test Category',
        slug: 'test-category'
      })
      .returning()
      .execute();
    categoryId = categoryResult[0].id;

    // Create available listing
    const listingResult = await db.insert(listingsTable)
      .values({
        seller_id: sellerId,
        category_id: categoryId,
        title: 'Test Product',
        description: 'A test product for checkout',
        price_cents: 2999,
        currency: 'USD',
        status: 'available'
      })
      .returning()
      .execute();
    listingId = listingResult[0].id;
  };

  it('should create payment intent successfully', async () => {
    await setupTestData();

    const input: CreatePaymentIntentInput = {
      listing_id: listingId
    };

    const result = await createPaymentIntent(input, buyerId);

    // Verify response structure
    expect(result.client_secret).toBeDefined();
    expect(result.client_secret).toMatch(/^pi_[a-z0-9]+_secret_mock$/);
    expect(result.order_id).toBeDefined();
    expect(result.order_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('should create order record in database', async () => {
    await setupTestData();

    const input: CreatePaymentIntentInput = {
      listing_id: listingId
    };

    const result = await createPaymentIntent(input, buyerId);

    // Verify order was created
    const orders = await db.select()
      .from(ordersTable)
      .where(eq(ordersTable.id, result.order_id))
      .execute();

    expect(orders).toHaveLength(1);
    const order = orders[0];
    expect(order.buyer_id).toEqual(buyerId);
    expect(order.listing_id).toEqual(listingId);
    expect(order.total_cents).toEqual(2999);
    expect(order.currency).toEqual('USD');
    expect(order.status).toEqual('pending');
    expect(order.expires_at).toBeNull();
    expect(order.created_at).toBeInstanceOf(Date);
    expect(order.updated_at).toBeInstanceOf(Date);
  });

  it('should create transaction record in database', async () => {
    await setupTestData();

    const input: CreatePaymentIntentInput = {
      listing_id: listingId
    };

    const result = await createPaymentIntent(input, buyerId);

    // Verify transaction was created
    const transactions = await db.select()
      .from(transactionsTable)
      .where(eq(transactionsTable.order_id, result.order_id))
      .execute();

    expect(transactions).toHaveLength(1);
    const transaction = transactions[0];
    expect(transaction.order_id).toEqual(result.order_id);
    expect(transaction.provider).toEqual('stripe');
    expect(transaction.provider_ref).toMatch(/^pi_[a-z0-9]+$/);
    expect(transaction.amount_cents).toEqual(2999);
    expect(transaction.status).toEqual('initiated');
    expect(transaction.created_at).toBeInstanceOf(Date);
  });

  it('should reject non-existent listing', async () => {
    await setupTestData();

    const input: CreatePaymentIntentInput = {
      listing_id: '00000000-0000-0000-0000-000000000000'
    };

    await expect(createPaymentIntent(input, buyerId)).rejects.toThrow(/listing not found/i);
  });

  it('should reject unavailable listing', async () => {
    await setupTestData();

    // Update listing to sold status
    await db.update(listingsTable)
      .set({ status: 'sold' })
      .where(eq(listingsTable.id, listingId))
      .execute();

    const input: CreatePaymentIntentInput = {
      listing_id: listingId
    };

    await expect(createPaymentIntent(input, buyerId)).rejects.toThrow(/listing is not available/i);
  });

  it('should reject delisted listing', async () => {
    await setupTestData();

    // Update listing to delisted status
    await db.update(listingsTable)
      .set({ status: 'delisted' })
      .where(eq(listingsTable.id, listingId))
      .execute();

    const input: CreatePaymentIntentInput = {
      listing_id: listingId
    };

    await expect(createPaymentIntent(input, buyerId)).rejects.toThrow(/listing is not available/i);
  });

  it('should prevent seller from buying own listing', async () => {
    await setupTestData();

    const input: CreatePaymentIntentInput = {
      listing_id: listingId
    };

    // Try to create payment intent as the seller
    await expect(createPaymentIntent(input, sellerId)).rejects.toThrow(/cannot purchase your own listing/i);
  });

  it('should handle different currencies correctly', async () => {
    await setupTestData();

    // Create EUR listing
    const eurListingResult = await db.insert(listingsTable)
      .values({
        seller_id: sellerId,
        category_id: categoryId,
        title: 'EUR Product',
        description: 'A product priced in EUR',
        price_cents: 4999,
        currency: 'EUR',
        status: 'available'
      })
      .returning()
      .execute();

    const input: CreatePaymentIntentInput = {
      listing_id: eurListingResult[0].id
    };

    const result = await createPaymentIntent(input, buyerId);

    // Verify order has correct currency
    const orders = await db.select()
      .from(ordersTable)
      .where(eq(ordersTable.id, result.order_id))
      .execute();

    expect(orders).toHaveLength(1);
    expect(orders[0].currency).toEqual('EUR');
    expect(orders[0].total_cents).toEqual(4999);
  });

  it('should handle high-priced items correctly', async () => {
    await setupTestData();

    // Create expensive listing
    const expensiveListingResult = await db.insert(listingsTable)
      .values({
        seller_id: sellerId,
        category_id: categoryId,
        title: 'Expensive Product',
        description: 'A very expensive product',
        price_cents: 999999,
        currency: 'USD',
        status: 'available'
      })
      .returning()
      .execute();

    const input: CreatePaymentIntentInput = {
      listing_id: expensiveListingResult[0].id
    };

    const result = await createPaymentIntent(input, buyerId);

    // Verify order handles large amounts
    const orders = await db.select()
      .from(ordersTable)
      .where(eq(ordersTable.id, result.order_id))
      .execute();

    expect(orders).toHaveLength(1);
    expect(orders[0].total_cents).toEqual(999999);

    // Verify transaction record
    const transactions = await db.select()
      .from(transactionsTable)
      .where(eq(transactionsTable.order_id, result.order_id))
      .execute();

    expect(transactions).toHaveLength(1);
    expect(transactions[0].amount_cents).toEqual(999999);
  });
});