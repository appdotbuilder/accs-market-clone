import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  profilesTable, 
  categoriesTable, 
  listingsTable, 
  ordersTable, 
  reviewsTable 
} from '../db/schema';
import { type CreateReviewInput, type GetSellerReviewsInput } from '../schema';
import { createReview, getSellerReviews } from '../handlers/reviews';
import { eq } from 'drizzle-orm';

// Test data setup
let testBuyer: any, testSeller: any, testCategory: any, testListing: any, testOrder: any;
let completedOrder: any, deliveredOrder: any, pendingOrder: any;

const setupTestData = async () => {
  // Create buyer user
  const buyerResult = await db.insert(usersTable)
    .values({
      email: 'buyer@test.com',
      password_hash: 'hash123',
      role: 'buyer'
    })
    .returning()
    .execute();
  testBuyer = buyerResult[0];

  // Create seller user
  const sellerResult = await db.insert(usersTable)
    .values({
      email: 'seller@test.com',
      password_hash: 'hash123',
      role: 'seller'
    })
    .returning()
    .execute();
  testSeller = sellerResult[0];

  // Create seller profile
  await db.insert(profilesTable)
    .values({
      user_id: testSeller.id,
      rating: '0.0',
      verification_status: 'verified'
    })
    .execute();

  // Create category
  const categoryResult = await db.insert(categoriesTable)
    .values({
      name: 'Test Category',
      slug: 'test-category'
    })
    .returning()
    .execute();
  testCategory = categoryResult[0];

  // Create listing
  const listingResult = await db.insert(listingsTable)
    .values({
      seller_id: testSeller.id,
      category_id: testCategory.id,
      title: 'Test Listing',
      description: 'Test description',
      price_cents: 1000,
      currency: 'USD',
      status: 'available'
    })
    .returning()
    .execute();
  testListing = listingResult[0];

  // Create completed order
  const completedOrderResult = await db.insert(ordersTable)
    .values({
      buyer_id: testBuyer.id,
      listing_id: testListing.id,
      total_cents: 1000,
      currency: 'USD',
      status: 'complete'
    })
    .returning()
    .execute();
  completedOrder = completedOrderResult[0];

  // Create delivered order
  const deliveredOrderResult = await db.insert(ordersTable)
    .values({
      buyer_id: testBuyer.id,
      listing_id: testListing.id,
      total_cents: 1000,
      currency: 'USD',
      status: 'delivered'
    })
    .returning()
    .execute();
  deliveredOrder = deliveredOrderResult[0];

  // Create pending order (for negative testing)
  const pendingOrderResult = await db.insert(ordersTable)
    .values({
      buyer_id: testBuyer.id,
      listing_id: testListing.id,
      total_cents: 1000,
      currency: 'USD',
      status: 'pending'
    })
    .returning()
    .execute();
  pendingOrder = pendingOrderResult[0];
};

describe('createReview', () => {
  beforeEach(async () => {
    await createDB();
    await setupTestData();
  });
  afterEach(resetDB);

  const validInput: CreateReviewInput = {
    order_id: '',
    rating: 5,
    comment: 'Great seller!'
  };

  it('should create a review for completed order', async () => {
    const input = { ...validInput, order_id: completedOrder.id };
    
    const result = await createReview(input, testBuyer.id);

    expect(result.order_id).toEqual(completedOrder.id);
    expect(result.seller_id).toEqual(testSeller.id);
    expect(result.buyer_id).toEqual(testBuyer.id);
    expect(result.rating).toEqual(5);
    expect(result.comment).toEqual('Great seller!');
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should create a review for delivered order', async () => {
    const input = { ...validInput, order_id: deliveredOrder.id };
    
    const result = await createReview(input, testBuyer.id);

    expect(result.order_id).toEqual(deliveredOrder.id);
    expect(result.seller_id).toEqual(testSeller.id);
    expect(result.buyer_id).toEqual(testBuyer.id);
    expect(result.rating).toEqual(5);
    expect(result.comment).toEqual('Great seller!');
  });

  it('should save review to database', async () => {
    const input = { ...validInput, order_id: completedOrder.id };
    
    const result = await createReview(input, testBuyer.id);

    const reviews = await db.select()
      .from(reviewsTable)
      .where(eq(reviewsTable.id, result.id))
      .execute();

    expect(reviews).toHaveLength(1);
    expect(reviews[0].order_id).toEqual(completedOrder.id);
    expect(reviews[0].rating).toEqual(5);
    expect(reviews[0].comment).toEqual('Great seller!');
  });

  it('should update seller rating in profile', async () => {
    const input = { ...validInput, order_id: completedOrder.id };
    
    await createReview(input, testBuyer.id);

    const profiles = await db.select()
      .from(profilesTable)
      .where(eq(profilesTable.user_id, testSeller.id))
      .execute();

    expect(profiles).toHaveLength(1);
    expect(parseFloat(profiles[0].rating)).toEqual(5.0);
  });

  it('should calculate average rating correctly with multiple reviews', async () => {
    // Create first review (rating: 5)
    const input1 = { ...validInput, order_id: completedOrder.id };
    await createReview(input1, testBuyer.id);

    // Create second review (rating: 3)
    const input2 = { ...validInput, order_id: deliveredOrder.id, rating: 3 };
    await createReview(input2, testBuyer.id);

    const profiles = await db.select()
      .from(profilesTable)
      .where(eq(profilesTable.user_id, testSeller.id))
      .execute();

    expect(profiles).toHaveLength(1);
    expect(parseFloat(profiles[0].rating)).toEqual(4.0); // (5 + 3) / 2 = 4.0
  });

  it('should reject review for non-existent order', async () => {
    const input = { ...validInput, order_id: '12345678-1234-1234-1234-123456789012' };

    await expect(createReview(input, testBuyer.id))
      .rejects.toThrow(/order not found/i);
  });

  it('should reject review if order does not belong to buyer', async () => {
    // Create another buyer
    const anotherBuyerResult = await db.insert(usersTable)
      .values({
        email: 'another@test.com',
        password_hash: 'hash123',
        role: 'buyer'
      })
      .returning()
      .execute();
    const anotherBuyer = anotherBuyerResult[0];

    const input = { ...validInput, order_id: completedOrder.id };

    await expect(createReview(input, anotherBuyer.id))
      .rejects.toThrow(/order does not belong to buyer/i);
  });

  it('should reject review for pending order', async () => {
    const input = { ...validInput, order_id: pendingOrder.id };

    await expect(createReview(input, testBuyer.id))
      .rejects.toThrow(/can only review delivered or completed orders/i);
  });

  it('should reject duplicate review for same order', async () => {
    const input = { ...validInput, order_id: completedOrder.id };
    
    // Create first review
    await createReview(input, testBuyer.id);

    // Try to create second review for same order
    await expect(createReview(input, testBuyer.id))
      .rejects.toThrow(/review already exists for this order/i);
  });
});

describe('getSellerReviews', () => {
  beforeEach(async () => {
    await createDB();
    await setupTestData();
  });
  afterEach(resetDB);

  it('should return empty results for seller with no reviews', async () => {
    const input: GetSellerReviewsInput = {
      seller_id: testSeller.id,
      page: 1
    };

    const result = await getSellerReviews(input);

    expect(result.items).toHaveLength(0);
    expect(result.total).toEqual(0);
    expect(result.page).toEqual(1);
    expect(result.page_size).toEqual(20);
    expect(result.total_pages).toEqual(0);
  });

  it('should return reviews for seller', async () => {
    // Create a review first
    const reviewInput: CreateReviewInput = {
      order_id: completedOrder.id,
      rating: 5,
      comment: 'Great seller!'
    };
    await createReview(reviewInput, testBuyer.id);

    const input: GetSellerReviewsInput = {
      seller_id: testSeller.id,
      page: 1
    };

    const result = await getSellerReviews(input);

    expect(result.items).toHaveLength(1);
    expect(result.total).toEqual(1);
    expect(result.page).toEqual(1);
    expect(result.page_size).toEqual(20);
    expect(result.total_pages).toEqual(1);

    const review = result.items[0];
    expect(review.seller_id).toEqual(testSeller.id);
    expect(review.buyer_id).toEqual(testBuyer.id);
    expect(review.rating).toEqual(5);
    expect(review.comment).toEqual('Great seller!');
  });

  it('should return reviews ordered by creation date (newest first)', async () => {
    // Create first review
    const review1Input: CreateReviewInput = {
      order_id: completedOrder.id,
      rating: 5,
      comment: 'First review'
    };
    const review1 = await createReview(review1Input, testBuyer.id);

    // Wait a bit to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));

    // Create second review
    const review2Input: CreateReviewInput = {
      order_id: deliveredOrder.id,
      rating: 4,
      comment: 'Second review'
    };
    const review2 = await createReview(review2Input, testBuyer.id);

    const input: GetSellerReviewsInput = {
      seller_id: testSeller.id,
      page: 1
    };

    const result = await getSellerReviews(input);

    expect(result.items).toHaveLength(2);
    // Newer review should be first
    expect(result.items[0].comment).toEqual('Second review');
    expect(result.items[1].comment).toEqual('First review');
    expect(result.items[0].created_at >= result.items[1].created_at).toBe(true);
  });

  it('should handle pagination correctly', async () => {
    // Create multiple reviews (need multiple orders first)
    for (let i = 0; i < 25; i++) {
      const orderResult = await db.insert(ordersTable)
        .values({
          buyer_id: testBuyer.id,
          listing_id: testListing.id,
          total_cents: 1000,
          currency: 'USD',
          status: 'complete'
        })
        .returning()
        .execute();

      const reviewInput: CreateReviewInput = {
        order_id: orderResult[0].id,
        rating: 5,
        comment: `Review ${i + 1}`
      };
      await createReview(reviewInput, testBuyer.id);
    }

    // Test first page
    const page1Input: GetSellerReviewsInput = {
      seller_id: testSeller.id,
      page: 1
    };

    const page1Result = await getSellerReviews(page1Input);

    expect(page1Result.items).toHaveLength(20);
    expect(page1Result.total).toEqual(25);
    expect(page1Result.page).toEqual(1);
    expect(page1Result.page_size).toEqual(20);
    expect(page1Result.total_pages).toEqual(2);

    // Test second page
    const page2Input: GetSellerReviewsInput = {
      seller_id: testSeller.id,
      page: 2
    };

    const page2Result = await getSellerReviews(page2Input);

    expect(page2Result.items).toHaveLength(5);
    expect(page2Result.total).toEqual(25);
    expect(page2Result.page).toEqual(2);
    expect(page2Result.total_pages).toEqual(2);
  });

  it('should return empty results for non-existent seller', async () => {
    const input: GetSellerReviewsInput = {
      seller_id: '12345678-1234-1234-1234-123456789012',
      page: 1
    };

    const result = await getSellerReviews(input);

    expect(result.items).toHaveLength(0);
    expect(result.total).toEqual(0);
    expect(result.total_pages).toEqual(0);
  });
});