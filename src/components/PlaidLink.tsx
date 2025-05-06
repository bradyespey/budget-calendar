import React, { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { Button } from './ui/Button';
import { RefreshCw } from 'lucide-react';
import { getChaseBalance } from '../api/accounts';

interface PlaidLinkProps {
  onSuccess: () => void;
  onExit?: () => void;
  buttonText?: string;
}

export function PlaidLink({ onSuccess, onExit, buttonText = 'Link Bank Account' }: PlaidLinkProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const createLinkToken = async () => {
      try {
        setLoading(true);
        setError(null);
        console.log('Creating Plaid link token...');
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-link-token`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error('Link token creation failed:', errorData);
          throw new Error(`Failed to create link token: ${errorData.error || response.status}`);
        }

        const data = await response.json();
        if (!data.link_token) {
          throw new Error('No link token received');
        }
        
        console.log('Link token created successfully');
        setLinkToken(data.link_token);
      } catch (error) {
        console.error('Error creating link token:', error);
        setError('Failed to initialize bank connection. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    if (!isConnected) {
      createLinkToken();
    }
  }, [isConnected]);

  const handleRefreshBalance = async () => {
    try {
      setRefreshing(true);
      setError(null);
      const data = await getChaseBalance();
      console.log('Balance updated:', data);
      onSuccess();
    } catch (error) {
      console.error('Error refreshing balance:', error);
      setError('Failed to update balance. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  const onPlaidSuccess = useCallback(async (publicToken: string) => {
    setLoading(true);
    setError(null);
    try {
      console.log('Exchanging public token...');
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/exchange-public-token`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ public_token: publicToken }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Token exchange failed:', errorData);
        throw new Error(`Failed to exchange token: ${errorData.error || response.status}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Token exchange failed');
      }

      setIsConnected(true);
      onSuccess();
    } catch (error) {
      console.error('Error exchanging public token:', error);
      setError('Failed to complete bank connection. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [onSuccess]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (public_token) => {
      console.log('Plaid Link success, exchanging token...');
      onPlaidSuccess(public_token);
    },
    onExit: () => {
      console.log('Plaid Link closed');
      onExit?.();
    },
  });

  return (
    <div>
      {isConnected ? (
        <Button
          onClick={handleRefreshBalance}
          isLoading={refreshing}
          leftIcon={<RefreshCw size={16} />}
        >
          {buttonText}
        </Button>
      ) : (
        <Button
          onClick={() => {
            console.log('Opening Plaid Link...');
            open();
          }}
          disabled={!ready || loading}
          isLoading={loading}
        >
          {buttonText}
        </Button>
      )}
      {error && (
        <div className="mt-2">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}