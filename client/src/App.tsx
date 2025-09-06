import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/utils/trpc';
import type { User, Listing, Category, Order } from '../../server/src/schema';
import { AuthDialog } from '@/components/AuthDialog';
import { CreateListingDialog } from '@/components/CreateListingDialog';
import { ListingCard } from '@/components/ListingCard';
import { OrderCard } from '@/components/OrderCard';
import { DashboardStats } from '@/components/DashboardStats';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [listings, setListings] = useState<Listing[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentView, setCurrentView] = useState<'home' | 'dashboard'>('home');
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [myListings, setMyListings] = useState<Listing[]>([]);

  // Load initial data
  const loadInitialData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [categoriesResult, listingsResult] = await Promise.all([
        trpc.catalog.listCategories.query(),
        trpc.catalog.searchListings.query({ page: 1, page_size: 20 })
      ]);
      
      setCategories(categoriesResult);
      setListings(listingsResult.items);
    } catch (error) {
      console.error('Failed to load initial data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadUserData = useCallback(async () => {
    if (!user) return;
    
    try {
      const [ordersResult, userListingsResult] = await Promise.all([
        trpc.orders.myOrders.query({ page: 1 }),
        user.role === 'seller' || user.role === 'admin' 
          ? trpc.seller.myListings.query({ page: 1 })
          : Promise.resolve({ items: [] })
      ]);

      setMyOrders(ordersResult.items || []);
      if ('items' in userListingsResult) {
        setMyListings(userListingsResult.items);
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
    }
  }, [user]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  const handleLogin = async (userData: User) => {
    setUser(userData);
    loadUserData();
  };

  const handleLogout = () => {
    setUser(null);
    setCurrentView('home');
    setMyOrders([]);
    setMyListings([]);
  };

  const handleSearch = async () => {
    try {
      setIsLoading(true);
      const result = await trpc.catalog.searchListings.query({
        q: searchQuery || undefined,
        category_slug: selectedCategory || undefined,
        page: 1,
        page_size: 20
      });
      setListings(result.items);
    } catch (error) {
      console.error('Failed to search listings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleListingCreated = (newListing: Listing) => {
    setMyListings(prev => [newListing, ...prev]);
    if (newListing.status === 'available') {
      setListings(prev => [newListing, ...prev]);
    }
  };

  if (isLoading && listings.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading AccsMarket...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-white/20 shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 
              className="text-2xl font-bold text-indigo-600 cursor-pointer hover:text-indigo-700 transition-colors"
              onClick={() => setCurrentView('home')}
            >
              🚀 AccsMarket
            </h1>
            
            {currentView === 'home' && (
              <div className="flex items-center space-x-2">
                <select 
                  value={selectedCategory || ''}
                  onChange={(e) => setSelectedCategory(e.target.value || null)}
                  className="px-3 py-2 border border-gray-300 rounded-md bg-white/80 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">All Categories</option>
                  {categories.map((category: Category) => (
                    <option key={category.id} value={category.slug}>
                      {category.name}
                    </option>
                  ))}
                </select>
                
                <input
                  type="text"
                  placeholder="Search accounts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  className="px-3 py-2 border border-gray-300 rounded-md bg-white/80 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                
                <Button onClick={handleSearch} variant="outline">
                  Search
                </Button>
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-4">
            {user ? (
              <>
                <div className="flex items-center space-x-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-indigo-100 text-indigo-600">
                      {user.email.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-sm">
                    <p className="text-gray-900">{user.email}</p>
                    <Badge variant="secondary" className="text-xs">
                      {user.role}
                    </Badge>
                  </div>
                </div>
                
                <Button
                  variant={currentView === 'dashboard' ? 'default' : 'outline'}
                  onClick={() => setCurrentView(currentView === 'dashboard' ? 'home' : 'dashboard')}
                >
                  {currentView === 'dashboard' ? 'Home' : 'Dashboard'}
                </Button>
                
                <Button variant="ghost" onClick={handleLogout}>
                  Logout
                </Button>
              </>
            ) : (
              <AuthDialog onLogin={handleLogin} />
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {currentView === 'home' ? (
          <div>
            {/* Hero Section */}
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">
                Premium Digital Accounts Marketplace
              </h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Buy and sell verified digital accounts with secure escrow protection. 
                Instant delivery, verified sellers, money-back guarantee.
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              <Card className="bg-white/80 backdrop-blur-sm border-white/20">
                <CardContent className="p-6 text-center">
                  <div className="text-3xl font-bold text-indigo-600 mb-2">
                    {listings.length}+
                  </div>
                  <p className="text-gray-600">Active Listings</p>
                </CardContent>
              </Card>
              
              <Card className="bg-white/80 backdrop-blur-sm border-white/20">
                <CardContent className="p-6 text-center">
                  <div className="text-3xl font-bold text-green-600 mb-2">💯</div>
                  <p className="text-gray-600">Secure Escrow</p>
                </CardContent>
              </Card>
              
              <Card className="bg-white/80 backdrop-blur-sm border-white/20">
                <CardContent className="p-6 text-center">
                  <div className="text-3xl font-bold text-purple-600 mb-2">⚡</div>
                  <p className="text-gray-600">Instant Delivery</p>
                </CardContent>
              </Card>
            </div>

            {/* Listings Grid */}
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-2xl font-semibold text-gray-900">
                {selectedCategory ? `${categories.find(c => c.slug === selectedCategory)?.name} Accounts` : 'Featured Accounts'}
              </h3>
              {listings.length > 0 && (
                <p className="text-gray-600">{listings.length} accounts available</p>
              )}
            </div>

            {listings.length === 0 ? (
              <Card className="bg-white/80 backdrop-blur-sm border-white/20">
                <CardContent className="p-12 text-center">
                  <div className="text-6xl mb-4">🔍</div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">No accounts found</h3>
                  <p className="text-gray-600">
                    {searchQuery || selectedCategory 
                      ? 'Try adjusting your search filters'
                      : 'Be the first to list an account!'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {listings.map((listing: Listing) => (
                  <ListingCard 
                    key={listing.id} 
                    listing={listing}
                    currentUser={user}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          user && (
            <div>
              <div className="mb-8 flex items-center justify-between">
                <h2 className="text-3xl font-bold text-gray-900">
                  Dashboard
                </h2>
                {(user.role === 'seller' || user.role === 'admin') && (
                  <CreateListingDialog 
                    categories={categories}
                    onListingCreated={handleListingCreated}
                  />
                )}
              </div>

              <DashboardStats user={user} />

              <Tabs defaultValue="orders" className="mt-8">
                <TabsList className="bg-white/80 backdrop-blur-sm">
                  <TabsTrigger value="orders">My Orders</TabsTrigger>
                  {(user.role === 'seller' || user.role === 'admin') && (
                    <TabsTrigger value="listings">My Listings</TabsTrigger>
                  )}
                  {(user.role === 'seller' || user.role === 'admin') && (
                    <TabsTrigger value="payouts">Payouts</TabsTrigger>
                  )}
                  {user.role === 'admin' && (
                    <TabsTrigger value="admin">Admin</TabsTrigger>
                  )}
                </TabsList>

                <TabsContent value="orders" className="mt-6">
                  <div className="space-y-4">
                    {myOrders.length === 0 ? (
                      <Card className="bg-white/80 backdrop-blur-sm border-white/20">
                        <CardContent className="p-8 text-center">
                          <div className="text-4xl mb-4">🛒</div>
                          <h3 className="text-xl font-semibold text-gray-900 mb-2">No orders yet</h3>
                          <p className="text-gray-600 mb-4">Start browsing accounts to make your first purchase</p>
                          <Button onClick={() => setCurrentView('home')}>
                            Browse Accounts
                          </Button>
                        </CardContent>
                      </Card>
                    ) : (
                      myOrders.map((order: Order) => (
                        <OrderCard key={order.id} order={order} userRole={user.role} />
                      ))
                    )}
                  </div>
                </TabsContent>

                {(user.role === 'seller' || user.role === 'admin') && (
                  <TabsContent value="listings" className="mt-6">
                    <div className="space-y-4">
                      {myListings.length === 0 ? (
                        <Card className="bg-white/80 backdrop-blur-sm border-white/20">
                          <CardContent className="p-8 text-center">
                            <div className="text-4xl mb-4">📝</div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">No listings yet</h3>
                            <p className="text-gray-600 mb-4">Create your first listing to start selling</p>
                            <CreateListingDialog 
                              categories={categories}
                              onListingCreated={handleListingCreated}
                            />
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {myListings.map((listing: Listing) => (
                            <ListingCard 
                              key={listing.id} 
                              listing={listing}
                              currentUser={user}
                              isOwner={true}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </TabsContent>
                )}

                {(user.role === 'seller' || user.role === 'admin') && (
                  <TabsContent value="payouts" className="mt-6">
                    <Card className="bg-white/80 backdrop-blur-sm border-white/20">
                      <CardHeader>
                        <CardTitle>💰 Payouts</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-gray-600">Payout management coming soon...</p>
                      </CardContent>
                    </Card>
                  </TabsContent>
                )}

                {user.role === 'admin' && (
                  <TabsContent value="admin" className="mt-6">
                    <Card className="bg-white/80 backdrop-blur-sm border-white/20">
                      <CardHeader>
                        <CardTitle>🛡️ Admin Panel</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-gray-600">Admin controls coming soon...</p>
                      </CardContent>
                    </Card>
                  </TabsContent>
                )}
              </Tabs>
            </div>
          )
        )}
      </main>
    </div>
  );
}

export default App;