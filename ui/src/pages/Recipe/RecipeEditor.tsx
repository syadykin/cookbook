import cn from 'classnames';
import { type KeyboardEvent, useEffect, useState } from 'react';

import { PasteRecipe } from '@/blocks/PasteRecipe';
import { usePhotoPicker } from '@/blocks/PhotoPicker';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TextArea, TextField } from '@/components/Field';
import { AddPhotoTile, NoPhoto, Photo, PhotoButton, RemovePhotoButton } from '@/components/Photo';
import { SectionTitle } from '@/components/SectionTitle';
import { DragHandle, SortableList } from '@/components/Sortable';
import { StepNumber } from '@/components/StepNumber';
import { Tag } from '@/components/Tag';
import {
  ClipboardIcon,
  ClockIcon,
  CloseIcon,
  ImagePlusIcon,
  PlusIcon,
  TimerIcon,
  TrashIcon,
} from '@/components/icons';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTags } from '@/hooks/useRecipes';
import { type DraftPhoto, draftToRecipe, photoTint, tagTint } from '@/lib/recipe';

import styles from './Recipe.module.scss';
import type { DraftApi, PhotoTarget } from './useDraft';

type Props = {
  d: DraftApi;
  isNew: boolean;
  saving: boolean;
  error?: string;
  onDone: () => void;
  onDelete?: () => void;
};

const photoLabel = (p: DraftPhoto, n: number) =>
  p.status === 'error'
    ? `Фото ${n} не завантажено: ${p.error}`
    : p.status === 'uploading'
      ? `Фото ${n} завантажується`
      : `Фото ${n}`;

export function RecipeEditor({ d, isNew, saving, error, onDone, onDelete }: Props) {
  const { draft } = d;
  useDocumentTitle(draft.title.trim() || (isNew ? 'Новий рецепт' : 'Без назви'));
  const [photoIndex, setPhotoIndex] = useState(0);
  const [tagDraft, setTagDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pasting, setPasting] = useState(false);
  const { data: knownTags } = useTags();

  const picker = usePhotoPicker<PhotoTarget>({
    title: (t) =>
      t === 'recipe'
        ? 'Фото рецепта'
        : `Фото до кроку ${draft.steps.findIndex((s) => s.key === t) + 1}`,
    onFiles: d.addPhotos,
  });

  // Ctrl+V of an image: into the step that holds focus, otherwise into the recipe photos. Text
  // wins when the clipboard carries both — Word or Google Docs add a rendered picture to copied
  // text, and pasting that into a step should not attach a photo.
  useEffect(() => {
    if (pasting) {
      return;
    }
    const onPaste = (e: ClipboardEvent) => {
      const data = e.clipboardData;
      if (!data || data.getData('text/plain').trim()) {
        return;
      }
      const images = Array.from(data.files).filter((f) => f.type.startsWith('image/'));
      if (!images.length) {
        return;
      }
      e.preventDefault();
      const step =
        e.target instanceof Element ? e.target.closest<HTMLElement>('[data-step]') : null;
      if (step?.dataset.step) {
        d.addPhotos(step.dataset.step, images);
      } else {
        // the recipe photos may be scrolled away; showing the paste as the hero is the feedback
        setPhotoIndex(draft.photos.length);
        d.addPhotos('recipe', images);
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [d, draft.photos.length, pasting]);

  const heroIndex = Math.min(photoIndex, Math.max(0, draft.photos.length - 1));
  const hero = draft.photos[heroIndex];

  const onTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      d.addTag(tagDraft);
      setTagDraft('');
    } else if (e.key === 'Backspace' && !tagDraft && draft.tags.length) {
      d.removeTag(draft.tags[draft.tags.length - 1]!);
    }
  };

  // a new row gets focus so «+ Додати» can be followed straight by typing
  const focusSoon = (id: string) =>
    requestAnimationFrame(() => document.getElementById(id)?.focus());

  const busy = saving || d.uploading;

  return (
    <>
      <header className={styles.header}>
        <nav aria-label="Редагування" className={cn(styles.nav, styles.editNav)}>
          <span className={styles.editLabel}>{isNew ? 'Новий рецепт' : 'Редагування'}</span>
          <Button disabled={busy} variant="accent" onClick={onDone}>
            {saving ? 'Збереження…' : d.uploading ? 'Завантаження фото…' : 'Готово'}
          </Button>
        </nav>
      </header>

      <main className={cn('column', styles.main)}>
        {d.restored && <p className={styles.notice}>Відновлено незбережені зміни.</p>}
        {isNew && (
          <Button className={styles.pasteButton} onClick={() => setPasting(true)}>
            <ClipboardIcon size={17} />
            Вставити з тексту
          </Button>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.time}>
          <ClockIcon size={15} />
          <TextField
            className={styles.timeField}
            label="Час приготування"
            placeholder="Час"
            value={draft.timeText}
            onChange={(e) => d.set('timeText', e.target.value)}
          />
        </div>
        <TextField
          className={styles.titleField}
          label="Назва рецепта"
          placeholder="Назва рецепта"
          value={draft.title}
          onChange={(e) => d.set('title', e.target.value)}
        />
        <TextArea
          className={styles.descriptionField}
          label="Короткий опис"
          placeholder="Кілька слів про страву"
          value={draft.description}
          onChange={(e) => d.set('description', e.target.value)}
        />

        <div className={styles.tags}>
          {draft.tags.map((t, i) => (
            <Tag key={t} label={t} tint={tagTint(i)} onRemove={() => d.removeTag(t)} />
          ))}
          <TextField
            className={styles.tagField}
            enterKeyHint="done"
            label="Новий тег"
            list="known-tags"
            placeholder="+ тег"
            value={tagDraft}
            onBlur={() => {
              d.addTag(tagDraft);
              setTagDraft('');
            }}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={onTagKey}
          />
          <datalist id="known-tags">
            {knownTags
              ?.filter((t) => !draft.tags.includes(t.name))
              .map((t) => (
                <option key={t.name} value={t.name} />
              ))}
          </datalist>
        </div>

        <section aria-label="Фото страви" className={styles.photos}>
          <Photo
            className={styles.hero}
            empty={<NoPhoto />}
            photo={hero}
            tint={photoTint(heroIndex)}
            w={1280}
          />
          <div className={styles.thumbs}>
            {draft.photos.map((p, i) => (
              <div key={p.key} className={cn('reveal-zone', styles.thumbWrap)}>
                <PhotoButton
                  aria-label={photoLabel(p, i + 1) + (i === 0 ? ' (обкладинка)' : '')}
                  className={styles.thumb}
                  failed={p.status === 'error'}
                  photo={p}
                  selected={i === heroIndex}
                  tint={photoTint(i)}
                  title={p.error}
                  uploading={p.status === 'uploading'}
                  onClick={() => setPhotoIndex(i)}
                />
                <RemovePhotoButton
                  label={`Видалити фото ${i + 1}`}
                  onClick={() => d.removePhoto(p.key)}
                />
              </div>
            ))}
            <AddPhotoTile
              aria-label="Додати фото рецепта"
              className={styles.thumb}
              onClick={() => picker.open('recipe')}
            />
          </div>
        </section>

        <section aria-labelledby="ing-h" className={styles.section}>
          <div className={styles.sectionHead}>
            <SectionTitle id="ing-h">Інгредієнти</SectionTitle>
            <div className={styles.servingsField}>
              <label htmlFor="f-servings">Порцій</label>
              <TextField
                className={styles.numberField}
                id="f-servings"
                inputMode="numeric"
                max={99}
                min={1}
                type="number"
                value={draft.servings}
                onChange={(e) =>
                  d.set('servings', Math.min(99, Math.max(1, parseInt(e.target.value, 10) || 1)))
                }
              />
            </div>
          </div>

          <ul className={styles.editList}>
            <SortableList items={draft.ingredients} onReorder={d.reorderIngredients}>
              {(x, row, handle) => (
                <li
                  key={x.key}
                  ref={row.ref}
                  className={cn('reveal-zone', styles.ingRow, row.dragging && styles.dragging)}
                  style={row.style}
                >
                  <DragHandle {...handle} />
                  <TextField
                    id={`ing-${x.key}`}
                    label="Інгредієнт"
                    placeholder="Інгредієнт"
                    value={x.name}
                    onChange={(e) => d.patchIngredient(x.key, { name: e.target.value })}
                  />
                  <TextField
                    className={styles.qtyField}
                    label="Кількість"
                    placeholder="500 г"
                    value={x.quantity}
                    onChange={(e) => d.patchIngredient(x.key, { quantity: e.target.value })}
                  />
                  <Button
                    aria-label="Видалити інгредієнт"
                    className={styles.rowButton}
                    reveal="touch"
                    onClick={() => d.removeIngredient(x.key)}
                  >
                    <CloseIcon size={15} />
                  </Button>
                </li>
              )}
            </SortableList>
          </ul>
          <Button className={styles.addRow} onClick={() => focusSoon(`ing-${d.addIngredient()}`)}>
            <PlusIcon size={16} />
            Додати інгредієнт
          </Button>
        </section>

        <section aria-labelledby="steps-h" className={styles.section}>
          <div className={styles.sectionHead}>
            <SectionTitle id="steps-h">Приготування</SectionTitle>
          </div>
          <ol className={styles.steps}>
            <SortableList items={draft.steps} onReorder={d.reorderSteps}>
              {(s, row, handle, i) => (
                <li
                  key={s.key}
                  ref={row.ref}
                  className={cn(
                    'reveal-zone',
                    styles.step,
                    styles.editStep,
                    row.dragging && styles.dragging,
                  )}
                  data-step={s.key}
                  style={row.style}
                >
                  <div className={styles.stepTools}>
                    <StepNumber n={i + 1} />
                    <DragHandle {...handle} className={styles.stepHandle} />
                    <Button
                      aria-label={`Видалити крок ${i + 1}`}
                      className={styles.stepHandle}
                      reveal="touch"
                      onClick={() => d.removeStep(s.key)}
                    >
                      <TrashIcon size={15} />
                    </Button>
                  </div>
                  <div className={styles.stepBody}>
                    <TextArea
                      id={`step-${s.key}`}
                      label={`Опис кроку ${i + 1}`}
                      placeholder="Опишіть крок"
                      value={s.text}
                      onChange={(e) => d.patchStep(s.key, { text: e.target.value })}
                    />
                    <div className={styles.stepPhotos}>
                      {s.photos.map((p, j) => (
                        <div key={p.key} className={cn('reveal-zone', styles.stepPhotoWrap)}>
                          <PhotoButton
                            aria-label={photoLabel(p, j + 1)}
                            className={styles.stepPhoto}
                            failed={p.status === 'error'}
                            photo={p}
                            tabIndex={-1}
                            tint={photoTint(i + j)}
                            title={p.error}
                            uploading={p.status === 'uploading'}
                            w={640}
                          />
                          <RemovePhotoButton
                            label="Видалити фото кроку"
                            onClick={() => d.removePhoto(p.key)}
                          />
                        </div>
                      ))}
                      <AddPhotoTile
                        aria-label={`Додати фото до кроку ${i + 1}`}
                        className={styles.stepAddPhoto}
                        icon={<ImagePlusIcon size={18} strokeWidth={1.4} />}
                        onClick={() => picker.open(s.key)}
                      />
                    </div>
                    <div className={styles.timerField}>
                      <TimerIcon size={16} />
                      <label htmlFor={`timer-${s.key}`}>Таймер</label>
                      <TextField
                        className={styles.numberField}
                        id={`timer-${s.key}`}
                        inputMode="decimal"
                        placeholder="—"
                        value={s.timer}
                        onChange={(e) =>
                          d.patchStep(s.key, { timer: e.target.value.replace(/[^\d.,]/g, '') })
                        }
                      />
                      <span>хв</span>
                    </div>
                  </div>
                </li>
              )}
            </SortableList>
          </ol>
          <Button className={styles.addRow} onClick={() => focusSoon(`step-${d.addStep()}`)}>
            <PlusIcon size={16} />
            Додати крок
          </Button>
        </section>

        {onDelete && (
          <footer className={styles.dangerZone}>
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              Видалити рецепт
            </Button>
          </footer>
        )}
      </main>

      {picker.element}

      {isNew && (
        <PasteRecipe
          open={pasting}
          replacing={(() => {
            const r = draftToRecipe(draft);
            return r.ingredients.length > 0 || r.steps.length > 0;
          })()}
          onOpenChange={setPasting}
          onParsed={d.applyParsed}
        />
      )}

      {onDelete && (
        <ConfirmDialog
          actions={[{ label: 'Видалити', variant: 'danger', onClick: onDelete }]}
          open={confirmDelete}
          title="Видалити рецепт?"
          onOpenChange={setConfirmDelete}
        >
          {`«${draft.title || 'Без назви'}» буде видалено разом із фото. Це не можна скасувати.`}
        </ConfirmDialog>
      )}
    </>
  );
}
