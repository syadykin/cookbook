import cn from 'classnames';
import { useState } from 'react';

import { routes } from '@/app/routes';
import { IngredientList } from '@/blocks/IngredientList';
import { Button } from '@/components/Button';
import { NoPhoto, Photo, PhotoButton } from '@/components/Photo';
import { SectionTitle } from '@/components/SectionTitle';
import { ServingsControl } from '@/components/ServingsControl';
import { StepNumber } from '@/components/StepNumber';
import { Tag } from '@/components/Tag';
import { TimerButton } from '@/components/TimerButton';
import { ChevronLeftIcon, ClockIcon, DownloadIcon, PencilIcon, PlayIcon } from '@/components/icons';
import { timerKey, useServings } from '@/contexts/Cooking';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { type TRecipe, recipePdfUrl } from '@/lib/api';
import { datesLine, photoTint, tagTint } from '@/lib/recipe';

import styles from './Recipe.module.scss';

type Props = {
  recipe: TRecipe;
  onEdit: () => void;
};

export function RecipeView({ recipe, onEdit }: Props) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [bigStepPhotos, setBigStepPhotos] = useState<Record<string, boolean>>({});
  const servings = useServings(recipe.id, recipe.servings);
  useDocumentTitle(recipe.title || 'Без назви');

  const hero = recipe.photos[Math.min(photoIndex, recipe.photos.length - 1)];

  return (
    <>
      <header className={cn('reveal-zone', styles.header)}>
        <nav aria-label="Навігація" className={cn('reveal-on-hover touch-visible', styles.nav)}>
          <Button aria-label="Усі рецепти" iconOnly to={routes.library.toPath()}>
            <ChevronLeftIcon />
          </Button>
          <div className={styles.navActions}>
            <Button aria-label="Завантажити PDF" download href={recipePdfUrl(recipe.id)} iconOnly>
              <DownloadIcon size={18} />
            </Button>
            <Button aria-label="Редагувати рецепт" iconOnly onClick={onEdit}>
              <PencilIcon size={18} />
            </Button>
          </div>
        </nav>
      </header>

      <main className={cn('column wide', styles.main)}>
        {recipe.timeText && (
          <div className={styles.time}>
            <ClockIcon size={15} />
            {recipe.timeText}
          </div>
        )}
        <h1 className={styles.title}>{recipe.title || 'Без назви'}</h1>
        {recipe.description && <p className={styles.description}>{recipe.description}</p>}
        {recipe.tags.length > 0 && (
          <div className={styles.tags}>
            {recipe.tags.map((t, i) => (
              <Tag key={t} label={t} tint={tagTint(i)} />
            ))}
          </div>
        )}

        <div className={styles.columns}>
          <div>
            {recipe.photos.length > 0 && (
              <section aria-label="Фото страви" className={styles.photos}>
                <Photo
                  alt={`Фото страви ${photoIndex + 1} з ${recipe.photos.length}`}
                  className={styles.hero}
                  empty={<NoPhoto />}
                  photo={hero}
                  sizes="(max-width: 640px) 100vw, 600px"
                  tint={photoTint(photoIndex)}
                  w={1280}
                />
                {recipe.photos.length > 1 && (
                  <div className={styles.thumbs}>
                    {recipe.photos.map((p, i) => (
                      <PhotoButton
                        key={p.id}
                        aria-label={`Фото ${i + 1} з ${recipe.photos.length}`}
                        aria-pressed={i === photoIndex}
                        className={styles.thumb}
                        photo={p}
                        selected={i === photoIndex}
                        tint={photoTint(i)}
                        onClick={() => setPhotoIndex(i)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {recipe.ingredientGroups.length > 0 && (
              <section aria-labelledby="ing-h" className={styles.section}>
                <div className={styles.sectionHead}>
                  <SectionTitle id="ing-h">Інгредієнти</SectionTitle>
                  <ServingsControl
                    canLess={servings.canLess}
                    canMore={servings.canMore}
                    multiplier={servings.multiplier}
                    servings={servings.servings}
                    onLess={servings.less}
                    onMore={servings.more}
                  />
                </div>
                <IngredientList
                  baseServings={servings.base}
                  groups={recipe.ingredientGroups}
                  recipeId={recipe.id}
                  servings={servings.servings}
                />
              </section>
            )}
          </div>
          <div>
            {recipe.steps.length > 0 && (
              <section aria-labelledby="steps-h" className={styles.section}>
                <div className={styles.sectionHead}>
                  <SectionTitle id="steps-h">Приготування</SectionTitle>
                  <Button
                    className={styles.cook}
                    to={routes.cook.toPath({ id: recipe.id })}
                    variant="accent"
                  >
                    <PlayIcon size={14} />
                    Готувати
                  </Button>
                </div>
                <ol className={styles.steps}>
                  {recipe.steps.map((s, i) => (
                    <li key={s.id ?? i} className={styles.step}>
                      <StepNumber n={i + 1} />
                      <div className={styles.stepBody}>
                        <p className={styles.stepText}>{s.text}</p>
                        {!!s.timerSeconds && (
                          <div className={styles.stepTimer}>
                            <TimerButton
                              seconds={s.timerSeconds}
                              timerKey={timerKey(recipe.id, s.id, i)}
                            />
                          </div>
                        )}
                        {s.photos.length > 0 && (
                          <div className={styles.stepPhotos}>
                            {s.photos.map((p, j) => {
                              const big = !!bigStepPhotos[p.id];
                              return (
                                <PhotoButton
                                  key={p.id}
                                  aria-label={`${big ? 'Зменшити' : 'Збільшити'} фото кроку ${i + 1}`}
                                  aria-pressed={big}
                                  className={cn(styles.stepPhoto, big && styles.stepPhotoBig)}
                                  photo={p}
                                  tint={photoTint(i + j)}
                                  w={big ? 1280 : 640}
                                  onClick={() =>
                                    setBigStepPhotos((b) => ({ ...b, [p.id]: !b[p.id] }))
                                  }
                                />
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {recipe.notes && (
              <section aria-labelledby="notes-h" className={styles.section}>
                <div className={styles.sectionHead}>
                  <SectionTitle id="notes-h">Примітки</SectionTitle>
                </div>
                <p className={styles.notes}>{recipe.notes}</p>
              </section>
            )}
          </div>
        </div>

        {recipe.ingredientGroups.length === 0 && recipe.steps.length === 0 && (
          <p className={styles.emptyNote}>
            Рецепт поки порожній.{' '}
            <button className={styles.linkButton} type="button" onClick={onEdit}>
              Заповнити
            </button>
          </p>
        )}

        <footer className={cn('reveal-zone', styles.footer)}>
          <p className="reveal-on-hover">{datesLine(recipe.createdAt, recipe.updatedAt)}</p>
        </footer>
      </main>
    </>
  );
}
