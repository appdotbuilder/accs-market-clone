import { 
  type UpsertListingInput, 
  type SetListingPayloadInput, 
  type SetListingStatusInput,
  type Listing,
  type PaginationInput,
  type BalanceResponse
} from '../schema';
import { db } from '../db';
import { 
  listingsTable, 
  categoriesTable, 
  listingSecurePayloadsTable,
  ordersTable
} from '../db/schema';
import { eq, and, sum, count, SQL } from 'drizzle-orm';
import * as crypto from 'crypto';

export async function upsertListing(input: UpsertListingInput, sellerId: string): Promise<Listing> {
  try {
    // Validate category exists
    const categoryExists = await db.select()
      .from(categoriesTable)
      .where(eq(categoriesTable.id, input.category_id))
      .execute();

    if (categoryExists.length === 0) {
      throw new Error('Category not found');
    }

    if (input.id) {
      // Update existing listing - verify ownership
      const existingListing = await db.select()
        .from(listingsTable)
        .where(and(
          eq(listingsTable.id, input.id),
          eq(listingsTable.seller_id, sellerId)
        ))
        .execute();

      if (existingListing.length === 0) {
        throw new Error('Listing not found or access denied');
      }

      const result = await db.update(listingsTable)
        .set({
          title: input.title,
          description: input.description,
          category_id: input.category_id,
          price_cents: input.price_cents,
          updated_at: new Date()
        })
        .where(eq(listingsTable.id, input.id))
        .returning()
        .execute();

      return result[0];
    } else {
      // Create new listing
      const result = await db.insert(listingsTable)
        .values({
          seller_id: sellerId,
          category_id: input.category_id,
          title: input.title,
          description: input.description,
          price_cents: input.price_cents,
          currency: 'USD',
          status: 'available',
          has_secure_payload: false
        })
        .returning()
        .execute();

      return result[0];
    }
  } catch (error) {
    console.error('Listing upsert failed:', error);
    throw error;
  }
}

export async function setListingPayload(input: SetListingPayloadInput, sellerId: string): Promise<void> {
  try {
    // Verify listing ownership by seller
    const listing = await db.select()
      .from(listingsTable)
      .where(and(
        eq(listingsTable.id, input.listing_id),
        eq(listingsTable.seller_id, sellerId)
      ))
      .execute();

    if (listing.length === 0) {
      throw new Error('Listing not found or access denied');
    }

    // Generate encryption key and nonce
    const key = crypto.randomBytes(32); // 256-bit key
    const nonce = crypto.randomBytes(16); // 128-bit nonce for AES-GCM

    // Create cipher and encrypt the plaintext credentials
    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
    let encrypted = cipher.update(input.plaintext_credentials, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // Check if payload already exists and delete it
    await db.delete(listingSecurePayloadsTable)
      .where(eq(listingSecurePayloadsTable.listing_id, input.listing_id))
      .execute();

    // Store encrypted payload
    await db.insert(listingSecurePayloadsTable)
      .values({
        listing_id: input.listing_id,
        cipher_text: encrypted,
        nonce: nonce.toString('base64')
      })
      .execute();

    // Update listing to indicate it has secure payload
    await db.update(listingsTable)
      .set({
        has_secure_payload: true,
        updated_at: new Date()
      })
      .where(eq(listingsTable.id, input.listing_id))
      .execute();
  } catch (error) {
    console.error('Set listing payload failed:', error);
    throw error;
  }
}

export async function setListingStatus(input: SetListingStatusInput, sellerId: string): Promise<void> {
  try {
    // Verify listing ownership by seller
    const listing = await db.select()
      .from(listingsTable)
      .where(and(
        eq(listingsTable.id, input.listing_id),
        eq(listingsTable.seller_id, sellerId)
      ))
      .execute();

    if (listing.length === 0) {
      throw new Error('Listing not found or access denied');
    }

    // Business logic: prevent manually setting to 'sold'
    if (input.status === 'sold') {
      throw new Error('Cannot manually set listing status to sold');
    }

    // Update listing status
    await db.update(listingsTable)
      .set({
        status: input.status,
        updated_at: new Date()
      })
      .where(eq(listingsTable.id, input.listing_id))
      .execute();
  } catch (error) {
    console.error('Set listing status failed:', error);
    throw error;
  }
}

export async function getMyListings(
  input: { status?: string; page: number }, 
  sellerId: string
): Promise<{
  items: Listing[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}> {
  try {
    const page_size = 20;
    const offset = (input.page - 1) * page_size;

    // Build query conditionally
    const conditions: SQL<unknown>[] = [eq(listingsTable.seller_id, sellerId)];

    if (input.status) {
      conditions.push(eq(listingsTable.status, input.status as any));
    }

    const query = db.select().from(listingsTable).where(and(...conditions));

    // Get total count
    const totalQuery = db.select({ count: count() })
      .from(listingsTable)
      .where(and(...conditions));

    const [items, totalResult] = await Promise.all([
      query.limit(page_size).offset(offset).execute(),
      totalQuery.execute()
    ]);

    const total = Number(totalResult[0]?.count || 0);
    const total_pages = Math.ceil(total / page_size);

    return {
      items,
      total,
      page: input.page,
      page_size,
      total_pages
    };
  } catch (error) {
    console.error('Get my listings failed:', error);
    throw error;
  }
}

export async function getMyBalance(sellerId: string): Promise<BalanceResponse> {
  try {
    // Calculate available balance from complete orders
    const availableQuery = db.select({ 
      total: sum(ordersTable.total_cents) 
    })
    .from(ordersTable)
    .innerJoin(listingsTable, eq(ordersTable.listing_id, listingsTable.id))
    .where(and(
      eq(listingsTable.seller_id, sellerId),
      eq(ordersTable.status, 'complete')
    ));

    // Calculate pending balance from delivered orders awaiting completion
    const pendingQuery = db.select({ 
      total: sum(ordersTable.total_cents) 
    })
    .from(ordersTable)
    .innerJoin(listingsTable, eq(ordersTable.listing_id, listingsTable.id))
    .where(and(
      eq(listingsTable.seller_id, sellerId),
      eq(ordersTable.status, 'delivered')
    ));

    const [availableResult, pendingResult] = await Promise.all([
      availableQuery.execute(),
      pendingQuery.execute()
    ]);

    const available_cents = Number(availableResult[0]?.total || 0);
    const pending_cents = Number(pendingResult[0]?.total || 0);

    return {
      available_cents,
      pending_cents
    };
  } catch (error) {
    console.error('Get balance failed:', error);
    throw error;
  }
}