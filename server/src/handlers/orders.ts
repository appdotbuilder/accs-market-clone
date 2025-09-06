import { db } from '../db';
import { 
  ordersTable, 
  usersTable, 
  listingsTable, 
  listingSecurePayloadsTable,
  transactionsTable 
} from '../db/schema';
import { 
  type Order, 
  type AcknowledgeDeliveryInput,
  type PaginationInput 
} from '../schema';
import { eq, and, count, desc, SQL } from 'drizzle-orm';

export async function getMyOrders(
  input: { status?: string; page: number }, 
  buyerId: string
): Promise<{
  items: Order[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}> {
  try {
    const page_size = 20;
    const offset = (input.page - 1) * page_size;
    
    // Build conditions array
    const conditions: SQL<unknown>[] = [eq(ordersTable.buyer_id, buyerId)];

    if (input.status) {
      conditions.push(eq(ordersTable.status, input.status as any));
    }

    // Execute main query
    const results = await db.select()
      .from(ordersTable)
      .innerJoin(listingsTable, eq(ordersTable.listing_id, listingsTable.id))
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(desc(ordersTable.created_at))
      .limit(page_size)
      .offset(offset)
      .execute();

    // Get total count
    const [{ count: total }] = await db.select({ count: count() })
      .from(ordersTable)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .execute();

    // Transform results
    const items: Order[] = results.map(result => ({
      id: result.orders.id,
      buyer_id: result.orders.buyer_id,
      listing_id: result.orders.listing_id,
      total_cents: result.orders.total_cents,
      currency: result.orders.currency,
      status: result.orders.status,
      expires_at: result.orders.expires_at,
      created_at: result.orders.created_at,
      updated_at: result.orders.updated_at
    }));

    const total_pages = Math.ceil(total / page_size);

    return {
      items,
      total,
      page: input.page,
      page_size,
      total_pages
    };
  } catch (error) {
    console.error('Failed to get orders:', error);
    throw error;
  }
}

export async function getOrder(orderId: string, userId: string, userRole: string): Promise<Order & {
  decryptedCredentials?: string;
}> {
  try {
    // Fetch order with related data
    const results = await db.select()
      .from(ordersTable)
      .innerJoin(listingsTable, eq(ordersTable.listing_id, listingsTable.id))
      .leftJoin(listingSecurePayloadsTable, eq(listingsTable.id, listingSecurePayloadsTable.listing_id))
      .where(eq(ordersTable.id, orderId))
      .execute();

    if (results.length === 0) {
      throw new Error('Order not found');
    }

    const result = results[0];
    const order = result.orders;
    const listing = result.listings;

    // Verify user has access to this order
    const isAdmin = userRole === 'admin';
    const isBuyer = order.buyer_id === userId;
    const isSeller = listing.seller_id === userId;

    if (!isAdmin && !isBuyer && !isSeller) {
      throw new Error('Access denied');
    }

    // Build response object
    const orderResponse: Order & { decryptedCredentials?: string } = {
      id: order.id,
      buyer_id: order.buyer_id,
      listing_id: order.listing_id,
      total_cents: order.total_cents,
      currency: order.currency,
      status: order.status,
      expires_at: order.expires_at,
      created_at: order.created_at,
      updated_at: order.updated_at
    };

    // If buyer and order status is paid or higher, include decrypted credentials
    if (isBuyer && ['paid', 'delivered', 'complete'].includes(order.status)) {
      const securePayload = result.listing_secure_payloads;
      if (securePayload) {
        // In a real implementation, you would decrypt the cipher_text using the nonce
        // For this example, we'll just indicate that credentials would be available
        orderResponse.decryptedCredentials = `[ENCRYPTED_CREDENTIALS_FOR_LISTING_${listing.id}]`;
      }
    }

    return orderResponse;
  } catch (error) {
    console.error('Failed to get order:', error);
    throw error;
  }
}

export async function acknowledgeDelivery(
  input: AcknowledgeDeliveryInput, 
  buyerId: string
): Promise<void> {
  try {
    // First, verify the order exists and belongs to the buyer
    const results = await db.select()
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.id, input.order_id),
          eq(ordersTable.buyer_id, buyerId)
        )
      )
      .execute();

    if (results.length === 0) {
      throw new Error('Order not found or access denied');
    }

    const order = results[0];

    // Verify order status is 'paid'
    if (order.status !== 'paid') {
      throw new Error('Order must be in paid status to acknowledge delivery');
    }

    // Update order status to 'delivered' and set expires_at to 24h from now
    const expires_at = new Date();
    expires_at.setHours(expires_at.getHours() + 24);

    await db.update(ordersTable)
      .set({
        status: 'delivered',
        expires_at: expires_at,
        updated_at: new Date()
      })
      .where(eq(ordersTable.id, input.order_id))
      .execute();
  } catch (error) {
    console.error('Failed to acknowledge delivery:', error);
    throw error;
  }
}