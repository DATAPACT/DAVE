import { useEffect, useRef } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { isInIframe } from '@/utils/auth';

const PARENT_ORIGIN = process.env.NEXT_PUBLIC_TOOLBOX_ORIGIN;

if (typeof window !== 'undefined' && !PARENT_ORIGIN) {
  console.warn(
    '[IframeAuth] NEXT_PUBLIC_TOOLBOX_ORIGIN is not set. ' +
    'postMessage will target any origin ("*") and SSO_TOKEN messages will be accepted from any origin. ' +
    'Set this variable in production to restrict communication to the trusted parent app.'
  );
}

function postToParent(data: object) {
  window.parent.postMessage(data, PARENT_ORIGIN || '*');
}

export function useIframeAuth() {
  const { data: session, status, update } = useSession();
  const signingIn = useRef(false);
  const inIframe = isInIframe();
  const tokenExpired = (session as any)?.error === 'IframeTokenExpired';

  // Signal to parent that DAVE is ready to receive the token
  useEffect(() => {
    if (!inIframe) return;
    postToParent({ type: 'SSO_READY' });
  }, [inIframe]);

  // Listen for SSO_TOKEN from toolbox-ui parent — registered once, stable for the session lifetime
  useEffect(() => {
    if (!inIframe) return;

    const handle = async (event: MessageEvent) => {
      if (PARENT_ORIGIN && event.origin !== PARENT_ORIGIN) return;
      const { type, token } = event.data ?? {};
      if (type !== 'SSO_TOKEN' || !token) return;

      // Skip if a sign-in is already in progress, or if authenticated with a valid (non-expired) token
      if (signingIn.current || (status === 'authenticated' && !tokenExpired)) return;

      signingIn.current = true;
      try {
        const result = await signIn('iframe-token', { accessToken: token, redirect: false });
        if (result?.ok) {
          await update();
        } else {
          console.error('[IframeAuth] sign-in failed:', result?.error);
          postToParent({ type: 'SSO_ERROR', error: result?.error });
        }
      } finally {
        signingIn.current = false;
      }
    };

    window.addEventListener('message', handle);
    return () => window.removeEventListener('message', handle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inIframe, status, tokenExpired]);

  // When iframe token expires, ask parent for a fresh one
  useEffect(() => {
    if (!inIframe) return;
    if ((session as any)?.error === 'IframeTokenExpired') {
      postToParent({ type: 'IFRAME_REQUEST_TOKEN' });
    }
  }, [inIframe, session]);
}