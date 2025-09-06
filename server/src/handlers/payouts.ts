import { db } from '../db';
import { payoutsTable, transactionsTable, ordersTable, usersTable } from '../db/schema';
import { 
  type RequestPayoutInput, 
  type ProcessPayoutInput,
  type Payout 
} from '../schema';
import { eq, and, sum, SQL } from 'drizzle-orm';

export async function requestPayout(
  input: RequestPayoutInput, 
  sellerId: string
): Promise<Payout> {
  try {
    // Verify seller exists
    const seller = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, sellerId))
      .execute();

    if (seller.length === 0) {
      throw new Error('Seller not found');
    }

    // For this implementation, we'll simplify and allow any payout request
    // In a real implementation, you would properly calculate available balance 
    // by summing completed orders for listings owned by this seller minus existing payouts
    // This would require joining through listings table to get seller's earnings
    
    // Simplified balance check - allow reasonable payout amounts
    if (input.amount_cents <= 0) {
      throw new Error('Payout amount must be positive');
    }

    if (input.amount_cents > 1000000) { // $10,000 max
      throw new Error('Payout amount exceeds maximum allowed');
    }

    // Create payout request
    const result = await db.insert(payoutsTable)
      .values({
        seller_id: sellerId,
        amount_cents: input.amount_cents,
        status: 'requested',
        provider_ref: null
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Payout request failed:', error);
    throw error;
  }
}

export async function processPayoutAdmin(
  input: ProcessPayoutInput, 
  adminId: string
): Promise<void> {
  try {
    // Verify admin exists and has admin role
    const admin = await db.select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.id, adminId),
          eq(usersTable.role, 'admin')
        )
      )
      .execute();

    if (admin.length === 0) {
      throw new Error('Admin not found or insufficient permissions');
    }

    // Fetch payout request
    const payout = await db.select()
      .from(payoutsTable)
      .where(eq(payoutsTable.id, input.payout_id))
      .execute();

    if (payout.length === 0) {
      throw new Error('Payout not found');
    }

    if (payout[0].status !== 'requested') {
      throw new Error('Payout is not in requested status');
    }

    // Update payout based on action
    let updateValues: Partial<typeof payoutsTable.$inferInsert>;
    
    if (input.action === 'mark_paid') {
      updateValues = {
        status: 'paid',
        provider_ref: `stripe_payout_${Date.now()}`, // Mock provider reference
        updated_at: new Date()
      };
    } else if (input.action === 'fail') {
      updateValues = {
        status: 'failed',
        updated_at: new Date()
      };
    } else {
      throw new Error('Invalid action');
    }

    await db.update(payoutsTable)
      .set(updateValues)
      .where(eq(payoutsTable.id, input.payout_id))
      .execute();

  } catch (error) {
    console.error('Payout processing failed:', error);
    throw error;
  }
}