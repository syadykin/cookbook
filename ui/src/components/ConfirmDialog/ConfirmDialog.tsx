import { AlertDialog } from '@base-ui/react/alert-dialog';
import type { ReactNode } from 'react';

import { Button, type ButtonVariant } from '@/components/Button';

import styles from './ConfirmDialog.module.scss';

export type ConfirmAction = {
  label: string;
  onClick: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children?: ReactNode;
  /** rendered left to right; the dialog's own «Скасувати» is added unless `cancel` is false */
  actions: ConfirmAction[];
  cancel?: string | false;
};

/** A centred modal question that needs an explicit answer (deleting, resolving a conflict). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  actions,
  cancel = 'Скасувати',
}: Props) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={styles.scrim} />
        <AlertDialog.Popup className={styles.popup}>
          <AlertDialog.Title className={styles.title}>{title}</AlertDialog.Title>
          {children && (
            <AlertDialog.Description className={styles.description}>
              {children}
            </AlertDialog.Description>
          )}
          <div className={styles.actions}>
            {cancel !== false && (
              <AlertDialog.Close render={<Button variant="muted" />}>{cancel}</AlertDialog.Close>
            )}
            {actions.map((a) => (
              <Button
                key={a.label}
                className={styles.action}
                disabled={a.disabled}
                variant={a.variant ?? 'muted'}
                onClick={a.onClick}
              >
                {a.label}
              </Button>
            ))}
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
