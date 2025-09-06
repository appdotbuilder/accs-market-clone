import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, disputesTable, ordersTable, listingsTable, categoriesTable } from '../db/schema';
import { type ListUsersInput, type ListDisputesInput } from '../schema';
import { listUsers, listDisputes } from '../handlers/admin';

// Test data
const testAdmin = {
  email: 'admin@test.com',
  password_hash: 'hashedpassword',
  role: 'admin' as const
};

const testBuyer = {
  email: 'buyer@test.com',
  password_hash: 'hashedpassword',
  role: 'buyer' as const
};

const testSeller = {
  email: 'seller@test.com',
  password_hash: 'hashedpassword',
  role: 'seller' as const
};

const testCategory = {
  name: 'Test Category',
  slug: 'test-category'
};

describe('Admin Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('listUsers', () => {
    it('should list all users for admin', async () => {
      // Create test data
      const [admin] = await db.insert(usersTable)
        .values(testAdmin)
        .returning()
        .execute();

      const [buyer] = await db.insert(usersTable)
        .values(testBuyer)
        .returning()
        .execute();

      const [seller] = await db.insert(usersTable)
        .values(testSeller)
        .returning()
        .execute();

      const input: ListUsersInput = {
        page: 1
      };

      const result = await listUsers(input, admin.id);

      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.page_size).toBe(20);
      expect(result.total_pages).toBe(1);

      // Verify password hashes are redacted
      result.items.forEach(user => {
        expect(user.password_hash).toBe('[REDACTED]');
      });

      // Verify users are ordered by creation date (newest first)
      expect(result.items[0].email).toBe(testSeller.email);
      expect(result.items[1].email).toBe(testBuyer.email);
      expect(result.items[2].email).toBe(testAdmin.email);
    });

    it('should filter users by role', async () => {
      // Create test data
      const [admin] = await db.insert(usersTable)
        .values(testAdmin)
        .returning()
        .execute();

      await db.insert(usersTable)
        .values(testBuyer)
        .returning()
        .execute();

      await db.insert(usersTable)
        .values(testSeller)
        .returning()
        .execute();

      const input: ListUsersInput = {
        role: 'seller',
        page: 1
      };

      const result = await listUsers(input, admin.id);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].role).toBe('seller');
      expect(result.items[0].email).toBe(testSeller.email);
      expect(result.total).toBe(1);
    });

    it('should filter users by email search', async () => {
      // Create test data
      const [admin] = await db.insert(usersTable)
        .values(testAdmin)
        .returning()
        .execute();

      await db.insert(usersTable)
        .values(testBuyer)
        .returning()
        .execute();

      await db.insert(usersTable)
        .values(testSeller)
        .returning()
        .execute();

      const input: ListUsersInput = {
        q: 'buyer',
        page: 1
      };

      const result = await listUsers(input, admin.id);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].email).toBe(testBuyer.email);
      expect(result.total).toBe(1);
    });

    it('should combine role and search filters', async () => {
      // Create test data
      const [admin] = await db.insert(usersTable)
        .values(testAdmin)
        .returning()
        .execute();

      await db.insert(usersTable)
        .values(testBuyer)
        .returning()
        .execute();

      await db.insert(usersTable)
        .values(testSeller)
        .returning()
        .execute();

      await db.insert(usersTable)
        .values({
          email: 'another-seller@test.com',
          password_hash: 'hashedpassword',
          role: 'seller' as const
        })
        .returning()
        .execute();

      const input: ListUsersInput = {
        role: 'seller',
        q: 'seller@test.com', // This should match both seller@test.com and another-seller@test.com
        page: 1
      };

      const result = await listUsers(input, admin.id);

      expect(result.items).toHaveLength(2); // Should find both sellers
      expect(result.total).toBe(2);
      result.items.forEach(user => {
        expect(user.role).toBe('seller');
        expect(user.email).toMatch(/seller@test\.com$/);
      });
    });

    it('should handle pagination correctly', async () => {
      // Create admin
      const [admin] = await db.insert(usersTable)
        .values(testAdmin)
        .returning()
        .execute();

      // Create 25 users to test pagination
      const users = Array.from({ length: 25 }, (_, i) => ({
        email: `user${i}@test.com`,
        password_hash: 'hashedpassword',
        role: 'buyer' as const
      }));

      await db.insert(usersTable)
        .values(users)
        .execute();

      // Test first page
      const firstPage = await listUsers({ page: 1 }, admin.id);
      expect(firstPage.items).toHaveLength(20);
      expect(firstPage.total).toBe(26); // 25 users + 1 admin
      expect(firstPage.page).toBe(1);
      expect(firstPage.total_pages).toBe(2);

      // Test second page
      const secondPage = await listUsers({ page: 2 }, admin.id);
      expect(secondPage.items).toHaveLength(6);
      expect(secondPage.total).toBe(26);
      expect(secondPage.page).toBe(2);
      expect(secondPage.total_pages).toBe(2);
    });

    it('should reject non-admin users', async () => {
      // Create non-admin user
      const [buyer] = await db.insert(usersTable)
        .values(testBuyer)
        .returning()
        .execute();

      const input: ListUsersInput = {
        page: 1
      };

      await expect(listUsers(input, buyer.id)).rejects.toThrow(/unauthorized.*admin/i);
    });

    it('should reject unknown user ids', async () => {
      const input: ListUsersInput = {
        page: 1
      };

      const fakeAdminId = '123e4567-e89b-12d3-a456-426614174000';
      await expect(listUsers(input, fakeAdminId)).rejects.toThrow(/unauthorized.*admin/i);
    });
  });

  describe('listDisputes', () => {
    it('should list all disputes for admin', async () => {
      // Create test users
      const [admin] = await db.insert(usersTable)
        .values(testAdmin)
        .returning()
        .execute();

      const [buyer] = await db.insert(usersTable)
        .values(testBuyer)
        .returning()
        .execute();

      const [seller] = await db.insert(usersTable)
        .values(testSeller)
        .returning()
        .execute();

      // Create category and listing
      const [category] = await db.insert(categoriesTable)
        .values(testCategory)
        .returning()
        .execute();

      const [listing] = await db.insert(listingsTable)
        .values({
          seller_id: seller.id,
          category_id: category.id,
          title: 'Test Listing',
          description: 'Test description',
          price_cents: 1000,
          currency: 'USD',
          status: 'available'
        })
        .returning()
        .execute();

      // Create orders
      const [order1] = await db.insert(ordersTable)
        .values({
          buyer_id: buyer.id,
          listing_id: listing.id,
          total_cents: 1000,
          currency: 'USD',
          status: 'disputed'
        })
        .returning()
        .execute();

      const [order2] = await db.insert(ordersTable)
        .values({
          buyer_id: buyer.id,
          listing_id: listing.id,
          total_cents: 1000,
          currency: 'USD',
          status: 'disputed'
        })
        .returning()
        .execute();

      // Create disputes (create them sequentially to ensure different timestamps)
      await db.insert(disputesTable)
        .values({
          order_id: order1.id,
          opener_id: buyer.id,
          reason: 'Item not received',
          status: 'open'
        })
        .execute();

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      await db.insert(disputesTable)
        .values({
          order_id: order2.id,
          opener_id: seller.id,
          reason: 'Buyer complaint invalid',
          status: 'resolved_seller'
        })
        .execute();

      const input: ListDisputesInput = {
        page: 1
      };

      const result = await listDisputes(input, admin.id);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.page_size).toBe(20);
      expect(result.total_pages).toBe(1);

      // Verify disputes are ordered by creation date (newest first)
      expect(result.items[0].reason).toBe('Buyer complaint invalid');
      expect(result.items[1].reason).toBe('Item not received');
    });

    it('should filter disputes by status', async () => {
      // Create test users
      const [admin] = await db.insert(usersTable)
        .values(testAdmin)
        .returning()
        .execute();

      const [buyer] = await db.insert(usersTable)
        .values(testBuyer)
        .returning()
        .execute();

      const [seller] = await db.insert(usersTable)
        .values(testSeller)
        .returning()
        .execute();

      // Create category and listing
      const [category] = await db.insert(categoriesTable)
        .values(testCategory)
        .returning()
        .execute();

      const [listing] = await db.insert(listingsTable)
        .values({
          seller_id: seller.id,
          category_id: category.id,
          title: 'Test Listing',
          description: 'Test description',
          price_cents: 1000,
          currency: 'USD',
          status: 'available'
        })
        .returning()
        .execute();

      // Create orders
      const [order1] = await db.insert(ordersTable)
        .values({
          buyer_id: buyer.id,
          listing_id: listing.id,
          total_cents: 1000,
          currency: 'USD',
          status: 'disputed'
        })
        .returning()
        .execute();

      const [order2] = await db.insert(ordersTable)
        .values({
          buyer_id: buyer.id,
          listing_id: listing.id,
          total_cents: 1000,
          currency: 'USD',
          status: 'disputed'
        })
        .returning()
        .execute();

      // Create disputes with different statuses
      await db.insert(disputesTable)
        .values([
          {
            order_id: order1.id,
            opener_id: buyer.id,
            reason: 'Open dispute',
            status: 'open'
          },
          {
            order_id: order2.id,
            opener_id: seller.id,
            reason: 'Resolved dispute',
            status: 'resolved_seller'
          }
        ])
        .execute();

      const input: ListDisputesInput = {
        status: 'open',
        page: 1
      };

      const result = await listDisputes(input, admin.id);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].status).toBe('open');
      expect(result.items[0].reason).toBe('Open dispute');
      expect(result.total).toBe(1);
    });

    it('should handle pagination correctly', async () => {
      // Create admin
      const [admin] = await db.insert(usersTable)
        .values(testAdmin)
        .returning()
        .execute();

      const [buyer] = await db.insert(usersTable)
        .values(testBuyer)
        .returning()
        .execute();

      const [seller] = await db.insert(usersTable)
        .values(testSeller)
        .returning()
        .execute();

      // Create category and listing
      const [category] = await db.insert(categoriesTable)
        .values(testCategory)
        .returning()
        .execute();

      const [listing] = await db.insert(listingsTable)
        .values({
          seller_id: seller.id,
          category_id: category.id,
          title: 'Test Listing',
          description: 'Test description',
          price_cents: 1000,
          currency: 'USD',
          status: 'available'
        })
        .returning()
        .execute();

      // Create 25 orders and disputes
      const orders = [];
      for (let i = 0; i < 25; i++) {
        const [order] = await db.insert(ordersTable)
          .values({
            buyer_id: buyer.id,
            listing_id: listing.id,
            total_cents: 1000,
            currency: 'USD',
            status: 'disputed'
          })
          .returning()
          .execute();
        orders.push(order);
      }

      const disputeData = orders.map(order => ({
        order_id: order.id,
        opener_id: buyer.id,
        reason: `Dispute for order ${order.id}`,
        status: 'open' as const
      }));

      await db.insert(disputesTable)
        .values(disputeData)
        .execute();

      // Test first page
      const firstPage = await listDisputes({ page: 1 }, admin.id);
      expect(firstPage.items).toHaveLength(20);
      expect(firstPage.total).toBe(25);
      expect(firstPage.page).toBe(1);
      expect(firstPage.total_pages).toBe(2);

      // Test second page
      const secondPage = await listDisputes({ page: 2 }, admin.id);
      expect(secondPage.items).toHaveLength(5);
      expect(secondPage.total).toBe(25);
      expect(secondPage.page).toBe(2);
      expect(secondPage.total_pages).toBe(2);
    });

    it('should reject non-admin users', async () => {
      // Create non-admin user
      const [buyer] = await db.insert(usersTable)
        .values(testBuyer)
        .returning()
        .execute();

      const input: ListDisputesInput = {
        page: 1
      };

      await expect(listDisputes(input, buyer.id)).rejects.toThrow(/unauthorized.*admin/i);
    });

    it('should reject unknown user ids', async () => {
      const input: ListDisputesInput = {
        page: 1
      };

      const fakeAdminId = '123e4567-e89b-12d3-a456-426614174000';
      await expect(listDisputes(input, fakeAdminId)).rejects.toThrow(/unauthorized.*admin/i);
    });

    it('should return empty results when no disputes exist', async () => {
      // Create admin
      const [admin] = await db.insert(usersTable)
        .values(testAdmin)
        .returning()
        .execute();

      const input: ListDisputesInput = {
        page: 1
      };

      const result = await listDisputes(input, admin.id);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.page_size).toBe(20);
      expect(result.total_pages).toBe(0);
    });
  });
});