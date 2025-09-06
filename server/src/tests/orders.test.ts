import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  categoriesTable, 
  listingsTable, 
  ordersTable,
  listingSecurePayloadsTable 
} from '../db/schema';
import { eq } from 'drizzle-orm';
import { 
  getMyOrders, 
  getOrder, 
  acknowledgeDelivery 
} from '../handlers/orders';
import { type AcknowledgeDeliveryInput } from '../schema';

// Test data
const testUser = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'buyer@test.com',
  password_hash: 'hashed_password',
  role: 'buyer' as const
};

const testSeller = {
  id: '00000000-0000-0000-0000-000000000002',
  email: 'seller@test.com',
  password_hash: 'hashed_password',
  role: 'seller' as const
};

const testAdmin = {
  id: '00000000-0000-0000-0000-000000000003',
  email: 'admin@test.com',
  password_hash: 'hashed_password',
  role: 'admin' as const
};

const testCategory = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Test Category',
  slug: 'test-category'
};

const testListing = {
  id: '00000000-0000-0000-0000-000000000001',
  seller_id: testSeller.id,
  category_id: testCategory.id,
  title: 'Test Listing',
  description: 'A test listing',
  price_cents: 1999,
  currency: 'USD',
  status: 'available' as const,
  has_secure_payload: true
};

const testOrder = {
  id: '00000000-0000-0000-0000-000000000001',
  buyer_id: testUser.id,
  listing_id: testListing.id,
  total_cents: 1999,
  currency: 'USD',
  status: 'pending' as const
};

const testSecurePayload = {
  id: '00000000-0000-0000-0000-000000000001',
  listing_id: testListing.id,
  cipher_text: 'encrypted_content',
  nonce: 'random_nonce'
};

describe('Orders handlers', () => {
  beforeEach(async () => {
    await createDB();
    
    // Insert test data
    await db.insert(usersTable).values([testUser, testSeller, testAdmin]).execute();
    await db.insert(categoriesTable).values(testCategory).execute();
    await db.insert(listingsTable).values(testListing).execute();
    await db.insert(listingSecurePayloadsTable).values(testSecurePayload).execute();
  });

  afterEach(resetDB);

  describe('getMyOrders', () => {
    it('should return empty list when no orders exist', async () => {
      const result = await getMyOrders({ page: 1 }, testUser.id);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.page_size).toBe(20);
      expect(result.total_pages).toBe(0);
    });

    it('should return orders for specific buyer', async () => {
      // Create orders for different buyers
      const order1 = { ...testOrder, id: '00000000-0000-0000-0000-000000000001' };
      const order2 = { 
        ...testOrder, 
        id: '00000000-0000-0000-0000-000000000002',
        buyer_id: testSeller.id // Different buyer
      };
      
      await db.insert(ordersTable).values([order1, order2]).execute();

      const result = await getMyOrders({ page: 1 }, testUser.id);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].buyer_id).toBe(testUser.id);
      expect(result.items[0].id).toBe(order1.id);
      expect(result.total).toBe(1);
    });

    it('should filter orders by status', async () => {
      // Create orders with different statuses
      const pendingOrder = { 
        ...testOrder, 
        id: '00000000-0000-0000-0000-000000000001',
        status: 'pending' as const 
      };
      const paidOrder = { 
        ...testOrder, 
        id: '00000000-0000-0000-0000-000000000002',
        status: 'paid' as const 
      };
      
      await db.insert(ordersTable).values([pendingOrder, paidOrder]).execute();

      const result = await getMyOrders({ status: 'paid', page: 1 }, testUser.id);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].status).toBe('paid');
      expect(result.items[0].id).toBe(paidOrder.id);
      expect(result.total).toBe(1);
    });

    it('should handle pagination correctly', async () => {
      // Create multiple orders to test pagination
      const orders = Array.from({ length: 25 }, (_, i) => ({
        ...testOrder,
        id: `00000000-0000-0000-0000-${(100 + i).toString().padStart(12, '0')}`,
      }));
      
      await db.insert(ordersTable).values(orders).execute();

      // Test first page
      const page1 = await getMyOrders({ page: 1 }, testUser.id);
      expect(page1.items).toHaveLength(20);
      expect(page1.total).toBe(25);
      expect(page1.total_pages).toBe(2);

      // Test second page
      const page2 = await getMyOrders({ page: 2 }, testUser.id);
      expect(page2.items).toHaveLength(5);
      expect(page2.total).toBe(25);
      expect(page2.total_pages).toBe(2);
    });

    it('should order results by created_at descending', async () => {
      const now = new Date();
      const earlier = new Date(now.getTime() - 60000); // 1 minute earlier

      const order1 = { 
        ...testOrder, 
        id: '00000000-0000-0000-0000-000000000001',
        created_at: earlier 
      };
      const order2 = { 
        ...testOrder, 
        id: '00000000-0000-0000-0000-000000000002',
        created_at: now 
      };
      
      await db.insert(ordersTable).values([order1, order2]).execute();

      const result = await getMyOrders({ page: 1 }, testUser.id);

      expect(result.items).toHaveLength(2);
      expect(result.items[0].id).toBe(order2.id); // Most recent first
      expect(result.items[1].id).toBe(order1.id);
    });
  });

  describe('getOrder', () => {
    beforeEach(async () => {
      await db.insert(ordersTable).values(testOrder).execute();
    });

    it('should return order for buyer', async () => {
      const result = await getOrder(testOrder.id, testUser.id, 'buyer');

      expect(result.id).toBe(testOrder.id);
      expect(result.buyer_id).toBe(testUser.id);
      expect(result.listing_id).toBe(testListing.id);
      expect(result.total_cents).toBe(1999);
      expect(result.currency).toBe('USD');
      expect(result.status).toBe('pending');
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should return order for seller', async () => {
      const result = await getOrder(testOrder.id, testSeller.id, 'seller');

      expect(result.id).toBe(testOrder.id);
      expect(result.buyer_id).toBe(testUser.id);
    });

    it('should return order for admin', async () => {
      const result = await getOrder(testOrder.id, testAdmin.id, 'admin');

      expect(result.id).toBe(testOrder.id);
      expect(result.buyer_id).toBe(testUser.id);
    });

    it('should throw error for unauthorized user', async () => {
      const unauthorizedUserId = '00000000-0000-0000-0000-000000000999';

      await expect(getOrder(testOrder.id, unauthorizedUserId, 'buyer'))
        .rejects.toThrow(/access denied/i);
    });

    it('should throw error for non-existent order', async () => {
      const nonExistentOrderId = '00000000-0000-0000-0000-000000000999';

      await expect(getOrder(nonExistentOrderId, testUser.id, 'buyer'))
        .rejects.toThrow(/order not found/i);
    });

    it('should include decrypted credentials for buyer with paid order', async () => {
      // Update order to paid status
      await db.update(ordersTable)
        .set({ status: 'paid' })
        .where(eq(ordersTable.id, testOrder.id))
        .execute();

      const result = await getOrder(testOrder.id, testUser.id, 'buyer');

      expect(result.decryptedCredentials).toBeDefined();
      expect(result.decryptedCredentials).toContain('ENCRYPTED_CREDENTIALS');
    });

    it('should not include credentials for pending order', async () => {
      const result = await getOrder(testOrder.id, testUser.id, 'buyer');

      expect(result.decryptedCredentials).toBeUndefined();
    });

    it('should not include credentials for seller', async () => {
      // Update order to paid status
      await db.update(ordersTable)
        .set({ status: 'paid' })
        .where(eq(ordersTable.id, testOrder.id))
        .execute();

      const result = await getOrder(testOrder.id, testSeller.id, 'seller');

      expect(result.decryptedCredentials).toBeUndefined();
    });
  });

  describe('acknowledgeDelivery', () => {
    it('should update order status to delivered and set expires_at', async () => {
      // Insert paid order
      const paidOrder = { ...testOrder, status: 'paid' as const };
      await db.insert(ordersTable).values(paidOrder).execute();

      const input: AcknowledgeDeliveryInput = {
        order_id: testOrder.id
      };

      await acknowledgeDelivery(input, testUser.id);

      // Verify order was updated
      const updatedOrders = await db.select()
        .from(ordersTable)
        .where(eq(ordersTable.id, testOrder.id))
        .execute();

      expect(updatedOrders).toHaveLength(1);
      const updatedOrder = updatedOrders[0];
      expect(updatedOrder.status).toBe('delivered');
      expect(updatedOrder.expires_at).toBeInstanceOf(Date);
      
      // Check expires_at is approximately 24 hours from now
      const now = new Date();
      const expectedExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const timeDiff = Math.abs(updatedOrder.expires_at!.getTime() - expectedExpiry.getTime());
      expect(timeDiff).toBeLessThan(60000); // Within 1 minute tolerance
    });

    it('should throw error for non-existent order', async () => {
      const input: AcknowledgeDeliveryInput = {
        order_id: '00000000-0000-0000-0000-000000000999'
      };

      await expect(acknowledgeDelivery(input, testUser.id))
        .rejects.toThrow(/order not found/i);
    });

    it('should throw error for order not owned by buyer', async () => {
      await db.insert(ordersTable).values(testOrder).execute();

      const input: AcknowledgeDeliveryInput = {
        order_id: testOrder.id
      };

      await expect(acknowledgeDelivery(input, testSeller.id))
        .rejects.toThrow(/order not found.*access denied/i);
    });

    it('should throw error for order not in paid status', async () => {
      // Insert pending order
      await db.insert(ordersTable).values(testOrder).execute();

      const input: AcknowledgeDeliveryInput = {
        order_id: testOrder.id
      };

      await expect(acknowledgeDelivery(input, testUser.id))
        .rejects.toThrow(/order must be in paid status/i);
    });

    it('should throw error for already delivered order', async () => {
      const deliveredOrder = { ...testOrder, status: 'delivered' as const };
      await db.insert(ordersTable).values(deliveredOrder).execute();

      const input: AcknowledgeDeliveryInput = {
        order_id: testOrder.id
      };

      await expect(acknowledgeDelivery(input, testUser.id))
        .rejects.toThrow(/order must be in paid status/i);
    });
  });
});