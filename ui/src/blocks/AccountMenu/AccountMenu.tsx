import { useNavigate } from 'react-router';

import { routes } from '@/app/routes';
import { Avatar } from '@/components/Avatar';
import type { Reveal } from '@/components/Button';
import {
  Menu,
  MenuHeader,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from '@/components/Menu';
import { LogoutIcon } from '@/components/icons';
import { useLogout, useMe } from '@/hooks/useAuth';

export function AccountMenu({ reveal }: { reveal?: Reveal }) {
  const { user } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();

  if (!user) {
    return null;
  }

  return (
    <Menu>
      <MenuTrigger aria-label="Обліковий запис" iconOnly reveal={reveal}>
        <Avatar name={user.name || user.email} src={user.avatarUrl} />
      </MenuTrigger>
      <MenuPopup>
        <MenuHeader>
          {user.name}
          <small>{user.email}</small>
        </MenuHeader>
        <MenuSeparator />
        <MenuItem
          onClick={() =>
            logout.mutate(undefined, { onSettled: () => navigate(routes.login.toPath()) })
          }
        >
          <LogoutIcon size={17} />
          Вийти
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
