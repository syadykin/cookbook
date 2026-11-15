import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import type { ReactNode } from 'react';

import styles from './Dialog.module.scss';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** a short line under the title */
  description?: ReactNode;
  children: ReactNode;
  /** buttons, right-aligned; use DialogClose for the one that only closes */
  actions: ReactNode;
};

/**
 * A modal with arbitrary content (a form). It sits near the top rather than centred, so a phone's
 * on-screen keyboard does not cover the field being typed into.
 */
export function Dialog({ open, onOpenChange, title, description, children, actions }: Props) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={styles.scrim} />
        <BaseDialog.Popup className={styles.popup}>
          <BaseDialog.Title className={styles.title}>{title}</BaseDialog.Title>
          {description && (
            <BaseDialog.Description className={styles.description}>
              {description}
            </BaseDialog.Description>
          )}
          <div className={styles.body}>{children}</div>
          <div className={styles.actions}>{actions}</div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

export const DialogClose = BaseDialog.Close;
