import { Button } from '@/components/Button';
import { MinusIcon, PlusIcon } from '@/components/icons';
import { multiplierLabel, servingsLabel } from '@/lib/recipe';

import styles from './ServingsControl.module.scss';

type Props = {
  servings: number;
  /** the recipe has no servings: show «×2» rather than «на 2 порції» */
  multiplier?: boolean;
  onLess: () => void;
  onMore: () => void;
  canLess: boolean;
  canMore: boolean;
};

/** «− на 4 порції +» or «− ×2 +». */
export function ServingsControl({ servings, multiplier, onLess, onMore, canLess, canMore }: Props) {
  return (
    <div className={styles.root}>
      <Button
        aria-label={multiplier ? 'Зменшити кількість' : 'Менше порцій'}
        disabled={!canLess}
        variant="round"
        onClick={onLess}
      >
        <MinusIcon size={14} strokeWidth={1.8} />
      </Button>
      <span aria-live="polite" className={styles.label}>
        {multiplier ? multiplierLabel(servings) : servingsLabel(servings)}
      </span>
      <Button
        aria-label={multiplier ? 'Збільшити кількість' : 'Більше порцій'}
        disabled={!canMore}
        variant="round"
        onClick={onMore}
      >
        <PlusIcon size={14} strokeWidth={1.8} />
      </Button>
    </div>
  );
}
