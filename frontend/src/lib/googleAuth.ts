import { useCallback, useRef, useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';

type TokenInfo = {
  accessToken: string;
  expiresAt: number;
};

let cachedToken: TokenInfo | null = null;

function isTokenValid(): boolean {
  return cachedToken !== null && Date.now() < cachedToken.expiresAt - 60_000;
}

export function useGoogleAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(isTokenValid());
  const resolveRef = useRef<((token: string) => void) | null>(null);
  const rejectRef = useRef<((err: Error) => void) | null>(null);

  const login = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    onSuccess(response) {
      cachedToken = {
        accessToken: response.access_token,
        expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
      };
      setIsAuthenticated(true);
      resolveRef.current?.(response.access_token);
      resolveRef.current = null;
      rejectRef.current = null;
    },
    onError(err) {
      rejectRef.current?.(new Error(err.error_description ?? 'Google login failed'));
      resolveRef.current = null;
      rejectRef.current = null;
    },
  });

  const getToken = useCallback((): Promise<string> => {
    if (isTokenValid()) {
      return Promise.resolve(cachedToken!.accessToken);
    }
    return new Promise<string>((resolve, reject) => {
      resolveRef.current = resolve;
      rejectRef.current = reject;
      login();
    });
  }, [login]);

  const loginAndGetToken = useCallback((): Promise<string> => {
    return getToken();
  }, [getToken]);

  return { isAuthenticated, login: loginAndGetToken, getToken };
}

/**
 * Get the cached Google OAuth token without requiring a React hook.
 * Returns null if no valid token is cached.
 */
export function getCachedGoogleToken(): string | null {
  return isTokenValid() ? cachedToken!.accessToken : null;
}
