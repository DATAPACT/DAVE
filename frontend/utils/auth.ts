/**
 * Authentication utility functions
 *
 * Provides a centralized way to check if authentication is enabled
 * across the frontend application.
 */

/**
 * Checks if authentication is enabled based on the environment variable
 * @returns {boolean} true if authentication is enabled, false otherwise
 */
export const isAuthEnabled = (): boolean => {
  return process.env.NEXT_PUBLIC_USE_AUTH !== 'false';
};

/**
 * Checks if authentication is disabled based on the environment variable
 * @returns {boolean} true if authentication is disabled, false otherwise
 */
export const isAuthDisabled = (): boolean => {
  return process.env.NEXT_PUBLIC_USE_AUTH === 'false';
};

/**
 * Gets the default redirect URL after authentication
 * @param callbackUrl Optional callback URL from query params
 * @returns {string} The redirect URL
 */
export const getAuthRedirectUrl = (callbackUrl?: string): string => {
  return callbackUrl || '/';
};

/**
 * Gets the sign-in URL with optional callback
 * @param callbackUrl Optional callback URL to redirect after sign-in
 * @returns {string} The sign-in URL
 */
export const getSignInUrl = (callbackUrl?: string): string => {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  const url = `${basePath}/sign-in`;
  return callbackUrl ? `${url}?callbackUrl=${encodeURIComponent(callbackUrl)}` : url;
};

export const isInIframe = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true; // cross-origin iframe throws on window.top access
  }
};

/**
 * Server-side: returns true if the incoming request is being loaded inside an iframe.
 * Uses the Fetch metadata header `Sec-Fetch-Dest: iframe` (supported by all modern browsers).
 * Falls back to checking the `Referer` header against the configured parent origin.
 */
export const isRequestFromIframe = (req: { headers: Record<string, string | string[] | undefined> }): boolean => {
  const dest = req.headers['sec-fetch-dest'];
  if (dest === 'iframe') return true;

  // Fallback: if a parent origin is configured, check the Referer
  const parentOrigin = process.env.NEXT_PUBLIC_FRAME_ANCESTORS;
  if (parentOrigin) {
    const referer = req.headers['referer'] || req.headers['referrer'];
    if (typeof referer === 'string' && referer.startsWith(parentOrigin)) return true;
  }

  return false;
};
