import { db } from '../db';
import { categoriesTable, listingsTable, usersTable, profilesTable } from '../db/schema';
import { type Category, type Listing, type SearchListingsInput } from '../schema';
import { eq, asc, ilike, gte, lte, and, count, type SQL } from 'drizzle-orm';

export async function listCategories(): Promise<Category[]> {
  try {
    const results = await db.select()
      .from(categoriesTable)
      .orderBy(asc(categoriesTable.name))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to list categories:', error);
    throw error;
  }
}

export async function searchListings(input: SearchListingsInput): Promise<{
  items: Listing[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}> {
  try {
    // Build conditions array
    const conditions: SQL<unknown>[] = [eq(listingsTable.status, 'available')];

    // Add search term filter
    if (input.q) {
      conditions.push(
        ilike(listingsTable.title, `%${input.q}%`)
      );
    }

    // Add category filter
    if (input.category_slug) {
      conditions.push(eq(categoriesTable.slug, input.category_slug));
    }

    // Add price range filters
    if (input.min_price !== undefined) {
      conditions.push(gte(listingsTable.price_cents, input.min_price));
    }

    if (input.max_price !== undefined) {
      conditions.push(lte(listingsTable.price_cents, input.max_price));
    }

    // Build main query with all conditions
    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

    // Calculate offset
    const offset = (input.page - 1) * input.page_size;

    // Execute main query
    const results = await db.select()
      .from(listingsTable)
      .innerJoin(categoriesTable, eq(listingsTable.category_id, categoriesTable.id))
      .where(whereClause)
      .limit(input.page_size)
      .offset(offset)
      .execute();

    // Count total records
    const countResult = await db.select({ count: count() })
      .from(listingsTable)
      .innerJoin(categoriesTable, eq(listingsTable.category_id, categoriesTable.id))
      .where(whereClause)
      .execute();
    
    const total = countResult[0].count;

    // Transform results to Listing format
    const items: Listing[] = results.map(result => ({
      id: result.listings.id,
      seller_id: result.listings.seller_id,
      category_id: result.listings.category_id,
      title: result.listings.title,
      description: result.listings.description,
      price_cents: result.listings.price_cents,
      currency: result.listings.currency,
      status: result.listings.status,
      has_secure_payload: result.listings.has_secure_payload,
      created_at: result.listings.created_at,
      updated_at: result.listings.updated_at
    }));

    const total_pages = Math.ceil(total / input.page_size);

    return {
      items,
      total,
      page: input.page,
      page_size: input.page_size,
      total_pages
    };
  } catch (error) {
    console.error('Failed to search listings:', error);
    throw error;
  }
}

export async function getListing(id: string): Promise<Listing | null> {
  try {
    const results = await db.select()
      .from(listingsTable)
      .where(
        and(
          eq(listingsTable.id, id),
          eq(listingsTable.status, 'available')
        )
      )
      .limit(1)
      .execute();

    if (results.length === 0) {
      return null;
    }

    return results[0];
  } catch (error) {
    console.error('Failed to get listing:', error);
    throw error;
  }
}