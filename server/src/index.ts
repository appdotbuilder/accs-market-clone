import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import schemas
import {
  registerInputSchema,
  loginInputSchema,
  searchListingsInputSchema,
  upsertListingInputSchema,
  setListingPayloadInputSchema,
  setListingStatusInputSchema,
  paginationInputSchema,
  createPaymentIntentInputSchema,
  acknowledgeDeliveryInputSchema,
  createReviewInputSchema,
  getSellerReviewsInputSchema,
  openDisputeInputSchema,
  resolveDisputeInputSchema,
  requestPayoutInputSchema,
  processPayoutInputSchema,
  listUsersInputSchema,
  listDisputesInputSchema
} from './schema';

// Import handlers
import { register, login, getCurrentUser } from './handlers/auth';
import { listCategories, searchListings, getListing } from './handlers/catalog';
import { upsertListing, setListingPayload, setListingStatus, getMyListings, getMyBalance } from './handlers/seller';
import { addToCart, removeFromCart, getCart } from './handlers/cart';
import { createPaymentIntent, handleStripeWebhook } from './handlers/checkout';
import { getMyOrders, getOrder, acknowledgeDelivery } from './handlers/orders';
import { createReview, getSellerReviews } from './handlers/reviews';
import { openDispute, resolveDispute } from './handlers/disputes';
import { requestPayout, processPayoutAdmin } from './handlers/payouts';
import { listUsers, listDisputes } from './handlers/admin';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

// Mock middleware for authentication - should be replaced with real auth
const requireAuth = publicProcedure.use(({ next }) => {
  // This is a placeholder! Real implementation should:
  // 1. Extract JWT from Authorization header or cookies
  // 2. Verify token and get user info
  // 3. Pass user context to procedures
  const mockUserId = '00000000-0000-0000-0000-000000000000';
  const mockUserRole = 'buyer';
  
  return next({
    ctx: { 
      userId: mockUserId, 
      userRole: mockUserRole 
    }
  });
});

const requireSeller = requireAuth.use(({ ctx, next }) => {
  if (ctx.userRole !== 'seller' && ctx.userRole !== 'admin') {
    throw new Error('Seller role required');
  }
  return next({ ctx });
});

const requireAdmin = requireAuth.use(({ ctx, next }) => {
  if (ctx.userRole !== 'admin') {
    throw new Error('Admin role required');
  }
  return next({ ctx });
});

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // Auth routes
  auth: router({
    register: publicProcedure
      .input(registerInputSchema)
      .mutation(({ input }) => register(input)),
    
    login: publicProcedure
      .input(loginInputSchema)
      .mutation(({ input }) => login(input)),
    
    me: requireAuth
      .query(({ ctx }) => getCurrentUser(ctx.userId))
  }),

  // Catalog routes (public)
  catalog: router({
    listCategories: publicProcedure
      .query(() => listCategories()),
    
    searchListings: publicProcedure
      .input(searchListingsInputSchema)
      .query(({ input }) => searchListings(input)),
    
    getListing: publicProcedure
      .input(z.string().uuid())
      .query(({ input }) => getListing(input))
  }),

  // Seller routes
  seller: router({
    upsertListing: requireSeller
      .input(upsertListingInputSchema)
      .mutation(({ input, ctx }) => upsertListing(input, ctx.userId)),
    
    setListingPayload: requireSeller
      .input(setListingPayloadInputSchema)
      .mutation(({ input, ctx }) => setListingPayload(input, ctx.userId)),
    
    setListingStatus: requireSeller
      .input(setListingStatusInputSchema)
      .mutation(({ input, ctx }) => setListingStatus(input, ctx.userId)),
    
    myListings: requireSeller
      .input(z.object({
        status: z.string().optional(),
        page: z.number().int().positive().default(1)
      }))
      .query(({ input, ctx }) => getMyListings(input, ctx.userId)),
    
    myBalance: requireSeller
      .query(({ ctx }) => getMyBalance(ctx.userId))
  }),

  // Cart routes
  cart: router({
    add: requireAuth
      .input(z.object({ listingId: z.string().uuid() }))
      .mutation(({ input, ctx }) => addToCart(input.listingId, ctx.userId)),
    
    remove: requireAuth
      .input(z.object({ listingId: z.string().uuid() }))
      .mutation(({ input, ctx }) => removeFromCart(input.listingId, ctx.userId)),
    
    get: requireAuth
      .query(({ ctx }) => getCart(ctx.userId))
  }),

  // Checkout routes
  checkout: router({
    createPaymentIntent: requireAuth
      .input(createPaymentIntentInputSchema)
      .mutation(({ input, ctx }) => createPaymentIntent(input, ctx.userId))
  }),

  // Orders routes
  orders: router({
    myOrders: requireAuth
      .input(z.object({
        status: z.string().optional(),
        page: z.number().int().positive().default(1)
      }))
      .query(({ input, ctx }) => getMyOrders(input, ctx.userId)),
    
    getOrder: requireAuth
      .input(z.string().uuid())
      .query(({ input, ctx }) => getOrder(input, ctx.userId, ctx.userRole)),
    
    acknowledgeDelivery: requireAuth
      .input(acknowledgeDeliveryInputSchema)
      .mutation(({ input, ctx }) => acknowledgeDelivery(input, ctx.userId))
  }),

  // Reviews routes
  reviews: router({
    create: requireAuth
      .input(createReviewInputSchema)
      .mutation(({ input, ctx }) => createReview(input, ctx.userId)),
    
    forSeller: publicProcedure
      .input(getSellerReviewsInputSchema)
      .query(({ input }) => getSellerReviews(input))
  }),

  // Disputes routes
  disputes: router({
    open: requireAuth
      .input(openDisputeInputSchema)
      .mutation(({ input, ctx }) => openDispute(input, ctx.userId)),
    
    resolve: requireAdmin
      .input(resolveDisputeInputSchema)
      .mutation(({ input, ctx }) => resolveDispute(input, ctx.userId))
  }),

  // Payouts routes
  payouts: router({
    request: requireSeller
      .input(requestPayoutInputSchema)
      .mutation(({ input, ctx }) => requestPayout(input, ctx.userId)),
    
    adminProcess: requireAdmin
      .input(processPayoutInputSchema)
      .mutation(({ input, ctx }) => processPayoutAdmin(input, ctx.userId))
  }),

  // Admin routes
  admin: router({
    listUsers: requireAdmin
      .input(listUsersInputSchema)
      .query(({ input, ctx }) => listUsers(input, ctx.userId)),
    
    listDisputes: requireAdmin
      .input(listDisputesInputSchema)
      .query(({ input, ctx }) => listDisputes(input, ctx.userId))
  })
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });

  server.listen(port);
  console.log(`AccsMarket tRPC server listening at port: ${port}`);
  console.log('Available routes:');
  console.log('- auth: register, login, me');
  console.log('- catalog: listCategories, searchListings, getListing');
  console.log('- seller: upsertListing, setListingPayload, setListingStatus, myListings, myBalance');
  console.log('- cart: add, remove, get');
  console.log('- checkout: createPaymentIntent');
  console.log('- orders: myOrders, getOrder, acknowledgeDelivery');
  console.log('- reviews: create, forSeller');
  console.log('- disputes: open, resolve');
  console.log('- payouts: request, adminProcess');
  console.log('- admin: listUsers, listDisputes');
}

start();