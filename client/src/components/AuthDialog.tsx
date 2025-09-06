import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { trpc } from '@/utils/trpc';
import type { User, RegisterInput, LoginInput } from '../../../server/src/schema';

interface AuthDialogProps {
  onLogin: (user: User) => void;
}

export function AuthDialog({ onLogin }: AuthDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [loginData, setLoginData] = useState<LoginInput>({
    email: '',
    password: ''
  });

  const [registerData, setRegisterData] = useState<RegisterInput>({
    email: '',
    password: '',
    role: 'buyer'
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await trpc.auth.login.mutate(loginData);
      onLogin(result.user);
      setIsOpen(false);
      setLoginData({ email: '', password: '' });
    } catch (error) {
      console.error('Login failed:', error);
      setError('Invalid email or password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const user = await trpc.auth.register.mutate(registerData);
      onLogin(user);
      setIsOpen(false);
      setRegisterData({ email: '', password: '', role: 'buyer' });
    } catch (error) {
      console.error('Registration failed:', error);
      setError('Registration failed. Email may already be in use.');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setError(null);
    setLoginData({ email: '', password: '' });
    setRegisterData({ email: '', password: '', role: 'buyer' });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) resetForm();
    }}>
      <DialogTrigger asChild>
        <Button>Sign In</Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-md bg-white/95 backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle className="text-center text-xl">
            Welcome to AccsMarket 🚀
          </DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Sign In</TabsTrigger>
            <TabsTrigger value="register">Sign Up</TabsTrigger>
          </TabsList>

          <TabsContent value="login" className="space-y-4 mt-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="your@email.com"
                  value={loginData.email}
                  onChange={(e) => setLoginData(prev => ({ ...prev, email: e.target.value }))}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="Your password"
                  value={loginData.password}
                  onChange={(e) => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                  required
                />
              </div>
              
              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading}
              >
                {isLoading ? 'Signing In...' : 'Sign In'}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="register" className="space-y-4 mt-6">
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="register-email">Email</Label>
                <Input
                  id="register-email"
                  type="email"
                  placeholder="your@email.com"
                  value={registerData.email}
                  onChange={(e) => setRegisterData(prev => ({ ...prev, email: e.target.value }))}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="register-password">Password</Label>
                <Input
                  id="register-password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={registerData.password}
                  onChange={(e) => setRegisterData(prev => ({ ...prev, password: e.target.value }))}
                  minLength={8}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="register-role">Account Type</Label>
                <Select 
                  value={registerData.role || 'buyer'} 
                  onValueChange={(value) => setRegisterData(prev => ({ ...prev, role: value as 'buyer' | 'seller' }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buyer">
                      <div className="flex items-center space-x-2">
                        <span>🛒</span>
                        <div>
                          <div className="font-medium">Buyer</div>
                          <div className="text-xs text-gray-500">Purchase accounts</div>
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="seller">
                      <div className="flex items-center space-x-2">
                        <span>💼</span>
                        <div>
                          <div className="font-medium">Seller</div>
                          <div className="text-xs text-gray-500">Sell accounts</div>
                        </div>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading}
              >
                {isLoading ? 'Creating Account...' : 'Create Account'}
              </Button>
            </form>

            <Card className="bg-blue-50/80 border-blue-200">
              <CardContent className="p-4">
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-2">✨ Why join AccsMarket?</p>
                  <ul className="space-y-1 text-xs">
                    <li>• Secure escrow protection</li>
                    <li>• Instant delivery after payment</li>
                    <li>• Verified seller ratings</li>
                    <li>• 24-hour dispute window</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}