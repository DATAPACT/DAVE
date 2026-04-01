import { Global } from '@emotion/react';
import styled from '@emotion/styled';
import type { AppProps } from 'next/app';
import GlobalStyles from '../styles/globalStyles';
import NextNProgress from 'nextjs-progressbar';
import { withTRPC } from '@trpc/next';
import { httpLink } from '@trpc/client/links/httpLink';
import { AppRouter } from '@/server/routers/_app';
import { HeroUIProvider } from '@heroui/react';
import { NextPage } from 'next';
import { ReactElement, ReactNode, useEffect, useState } from 'react';
import {
  SessionProvider,
  useSession,
  signOut,
} from 'next-auth/react';
import { useQuery } from '@/utils/trpc';
import { useRouter } from 'next/router';
import { useAtom } from 'jotai';
import { loadLLMSettingsAtom } from '@/atoms/llmSettings';

import { TranslationProvider } from '@/components';
import TaxonomyProvider from '@/modules/taxonomy/TaxonomyProvider';
import { UploadProgressIndicator } from '@/components/UploadProgressIndicator';
import { getBrowserId } from '@/utils/browserId';
import { isAuthEnabled, getSignInUrl } from '@/utils/auth';
import { useIframeAuth } from '@/hooks/use-iframe-auth';
import '@/styles/globals.css';

export type NextPageWithLayout<P = {}, IP = P> = NextPage<P, IP> & {
  getLayout?: (page: ReactElement) => ReactNode;
};

// Defined outside MyApp so React treats these as stable component types.
// Defining them inside MyApp would cause React to see a new type on every render,
// triggering constant unmount/remount and re-firing all effects.
const IframeAuthBridge = () => {
  useIframeAuth();
  return null;
};

// Watches the NextAuth session and:
// - signs the user out if a refresh failure occurred
// - fetches collections in the background once logged in and on route changes
// - proactively refreshes the NextAuth session shortly before the access token expires
// Must be rendered inside SessionProvider so that useSession() has access to the session context.
const AuthWatcher = () => {
  const authEnabled = isAuthEnabled();
  const { data: currentSession, update } = useSession();
  const router = useRouter();
  const [, loadLLMSettings] = useAtom(loadLLMSettingsAtom);

  useEffect(() => {
    if (currentSession?.user) {
      console.log(
        'User ID:',
        (currentSession.user as any).userId || 'No ID available'
      );
    } else {
      console.log('User ID: Not logged in');
    }
  }, [currentSession]);

  const token = (currentSession as any)?.accessToken;
  const collectionsQuery = useQuery(['collection.getAll', { token }], {
    enabled: authEnabled ? Boolean(token) : true,
    refetchOnWindowFocus: false,
    retry: false,
  });

  useEffect(() => {
    if (!authEnabled) return;
    try {
      if ((currentSession as any)?.error === 'RefreshAccessTokenError') {
        signOut({ callbackUrl: getSignInUrl() });
      }
    } catch (e) {
      // Silent error handling
    }
  }, [currentSession, authEnabled]);

  useEffect(() => {
    try {
      if (token) {
        collectionsQuery.refetch().catch(() => {});
      }
    } catch (e) {
      // Silent error handling
    }
  }, [token, collectionsQuery.refetch]);

  useEffect(() => {
    if (!authEnabled || !token) return;

    let timeoutId: NodeJS.Timeout;
    let intervalId: NodeJS.Timeout;

    const scheduleRefresh = () => {
      try {
        const parts = token.split('.');
        if (parts.length < 2) {
          console.warn('AuthWatcher: Invalid token format');
          return;
        }

        const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
          Array.prototype.map
            .call(atob(payload), (c: string) => {
              return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            })
            .join('')
        );
        const parsed = JSON.parse(jsonPayload);

        if (parsed?.exp) {
          const expiresAt = parsed.exp * 1000;
          const now = Date.now();
          const timeUntilExpiry = expiresAt - now;

          if (timeUntilExpiry <= 0) {
            console.log('AuthWatcher: token already expired, refreshing immediately');
            update().catch((err) => {
              console.error('AuthWatcher: immediate refresh failed', err);
              signOut({ callbackUrl: getSignInUrl() });
            });
            return;
          }

          const refreshBuffer = Math.min(60 * 1000, timeUntilExpiry / 2);
          const refreshIn = timeUntilExpiry - refreshBuffer;

          console.log(
            `AuthWatcher: scheduling refresh in ${Math.round(refreshIn / 1000)}s (token expires in ${Math.round(timeUntilExpiry / 1000)}s)`
          );

          timeoutId = setTimeout(async () => {
            try {
              console.log('AuthWatcher: performing scheduled session refresh');
              await update();
              console.log('AuthWatcher: scheduled refresh finished');
            } catch (err) {
              console.error('AuthWatcher: scheduled refresh failed', err);
              signOut({ callbackUrl: getSignInUrl() });
            }
          }, refreshIn);
        } else {
          console.warn('AuthWatcher: no expiry in token, using fallback interval');
          intervalId = setInterval(async () => {
            try {
              console.log('AuthWatcher: performing fallback periodic refresh');
              await update();
              console.log('AuthWatcher: fallback refresh finished');
            } catch (err) {
              console.error('AuthWatcher: fallback refresh failed', err);
              signOut({ callbackUrl: getSignInUrl() });
            }
          }, 120 * 1000);
        }
      } catch (err) {
        console.error('AuthWatcher: error parsing token, using fallback interval', err);
        intervalId = setInterval(async () => {
          try {
            await update();
          } catch (err) {
            console.error('AuthWatcher: fallback refresh failed', err);
            signOut({ callbackUrl: getSignInUrl() });
          }
        }, 120 * 1000);
      }
    };

    scheduleRefresh();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [token, update, authEnabled]);

  useEffect(() => {
    const handleRouteChange = () => {
      if (authEnabled && !token) return;
      collectionsQuery.refetch().catch(() => {});
    };
    router.events.on('routeChangeComplete', handleRouteChange);
    return () => { router.events.off('routeChangeComplete', handleRouteChange); };
  }, [router.events, token, collectionsQuery.refetch, authEnabled]);

  useEffect(() => {
    loadLLMSettings().catch(() => {});
  }, [loadLLMSettings]);

  return null;
};

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

const Layout = styled.div`
  min-height: 100vh;
  background: #ffffff;
`;

const getTRPCUrl = () => {
  // return process.env.NEXT_PUBLIC_VERCEL_URL
  //   ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}/api/trpc`
  //   : 'http://localhost:3000/api/trpc';
  if (typeof window !== 'undefined') {
    return `${process.env.NEXT_PUBLIC_BASE_PATH}/api/trpc`;
  }

  const url = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}/api/trpc`
    : `${process.env.NEXT_PUBLIC_FULL_PATH}/api/trpc`;

  return url;
};

const getTRPCHeaders = () => {
  if (typeof window === 'undefined') return {};
  if (process.env.NEXT_PUBLIC_USE_AUTH === 'false') {
    return {
      'X-Browser-ID': getBrowserId(),
    };
  }
  return {};
};

function MyApp({
  Component,
  pageProps: { session, locale, ...pageProps },
  router,
}: AppPropsWithLayout) {
  // Use the layout defined at the page level, if available
  const getLayout = Component.getLayout ?? ((page) => page);

  // A simple version counter used to force a remount of the TranslationProvider subtree
  // whenever the selected locale changes. This provides a straightforward way to ensure
  // all components re-render with the newly loaded translations.
  const [localeVersion, setLocaleVersion] = useState<number>(0);

  // Listen for locale changes (both storage events from other tabs and a custom event)
  // and bump the version to force remount.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const bump = () => setLocaleVersion((v) => v + 1);
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'locale') bump();
    };
    const onLocaleChange = (_e: Event) => bump();

    window.addEventListener('storage', onStorage);
    window.addEventListener('localeChange', onLocaleChange as EventListener);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(
        'localeChange',
        onLocaleChange as EventListener
      );
    };
  }, []);

  const authEnabled = isAuthEnabled();

  return (
    <SessionProvider
      session={session}
      basePath={`${process.env.NEXT_PUBLIC_BASE_PATH}/api/auth`}
    >
      {/* AuthWatcher only runs when auth is enabled */}
      {authEnabled && <AuthWatcher />}
      {authEnabled && <IframeAuthBridge />}

      <Global styles={GlobalStyles} />
      <TranslationProvider key={localeVersion} locale={locale}>
        <TaxonomyProvider>
          <HeroUIProvider>
            <Layout>
              <NextNProgress color="rgb(75 85 99)" showOnShallow={false} />
              {getLayout(<Component {...pageProps} />)}
              <UploadProgressIndicator />
            </Layout>
          </HeroUIProvider>
        </TaxonomyProvider>
      </TranslationProvider>
    </SessionProvider>
  );
}

export default withTRPC<AppRouter>({
  config({ ctx }) {
    /**
     * If you want to use SSR, you need to use the server's full URL
     * @link https://trpc.io/docs/ssr
     */
    const url = getTRPCUrl();
    const headers = getTRPCHeaders();

    return {
      url,
      headers,
      // Configure httpBatchLink explicitly so we can force POST for queries
      // and use a custom fetch that omits cookies (avoids very large Cookie headers).
      links: [
        httpLink({
          url,
          // httpLink always uses POST, avoiding 431 caused by large JWT tokens in GET query strings
          fetch: (input: RequestInfo, init?: RequestInit) =>
            fetch(input, { ...(init || {}), credentials: 'omit' }),
        }),
      ],
      /**
       * @link https://react-query.tanstack.com/reference/QueryClient
       */
      // queryClientConfig: { defaultOptions: { queries: { staleTime: 60 } } },
    };
  },
  /**
   * @link https://trpc.io/docs/ssr
   */
  ssr: false,
})(MyApp);
