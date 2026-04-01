import { useQuery } from '@/utils/trpc';
import styled from '@emotion/styled';
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Avatar,
  Spinner,
} from '@heroui/react';
import { FiSliders } from '@react-icons/all-files/fi/FiSliders';
import { FiFolder } from '@react-icons/all-files/fi/FiFolder';
import { FiSettings } from '@react-icons/all-files/fi/FiSettings';
import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { useText } from '../TranslationProvider';
import { isAuthEnabled, isInIframe } from '@/utils/auth';

const LinkButton = styled.div({
  border: 'none',
  outline: 'none',
  padding: '8px 10px',
  borderRadius: '6px',
  color: 'rgb(75 85 99)',
  transition: 'background 250ms ease-out',

  '&:hover': {
    backgroundColor: 'rgb(0 0 0/0.03)',
  },
});

const LoginAvatar = () => {
  const t = useText('common');
  const { data, status } = useSession();

  const handleAction = (key: string | number) => {
    if (key === 'logout' && isAuthEnabled()) {
      signOut({
        callbackUrl: '/login',
      });
    }
  };

  if (status === 'loading') {
    return (
      <Skeleton
        width={40}
        height={40}
        borderRadius="50%"
        style={{ lineHeight: 'unset' }}
      />
    );
  }

  if (status === 'unauthenticated' && isAuthEnabled()) {
    return (
      <Link href="/login" passHref>
        <LinkButton>{t('toolbar.login')}</LinkButton>
      </Link>
    );
  }

  // When USE_AUTH=false or authenticated, show avatar
  const displayName = data?.user?.name || 'Anonymous';
  const avatarText = displayName.slice(0, 1).toUpperCase();
  const authEnabled = isAuthEnabled();
  const inIframe = isInIframe();

  return (
    <Dropdown placement="bottom-end">
      <DropdownTrigger>
        <Avatar name={avatarText} size="sm" style={{ cursor: 'pointer' }} />
      </DropdownTrigger>
      <DropdownMenu
        aria-label="User actions"
        onAction={(key) => handleAction(key as string)}
      >
        <DropdownItem key="collections" startContent={<FiFolder />}>
          <Link href="/collections">
            <span style={{ fontWeight: 700 }}>
              {t('toolbar.manageCollections')}
            </span>
          </Link>
        </DropdownItem>
        <DropdownItem key="settings" startContent={<FiSettings />}>
          <Link href="/settings">
            <span style={{ fontWeight: 700 }}>{t('toolbar.settings')}</span>
          </Link>
        </DropdownItem>
        {authEnabled && !inIframe && (
          <DropdownItem key="logout" color="danger">
            {t('toolbar.logout')}
          </DropdownItem>
        )}
      </DropdownMenu>
    </Dropdown>
  );
};

export default LoginAvatar;
