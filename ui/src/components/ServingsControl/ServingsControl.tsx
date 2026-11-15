import { Button, type Reveal } from '@/components/Button';
import { MinusIcon, PlusIcon } from '@/components/icons';
import { servingsLabel } from '@/lib/recipe';

import styles from './ServingsControl.module.scss';

type Props = {
  servings: number;
  onLess: () => void;
  onMore: () => void;
  canLess: boolean;
  canMore: boolean;
  reveal?: Reveal;
};

/** «− на 4 порції +»; the buttons may hide until hover, the label never does. */
export function ServingsControl({ servings, onLess, onMore, canLess, canMore, reveal }: Props) {
  return (
    <div className={styles.root}>
      <Button
        aria-label="Менше порцій"
        disabled={!canLess}
        reveal={reveal}
        variant="round"
        onClick={onLess}
      >
        <MinusIcon size={14} strokeWidth={1.8} />
      </Button>
      <span aria-live="polite" className={styles.label}>
        {servingsLabel(servings)}
      </span>
      <Button
        aria-label="Більше порцій"
        disabled={!canMore}
        reveal={reveal}
        variant="round"
        onClick={onMore}
      >
        <PlusIcon size={14} strokeWidth={1.8} />
      </Button>
    </div>
  );
}
