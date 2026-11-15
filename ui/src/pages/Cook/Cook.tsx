import cn from 'classnames';
import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router';

import { routes } from '@/app/routes';
import { IngredientList } from '@/blocks/IngredientList';
import { Button } from '@/components/Button';
import { Photo, PhotoButton } from '@/components/Photo';
import { ServingsControl } from '@/components/ServingsControl';
import { StepNumber } from '@/components/StepNumber';
import { TimerButton } from '@/components/TimerButton';
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  MoonIcon,
  SunIcon,
} from '@/components/icons';
import { timerKey, useServings } from '@/contexts/Cooking';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useRecipe } from '@/hooks/useRecipes';
import { useWakeLock } from '@/hooks/useWakeLock';
import type { TRecipe, TStep } from '@/lib/api';
import { photoTint } from '@/lib/recipe';

import styles from './Cook.module.scss';

const SWIPE_THRESHOLD = 50;
/** a horizontal move this long, and more horizontal than vertical, is a swipe, not a tap */
const SWIPE_START = 8;

export function Cook() {
  const id = Number(useParams().id);
  const { data: recipe, isError } = useRecipe(id);

  if (isError) {
    return <Navigate replace to={routes.recipe.toPath({ id })} />;
  }
  if (!recipe) {
    return null;
  }
  return <CookSlides recipe={recipe} />;
}

function CookSlides({ recipe }: { recipe: TRecipe }) {
  const total = recipe.steps.length + 1;
  useDocumentTitle(recipe.title || 'Без назви');
  const [index, setIndex] = useState(0);
  const [dx, setDx] = useState(0);
  const [wake, setWake] = useState(true);
  useWakeLock(wake);

  const go = (i: number) => setIndex(Math.max(0, Math.min(total - 1, i)));

  // swipe tracking lives in a ref: it changes on every pointermove and must not re-render alone
  const drag = useRef({ x: 0, y: 0, active: false, moved: false });

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) {
      return;
    }
    drag.current = { x: e.clientX, y: e.clientY, active: true, moved: false };
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d.active) {
      return;
    }
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (!d.moved && Math.abs(mx) > SWIPE_START && Math.abs(mx) > Math.abs(my)) {
      d.moved = true;
    }
    if (d.moved) {
      // resistance past the first and last slide
      const edge = (index === 0 && mx > 0) || (index === total - 1 && mx < 0);
      setDx(edge ? mx / 3 : mx);
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current;
    if (!d.active) {
      return;
    }
    d.active = false;
    const mx = e.clientX - d.x;
    if (d.moved && mx < -SWIPE_THRESHOLD) {
      go(index + 1);
    } else if (d.moved && mx > SWIPE_THRESHOLD) {
      go(index - 1);
    }
    setDx(0);
  };

  const onPointerCancel = () => {
    drag.current.active = false;
    drag.current.moved = false;
    setDx(0);
  };

  // the click that ends a swipe must not also press whatever button the finger was on
  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current.moved) {
      e.stopPropagation();
      e.preventDefault();
      drag.current.moved = false;
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) {
        return;
      }
      if (e.key === 'ArrowRight') {
        setIndex((i) => Math.min(total - 1, i + 1));
      } else if (e.key === 'ArrowLeft') {
        setIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [total]);

  const isLast = index === total - 1;
  const recipePath = routes.recipe.toPath({ id: recipe.id });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.bar}>
          <Button aria-label="Закрити режим готування" iconOnly to={recipePath}>
            <CloseIcon />
          </Button>
          <span className={styles.recipeTitle}>{recipe.title}</span>
          <Button
            aria-label={wake ? 'Екран не гасне. Вимкнути' : 'Не давати екрану гаснути'}
            aria-pressed={wake}
            iconOnly
            title={wake ? 'Екран не гасне' : 'Екран може гаснути'}
            onClick={() => setWake((w) => !w)}
          >
            {wake ? <SunIcon size={19} /> : <MoonIcon size={19} />}
          </Button>
        </div>
        <div aria-label="Слайди" className={styles.segments} role="group">
          {Array.from({ length: total }, (_, i) => (
            <button
              key={i}
              aria-current={i === index ? 'step' : undefined}
              aria-label={i === 0 ? 'Інгредієнти' : `Крок ${i}`}
              className={cn(styles.segment, i <= index && styles.segmentOn)}
              type="button"
              onClick={() => go(i)}
            >
              <span />
            </button>
          ))}
        </div>
      </header>

      <div className={styles.viewport}>
        <div
          className={cn(styles.track, dx !== 0 && styles.dragging)}
          style={{ transform: `translateX(calc(${-index * 100}% + ${dx}px))` }}
          onClickCapture={onClickCapture}
          onPointerCancel={onPointerCancel}
          onPointerDown={onPointerDown}
          onPointerLeave={onPointerCancel}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <Slide current={index === 0} label="Інгредієнти">
            <IngredientsSlide recipe={recipe} />
          </Slide>
          {recipe.steps.map((s, i) => (
            <Slide key={s.id ?? i} current={index === i + 1} label={`Крок ${i + 1}`}>
              <StepSlide index={i} recipe={recipe} step={s} />
            </Slide>
          ))}
        </div>
      </div>

      <nav aria-label="Перехід між кроками" className={styles.footer}>
        <Button className={cn(index === 0 && styles.invisible)} onClick={() => go(index - 1)}>
          <ChevronLeftIcon size={18} />
          Назад
        </Button>
        {isLast ? (
          <Button to={recipePath} variant="accent">
            Готово
          </Button>
        ) : (
          <Button className={styles.next} onClick={() => go(index + 1)}>
            {index === 0 ? 'До кроків' : 'Далі'}
            <ChevronRightIcon size={18} />
          </Button>
        )}
      </nav>
    </div>
  );
}

function Slide({
  current,
  label,
  children,
}: {
  current: boolean;
  label: string;
  children: ReactNode;
}) {
  // off-screen slides are inert: hidden from screen readers and out of the tab order
  return (
    <section aria-hidden={!current} aria-label={label} className={styles.slide} inert={!current}>
      {children}
    </section>
  );
}

function IngredientsSlide({ recipe }: { recipe: TRecipe }) {
  const servings = useServings(recipe.id, recipe.servings);
  return (
    <>
      <div className={styles.ingHead}>
        <h1 className={styles.ingTitle}>Інгредієнти</h1>
        <ServingsControl
          canLess={servings.canLess}
          canMore={servings.canMore}
          servings={servings.servings}
          onLess={servings.less}
          onMore={servings.more}
        />
      </div>
      {recipe.ingredients.length ? (
        <IngredientList
          baseServings={recipe.servings}
          ingredients={recipe.ingredients}
          recipeId={recipe.id}
          servings={servings.servings}
          size="large"
        />
      ) : (
        <p className={styles.hint}>Інгредієнтів не вказано.</p>
      )}
      {recipe.steps.length > 0 && (
        <p className={styles.hint}>
          Гортайте вліво, щоб перейти до кроків
          <ArrowRightIcon size={16} />
        </p>
      )}
    </>
  );
}

function StepSlide({ recipe, step, index }: { recipe: TRecipe; step: TStep; index: number }) {
  const [photo, setPhoto] = useState(0);
  const n = step.photos.length;

  return (
    <>
      <div className={styles.stepHead}>
        <StepNumber n={index + 1} />
        <span>
          Крок {index + 1} з {recipe.steps.length}
        </span>
      </div>
      <p className={styles.stepText}>{step.text}</p>
      {!!step.timerSeconds && (
        <div className={styles.timer}>
          <TimerButton
            seconds={step.timerSeconds}
            size="large"
            timerKey={timerKey(recipe.id, step.id, index)}
          />
        </div>
      )}
      {n > 0 && (
        <div className={styles.photos}>
          <button
            aria-label={n > 1 ? 'Наступне фото кроку' : 'Фото кроку'}
            className={styles.photo}
            type="button"
            onClick={() => n > 1 && setPhoto((p) => (p + 1) % n)}
          >
            <Photo
              className={styles.photoImg}
              photo={step.photos[photo]}
              sizes="(max-width: 640px) 100vw, 600px"
              tint={photoTint(index + photo)}
              w={1280}
            />
            {n > 1 && (
              <span className={styles.counter}>
                {photo + 1} / {n}
              </span>
            )}
          </button>
          {n > 1 && (
            <div className={styles.thumbs}>
              {step.photos.map((p, j) => (
                <PhotoButton
                  key={p.id}
                  aria-label={`Фото ${j + 1} з ${n}`}
                  aria-pressed={j === photo}
                  className={styles.thumb}
                  photo={p}
                  selected={j === photo}
                  tint={photoTint(index + j)}
                  onClick={() => setPhoto(j)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
