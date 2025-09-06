import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { trpc } from '@/utils/trpc';
import type { Listing, User } from '../../../server/src/schema';

interface ListingCardProps {
  listing: Listing;
  currentUser: User | null;
  isOwner?: boolean;
}

export function ListingCard({ listing, currentUser, isOwner = false }: ListingCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [newStatus, setNewStatus] = useState(listing.status);
  const [error, setError] = useState<string | null>(null);

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const handleAddToCart = async () => {
    if (!currentUser) return;

    setIsLoading(true);
    setError(null);

    try {
      await trpc.cart.add.mutate({ listingId: listing.id });
      // In a real app, you might want to show a toast notification here
      console.log('Added to cart successfully');
    } catch (error) {
      console.error('Failed to add to cart:', error);
      setError('Failed to add to cart');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async () => {
    if (!currentUser || newStatus === listing.status) return;

    setIsLoading(true);
    setError(null);

    try {
      await trpc.seller.setListingStatus.mutate({
        listing_id: listing.id,
        status: newStatus
      });
      
      listing.status = newStatus; // Optimistic update
      setShowStatusDialog(false);
    } catch (error) {
      console.error('Failed to update status:', error);
      setError('Failed to update status');
      setNewStatus(listing.status); // Revert on error
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-green-100 text-green-800';
      case 'sold': return 'bg-gray-100 text-gray-800';
      case 'delisted': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'available': return '✅';
      case 'sold': return '🔒';
      case 'delisted': return '❌';
      default: return '❓';
    }
  };

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-white/20 hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg line-clamp-2">{listing.title}</CardTitle>
          <Badge className={getStatusColor(listing.status)}>
            {getStatusIcon(listing.status)} {listing.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-gray-600 text-sm line-clamp-3">
          {listing.description}
        </p>

        <div className="flex items-center justify-between">
          <div className="text-2xl font-bold text-indigo-600">
            {formatPrice(listing.price_cents)}
          </div>
          <div className="text-xs text-gray-500">
            {listing.currency}
          </div>
        </div>

        {listing.has_secure_payload && (
          <div className="flex items-center space-x-1 text-green-600 text-sm">
            <span>🔐</span>
            <span>Credentials uploaded</span>
          </div>
        )}

        <div className="text-xs text-gray-500">
          Listed {listing.created_at.toLocaleDateString()}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex space-x-2 pt-2">
          {isOwner ? (
            <>
              <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="flex-1">
                    Edit Status
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Update Listing Status</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Select value={newStatus} onValueChange={(value) => setNewStatus(value as typeof newStatus)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="available">
                          <div className="flex items-center space-x-2">
                            <span>✅</span>
                            <span>Available</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="delisted">
                          <div className="flex items-center space-x-2">
                            <span>❌</span>
                            <span>Delisted</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    
                    <div className="flex space-x-2">
                      <Button 
                        onClick={handleStatusChange} 
                        disabled={isLoading || newStatus === listing.status}
                        className="flex-1"
                      >
                        {isLoading ? 'Updating...' : 'Update Status'}
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => setShowStatusDialog(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              
              <Button variant="outline" className="flex-1">
                Edit Details
              </Button>
            </>
          ) : (
            <>
              {currentUser ? (
                listing.status === 'available' ? (
                  <Button 
                    onClick={handleAddToCart} 
                    disabled={isLoading}
                    className="flex-1"
                  >
                    {isLoading ? 'Adding...' : '🛒 Add to Cart'}
                  </Button>
                ) : (
                  <Button disabled className="flex-1">
                    {listing.status === 'sold' ? '🔒 Sold' : '❌ Not Available'}
                  </Button>
                )
              ) : (
                <Button disabled className="flex-1">
                  Sign in to purchase
                </Button>
              )}
              
              <Button variant="outline" size="sm">
                View Details
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}