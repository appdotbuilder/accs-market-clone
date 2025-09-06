import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { trpc } from '@/utils/trpc';
import type { Order } from '../../../server/src/schema';

interface OrderCardProps {
  order: Order;
  userRole: string;
}

export function OrderCard({ order }: OrderCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [credentials, setCredentials] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'paid': return 'bg-blue-100 text-blue-800';
      case 'delivered': return 'bg-green-100 text-green-800';
      case 'disputed': return 'bg-red-100 text-red-800';
      case 'complete': return 'bg-emerald-100 text-emerald-800';
      case 'refunded': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'paid': return '💰';
      case 'delivered': return '📦';
      case 'disputed': return '⚠️';
      case 'complete': return '✅';
      case 'refunded': return '🔄';
      default: return '❓';
    }
  };

  const handleViewCredentials = async () => {
    if (credentials) {
      setShowCredentials(true);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // In a real implementation, this would return the order with decrypted credentials
      await trpc.orders.getOrder.query(order.id);
      
      // For now, show placeholder credentials since the backend is stubbed
      setCredentials(`Username: example_user
Password: secure_password_123
Email: account@example.com
Recovery Email: recovery@example.com

Additional Notes:
- Account is verified
- No restrictions
- Original email access included
- Please change password after login`);
      
      setShowCredentials(true);
    } catch (error) {
      console.error('Failed to load credentials:', error);
      setError('Failed to load account credentials');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcknowledgeDelivery = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await trpc.orders.acknowledgeDelivery.mutate({ order_id: order.id });
      // Update order status optimistically
      order.status = 'delivered';
    } catch (error) {
      console.error('Failed to acknowledge delivery:', error);
      setError('Failed to acknowledge delivery');
    } finally {
      setIsLoading(false);
    }
  };

  const canViewCredentials = order.status === 'paid' || order.status === 'delivered' || order.status === 'complete';
  const canAcknowledgeDelivery = order.status === 'paid';
  const isExpiring = order.expires_at && new Date() > new Date(order.expires_at);

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-white/20">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">Order #{order.id.slice(-8)}</CardTitle>
            <p className="text-sm text-gray-600 mt-1">
              Placed {order.created_at.toLocaleDateString()}
            </p>
          </div>
          <Badge className={getStatusColor(order.status)}>
            {getStatusIcon(order.status)} {order.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-indigo-600">
              {formatPrice(order.total_cents)}
            </div>
            <div className="text-xs text-gray-500">{order.currency}</div>
          </div>
          
          {order.expires_at && (
            <div className="text-right">
              <div className="text-sm text-gray-600">Expires</div>
              <div className={`text-xs ${isExpiring ? 'text-red-600' : 'text-gray-500'}`}>
                {order.expires_at.toLocaleDateString()}
              </div>
            </div>
          )}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {order.status === 'pending' && (
          <Alert>
            <AlertDescription>
              ⏳ Payment is being processed. You'll receive the account credentials once payment is confirmed.
            </AlertDescription>
          </Alert>
        )}

        {order.status === 'paid' && (
          <Alert>
            <AlertDescription>
              💰 Payment confirmed! Your account credentials are ready. Please verify the account and acknowledge delivery within 24 hours.
            </AlertDescription>
          </Alert>
        )}

        {order.status === 'delivered' && (
          <Alert>
            <AlertDescription>
              📦 Delivery acknowledged. Order will automatically complete after the dispute window expires.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          {canViewCredentials && (
            <Dialog open={showCredentials} onOpenChange={setShowCredentials}>
              <DialogTrigger asChild>
                <Button onClick={handleViewCredentials} disabled={isLoading}>
                  {isLoading ? 'Loading...' : '🔐 View Credentials'}
                </Button>
              </DialogTrigger>
              
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Account Credentials</DialogTitle>
                </DialogHeader>
                
                <div className="space-y-4">
                  <Alert>
                    <AlertDescription>
                      🔒 These are your account credentials. Please copy them safely and change the password after first login.
                    </AlertDescription>
                  </Alert>
                  
                  <Textarea
                    value={credentials || ''}
                    readOnly
                    rows={8}
                    className="font-mono text-sm"
                  />
                  
                  <Button
                    onClick={() => {
                      if (credentials) {
                        navigator.clipboard.writeText(credentials);
                      }
                    }}
                    className="w-full"
                  >
                    📋 Copy to Clipboard
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {canAcknowledgeDelivery && (
            <Button 
              variant="outline"
              onClick={handleAcknowledgeDelivery}
              disabled={isLoading}
            >
              {isLoading ? 'Processing...' : '✅ Confirm Received'}
            </Button>
          )}

          {(order.status === 'paid' || order.status === 'delivered') && (
            <Button variant="outline" size="sm">
              ⚠️ Open Dispute
            </Button>
          )}

          {order.status === 'complete' && (
            <Button variant="outline" size="sm">
              ⭐ Leave Review
            </Button>
          )}
        </div>

        <Separator />
        
        <div className="text-xs text-gray-500 space-y-1">
          <div>Order ID: {order.id}</div>
          <div>Last Updated: {order.updated_at.toLocaleDateString()}</div>
        </div>
      </CardContent>
    </Card>
  );
}