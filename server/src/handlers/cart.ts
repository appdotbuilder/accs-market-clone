import { db } from '../db';
import { listingsTable, usersTable } from '../db/schema';
import { type CartItem, type Listing } from '../schema';
import { eq, and } from 'drizzle-orm';

// Simple in-memory cart storage (in production, this would be in session/Redis/database)
const cartStorage: Map<string, string> = new Map();

export async function addToCart(listingId: string, buyerId: string): Promise<void> {
  try {
    // Verify buyer exists
    const buyer = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, buyerId))
      .execute();

    if (buyer.length === 0) {
      throw new Error('Buyer not found');
    }

    // Verify listing exists and is available
    const listing = await db.select()
      .from(listingsTable)
      .where(
        and(
          eq(listingsTable.id, listingId),
          eq(listingsTable.status, 'available')
        )
      )
      .execute();

    if (listing.length === 0) {
      throw new Error('Listing not found or not available');
    }

    // Check that buyer is not trying to add their own listing
    if (listing[0].seller_id === buyerId) {
      throw new Error('Cannot add your own listing to cart');
    }

    // Since we only allow 1 item per order, replace existing cart item
    cartStorage.set(buyerId, listingId);
  } catch (error) {
    console.error('Add to cart failed:', error);
    throw error;
  }
}

export async function removeFromCart(listingId: string, buyerId: string): Promise<void> {
  try {
    // Get current cart item for buyer
    const currentCartItem = cartStorage.get(buyerId);
    
    // Only remove if the specified listing is actually in the cart
    if (currentCartItem === listingId) {
      cartStorage.delete(buyerId);
    }
    
    // Handle case where item doesn't exist gracefully - no error thrown
  } catch (error) {
    console.error('Remove from cart failed:', error);
    throw error;
  }
}

export async function getCart(buyerId: string): Promise<{
  items: Array<{ listing: Listing }>
}> {
  try {
    // Verify buyer exists
    const buyer = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, buyerId))
      .execute();

    if (buyer.length === 0) {
      throw new Error('Buyer not found');
    }

    // Get cart item for this buyer
    const listingId = cartStorage.get(buyerId);
    
    if (!listingId) {
      return { items: [] };
    }

    // Fetch listing details and verify it's still available
    const listings = await db.select()
      .from(listingsTable)
      .where(
        and(
          eq(listingsTable.id, listingId),
          eq(listingsTable.status, 'available')
        )
      )
      .execute();

    if (listings.length === 0) {
      // Listing is no longer available, remove from cart
      cartStorage.delete(buyerId);
      return { items: [] };
    }

    const listing = listings[0];
    return {
      items: [{
        listing: {
          ...listing,
          created_at: new Date(listing.created_at),
          updated_at: new Date(listing.updated_at)
        }
      }]
    };
  } catch (error) {
    console.error('Get cart failed:', error);
    throw error;
  }
}