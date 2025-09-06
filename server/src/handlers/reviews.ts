import { db } from '../db';
import { 
  reviewsTable,
  ordersTable,
  listingsTable,
  profilesTable,
  usersTable
} from '../db/schema';
import { 
  type CreateReviewInput, 
  type GetSellerReviewsInput,
  type Review 
} from '../schema';
import { eq, desc, count, and, avg } from 'drizzle-orm';

export async function createReview(
  input: CreateReviewInput, 
  buyerId: string
): Promise<Review> {
  try {
    // 1. Verify order belongs to buyer and get order details
    const orderQuery = await db.select({
      order_id: ordersTable.id,
      buyer_id: ordersTable.buyer_id,
      status: ordersTable.status,
      seller_id: listingsTable.seller_id
    })
    .from(ordersTable)
    .innerJoin(listingsTable, eq(ordersTable.listing_id, listingsTable.id))
    .where(eq(ordersTable.id, input.order_id))
    .execute();

    if (orderQuery.length === 0) {
      throw new Error('Order not found');
    }

    const order = orderQuery[0];

    // Verify order belongs to buyer
    if (order.buyer_id !== buyerId) {
      throw new Error('Order does not belong to buyer');
    }

    // 2. Verify order status is 'delivered' or 'complete'
    if (order.status !== 'delivered' && order.status !== 'complete') {
      throw new Error('Can only review delivered or completed orders');
    }

    // 3. Verify review doesn't already exist for this order
    const existingReview = await db.select()
      .from(reviewsTable)
      .where(eq(reviewsTable.order_id, input.order_id))
      .execute();

    if (existingReview.length > 0) {
      throw new Error('Review already exists for this order');
    }

    // 4. Create review record
    const result = await db.insert(reviewsTable)
      .values({
        order_id: input.order_id,
        seller_id: order.seller_id,
        buyer_id: buyerId,
        rating: input.rating,
        comment: input.comment
      })
      .returning()
      .execute();

    const review = result[0];

    // 5. Update seller's average rating in profiles table
    const avgRatingQuery = await db.select({
      avgRating: avg(reviewsTable.rating)
    })
    .from(reviewsTable)
    .where(eq(reviewsTable.seller_id, order.seller_id))
    .execute();

    const avgRating = avgRatingQuery[0]?.avgRating;
    
    if (avgRating !== null) {
      await db.update(profilesTable)
        .set({
          rating: parseFloat(avgRating).toString()
        })
        .where(eq(profilesTable.user_id, order.seller_id))
        .execute();
    }

    return review;
  } catch (error) {
    console.error('Review creation failed:', error);
    throw error;
  }
}

export async function getSellerReviews(input: GetSellerReviewsInput): Promise<{
  items: Review[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}> {
  try {
    const pageSize = 20; // Default page size from schema
    const offset = (input.page - 1) * pageSize;

    // Get total count of reviews for this seller
    const totalQuery = await db.select({
      count: count()
    })
    .from(reviewsTable)
    .where(eq(reviewsTable.seller_id, input.seller_id))
    .execute();

    const total = totalQuery[0]?.count || 0;

    // Get paginated reviews ordered by creation date (newest first)
    const reviews = await db.select()
      .from(reviewsTable)
      .where(eq(reviewsTable.seller_id, input.seller_id))
      .orderBy(desc(reviewsTable.created_at))
      .limit(pageSize)
      .offset(offset)
      .execute();

    const totalPages = Math.ceil(total / pageSize);

    return {
      items: reviews,
      total,
      page: input.page,
      page_size: pageSize,
      total_pages: totalPages
    };
  } catch (error) {
    console.error('Fetching seller reviews failed:', error);
    throw error;
  }
}