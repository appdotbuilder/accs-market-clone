import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { trpc } from '@/utils/trpc';
import type { Category, Listing, UpsertListingInput } from '../../../server/src/schema';

interface CreateListingDialogProps {
  categories: Category[];
  onListingCreated: (listing: Listing) => void;
}

export function CreateListingDialog({ categories, onListingCreated }: CreateListingDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);

  const [formData, setFormData] = useState<UpsertListingInput>({
    title: '',
    description: '',
    category_id: '',
    price_cents: 0
  });

  const [credentials, setCredentials] = useState('');
  const [newListingId, setNewListingId] = useState<string | null>(null);

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      category_id: '',
      price_cents: 0
    });
    setCredentials('');
    setNewListingId(null);
    setCurrentStep(1);
    setError(null);
  };

  const handleSubmitListing = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const listing = await trpc.seller.upsertListing.mutate(formData);
      setNewListingId(listing.id);
      onListingCreated(listing);
      
      if (credentials.trim()) {
        setCurrentStep(2);
      } else {
        setIsOpen(false);
        resetForm();
      }
    } catch (error) {
      console.error('Failed to create listing:', error);
      setError('Failed to create listing. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListingId || !credentials.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      await trpc.seller.setListingPayload.mutate({
        listing_id: newListingId,
        plaintext_credentials: credentials
      });
      
      setIsOpen(false);
      resetForm();
    } catch (error) {
      console.error('Failed to upload credentials:', error);
      setError('Failed to upload credentials. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePriceChange = (value: string) => {
    const dollars = parseFloat(value) || 0;
    const cents = Math.round(dollars * 100);
    setFormData(prev => ({ ...prev, price_cents: cents }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) resetForm();
    }}>
      <DialogTrigger asChild>
        <Button>
          ✨ Create Listing
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-lg bg-white/95 backdrop-blur-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {currentStep === 1 ? 'Create New Listing' : 'Upload Account Credentials'}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {currentStep === 1 ? (
          <form onSubmit={handleSubmitListing} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">Account Title *</Label>
              <Input
                id="title"
                placeholder="e.g., Instagram Account - 10K Followers"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select 
                value={formData.category_id} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, category_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category: Category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">Price (USD) *</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="29.99"
                value={formData.price_cents > 0 ? (formData.price_cents / 100).toFixed(2) : ''}
                onChange={(e) => handlePriceChange(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                placeholder="Describe the account details, verification status, follower count, engagement rate, niche, etc."
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={4}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="credentials">Account Credentials (Optional)</Label>
              <Textarea
                id="credentials"
                placeholder="Username: example&#10;Password: password123&#10;Email: email@example.com&#10;Recovery Email: recovery@example.com"
                value={credentials}
                onChange={(e) => setCredentials(e.target.value)}
                rows={4}
              />
              <p className="text-xs text-gray-500">
                🔐 Credentials are encrypted and only revealed to buyers after payment
              </p>
            </div>

            <div className="bg-blue-50/80 p-4 rounded-lg border border-blue-200">
              <h4 className="font-medium text-blue-900 mb-2">📋 Listing Guidelines</h4>
              <ul className="text-xs text-blue-800 space-y-1">
                <li>• Provide accurate account information</li>
                <li>• Include verification status if applicable</li>
                <li>• Mention follower count, engagement rate</li>
                <li>• Specify account age and niche</li>
                <li>• Upload credentials for instant delivery</li>
              </ul>
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading || !formData.title || !formData.category_id || formData.price_cents <= 0}
            >
              {isLoading ? 'Creating Listing...' : 'Create Listing'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleUploadCredentials} className="space-y-6">
            <div className="text-center text-green-600">
              <div className="text-4xl mb-2">✅</div>
              <h3 className="text-lg font-medium">Listing Created Successfully!</h3>
              <p className="text-sm text-gray-600 mt-1">
                Now upload the account credentials to enable instant delivery
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="final-credentials">Account Credentials *</Label>
              <Textarea
                id="final-credentials"
                placeholder="Username: example&#10;Password: password123&#10;Email: email@example.com&#10;Recovery Email: recovery@example.com&#10;&#10;Additional Notes:&#10;- Account is verified&#10;- No restrictions&#10;- Original email included"
                value={credentials}
                onChange={(e) => setCredentials(e.target.value)}
                rows={8}
                required
              />
            </div>

            <div className="bg-green-50/80 p-4 rounded-lg border border-green-200">
              <h4 className="font-medium text-green-900 mb-2">🔐 Security Notice</h4>
              <ul className="text-xs text-green-800 space-y-1">
                <li>• Credentials are encrypted with military-grade security</li>
                <li>• Only revealed after successful payment</li>
                <li>• Stored securely on our servers</li>
                <li>• Never shared with unauthorized parties</li>
              </ul>
            </div>

            <div className="flex space-x-2">
              <Button 
                type="submit" 
                className="flex-1" 
                disabled={isLoading || !credentials.trim()}
              >
                {isLoading ? 'Uploading...' : '🔒 Upload Credentials'}
              </Button>
              
              <Button 
                type="button"
                variant="outline"
                onClick={() => {
                  setIsOpen(false);
                  resetForm();
                }}
              >
                Skip for Now
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}