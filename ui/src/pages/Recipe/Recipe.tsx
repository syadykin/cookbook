import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';

import { routes } from '@/app/routes';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ArrowLeftIcon } from '@/components/icons';
import { recipeKey, useDeleteRecipe, useRecipe, useSaveRecipe } from '@/hooks/useRecipes';
import $api, { ApiError, type TRecipe, unwrap } from '@/lib/api';
import { draftToRecipe, isDraftEmpty } from '@/lib/recipe';

import styles from './Recipe.module.scss';
import { RecipeEditor } from './RecipeEditor';
import { RecipeView } from './RecipeView';
import { useDraft } from './useDraft';

/** /r/new and /r/:id — viewing and editing on one page; `?edit` in the URL means editing. */
export function Recipe() {
  const { id: rawId } = useParams();
  const id = rawId && rawId !== 'new' ? Number(rawId) : undefined;
  const isNew = id === undefined;

  const [params, setParams] = useSearchParams();
  const editing = isNew || params.has('edit');

  const { data: recipe, error, isPending } = useRecipe(id);

  const setEditing = (on: boolean) =>
    setParams(
      (p) => {
        if (on) {
          p.set('edit', '');
        } else {
          p.delete('edit');
        }
        return p;
      },
      { replace: true },
    );

  if (!isNew && isPending) {
    return null;
  }

  if (!isNew && (error || !recipe)) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <main className={`column ${styles.main}`}>
        <Button to={routes.library.toPath()}>
          <ArrowLeftIcon size={18} />
          До списку
        </Button>
        <p className={styles.emptyNote}>
          {notFound
            ? 'Такого рецепта немає — можливо, його видалили.'
            : 'Не вдалося завантажити рецепт.'}
        </p>
      </main>
    );
  }

  if (editing) {
    // keyed so switching recipes (or new → saved) starts a fresh draft
    return <EditRecipe key={id ?? 'new'} recipe={recipe} onFinished={() => setEditing(false)} />;
  }

  return (
    <RecipeView
      recipe={recipe!}
      onEdit={() => {
        window.scrollTo({ top: 0 });
        setEditing(true);
      }}
    />
  );
}

function EditRecipe({ recipe, onFinished }: { recipe?: TRecipe; onFinished: () => void }) {
  const d = useDraft(recipe);
  const save = useSaveRecipe();
  const remove = useDeleteRecipe();
  const navigate = useNavigate();
  const client = useQueryClient();

  const [error, setError] = useState<string>();
  const [conflict, setConflict] = useState(false);

  const done = async () => {
    setError(undefined);

    if (!recipe && isDraftEmpty(d.draft)) {
      // nothing typed into a new recipe: leave without creating an empty one
      d.discard();
      navigate(routes.library.toPath(), { replace: true });
      return;
    }

    const body = draftToRecipe(d.draft, recipe && { ...recipe, version: d.baseVersion });
    try {
      const saved = await save.mutateAsync(body);
      d.discard();
      if (!recipe) {
        navigate(routes.recipe.toPath({ id: saved.id }), { replace: true });
      } else {
        onFinished();
      }
      window.scrollTo({ top: 0 });
    } catch (e) {
      if (e instanceof ApiError && e.status === 412) {
        setConflict(true);
      } else if (e instanceof ApiError && e.body) {
        const field = e.body.fields && Object.values(e.body.fields)[0]?.[0];
        setError(field ? `${e.body.message}: ${field}` : e.body.message);
      } else {
        setError(
          'Не вдалося зберегти: немає з’єднання. Зміни збережено на цьому пристрої — спробуйте ще раз.',
        );
      }
    }
  };

  const keepMine = async () => {
    setConflict(false);
    try {
      const latest = await unwrap($api['recipes.get'](recipe!.id));
      d.rebase(latest.version);
      client.setQueryData(recipeKey(latest.id), latest);
    } catch {
      setError('Не вдалося отримати свіжу версію рецепта.');
    }
  };

  const takeTheirs = () => {
    setConflict(false);
    d.discard();
    void client.invalidateQueries({ queryKey: recipeKey(recipe!.id) });
    onFinished();
  };

  const onDelete = recipe
    ? async () => {
        await remove.mutateAsync(recipe.id);
        d.discard();
        navigate(routes.library.toPath(), { replace: true });
      }
    : undefined;

  return (
    <>
      <RecipeEditor
        d={d}
        error={error}
        isNew={!recipe}
        saving={save.isPending}
        onDelete={onDelete}
        onDone={done}
      />
      <ConfirmDialog
        actions={[
          { label: 'Відкинути мої', onClick: takeTheirs },
          { label: 'Залишити мої', variant: 'accent', onClick: keepMine },
        ]}
        cancel={false}
        open={conflict}
        title="Рецепт змінився"
        onOpenChange={setConflict}
      >
        Поки ви редагували, його змінили в іншому вікні або на іншому пристрої. «Залишити мої»
        підготує ваші зміни до збереження поверх тієї версії — натисніть «Готово» ще раз.
      </ConfirmDialog>
    </>
  );
}
