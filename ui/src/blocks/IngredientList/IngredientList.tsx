import cn from 'classnames';

import { useCrossed } from '@/contexts/Cooking';
import type { TIngredientGroup } from '@/lib/api';
import { groupTitle, scaleQuantity } from '@/lib/recipe';

import styles from './IngredientList.module.scss';

type Props = {
  recipeId: number;
  groups: TIngredientGroup[];
  servings: number;
  baseServings: number;
  size?: 'normal' | 'large';
};

/**
 * Read-only ingredients, under a heading per group (none for a lone unnamed group); a tap
 * crosses a row out (kept for this tab, shared with cook mode).
 */
export function IngredientList({
  recipeId,
  groups,
  servings,
  baseServings,
  size = 'normal',
}: Props) {
  const { isCrossed, toggle } = useCrossed(recipeId);

  return (
    <div className={cn(styles.groups, size === 'large' && styles.large)}>
      {groups.map((g, gi) => {
        const title = groupTitle(g.name, gi, groups.length);
        return (
          <div key={g.id ?? gi} className={styles.group}>
            {title && <h3 className={styles.groupTitle}>{title}</h3>}
            <ul className={styles.list}>
              {g.ingredients.map((x, i) => {
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
          </div>
        );
      })}
    </div>
  );
}
