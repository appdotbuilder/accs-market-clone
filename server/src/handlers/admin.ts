import { db } from '../db';
import { usersTable, profilesTable, disputesTable, ordersTable, listingsTable } from '../db/schema';
import { 
  type ListUsersInput, 
  type ListDisputesInput,
  type User,
  type Dispute 
} from '../schema';
import { eq, ilike, and, count, desc, type SQL } from 'drizzle-orm';

export async function listUsers(
  input: ListUsersInput, 
  adminId: string
): Promise<{
  items: User[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}> {
  try {
    // Verify admin role
    const admin = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, adminId))
      .execute();

    if (admin.length === 0 || admin[0].role !== 'admin') {
      throw new Error('Unauthorized: Admin access required');
    }

    // Build conditions array
    const conditions: SQL<unknown>[] = [];

    if (input.role) {
      conditions.push(eq(usersTable.role, input.role));
    }

    if (input.q) {
      conditions.push(ilike(usersTable.email, `%${input.q}%`));
    }

    // Build where condition
    const whereCondition = conditions.length === 0 ? undefined : 
      (conditions.length === 1 ? conditions[0] : and(...conditions));

    // Count total records
    const countQuery = db.select({ count: count() }).from(usersTable);
    const totalResult = whereCondition ? 
      await countQuery.where(whereCondition).execute() :
      await countQuery.execute();
    
    const total = totalResult[0].count;

    // Calculate pagination
    const page_size = 20; // Fixed page size for admin
    const offset = (input.page - 1) * page_size;
    const total_pages = Math.ceil(total / page_size);

    // Build main query
    const baseQuery = db.select({
      id: usersTable.id,
      email: usersTable.email,
      password_hash: usersTable.password_hash,
      role: usersTable.role,
      created_at: usersTable.created_at,
      updated_at: usersTable.updated_at
    }).from(usersTable);

    const query = whereCondition ? baseQuery.where(whereCondition) : baseQuery;
    
    const results = await query
      .orderBy(desc(usersTable.created_at))
      .limit(page_size)
      .offset(offset)
      .execute();

    // Exclude password hashes from results
    const items: User[] = results.map(user => ({
      ...user,
      password_hash: '[REDACTED]' // Hide password hash for security
    }));

    return {
      items,
      total,
      page: input.page,
      page_size,
      total_pages
    };
  } catch (error) {
    console.error('List users failed:', error);
    throw error;
  }
}

export async function listDisputes(
  input: ListDisputesInput, 
  adminId: string
): Promise<{
  items: Dispute[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}> {
  try {
    // Verify admin role
    const admin = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, adminId))
      .execute();

    if (admin.length === 0 || admin[0].role !== 'admin') {
      throw new Error('Unauthorized: Admin access required');
    }

    // Build conditions array
    const conditions: SQL<unknown>[] = [];

    if (input.status) {
      conditions.push(eq(disputesTable.status, input.status));
    }

    // Build where condition
    const whereCondition = conditions.length === 0 ? undefined : 
      (conditions.length === 1 ? conditions[0] : and(...conditions));

    // Count total records
    const countQuery = db.select({ count: count() }).from(disputesTable);
    const totalResult = whereCondition ? 
      await countQuery.where(whereCondition).execute() :
      await countQuery.execute();
    
    const total = totalResult[0].count;

    // Calculate pagination
    const page_size = 20; // Fixed page size for admin
    const offset = (input.page - 1) * page_size;
    const total_pages = Math.ceil(total / page_size);

    // Build main query
    const baseQuery = db.select({
      id: disputesTable.id,
      order_id: disputesTable.order_id,
      opener_id: disputesTable.opener_id,
      reason: disputesTable.reason,
      status: disputesTable.status,
      created_at: disputesTable.created_at,
      updated_at: disputesTable.updated_at
    }).from(disputesTable);

    const query = whereCondition ? baseQuery.where(whereCondition) : baseQuery;
    
    const results = await query
      .orderBy(desc(disputesTable.created_at))
      .limit(page_size)
      .offset(offset)
      .execute();

    const items: Dispute[] = results.map(dispute => ({
      ...dispute
    }));

    return {
      items,
      total,
      page: input.page,
      page_size,
      total_pages
    };
  } catch (error) {
    console.error('List disputes failed:', error);
    throw error;
  }
}