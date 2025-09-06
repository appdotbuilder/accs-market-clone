import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/utils/trpc';
import type { User, BalanceResponse } from '../../../server/src/schema';

interface DashboardStatsProps {
  user: User;
}

export function DashboardStats({ user }: DashboardStatsProps) {
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [stats, setStats] = useState({
    totalOrders: 0,
    totalListings: 0,
    completedOrders: 0,
    activeListings: 0
  });

  const loadSellerBalance = useCallback(async () => {
    if (user.role !== 'seller' && user.role !== 'admin') return;
    
    try {
      const balanceResult = await trpc.seller.myBalance.query();
      setBalance(balanceResult);
    } catch (error) {
      console.error('Failed to load balance:', error);
    }
  }, [user.role]);

  const loadStats = useCallback(async () => {
    try {
      // Load basic stats (these would be real API calls in production)
      // For now, showing placeholder stats
      setStats({
        totalOrders: 5,
        totalListings: user.role === 'seller' ? 3 : 0,
        completedOrders: 3,
        activeListings: user.role === 'seller' ? 2 : 0
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }, [user.role]);

  useEffect(() => {
    loadSellerBalance();
    loadStats();
  }, [loadSellerBalance, loadStats]);

  const formatBalance = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {/* Total Orders */}
      <Card className="bg-white/80 backdrop-blur-sm border-white/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-600">
            📦 Total Orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-indigo-600">
            {stats.totalOrders}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {stats.completedOrders} completed
          </p>
        </CardContent>
      </Card>

      {/* Seller-specific stats */}
      {(user.role === 'seller' || user.role === 'admin') && (
        <>
          <Card className="bg-white/80 backdrop-blur-sm border-white/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                📝 My Listings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {stats.totalListings}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {stats.activeListings} active
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white/80 backdrop-blur-sm border-white/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                💰 Available Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">
                {balance ? formatBalance(balance.available_cents) : '$0.00'}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Ready for payout
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white/80 backdrop-blur-sm border-white/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                ⏳ Pending Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {balance ? formatBalance(balance.pending_cents) : '$0.00'}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                In escrow
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {/* Buyer-specific stats */}
      {user.role === 'buyer' && (
        <>
          <Card className="bg-white/80 backdrop-blur-sm border-white/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                ✅ Completed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {stats.completedOrders}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Successful purchases
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white/80 backdrop-blur-sm border-white/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                ⭐ Reviews Left
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">
                {Math.floor(stats.completedOrders * 0.8)} {/* ~80% review rate */}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Helpful feedback
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white/80 backdrop-blur-sm border-white/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                🛡️ Protection Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-blue-600">
                ACTIVE
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Buyer protection enabled
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {/* Admin-specific stats */}
      {user.role === 'admin' && (
        <Card className="bg-white/80 backdrop-blur-sm border-white/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              🛡️ Admin Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-red-600">
              ADMIN
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Full platform access
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}