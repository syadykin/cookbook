import cn from 'classnames';

import { useCrossed } from '@/contexts/Cooking';
import type { TIngredient } from '@/lib/api';
import { scaleQuantity } from '@/lib/recipe';

import styles from './IngredientList.module.scss';

type Props = {
  recipeId: number;
  ingredients: TIngredient[];
  servings: number;
  baseServings: number;
  size?: 'normal' | 'large';
};

/** Read-only ingredients; a tap crosses a row out (kept for this tab, shared with cook mode). */
export function IngredientList({
  recipeId,
  ingredients,
  servings,
  baseServings,
  size = 'normal',
}: Props) {
  const { isCrossed, toggle } = useCrossed(recipeId);

  return (
    <ul className={cn(styles.list, size === 'large' && styles.large)}>
      {ingredients.map((x, i) => {
        const done = x.id !== undefined && isCrossed(x.id);
        return (
          <li key={x.id ?? i}>
            <button
              aria-pressed={done}
              className={cn(styles.row, done && styles.done)}
              type="button"
              onClick={() => x.id !== undefined && toggle(x.id)}
            >
              <span>{x.name}</span>
              <span className={styles.qty}>
                {scaleQuantity(x.quantity, servings, baseServings)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
