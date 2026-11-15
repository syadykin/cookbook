import { useState } from 'react';

import { Button } from '@/components/Button';
import { Dialog, DialogClose } from '@/components/Dialog';
import { TextArea } from '@/components/Field';
import { type ParsedRecipe, parseRecipe } from '@/lib/parseRecipe';

import styles from './PasteRecipe.module.scss';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onParsed: (recipe: ParsedRecipe) => void;
  /** the form already has content that the parsed recipe will replace */
  replacing: boolean;
};

/** Paste a recipe as plain text; it is parsed in the browser and lands in the editor for review. */
export function PasteRecipe({ open, onOpenChange, onParsed, replacing }: Props) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();

  const parse = () => {
    const parsed = parseRecipe(text);
    if (!parsed.ingredients.length && !parsed.steps.length) {
      setError('Не вдалося знайти в тексті ні інгредієнтів, ні кроків.');
      return;
    }
    onParsed(parsed);
    setText('');
    setError(undefined);
    onOpenChange(false);
  };

  return (
    <Dialog
      actions={
        <>
          <DialogClose render={<Button variant="muted" />}>Скасувати</DialogClose>
          <Button disabled={!text.trim()} variant="accent" onClick={parse}>
            Розібрати
          </Button>
        </>
      }
      description={
        <>
          Інгредієнти — рядками з «•» або «-» чи під заголовком «Інгредієнти:», кроки — абзацами або
          нумерованими рядками. Після розбору все можна виправити.
          {replacing && ' Інгредієнти й кроки, які вже є у формі, буде замінено.'}
        </>
      }
      open={open}
      title="Вставити рецепт з тексту"
      onOpenChange={(o) => {
        setError(undefined);
        onOpenChange(o);
      }}
    >
      <TextArea
        className={styles.text}
        label="Текст рецепта"
        placeholder={'Сирники\n\n• 500 г сиру\n• 2 яйця\n\nРозімніть сир…'}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(undefined);
        }}
      />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
