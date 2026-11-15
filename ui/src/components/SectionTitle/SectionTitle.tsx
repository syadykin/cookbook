import cn from 'classnames';
import type { HTMLAttributes } from 'react';

import styles from './SectionTitle.module.scss';

/** Handwritten section heading — «Інгредієнти», «Приготування». */
export function SectionTitle({
  as: Tag = 'h2',
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement> & { as?: 'h1' | 'h2' }) {
  return <Tag className={cn(styles.title, className)} {...props} />;
}
