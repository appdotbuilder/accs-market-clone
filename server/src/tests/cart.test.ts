import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, categoriesTable, listingsTable } from '../db/schema';
import { addToCart, removeFromCart, getCart } from '../handlers/cart';
import { eq } from 'drizzle-orm';

// Test data setup
const createTestUser = async (role: 'buyer' | 'seller' = 'buyer') => {
  const result = await db.insert(usersTable)
    .values({
      email: `${role}@test.com`,
      password_hash: 'hashed_password',
      role
    })
    .returning()
    .execute();
  return result[0];
};

const createTestCategory = async () => {
  const result = await db.insert(categoriesTable)
    .values({
      name: 'Test Category',
      slug: 'test-category'
    })
    .returning()
    .execute();
  return result[0];
};

const createTestListing = async (sellerId: string, categoryId: string, status: 'available' | 'sold' = 'available') => {
  const result = await db.insert(listingsTable)
    .values({
      seller_id: sellerId,
      category_id: categoryId,
      title: 'Test Listing',
      description: 'A test listing',
      price_cents: 1999,
      status
    })
    .returning()
    .execute();
  return result[0];
};

describe('Cart Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('addToCart', () => {
    it('should add listing to cart successfully', async () => {
      // Create test data
      const buyer = await createTestUser('buyer');
      const seller = await createTestUser('seller');
      const category = await createTestCategory();
      const listing = await createTestListing(seller.id, category.id);

      // Add to cart
      await addToCart(listing.id, buyer.id);

      // Verify cart contents
      const cart = await getCart(buyer.id);
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].listing.id).toBe(listing.id);
      expect(cart.items[0].listing.title).toBe('Test Listing');
    });

    it('should replace existing cart item when adding new item', async () => {
      // Create test data
      const buyer = await createTestUser('buyer');
      const seller = await createTestUser('seller');
      const category = await createTestCategory();
      const listing1 = await createTestListing(seller.id, category.id);
      
      // Create second listing
      const listing2 = await db.insert(listingsTable)
        .values({
          seller_id: seller.id,
          category_id: category.id,
          title: 'Second Test Listing',
          description: 'Another test listing',
          price_cents: 2999
        })
        .returning()
        .execute();

      // Add first listing to cart
      await addToCart(listing1.id, buyer.id);
      let cart = await getCart(buyer.id);
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].listing.id).toBe(listing1.id);

      // Add second listing - should replace first
      await addToCart(listing2[0].id, buyer.id);
      cart = await getCart(buyer.id);
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].listing.id).toBe(listing2[0].id);
      expect(cart.items[0].listing.title).toBe('Second Test Listing');
    });

    it('should throw error when buyer does not exist', async () => {
      const seller = await createTestUser('seller');
      const category = await createTestCategory();
      const listing = await createTestListing(seller.id, category.id);

      // Use a valid UUID format that doesn't exist in database
      const nonexistentBuyerId = '550e8400-e29b-41d4-a716-446655440000';
      await expect(addToCart(listing.id, nonexistentBuyerId)).rejects.toThrow(/buyer not found/i);
    });

    it('should throw error when listing does not exist', async () => {
      const buyer = await createTestUser('buyer');

      // Use a valid UUID format that doesn't exist in database
      const nonexistentListingId = '550e8400-e29b-41d4-a716-446655440001';
      await expect(addToCart(nonexistentListingId, buyer.id)).rejects.toThrow(/listing not found/i);
    });

    it('should throw error when listing is not available', async () => {
      const buyer = await createTestUser('buyer');
      const seller = await createTestUser('seller');
      const category = await createTestCategory();
      const listing = await createTestListing(seller.id, category.id, 'sold');

      await expect(addToCart(listing.id, buyer.id)).rejects.toThrow(/listing not found or not available/i);
    });

    it('should throw error when buyer tries to add their own listing', async () => {
      const sellerBuyer = await createTestUser('seller');
      const category = await createTestCategory();
      const listing = await createTestListing(sellerBuyer.id, category.id);

      await expect(addToCart(listing.id, sellerBuyer.id)).rejects.toThrow(/cannot add your own listing/i);
    });
  });

  describe('removeFromCart', () => {
    it('should remove listing from cart successfully', async () => {
      // Create test data and add to cart
      const buyer = await createTestUser('buyer');
      const seller = await createTestUser('seller');
      const category = await createTestCategory();
      const listing = await createTestListing(seller.id, category.id);

      await addToCart(listing.id, buyer.id);
      let cart = await getCart(buyer.id);
      expect(cart.items).toHaveLength(1);

      // Remove from cart
      await removeFromCart(listing.id, buyer.id);
      cart = await getCart(buyer.id);
      expect(cart.items).toHaveLength(0);
    });

    it('should handle removing non-existent item gracefully', async () => {
      const buyer = await createTestUser('buyer');

      // Should not throw error - use valid UUID format
      const nonexistentListingId = '550e8400-e29b-41d4-a716-446655440001';
      await removeFromCart(nonexistentListingId, buyer.id);
      
      const cart = await getCart(buyer.id);
      expect(cart.items).toHaveLength(0);
    });

    it('should handle removing wrong item gracefully', async () => {
      // Create test data and add to cart
      const buyer = await createTestUser('buyer');
      const seller = await createTestUser('seller');
      const category = await createTestCategory();
      const listing1 = await createTestListing(seller.id, category.id);
      
      // Create second listing
      const listing2 = await db.insert(listingsTable)
        .values({
          seller_id: seller.id,
          category_id: category.id,
          title: 'Second Test Listing',
          description: 'Another test listing',
          price_cents: 2999
        })
        .returning()
        .execute();

      await addToCart(listing1.id, buyer.id);
      let cart = await getCart(buyer.id);
      expect(cart.items).toHaveLength(1);

      // Try to remove different listing - should not affect cart
      await removeFromCart(listing2[0].id, buyer.id);
      cart = await getCart(buyer.id);
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].listing.id).toBe(listing1.id);
    });
  });

  describe('getCart', () => {
    it('should return empty cart for new buyer', async () => {
      const buyer = await createTestUser('buyer');

      const cart = await getCart(buyer.id);
      expect(cart.items).toHaveLength(0);
    });

    it('should return cart with listing details', async () => {
      const buyer = await createTestUser('buyer');
      const seller = await createTestUser('seller');
      const category = await createTestCategory();
      const listing = await createTestListing(seller.id, category.id);

      await addToCart(listing.id, buyer.id);
      const cart = await getCart(buyer.id);

      expect(cart.items).toHaveLength(1);
      const cartListing = cart.items[0].listing;
      expect(cartListing.id).toBe(listing.id);
      expect(cartListing.title).toBe('Test Listing');
      expect(cartListing.description).toBe('A test listing');
      expect(cartListing.price_cents).toBe(1999);
      expect(cartListing.status).toBe('available');
      expect(cartListing.created_at).toBeInstanceOf(Date);
      expect(cartListing.updated_at).toBeInstanceOf(Date);
    });

    it('should remove unavailable listings from cart', async () => {
      const buyer = await createTestUser('buyer');
      const seller = await createTestUser('seller');
      const category = await createTestCategory();
      const listing = await createTestListing(seller.id, category.id);

      // Add to cart
      await addToCart(listing.id, buyer.id);
      let cart = await getCart(buyer.id);
      expect(cart.items).toHaveLength(1);

      // Mark listing as sold
      await db.update(listingsTable)
        .set({ status: 'sold' })
        .where(eq(listingsTable.id, listing.id))
        .execute();

      // Get cart should now be empty and listing should be removed
      cart = await getCart(buyer.id);
      expect(cart.items).toHaveLength(0);
    });

    it('should throw error when buyer does not exist', async () => {
      // Use a valid UUID format that doesn't exist in database
      const nonexistentBuyerId = '550e8400-e29b-41d4-a716-446655440000';
      await expect(getCart(nonexistentBuyerId)).rejects.toThrow(/buyer not found/i);
    });
  });
});