import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { categoriesTable, listingsTable, usersTable, profilesTable } from '../db/schema';
import { type SearchListingsInput } from '../schema';
import { listCategories, searchListings, getListing } from '../handlers/catalog';
import { eq } from 'drizzle-orm';

// Test data setup
const testCategory1 = {
  name: 'Electronics',
  slug: 'electronics'
};

const testCategory2 = {
  name: 'Books',
  slug: 'books'
};

const testUser = {
  email: 'seller@example.com',
  password_hash: 'hashed_password',
  role: 'seller' as const
};

describe('catalog handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('listCategories', () => {
    it('should return empty array when no categories exist', async () => {
      const result = await listCategories();
      expect(result).toEqual([]);
    });

    it('should return categories sorted by name', async () => {
      // Insert categories in reverse alphabetical order
      const [category2] = await db.insert(categoriesTable)
        .values(testCategory2)
        .returning()
        .execute();

      const [category1] = await db.insert(categoriesTable)
        .values(testCategory1)
        .returning()
        .execute();

      const result = await listCategories();

      expect(result).toHaveLength(2);
      // Should be sorted alphabetically: Books, Electronics
      expect(result[0].name).toBe('Books');
      expect(result[0].slug).toBe('books');
      expect(result[1].name).toBe('Electronics');
      expect(result[1].slug).toBe('electronics');
      expect(result[0].id).toBeDefined();
      expect(result[1].id).toBeDefined();
    });

    it('should handle multiple categories correctly', async () => {
      // Insert multiple categories
      await db.insert(categoriesTable)
        .values([
          { name: 'Zebra Category', slug: 'zebra' },
          { name: 'Alpha Category', slug: 'alpha' },
          { name: 'Beta Category', slug: 'beta' }
        ])
        .execute();

      const result = await listCategories();

      expect(result).toHaveLength(3);
      // Should be sorted: Alpha, Beta, Zebra
      expect(result[0].name).toBe('Alpha Category');
      expect(result[1].name).toBe('Beta Category');
      expect(result[2].name).toBe('Zebra Category');
    });
  });

  describe('searchListings', () => {
    let categoryId: string;
    let userId: string;

    beforeEach(async () => {
      // Create prerequisite data
      const [category] = await db.insert(categoriesTable)
        .values(testCategory1)
        .returning()
        .execute();
      categoryId = category.id;

      const [user] = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();
      userId = user.id;

      // Create profile for the user
      await db.insert(profilesTable)
        .values({
          user_id: userId,
          rating: '4.5',
          verification_status: 'verified'
        })
        .execute();
    });

    it('should return empty results when no listings exist', async () => {
      const input: SearchListingsInput = {
        page: 1,
        page_size: 20
      };

      const result = await searchListings(input);

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.page_size).toBe(20);
      expect(result.total_pages).toBe(0);
    });

    it('should return available listings with pagination', async () => {
      // Create test listings
      const listings = [
        {
          seller_id: userId,
          category_id: categoryId,
          title: 'iPhone 15',
          description: 'Latest iPhone model',
          price_cents: 99999,
          status: 'available' as const
        },
        {
          seller_id: userId,
          category_id: categoryId,
          title: 'Samsung Galaxy',
          description: 'Android smartphone',
          price_cents: 79999,
          status: 'available' as const
        },
        {
          seller_id: userId,
          category_id: categoryId,
          title: 'Sold Phone',
          description: 'This should not appear',
          price_cents: 59999,
          status: 'sold' as const
        }
      ];

      await db.insert(listingsTable)
        .values(listings)
        .execute();

      const input: SearchListingsInput = {
        page: 1,
        page_size: 20
      };

      const result = await searchListings(input);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.page_size).toBe(20);
      expect(result.total_pages).toBe(1);

      // Check that only available listings are returned
      result.items.forEach(listing => {
        expect(listing.status).toBe('available');
        expect(listing.id).toBeDefined();
        expect(listing.created_at).toBeInstanceOf(Date);
        expect(listing.updated_at).toBeInstanceOf(Date);
      });
    });

    it('should filter by search query', async () => {
      await db.insert(listingsTable)
        .values([
          {
            seller_id: userId,
            category_id: categoryId,
            title: 'iPhone 15 Pro',
            description: 'Apple smartphone',
            price_cents: 99999,
            status: 'available' as const
          },
          {
            seller_id: userId,
            category_id: categoryId,
            title: 'Samsung Galaxy',
            description: 'Android phone',
            price_cents: 79999,
            status: 'available' as const
          }
        ])
        .execute();

      const input: SearchListingsInput = {
        q: 'iPhone',
        page: 1,
        page_size: 20
      };

      const result = await searchListings(input);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toContain('iPhone');
      expect(result.total).toBe(1);
    });

    it('should filter by category slug', async () => {
      // Create another category
      const [booksCategory] = await db.insert(categoriesTable)
        .values(testCategory2)
        .returning()
        .execute();

      await db.insert(listingsTable)
        .values([
          {
            seller_id: userId,
            category_id: categoryId, // electronics
            title: 'iPhone 15',
            description: 'Apple smartphone',
            price_cents: 99999,
            status: 'available' as const
          },
          {
            seller_id: userId,
            category_id: booksCategory.id, // books
            title: 'Programming Book',
            description: 'Learn to code',
            price_cents: 2999,
            status: 'available' as const
          }
        ])
        .execute();

      const input: SearchListingsInput = {
        category_slug: 'books',
        page: 1,
        page_size: 20
      };

      const result = await searchListings(input);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe('Programming Book');
      expect(result.total).toBe(1);
    });

    it('should filter by price range', async () => {
      await db.insert(listingsTable)
        .values([
          {
            seller_id: userId,
            category_id: categoryId,
            title: 'Cheap Phone',
            description: 'Budget option',
            price_cents: 19999, // $199.99
            status: 'available' as const
          },
          {
            seller_id: userId,
            category_id: categoryId,
            title: 'Mid Phone',
            description: 'Middle range',
            price_cents: 49999, // $499.99
            status: 'available' as const
          },
          {
            seller_id: userId,
            category_id: categoryId,
            title: 'Expensive Phone',
            description: 'Premium option',
            price_cents: 99999, // $999.99
            status: 'available' as const
          }
        ])
        .execute();

      // Test min_price filter
      const minPriceInput: SearchListingsInput = {
        min_price: 50000, // $500
        page: 1,
        page_size: 20
      };

      const minPriceResult = await searchListings(minPriceInput);
      expect(minPriceResult.items).toHaveLength(1);
      expect(minPriceResult.items[0].title).toBe('Expensive Phone');

      // Test max_price filter
      const maxPriceInput: SearchListingsInput = {
        max_price: 30000, // $300
        page: 1,
        page_size: 20
      };

      const maxPriceResult = await searchListings(maxPriceInput);
      expect(maxPriceResult.items).toHaveLength(1);
      expect(maxPriceResult.items[0].title).toBe('Cheap Phone');

      // Test price range filter
      const rangeInput: SearchListingsInput = {
        min_price: 30000, // $300
        max_price: 70000, // $700
        page: 1,
        page_size: 20
      };

      const rangeResult = await searchListings(rangeInput);
      expect(rangeResult.items).toHaveLength(1);
      expect(rangeResult.items[0].title).toBe('Mid Phone');
    });

    it('should handle pagination correctly', async () => {
      // Create 5 test listings
      const listings = [];
      for (let i = 1; i <= 5; i++) {
        listings.push({
          seller_id: userId,
          category_id: categoryId,
          title: `Phone ${i}`,
          description: `Description ${i}`,
          price_cents: 10000 + i * 1000,
          status: 'available' as const
        });
      }

      await db.insert(listingsTable)
        .values(listings)
        .execute();

      // Test first page
      const page1Input: SearchListingsInput = {
        page: 1,
        page_size: 2
      };

      const page1Result = await searchListings(page1Input);
      expect(page1Result.items).toHaveLength(2);
      expect(page1Result.total).toBe(5);
      expect(page1Result.page).toBe(1);
      expect(page1Result.page_size).toBe(2);
      expect(page1Result.total_pages).toBe(3);

      // Test second page
      const page2Input: SearchListingsInput = {
        page: 2,
        page_size: 2
      };

      const page2Result = await searchListings(page2Input);
      expect(page2Result.items).toHaveLength(2);
      expect(page2Result.page).toBe(2);

      // Test last page
      const page3Input: SearchListingsInput = {
        page: 3,
        page_size: 2
      };

      const page3Result = await searchListings(page3Input);
      expect(page3Result.items).toHaveLength(1);
      expect(page3Result.page).toBe(3);
    });

    it('should combine multiple filters', async () => {
      // Create another category
      const [booksCategory] = await db.insert(categoriesTable)
        .values(testCategory2)
        .returning()
        .execute();

      await db.insert(listingsTable)
        .values([
          {
            seller_id: userId,
            category_id: categoryId,
            title: 'iPhone Pro Max',
            description: 'Premium Apple phone',
            price_cents: 109999,
            status: 'available' as const
          },
          {
            seller_id: userId,
            category_id: categoryId,
            title: 'iPhone Mini',
            description: 'Compact Apple phone',
            price_cents: 59999,
            status: 'available' as const
          },
          {
            seller_id: userId,
            category_id: booksCategory.id,
            title: 'iPhone Guide Book',
            description: 'How to use iPhone',
            price_cents: 2999,
            status: 'available' as const
          }
        ])
        .execute();

      const input: SearchListingsInput = {
        q: 'iPhone',
        category_slug: 'electronics',
        min_price: 60000,
        page: 1,
        page_size: 20
      };

      const result = await searchListings(input);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe('iPhone Pro Max');
      expect(result.total).toBe(1);
    });
  });

  describe('getListing', () => {
    let categoryId: string;
    let userId: string;

    beforeEach(async () => {
      // Create prerequisite data
      const [category] = await db.insert(categoriesTable)
        .values(testCategory1)
        .returning()
        .execute();
      categoryId = category.id;

      const [user] = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();
      userId = user.id;
    });

    it('should return null for non-existent listing', async () => {
      const result = await getListing('550e8400-e29b-41d4-a716-446655440000');
      expect(result).toBeNull();
    });

    it('should return available listing by ID', async () => {
      const [listing] = await db.insert(listingsTable)
        .values({
          seller_id: userId,
          category_id: categoryId,
          title: 'iPhone 15',
          description: 'Latest iPhone model',
          price_cents: 99999,
          status: 'available' as const
        })
        .returning()
        .execute();

      const result = await getListing(listing.id);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(listing.id);
      expect(result!.title).toBe('iPhone 15');
      expect(result!.description).toBe('Latest iPhone model');
      expect(result!.price_cents).toBe(99999);
      expect(result!.status).toBe('available');
      expect(result!.seller_id).toBe(userId);
      expect(result!.category_id).toBe(categoryId);
      expect(result!.currency).toBe('USD');
      expect(result!.has_secure_payload).toBe(false);
      expect(result!.created_at).toBeInstanceOf(Date);
      expect(result!.updated_at).toBeInstanceOf(Date);
    });

    it('should return null for non-available listings', async () => {
      const [soldListing] = await db.insert(listingsTable)
        .values({
          seller_id: userId,
          category_id: categoryId,
          title: 'Sold iPhone',
          description: 'This was sold',
          price_cents: 99999,
          status: 'sold' as const
        })
        .returning()
        .execute();

      const [delistedListing] = await db.insert(listingsTable)
        .values({
          seller_id: userId,
          category_id: categoryId,
          title: 'Delisted iPhone',
          description: 'This was delisted',
          price_cents: 99999,
          status: 'delisted' as const
        })
        .returning()
        .execute();

      const soldResult = await getListing(soldListing.id);
      const delistedResult = await getListing(delistedListing.id);

      expect(soldResult).toBeNull();
      expect(delistedResult).toBeNull();
    });

    it('should validate listing properties', async () => {
      const [listing] = await db.insert(listingsTable)
        .values({
          seller_id: userId,
          category_id: categoryId,
          title: 'Test Product',
          description: 'A test listing',
          price_cents: 12345,
          currency: 'EUR',
          status: 'available' as const,
          has_secure_payload: true
        })
        .returning()
        .execute();

      const result = await getListing(listing.id);

      expect(result).not.toBeNull();
      expect(result!.currency).toBe('EUR');
      expect(result!.has_secure_payload).toBe(true);
      expect(typeof result!.price_cents).toBe('number');
      expect(result!.created_at instanceof Date).toBe(true);
    });
  });
});