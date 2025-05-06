import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Get the URL hash
        const hashFragment = window.location.hash;
        
        if (hashFragment) {
          // Remove the leading '#' and parse the parameters
          const params = new URLSearchParams(hashFragment.substring(1));
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          const expiresIn = params.get('expires_in');
          const providerToken = params.get('provider_token');
          const providerRefreshToken = params.get('provider_refresh_token');

          if (accessToken) {
            // Set the session with all available tokens
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken || '',
              expires_in: parseInt(expiresIn || '3600'),
              provider_token: providerToken,
              provider_refresh_token: providerRefreshToken,
            });

            // Verify the session was set correctly
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            
            if (sessionError) throw sessionError;
            
            if (session) {
              // Clear the hash fragment and navigate to dashboard
              window.history.replaceState(null, '', window.location.pathname);
              navigate('/dashboard', { replace: true });
              return;
            }
          }
        }

        // If we get here, something went wrong
        console.error('No valid session found in callback');
        navigate('/login', { replace: true });
      } catch (error) {
        console.error('Error in auth callback:', error);
        navigate('/login', { replace: true });
      }
    };

    handleAuthCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  );
}