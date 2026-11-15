import { Menu as BaseMenu } from '@base-ui/react/menu';
import cn from 'classnames';
import type { ComponentProps, ReactNode } from 'react';

import { type ButtonVariant, type Reveal, buttonClass } from '@/components/Button';

import styles from './Menu.module.scss';

export const Menu = BaseMenu.Root;

type TriggerProps = Omit<ComponentProps<typeof BaseMenu.Trigger>, 'className'> & {
  variant?: ButtonVariant;
  iconOnly?: boolean;
  reveal?: Reveal;
  className?: string;
};

/** A Button-looking trigger; gets `data-popup-open` while open, which keeps a reveal zone shown. */
export function MenuTrigger({ variant, iconOnly, reveal, className, ...props }: TriggerProps) {
  return (
    <BaseMenu.Trigger
      className={cn(buttonClass(variant, { iconOnly, reveal }), className)}
      {...props}
    />
  );
}

type PopupProps = {
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
};

export function MenuPopup({ children, align = 'end', className }: PopupProps) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner align={align} sideOffset={6}>
        <BaseMenu.Popup className={cn(styles.popup, className)}>{children}</BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

/** Non-interactive block at the top of a menu, e.g. the account name and email. */
export function MenuHeader({ children }: { children: ReactNode }) {
  return <div className={styles.header}>{children}</div>;
}

export function MenuItem({
  className,
  ...props
}: Omit<ComponentProps<typeof BaseMenu.Item>, 'className'> & { className?: string }) {
  return <BaseMenu.Item className={cn(styles.item, className)} {...props} />;
}

export function MenuSeparator() {
  return <BaseMenu.Separator className={styles.separator} />;
}
