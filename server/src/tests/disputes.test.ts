import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  categoriesTable, 
  listingsTable, 
  ordersTable,
  disputesTable 
} from '../db/schema';
import { 
  type OpenDisputeInput, 
  type ResolveDisputeInput 
} from '../schema';
import { openDispute, resolveDispute } from '../handlers/disputes';
import { eq } from 'drizzle-orm';

// Test users
const buyerUser = {
  email: 'buyer@test.com',
  password_hash: 'hashedpassword',
  role: 'buyer' as const
};

const sellerUser = {
  email: 'seller@test.com', 
  password_hash: 'hashedpassword',
  role: 'seller' as const
};

const adminUser = {
  email: 'admin@test.com',
  password_hash: 'hashedpassword', 
  role: 'admin' as const
};

// Test category
const testCategory = {
  name: 'Test Category',
  slug: 'test-category'
};

// Test listing
const testListing = {
  title: 'Test Listing',
  description: 'A listing for testing',
  price_cents: 1999,
  currency: 'USD',
  status: 'available' as const
};

describe('openDispute', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let buyerId: string;
  let sellerId: string;
  let categoryId: string;
  let listingId: string;
  let orderId: string;

  beforeEach(async () => {
    // Create test users
    const buyers = await db.insert(usersTable).values(buyerUser).returning().execute();
    const sellers = await db.insert(usersTable).values(sellerUser).returning().execute();
    buyerId = buyers[0].id;
    sellerId = sellers[0].id;

    // Create test category
    const categories = await db.insert(categoriesTable).values(testCategory).returning().execute();
    categoryId = categories[0].id;

    // Create test listing
    const listings = await db.insert(listingsTable).values({
      ...testListing,
      seller_id: sellerId,
      category_id: categoryId
    }).returning().execute();
    listingId = listings[0].id;

    // Create test order with 'paid' status
    const orders = await db.insert(ordersTable).values({
      buyer_id: buyerId,
      listing_id: listingId,
      total_cents: 1999,
      currency: 'USD',
      status: 'paid'
    }).returning().execute();
    orderId = orders[0].id;
  });

  const testInput: OpenDisputeInput = {
    order_id: '', // Will be set in tests
    reason: 'Item not as described'
  };

  it('should allow buyer to open dispute', async () => {
    testInput.order_id = orderId;
    const result = await openDispute(testInput, buyerId);

    expect(result.order_id).toEqual(orderId);
    expect(result.opener_id).toEqual(buyerId);
    expect(result.reason).toEqual('Item not as described');
    expect(result.status).toEqual('open');
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should allow seller to open dispute', async () => {
    testInput.order_id = orderId;
    const result = await openDispute(testInput, sellerId);

    expect(result.order_id).toEqual(orderId);
    expect(result.opener_id).toEqual(sellerId);
    expect(result.reason).toEqual('Item not as described');
    expect(result.status).toEqual('open');
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should update order status to disputed', async () => {
    testInput.order_id = orderId;
    await openDispute(testInput, buyerId);

    const orders = await db.select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .execute();

    expect(orders).toHaveLength(1);
    expect(orders[0].status).toEqual('disputed');
  });

  it('should save dispute to database', async () => {
    testInput.order_id = orderId;
    const result = await openDispute(testInput, buyerId);

    const disputes = await db.select()
      .from(disputesTable)
      .where(eq(disputesTable.id, result.id))
      .execute();

    expect(disputes).toHaveLength(1);
    expect(disputes[0].order_id).toEqual(orderId);
    expect(disputes[0].opener_id).toEqual(buyerId);
    expect(disputes[0].reason).toEqual('Item not as described');
    expect(disputes[0].status).toEqual('open');
  });

  it('should reject dispute from non-participant', async () => {
    // Create another user not involved in the order
    const otherUsers = await db.insert(usersTable).values({
      email: 'other@test.com',
      password_hash: 'hashedpassword',
      role: 'buyer'
    }).returning().execute();
    const otherUserId = otherUsers[0].id;

    testInput.order_id = orderId;
    await expect(openDispute(testInput, otherUserId))
      .rejects.toThrow(/only order participants can open disputes/i);
  });

  it('should reject dispute for invalid order status', async () => {
    // Update order to pending status
    await db.update(ordersTable)
      .set({ status: 'pending' })
      .where(eq(ordersTable.id, orderId))
      .execute();

    testInput.order_id = orderId;
    await expect(openDispute(testInput, buyerId))
      .rejects.toThrow(/disputes can only be opened for paid or delivered orders/i);
  });

  it('should allow dispute for delivered orders', async () => {
    // Update order to delivered status
    await db.update(ordersTable)
      .set({ status: 'delivered' })
      .where(eq(ordersTable.id, orderId))
      .execute();

    testInput.order_id = orderId;
    const result = await openDispute(testInput, buyerId);

    expect(result.status).toEqual('open');
  });

  it('should reject duplicate dispute for same order', async () => {
    testInput.order_id = orderId;
    await openDispute(testInput, buyerId);

    // Try to open another dispute for the same order
    await expect(openDispute(testInput, sellerId))
      .rejects.toThrow(/dispute already exists for this order/i);
  });

  it('should reject dispute for non-existent order', async () => {
    testInput.order_id = '12345678-1234-1234-1234-123456789012';
    await expect(openDispute(testInput, buyerId))
      .rejects.toThrow(/order not found/i);
  });
});

describe('resolveDispute', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let buyerId: string;
  let sellerId: string;
  let adminId: string;
  let categoryId: string;
  let listingId: string;
  let orderId: string;
  let disputeId: string;

  beforeEach(async () => {
    // Create test users
    const buyers = await db.insert(usersTable).values(buyerUser).returning().execute();
    const sellers = await db.insert(usersTable).values(sellerUser).returning().execute();
    const admins = await db.insert(usersTable).values(adminUser).returning().execute();
    buyerId = buyers[0].id;
    sellerId = sellers[0].id;
    adminId = admins[0].id;

    // Create test category
    const categories = await db.insert(categoriesTable).values(testCategory).returning().execute();
    categoryId = categories[0].id;

    // Create test listing
    const listings = await db.insert(listingsTable).values({
      ...testListing,
      seller_id: sellerId,
      category_id: categoryId
    }).returning().execute();
    listingId = listings[0].id;

    // Create test order with 'disputed' status
    const orders = await db.insert(ordersTable).values({
      buyer_id: buyerId,
      listing_id: listingId,
      total_cents: 1999,
      currency: 'USD',
      status: 'disputed'
    }).returning().execute();
    orderId = orders[0].id;

    // Create open dispute
    const disputes = await db.insert(disputesTable).values({
      order_id: orderId,
      opener_id: buyerId,
      reason: 'Item not as described',
      status: 'open'
    }).returning().execute();
    disputeId = disputes[0].id;
  });

  it('should resolve dispute in favor of buyer', async () => {
    const input: ResolveDisputeInput = {
      order_id: orderId,
      resolution: 'buyer'
    };

    await resolveDispute(input, adminId);

    // Check dispute was updated
    const disputes = await db.select()
      .from(disputesTable)
      .where(eq(disputesTable.id, disputeId))
      .execute();

    expect(disputes).toHaveLength(1);
    expect(disputes[0].status).toEqual('refunded');

    // Check order status was updated
    const orders = await db.select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .execute();

    expect(orders).toHaveLength(1);
    expect(orders[0].status).toEqual('refunded');
  });

  it('should resolve dispute in favor of seller', async () => {
    const input: ResolveDisputeInput = {
      order_id: orderId,
      resolution: 'seller'
    };

    await resolveDispute(input, adminId);

    // Check dispute was updated
    const disputes = await db.select()
      .from(disputesTable)
      .where(eq(disputesTable.id, disputeId))
      .execute();

    expect(disputes).toHaveLength(1);
    expect(disputes[0].status).toEqual('resolved_seller');

    // Check order status was updated
    const orders = await db.select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .execute();

    expect(orders).toHaveLength(1);
    expect(orders[0].status).toEqual('complete');
  });

  it('should handle refund resolution same as buyer resolution', async () => {
    const input: ResolveDisputeInput = {
      order_id: orderId,
      resolution: 'refund'
    };

    await resolveDispute(input, adminId);

    // Check dispute was updated
    const disputes = await db.select()
      .from(disputesTable)
      .where(eq(disputesTable.id, disputeId))
      .execute();

    expect(disputes).toHaveLength(1);
    expect(disputes[0].status).toEqual('refunded');

    // Check order status was updated
    const orders = await db.select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .execute();

    expect(orders).toHaveLength(1);
    expect(orders[0].status).toEqual('refunded');
  });

  it('should reject resolution from non-admin user', async () => {
    const input: ResolveDisputeInput = {
      order_id: orderId,
      resolution: 'buyer'
    };

    await expect(resolveDispute(input, buyerId))
      .rejects.toThrow(/only admins can resolve disputes/i);
  });

  it('should reject resolution for non-existent dispute', async () => {
    // Create order without dispute
    const ordersWithoutDispute = await db.insert(ordersTable).values({
      buyer_id: buyerId,
      listing_id: listingId,
      total_cents: 1999,
      currency: 'USD',
      status: 'paid'
    }).returning().execute();

    const input: ResolveDisputeInput = {
      order_id: ordersWithoutDispute[0].id,
      resolution: 'buyer'
    };

    await expect(resolveDispute(input, adminId))
      .rejects.toThrow(/dispute not found/i);
  });

  it('should reject resolution for already resolved dispute', async () => {
    // Update dispute to resolved status
    await db.update(disputesTable)
      .set({ status: 'resolved_seller' })
      .where(eq(disputesTable.id, disputeId))
      .execute();

    const input: ResolveDisputeInput = {
      order_id: orderId,
      resolution: 'buyer'
    };

    await expect(resolveDispute(input, adminId))
      .rejects.toThrow(/dispute is not open/i);
  });

  it('should reject resolution from non-existent admin', async () => {
    const input: ResolveDisputeInput = {
      order_id: orderId,
      resolution: 'buyer'
    };

    const fakeAdminId = '12345678-1234-1234-1234-123456789012';
    await expect(resolveDispute(input, fakeAdminId))
      .rejects.toThrow(/only admins can resolve disputes/i);
  });
});