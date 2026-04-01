import { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { isRequestFromIframe } from '@/utils/auth';
import { ToolbarLayout } from '@/components/ToolbarLayout';
import styled from '@emotion/styled';
import Link from 'next/link';
import { FiCpu } from '@react-icons/all-files/fi/FiCpu';
import { FiSettings } from '@react-icons/all-files/fi/FiSettings';
import { FiGlobe } from '@react-icons/all-files/fi/FiGlobe';
import { FiSliders } from '@react-icons/all-files/fi/FiSliders';
import { Spacer } from '@heroui/react';
import { BaseSelect, Option } from '@/components/BaseSelect';
import { useText } from '@/components/TranslationProvider';
import { useEffect, useState } from 'react';

const Container = styled.div({
  maxWidth: '1200px',
  margin: '0 auto',
  padding: '40px 24px',
});

const Title = styled.h1({
  fontSize: '32px',
  fontWeight: 700,
  marginBottom: '8px',
  color: '#000',
});

const Subtitle = styled.p({
  fontSize: '16px',
  color: '#666',
  marginBottom: '40px',
});

const SettingsGrid = styled.div({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
  gap: '24px',
  marginTop: '24px',
});

const SettingCard = styled.div({
  display: 'flex',
  flexDirection: 'column',
  padding: '24px',
  borderRadius: '12px',
  border: '1px solid #E5E7EB',
  backgroundColor: '#FFF',
  transition: 'all 0.2s ease',
  cursor: 'pointer',
  textDecoration: 'none',
  color: 'inherit',

  '&:hover': {
    borderColor: '#0070f3',
    boxShadow: '0 4px 12px rgba(0, 112, 243, 0.1)',
    transform: 'translateY(-2px)',
  },
});

const IconWrapper = styled.div({
  width: '48px',
  height: '48px',
  borderRadius: '12px',
  backgroundColor: '#F3F4F6',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: '16px',
  fontSize: '24px',
  color: '#0070f3',
});

const CardTitle = styled.h3({
  fontSize: '18px',
  fontWeight: 600,
  marginBottom: '8px',
  color: '#000',
});

const CardDescription = styled.p({
  fontSize: '14px',
  color: '#666',
  lineHeight: '1.5',
});

const LanguageCard = styled.div({
  display: 'flex',
  flexDirection: 'column',
  padding: '24px',
  borderRadius: '12px',
  border: '1px solid #E5E7EB',
  backgroundColor: '#FFF',
});

const SettingsPage = () => {
  const t = useText('settings');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');

  useEffect(() => {
    // Prefer a stored locale in localStorage (client-side). Fall back to cookie or 'ita'.
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('locale');
      if (stored) {
        setSelectedLanguage(stored);
        return;
      }
    }

    // Get current language from cookie or default to 'ita'
    const cookies = document.cookie.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);
    const currentLocale = cookies.locale || 'ita';
    setSelectedLanguage(currentLocale);
  }, []);

  const handleLanguageChange = (value: string) => {
    // Persist selected locale to cookie (so SSR requests still have a fallback)
    try {
      const expires = new Date();
      expires.setFullYear(expires.getFullYear() + 1);
      document.cookie = `locale=${value}; expires=${expires.toUTCString()}; path=/`;
    } catch (e) {
      // ignore cookie write errors
    }

    // Persist the chosen locale to localStorage so the client-side TranslationProvider can pick it up.
    try {
      localStorage.setItem('locale', value);
    } catch (e) {
      // Ignore localStorage write errors
    }

    // Dispatch a custom event so same-tab listeners can react immediately.
    try {
      window.dispatchEvent(new CustomEvent('localeChange', { detail: value }));
    } catch (e) {
      // ignore
    }

    // Keep local UI state in sync
    setSelectedLanguage(value);

    // Simplest, most reliable approach: perform a full reload so server and client are both in the new locale.
    // This ensures pages that only read the locale on first render (SSR or mounted code) show the new language.
    try {
      window.location.reload();
    } catch (e) {
      // If reload somehow fails, there's not much else to do; components may still update via the event.
    }
  };

  return (
    <ToolbarLayout>
      <Container>
        <Title>{t('title')}</Title>
        <Subtitle>{t('subtitle')}</Subtitle>

        <SettingsGrid>
          <LanguageCard>
            <IconWrapper>
              <FiGlobe />
            </IconWrapper>
            <CardTitle>{t('language.label')}</CardTitle>
            <CardDescription>{t('language.description')}</CardDescription>
            <Spacer y={1} />
            <BaseSelect
              value={selectedLanguage}
              onChange={(e, val) => handleLanguageChange(val as string)}
              inputProps={{ placeholder: t('language.selectPlaceholder') }}
            >
              <Option value="eng" label={t('language.english')}>
                {t('language.english')}
              </Option>
              <Option value="ita" label={t('language.italian')}>
                {t('language.italian')}
              </Option>
            </BaseSelect>
          </LanguageCard>

          <Link href="/settings/llm">
            <SettingCard>
              <IconWrapper>
                <FiCpu />
              </IconWrapper>
              <CardTitle>{t('llmConfig.title')}</CardTitle>
              <CardDescription>{t('llmConfig.description')}</CardDescription>
            </SettingCard>
          </Link>

          <Link href="/settings/annotation-configuration">
            <SettingCard>
              <IconWrapper>
                <FiSliders />
              </IconWrapper>
              <CardTitle>{t('annotationConfig.title')}</CardTitle>
              <CardDescription>
                {t('annotationConfig.description')}
              </CardDescription>
            </SettingCard>
          </Link>

          {/* Placeholder for future settings */}
          <SettingCard
            style={{
              opacity: 0.6,
              cursor: 'not-allowed',
              pointerEvents: 'none',
            }}
          >
            <IconWrapper>
              <FiSettings />
            </IconWrapper>
            <CardTitle>{t('generalSettings.title')}</CardTitle>
            <CardDescription>
              {t('generalSettings.description')}
            </CardDescription>
          </SettingCard>
        </SettingsGrid>
      </Container>
    </ToolbarLayout>
  );
};

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

export default SettingsPage;
