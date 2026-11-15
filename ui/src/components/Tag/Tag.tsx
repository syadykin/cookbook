import cn from 'classnames';
import type { ButtonHTMLAttributes } from 'react';

import { CloseIcon } from '@/components/icons';

import styles from './Tag.module.scss';

type Props = {
  label: string;
  /** pastel background; text on it stays --text */
  tint?: string;
  /** shows a × that calls this */
  onRemove?: () => void;
};

/** A tag pill as shown on a recipe. */
export function Tag({ label, tint, onRemove }: Props) {
  return (
    <span className={styles.tag} style={{ background: tint }}>
      {label}
      {onRemove && (
        <button
          aria-label={`Прибрати тег ${label}`}
          className={styles.remove}
          type="button"
          onClick={onRemove}
        >
          <CloseIcon size={11} strokeWidth={2.2} />
        </button>
      )}
    </span>
  );
}

type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  tint?: string;
};

/** A toggleable tag filter chip (the library's tag row). */
export function Chip({ active, tint, className, children, ...props }: ChipProps) {
  return (
    <button
      aria-pressed={active}
      className={cn(styles.chip, active && styles.active, className)}
      style={active ? { background: tint } : undefined}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
