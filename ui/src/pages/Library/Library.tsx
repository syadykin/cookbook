import { useDeferredValue, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { routes } from '@/app/routes';
import { AccountMenu } from '@/blocks/AccountMenu';
import { Button } from '@/components/Button';
import { Photo } from '@/components/Photo';
import { Chip } from '@/components/Tag';
import { ChevronRightIcon, PlusIcon, SearchIcon } from '@/components/icons';
import { useRecipeList, useTags } from '@/hooks/useRecipes';
import { photoTint, tagTint } from '@/lib/recipe';

import styles from './Library.module.scss';

export function Library() {
  // the active tag lives in the URL, so «back» from a recipe returns to the same filter
  const [params, setParams] = useSearchParams();
  const tag = params.get('tag') ?? undefined;
  const [query, setQuery] = useState('');
  const q = useDeferredValue(query.trim());

  const { data: tags } = useTags();
  const { data: recipes, isPending } = useRecipeList({ q, tag });

  const pickTag = (t: string) =>
    setParams(
      (p) => {
        if (p.get('tag') === t) {
          p.delete('tag');
        } else {
          p.set('tag', t);
        }
        return p;
      },
      { replace: true },
    );

  const filtering = !!q || !!tag;

  return (
    <main className={`column ${styles.page}`}>
      <header className={`reveal-zone ${styles.head}`}>
        <h1 className={styles.title}>Рецепти</h1>
        <div className={styles.actions}>
          <Button aria-label="Новий рецепт" iconOnly reveal="touch" to={routes.recipeNew.toPath()}>
            <PlusIcon />
          </Button>
          <AccountMenu reveal="touch" />
        </div>
      </header>

      <div className={styles.search}>
        <SearchIcon className={styles.searchIcon} size={17} />
        <label className="sr-only" htmlFor="q">
          Пошук рецептів
        </label>
        <input
          className={styles.searchInput}
          enterKeyHint="search"
          id="q"
          placeholder="Пошук"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {!!tags?.length && (
        <div aria-label="Фільтр за тегами" className={styles.chips} role="group">
          {tags.map((t, i) => (
            <Chip
              key={t.name}
              active={tag === t.name}
              tint={tagTint(i)}
              onClick={() => pickTag(t.name)}
            >
              {t.name}
            </Chip>
          ))}
        </div>
      )}

      <ul className={styles.list}>
        {recipes?.map((r, i) => (
          <li key={r.id}>
            <Link className={styles.row} to={routes.recipe.toPath({ id: r.id })}>
              <Photo className={styles.thumb} photo={r.cover} tint={photoTint(i)} w={160} />
              <div className={styles.text}>
                <div className={styles.rowTitle}>{r.title || 'Без назви'}</div>
                {r.description && <div className={styles.description}>{r.description}</div>}
                <div className={styles.meta}>
                  {[r.timeText, r.tags.join(', ')].filter(Boolean).join(' · ')}
                </div>
              </div>
              <ChevronRightIcon className={styles.arrow} size={18} />
            </Link>
          </li>
        ))}
      </ul>

      {!isPending && recipes?.length === 0 && (
        <p className={styles.empty}>
          {filtering
            ? 'Нічого не знайдено.'
            : 'Тут поки порожньо. Натисніть «+», щоб додати перший рецепт.'}
        </p>
      )}
    </main>
  );
}
