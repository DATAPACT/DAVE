import { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { isRequestFromIframe } from '@/utils/auth';
import { ToolbarLayout } from '@/components/ToolbarLayout';
import AnnotationConfigurationPage from '../annotation-configuration';

type Props = {
  locale: any;
};

export default function SettingsAnnotationConfigurationPage(_: Props) {
  // Render the existing annotation configuration page inside the settings layout
  return (
    <ToolbarLayout>
      <AnnotationConfigurationPage />
    </ToolbarLayout>
  );
}

// Protect this page - require authentication unless USE_AUTH is false
export const getServerSideProps: GetServerSideProps = async (context) => {
  if (process.env.USE_AUTH !== 'false' && !isRequestFromIframe(context.req)) {
    const session = await getServerSession(context.req, context.res, authOptions);

    if (!session) {
      return {
        redirect: {
          destination: '/sign-in',
          permanent: false,
        },
      };
    }
  }

  // Check for locale in cookies, fallback to env
  const locale = context.req.cookies.locale || process.env.LOCALE || 'ita';
  const localeObj = (await import(`@/translation/${locale}`)).default;

  return {
    props: {
      locale: localeObj,
    },
  };
};
