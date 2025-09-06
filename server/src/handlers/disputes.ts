import { db } from '../db';
import { 
  disputesTable, 
  ordersTable, 
  usersTable,
  listingsTable 
} from '../db/schema';
import { 
  type OpenDisputeInput, 
  type ResolveDisputeInput,
  type Dispute 
} from '../schema';
import { eq, and } from 'drizzle-orm';

export async function openDispute(
  input: OpenDisputeInput, 
  userId: string
): Promise<Dispute> {
  try {
    // 1. Verify order exists and get order details with listing info
    const orderResults = await db.select({
      order: ordersTable,
      listing: listingsTable
    })
    .from(ordersTable)
    .innerJoin(listingsTable, eq(ordersTable.listing_id, listingsTable.id))
    .where(eq(ordersTable.id, input.order_id))
    .execute();

    if (orderResults.length === 0) {
      throw new Error('Order not found');
    }

    const { order, listing } = orderResults[0];

    // 2. Verify user is buyer or seller of the order
    if (order.buyer_id !== userId && listing.seller_id !== userId) {
      throw new Error('Only order participants can open disputes');
    }

    // 3. Verify no existing dispute for this order (check this first)
    const existingDisputes = await db.select()
      .from(disputesTable)
      .where(eq(disputesTable.order_id, input.order_id))
      .execute();

    if (existingDisputes.length > 0) {
      throw new Error('Dispute already exists for this order');
    }

    // 4. Verify order status allows disputes (paid, delivered, disputed)
    // Note: We allow 'disputed' status in case the order was already marked as disputed
    // but the dispute creation failed, allowing retry
    if (!['paid', 'delivered'].includes(order.status)) {
      throw new Error('Disputes can only be opened for paid or delivered orders');
    }

    // 5. Create dispute record with 'open' status
    const disputeResults = await db.insert(disputesTable)
      .values({
        order_id: input.order_id,
        opener_id: userId,
        reason: input.reason,
        status: 'open'
      })
      .returning()
      .execute();

    // 6. Update order status to 'disputed'
    await db.update(ordersTable)
      .set({ 
        status: 'disputed',
        updated_at: new Date()
      })
      .where(eq(ordersTable.id, input.order_id))
      .execute();

    return disputeResults[0];
  } catch (error) {
    console.error('Opening dispute failed:', error);
    throw error;
  }
}

export async function resolveDispute(
  input: ResolveDisputeInput, 
  adminId: string
): Promise<void> {
  try {
    // 1. Verify admin role
    const adminResults = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, adminId))
      .execute();

    if (adminResults.length === 0 || adminResults[0].role !== 'admin') {
      throw new Error('Only admins can resolve disputes');
    }

    // 2. Fetch dispute and verify it's 'open'
    const disputeResults = await db.select()
      .from(disputesTable)
      .where(eq(disputesTable.order_id, input.order_id))
      .execute();

    if (disputeResults.length === 0) {
      throw new Error('Dispute not found');
    }

    const dispute = disputeResults[0];
    if (dispute.status !== 'open') {
      throw new Error('Dispute is not open');
    }

    // 3. Update dispute status based on resolution
    let disputeStatus: 'resolved_buyer' | 'resolved_seller' | 'refunded';
    let orderStatus: 'refunded' | 'complete';

    if (input.resolution === 'buyer' || input.resolution === 'refund') {
      disputeStatus = 'refunded';
      orderStatus = 'refunded';
    } else {
      disputeStatus = 'resolved_seller';
      orderStatus = 'complete';
    }

    // Update dispute status
    await db.update(disputesTable)
      .set({ 
        status: disputeStatus,
        updated_at: new Date()
      })
      .where(eq(disputesTable.id, dispute.id))
      .execute();

    // 4. Update order status accordingly
    await db.update(ordersTable)
      .set({ 
        status: orderStatus,
        updated_at: new Date()
      })
      .where(eq(ordersTable.id, input.order_id))
      .execute();

    // Note: In a real implementation, payment actions would be handled here:
    // - 'buyer'/'refund': Initiate refund to buyer via payment processor
    // - 'seller': Release payment to seller via payment processor
    // For this implementation, we're only updating the database states
  } catch (error) {
    console.error('Resolving dispute failed:', error);
    throw error;
  }
}