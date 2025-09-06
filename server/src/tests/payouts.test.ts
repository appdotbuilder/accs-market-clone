import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  payoutsTable, 
  ordersTable, 
  transactionsTable,
  listingsTable,
  categoriesTable
} from '../db/schema';
import { 
  type RequestPayoutInput, 
  type ProcessPayoutInput 
} from '../schema';
import { requestPayout, processPayoutAdmin } from '../handlers/payouts';
import { eq } from 'drizzle-orm';

// Test data
const testSeller = {
  email: 'seller@test.com',
  password_hash: 'hashed_password',
  role: 'seller' as const
};

const testAdmin = {
  email: 'admin@test.com',
  password_hash: 'hashed_password',
  role: 'admin' as const
};

const testBuyer = {
  email: 'buyer@test.com',
  password_hash: 'hashed_password',
  role: 'buyer' as const
};

const testCategory = {
  name: 'Electronics',
  slug: 'electronics'
};

describe('requestPayout', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a payout request for valid seller', async () => {
    // Create seller
    const seller = await db.insert(usersTable)
      .values(testSeller)
      .returning()
      .execute();

    const sellerId = seller[0].id;

    const input: RequestPayoutInput = {
      amount_cents: 10000 // $100
    };

    const result = await requestPayout(input, sellerId);

    // Verify payout was created
    expect(result.seller_id).toEqual(sellerId);
    expect(result.amount_cents).toEqual(10000);
    expect(result.status).toEqual('requested');
    expect(result.provider_ref).toBeNull();
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save payout to database', async () => {
    // Create seller
    const seller = await db.insert(usersTable)
      .values(testSeller)
      .returning()
      .execute();

    const sellerId = seller[0].id;

    const input: RequestPayoutInput = {
      amount_cents: 5000 // $50
    };

    const result = await requestPayout(input, sellerId);

    // Verify in database
    const payouts = await db.select()
      .from(payoutsTable)
      .where(eq(payoutsTable.id, result.id))
      .execute();

    expect(payouts).toHaveLength(1);
    expect(payouts[0].seller_id).toEqual(sellerId);
    expect(payouts[0].amount_cents).toEqual(5000);
    expect(payouts[0].status).toEqual('requested');
    expect(payouts[0].provider_ref).toBeNull();
    expect(payouts[0].created_at).toBeInstanceOf(Date);
  });

  it('should reject payout request for non-existent seller', async () => {
    const input: RequestPayoutInput = {
      amount_cents: 10000
    };

    const fakeSellerId = '00000000-0000-0000-0000-000000000000';

    await expect(requestPayout(input, fakeSellerId))
      .rejects
      .toThrow(/seller not found/i);
  });

  it('should handle payout with completed order scenario', async () => {
    // Create all prerequisite data
    const seller = await db.insert(usersTable)
      .values(testSeller)
      .returning()
      .execute();

    const buyer = await db.insert(usersTable)
      .values(testBuyer)
      .returning()
      .execute();

    const category = await db.insert(categoriesTable)
      .values(testCategory)
      .returning()
      .execute();

    // Create listing
    const listing = await db.insert(listingsTable)
      .values({
        seller_id: seller[0].id,
        category_id: category[0].id,
        title: 'Test Product',
        description: 'Test Description',
        price_cents: 15000,
        currency: 'USD',
        status: 'available'
      })
      .returning()
      .execute();

    // Create completed order
    const order = await db.insert(ordersTable)
      .values({
        buyer_id: buyer[0].id,
        listing_id: listing[0].id,
        total_cents: 15000,
        currency: 'USD',
        status: 'complete'
      })
      .returning()
      .execute();

    // Create successful transaction
    await db.insert(transactionsTable)
      .values({
        order_id: order[0].id,
        provider: 'stripe',
        provider_ref: 'pi_test123',
        amount_cents: 15000,
        status: 'succeeded'
      })
      .execute();

    const input: RequestPayoutInput = {
      amount_cents: 10000 // Request less than earned
    };

    const result = await requestPayout(input, seller[0].id);

    expect(result.seller_id).toEqual(seller[0].id);
    expect(result.amount_cents).toEqual(10000);
    expect(result.status).toEqual('requested');
  });

  it('should handle multiple payout requests for same seller', async () => {
    // Create seller
    const seller = await db.insert(usersTable)
      .values(testSeller)
      .returning()
      .execute();

    const sellerId = seller[0].id;

    // First payout request
    const input1: RequestPayoutInput = {
      amount_cents: 5000
    };

    const result1 = await requestPayout(input1, sellerId);

    // Second payout request
    const input2: RequestPayoutInput = {
      amount_cents: 3000
    };

    const result2 = await requestPayout(input2, sellerId);

    // Both should be created successfully
    expect(result1.id).not.toEqual(result2.id);
    expect(result1.amount_cents).toEqual(5000);
    expect(result2.amount_cents).toEqual(3000);

    // Verify both in database
    const payouts = await db.select()
      .from(payoutsTable)
      .where(eq(payoutsTable.seller_id, sellerId))
      .execute();

    expect(payouts).toHaveLength(2);
  });
});

describe('processPayoutAdmin', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should mark payout as paid by admin', async () => {
    // Create admin and seller
    const admin = await db.insert(usersTable)
      .values(testAdmin)
      .returning()
      .execute();

    const seller = await db.insert(usersTable)
      .values(testSeller)
      .returning()
      .execute();

    // Create payout request
    const payout = await db.insert(payoutsTable)
      .values({
        seller_id: seller[0].id,
        amount_cents: 10000,
        status: 'requested',
        provider_ref: null
      })
      .returning()
      .execute();

    const input: ProcessPayoutInput = {
      payout_id: payout[0].id,
      action: 'mark_paid'
    };

    await processPayoutAdmin(input, admin[0].id);

    // Verify payout was updated
    const updatedPayout = await db.select()
      .from(payoutsTable)
      .where(eq(payoutsTable.id, payout[0].id))
      .execute();

    expect(updatedPayout).toHaveLength(1);
    expect(updatedPayout[0].status).toEqual('paid');
    expect(updatedPayout[0].provider_ref).toContain('stripe_payout_');
    expect(updatedPayout[0].updated_at).toBeInstanceOf(Date);
  });

  it('should fail payout by admin', async () => {
    // Create admin and seller
    const admin = await db.insert(usersTable)
      .values(testAdmin)
      .returning()
      .execute();

    const seller = await db.insert(usersTable)
      .values(testSeller)
      .returning()
      .execute();

    // Create payout request
    const payout = await db.insert(payoutsTable)
      .values({
        seller_id: seller[0].id,
        amount_cents: 10000,
        status: 'requested',
        provider_ref: null
      })
      .returning()
      .execute();

    const input: ProcessPayoutInput = {
      payout_id: payout[0].id,
      action: 'fail'
    };

    await processPayoutAdmin(input, admin[0].id);

    // Verify payout was failed
    const updatedPayout = await db.select()
      .from(payoutsTable)
      .where(eq(payoutsTable.id, payout[0].id))
      .execute();

    expect(updatedPayout).toHaveLength(1);
    expect(updatedPayout[0].status).toEqual('failed');
    expect(updatedPayout[0].provider_ref).toBeNull();
    expect(updatedPayout[0].updated_at).toBeInstanceOf(Date);
  });

  it('should reject processing by non-admin user', async () => {
    // Create non-admin user and seller
    const nonAdmin = await db.insert(usersTable)
      .values(testBuyer) // buyer role, not admin
      .returning()
      .execute();

    const seller = await db.insert(usersTable)
      .values(testSeller)
      .returning()
      .execute();

    // Create payout request
    const payout = await db.insert(payoutsTable)
      .values({
        seller_id: seller[0].id,
        amount_cents: 10000,
        status: 'requested',
        provider_ref: null
      })
      .returning()
      .execute();

    const input: ProcessPayoutInput = {
      payout_id: payout[0].id,
      action: 'mark_paid'
    };

    await expect(processPayoutAdmin(input, nonAdmin[0].id))
      .rejects
      .toThrow(/admin not found or insufficient permissions/i);
  });

  it('should reject processing non-existent payout', async () => {
    // Create admin
    const admin = await db.insert(usersTable)
      .values(testAdmin)
      .returning()
      .execute();

    const input: ProcessPayoutInput = {
      payout_id: '00000000-0000-0000-0000-000000000000',
      action: 'mark_paid'
    };

    await expect(processPayoutAdmin(input, admin[0].id))
      .rejects
      .toThrow(/payout not found/i);
  });

  it('should reject processing payout not in requested status', async () => {
    // Create admin and seller
    const admin = await db.insert(usersTable)
      .values(testAdmin)
      .returning()
      .execute();

    const seller = await db.insert(usersTable)
      .values(testSeller)
      .returning()
      .execute();

    // Create payout request that's already paid
    const payout = await db.insert(payoutsTable)
      .values({
        seller_id: seller[0].id,
        amount_cents: 10000,
        status: 'paid', // Already paid
        provider_ref: 'stripe_ref_123'
      })
      .returning()
      .execute();

    const input: ProcessPayoutInput = {
      payout_id: payout[0].id,
      action: 'mark_paid'
    };

    await expect(processPayoutAdmin(input, admin[0].id))
      .rejects
      .toThrow(/payout is not in requested status/i);
  });

  it('should reject invalid action', async () => {
    // Create admin and seller
    const admin = await db.insert(usersTable)
      .values(testAdmin)
      .returning()
      .execute();

    const seller = await db.insert(usersTable)
      .values(testSeller)
      .returning()
      .execute();

    // Create payout request
    const payout = await db.insert(payoutsTable)
      .values({
        seller_id: seller[0].id,
        amount_cents: 10000,
        status: 'requested',
        provider_ref: null
      })
      .returning()
      .execute();

    const input = {
      payout_id: payout[0].id,
      action: 'invalid_action' as any // Invalid action
    };

    await expect(processPayoutAdmin(input, admin[0].id))
      .rejects
      .toThrow(/invalid action/i);
  });

  it('should reject processing by non-existent admin', async () => {
    const seller = await db.insert(usersTable)
      .values(testSeller)
      .returning()
      .execute();

    // Create payout request
    const payout = await db.insert(payoutsTable)
      .values({
        seller_id: seller[0].id,
        amount_cents: 10000,
        status: 'requested',
        provider_ref: null
      })
      .returning()
      .execute();

    const input: ProcessPayoutInput = {
      payout_id: payout[0].id,
      action: 'mark_paid'
    };

    const fakeAdminId = '00000000-0000-0000-0000-000000000000';

    await expect(processPayoutAdmin(input, fakeAdminId))
      .rejects
      .toThrow(/admin not found or insufficient permissions/i);
  });
});