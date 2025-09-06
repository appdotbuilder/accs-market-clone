import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  categoriesTable, 
  listingsTable,
  listingSecurePayloadsTable,
  ordersTable
} from '../db/schema';
import { 
  upsertListing,
  setListingPayload,
  setListingStatus,
  getMyListings,
  getMyBalance
} from '../handlers/seller';
import { eq, and } from 'drizzle-orm';
import type { 
  UpsertListingInput, 
  SetListingPayloadInput,
  SetListingStatusInput 
} from '../schema';

// Test data
const testSeller = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'seller@test.com',
  password_hash: 'hashed_password',
  role: 'seller' as const
};

const testBuyer = {
  id: '22222222-2222-2222-2222-222222222222',
  email: 'buyer@test.com',
  password_hash: 'hashed_password',
  role: 'buyer' as const
};

const testCategory = {
  id: '33333333-3333-3333-3333-333333333333',
  name: 'Electronics',
  slug: 'electronics'
};

const testListingInput: UpsertListingInput = {
  title: 'Test Product',
  description: 'A test product for sale',
  category_id: testCategory.id,
  price_cents: 1999
};

describe('seller handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  beforeEach(async () => {
    // Create prerequisite data
    await db.insert(usersTable).values([testSeller, testBuyer]).execute();
    await db.insert(categoriesTable).values(testCategory).execute();
  });

  describe('upsertListing', () => {
    it('should create a new listing', async () => {
      const result = await upsertListing(testListingInput, testSeller.id);

      expect(result.title).toEqual('Test Product');
      expect(result.description).toEqual(testListingInput.description);
      expect(result.price_cents).toEqual(1999);
      expect(result.seller_id).toEqual(testSeller.id);
      expect(result.category_id).toEqual(testCategory.id);
      expect(result.currency).toEqual('USD');
      expect(result.status).toEqual('available');
      expect(result.has_secure_payload).toEqual(false);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should save listing to database', async () => {
      const result = await upsertListing(testListingInput, testSeller.id);

      const listings = await db.select()
        .from(listingsTable)
        .where(eq(listingsTable.id, result.id))
        .execute();

      expect(listings).toHaveLength(1);
      expect(listings[0].title).toEqual('Test Product');
      expect(listings[0].seller_id).toEqual(testSeller.id);
    });

    it('should update existing listing', async () => {
      // Create initial listing
      const initial = await upsertListing(testListingInput, testSeller.id);

      // Update listing
      const updateInput: UpsertListingInput = {
        id: initial.id,
        title: 'Updated Product',
        description: 'Updated description',
        category_id: testCategory.id,
        price_cents: 2999
      };

      const result = await upsertListing(updateInput, testSeller.id);

      expect(result.id).toEqual(initial.id);
      expect(result.title).toEqual('Updated Product');
      expect(result.description).toEqual('Updated description');
      expect(result.price_cents).toEqual(2999);
      expect(result.updated_at > initial.updated_at).toBe(true);
    });

    it('should reject update for non-owned listing', async () => {
      // Create listing with first seller
      const initial = await upsertListing(testListingInput, testSeller.id);

      // Try to update with different seller
      const otherSellerId = '99999999-9999-9999-9999-999999999999';
      await db.insert(usersTable).values({
        id: otherSellerId,
        email: 'other@test.com',
        password_hash: 'hash',
        role: 'seller'
      }).execute();

      const updateInput: UpsertListingInput = {
        id: initial.id,
        title: 'Hacked Product',
        description: 'Should not work',
        category_id: testCategory.id,
        price_cents: 1
      };

      await expect(upsertListing(updateInput, otherSellerId))
        .rejects.toThrow(/not found or access denied/i);
    });

    it('should reject invalid category', async () => {
      const invalidInput: UpsertListingInput = {
        title: 'Test Product',
        description: 'Test',
        category_id: '99999999-9999-9999-9999-999999999999',
        price_cents: 1999
      };

      await expect(upsertListing(invalidInput, testSeller.id))
        .rejects.toThrow(/category not found/i);
    });
  });

  describe('setListingPayload', () => {
    it('should set secure payload for owned listing', async () => {
      // Create listing first
      const listing = await upsertListing(testListingInput, testSeller.id);

      const payloadInput: SetListingPayloadInput = {
        listing_id: listing.id,
        plaintext_credentials: 'username:password123'
      };

      await setListingPayload(payloadInput, testSeller.id);

      // Verify payload was stored
      const payloads = await db.select()
        .from(listingSecurePayloadsTable)
        .where(eq(listingSecurePayloadsTable.listing_id, listing.id))
        .execute();

      expect(payloads).toHaveLength(1);
      expect(payloads[0].cipher_text).toBeDefined();
      expect(payloads[0].nonce).toBeDefined();

      // Verify listing was updated
      const updatedListing = await db.select()
        .from(listingsTable)
        .where(eq(listingsTable.id, listing.id))
        .execute();

      expect(updatedListing[0].has_secure_payload).toBe(true);
    });

    it('should reject payload for non-owned listing', async () => {
      // Create listing with first seller
      const listing = await upsertListing(testListingInput, testSeller.id);

      // Try to set payload with different seller
      const otherSellerId = '99999999-9999-9999-9999-999999999999';
      await db.insert(usersTable).values({
        id: otherSellerId,
        email: 'other@test.com',
        password_hash: 'hash',
        role: 'seller'
      }).execute();

      const payloadInput: SetListingPayloadInput = {
        listing_id: listing.id,
        plaintext_credentials: 'hacked'
      };

      await expect(setListingPayload(payloadInput, otherSellerId))
        .rejects.toThrow(/not found or access denied/i);
    });
  });

  describe('setListingStatus', () => {
    it('should update status for owned listing', async () => {
      // Create listing first
      const listing = await upsertListing(testListingInput, testSeller.id);

      const statusInput: SetListingStatusInput = {
        listing_id: listing.id,
        status: 'delisted'
      };

      await setListingStatus(statusInput, testSeller.id);

      // Verify status was updated
      const updatedListing = await db.select()
        .from(listingsTable)
        .where(eq(listingsTable.id, listing.id))
        .execute();

      expect(updatedListing[0].status).toEqual('delisted');
    });

    it('should reject manually setting status to sold', async () => {
      const listing = await upsertListing(testListingInput, testSeller.id);

      const statusInput: SetListingStatusInput = {
        listing_id: listing.id,
        status: 'sold'
      };

      await expect(setListingStatus(statusInput, testSeller.id))
        .rejects.toThrow(/cannot manually set.*sold/i);
    });

    it('should reject status change for non-owned listing', async () => {
      const listing = await upsertListing(testListingInput, testSeller.id);

      const otherSellerId = '99999999-9999-9999-9999-999999999999';
      await db.insert(usersTable).values({
        id: otherSellerId,
        email: 'other@test.com',
        password_hash: 'hash',
        role: 'seller'
      }).execute();

      const statusInput: SetListingStatusInput = {
        listing_id: listing.id,
        status: 'delisted'
      };

      await expect(setListingStatus(statusInput, otherSellerId))
        .rejects.toThrow(/not found or access denied/i);
    });
  });

  describe('getMyListings', () => {
    it('should return seller listings with pagination', async () => {
      // Create multiple listings
      await upsertListing({...testListingInput, title: 'Product 1'}, testSeller.id);
      await upsertListing({...testListingInput, title: 'Product 2'}, testSeller.id);

      const result = await getMyListings({ page: 1 }, testSeller.id);

      expect(result.items).toHaveLength(2);
      expect(result.total).toEqual(2);
      expect(result.page).toEqual(1);
      expect(result.page_size).toEqual(20);
      expect(result.total_pages).toEqual(1);
      expect(result.items[0].title).toBeDefined();
      expect(result.items[0].seller_id).toEqual(testSeller.id);
    });

    it('should filter by status', async () => {
      // Create listings with different statuses
      const listing1 = await upsertListing({...testListingInput, title: 'Available'}, testSeller.id);
      const listing2 = await upsertListing({...testListingInput, title: 'Delisted'}, testSeller.id);

      // Update one listing status
      await setListingStatus({ listing_id: listing2.id, status: 'delisted' }, testSeller.id);

      const result = await getMyListings({ status: 'available', page: 1 }, testSeller.id);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toEqual('Available');
      expect(result.items[0].status).toEqual('available');
    });

    it('should only return listings for the seller', async () => {
      // Create listing for test seller
      await upsertListing(testListingInput, testSeller.id);

      // Create another seller and listing
      const otherSellerId = '99999999-9999-9999-9999-999999999999';
      await db.insert(usersTable).values({
        id: otherSellerId,
        email: 'other@test.com',
        password_hash: 'hash',
        role: 'seller'
      }).execute();
      await upsertListing({...testListingInput, title: 'Other Seller Product'}, otherSellerId);

      const result = await getMyListings({ page: 1 }, testSeller.id);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].seller_id).toEqual(testSeller.id);
      expect(result.items[0].title).toEqual('Test Product');
    });
  });

  describe('getMyBalance', () => {
    it('should calculate available and pending balance', async () => {
      // Create listing
      const listing = await upsertListing(testListingInput, testSeller.id);

      // Create orders with different statuses
      await db.insert(ordersTable).values([
        {
          buyer_id: testBuyer.id,
          listing_id: listing.id,
          total_cents: 1000,
          currency: 'USD',
          status: 'complete'
        },
        {
          buyer_id: testBuyer.id,
          listing_id: listing.id,
          total_cents: 500,
          currency: 'USD',
          status: 'delivered'
        },
        {
          buyer_id: testBuyer.id,
          listing_id: listing.id,
          total_cents: 300,
          currency: 'USD',
          status: 'pending'
        }
      ]).execute();

      const result = await getMyBalance(testSeller.id);

      expect(result.available_cents).toEqual(1000); // Only 'complete' orders
      expect(result.pending_cents).toEqual(500); // Only 'delivered' orders
    });

    it('should return zero balances when no orders exist', async () => {
      const result = await getMyBalance(testSeller.id);

      expect(result.available_cents).toEqual(0);
      expect(result.pending_cents).toEqual(0);
    });

    it('should only include balances from seller own listings', async () => {
      // Create listing for test seller
      const listing = await upsertListing(testListingInput, testSeller.id);

      // Create other seller and their listing
      const otherSellerId = '99999999-9999-9999-9999-999999999999';
      await db.insert(usersTable).values({
        id: otherSellerId,
        email: 'other@test.com',
        password_hash: 'hash',
        role: 'seller'
      }).execute();
      const otherListing = await upsertListing(testListingInput, otherSellerId);

      // Create orders for both listings
      await db.insert(ordersTable).values([
        {
          buyer_id: testBuyer.id,
          listing_id: listing.id,
          total_cents: 1000,
          currency: 'USD',
          status: 'complete'
        },
        {
          buyer_id: testBuyer.id,
          listing_id: otherListing.id,
          total_cents: 5000,
          currency: 'USD',
          status: 'complete'
        }
      ]).execute();

      const result = await getMyBalance(testSeller.id);

      expect(result.available_cents).toEqual(1000); // Only from test seller's listing
      expect(result.pending_cents).toEqual(0);
    });
  });
});