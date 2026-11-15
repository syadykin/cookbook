import cn from 'classnames';

import styles from './Button.module.scss';

export type ButtonVariant =
  /** transparent, muted text; hover background — toolbar actions */
  | 'ghost'
  /** white pill with a border, 50px — the login button */
  | 'outline'
  /** pastel accent pill — «Готово», «Готувати» */
  | 'accent'
  /** red text, no chrome — «Видалити рецепт» */
  | 'danger'
  /** 32px bordered circle — servings −/+ */
  | 'round'
  /** light grey block — «Скасувати» in sheets and dialogs */
  | 'muted';

/**
 * Hidden-until-hover behaviour from the mockup: `true` reveals on hover/focus of the nearest
 * `.reveal-zone`; `'touch'` additionally keeps it visible on touch screens.
 */
export type Reveal = boolean | 'touch';

export const revealClass = (reveal?: Reveal) =>
  cn(reveal && 'reveal-on-hover', reveal === 'touch' && 'touch-visible');

/** Button look for elements rendered by other components (e.g. a Base UI trigger). */
export const buttonClass = (
  variant: ButtonVariant = 'ghost',
  { iconOnly, reveal }: { iconOnly?: boolean; reveal?: Reveal } = {},
) => cn(styles.button, styles[variant], iconOnly && styles.iconOnly, revealClass(reveal));
