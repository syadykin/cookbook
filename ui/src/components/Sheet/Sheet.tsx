import { Dialog } from '@base-ui/react/dialog';
import cn from 'classnames';
import type { LabelHTMLAttributes, ReactNode } from 'react';

import styles from './Sheet.module.scss';

type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
};

/** Bottom sheet (phones): slides up over a scrim; a tap on the scrim closes it. */
export function Sheet({ open, onOpenChange, title, children }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.scrim} />
        <Dialog.Popup className={styles.sheet}>
          <div aria-hidden="true" className={styles.grip} />
          <Dialog.Title className={styles.title}>{title}</Dialog.Title>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type OptionProps = {
  icon: ReactNode;
  /** pastel circle behind the icon */
  tint: string;
  children: ReactNode;
} & LabelHTMLAttributes<HTMLLabelElement>;

/**
 * A sheet row. It is a <label> so a nested <input type="file"> opens on tap: browsers only let a
 * file picker open from a real user gesture on (or forwarded by a label to) the input.
 */
export function SheetOption({ icon, tint, children, className, ...props }: OptionProps) {
  return (
    <label className={cn(styles.option, className)} {...props}>
      <span aria-hidden="true" className={styles.icon} style={{ background: tint }}>
        {icon}
      </span>
      {children}
    </label>
  );
}

export function SheetCancel({ children = 'Скасувати' }: { children?: ReactNode }) {
  return <Dialog.Close className={styles.cancel}>{children}</Dialog.Close>;
}
