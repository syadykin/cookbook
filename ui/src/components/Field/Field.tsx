import cn from 'classnames';
import {
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
  useLayoutEffect,
  useRef,
} from 'react';

import styles from './Field.module.scss';

/**
 * Edit-mode fields look like the text they replace, marked only by a dashed underline (solid and
 * shaded on focus). Every field needs a label; pass `label` for a visually hidden one.
 */
type Common = { label?: string; className?: string };

const useFieldId = (id?: string) => {
  const generated = useId();
  return id ?? generated;
};

export function TextField({
  label,
  className,
  id,
  ...props
}: Common & InputHTMLAttributes<HTMLInputElement>) {
  const fid = useFieldId(id);
  return (
    <>
      {label && (
        <label className="sr-only" htmlFor={fid}>
          {label}
        </label>
      )}
      <input className={cn(styles.field, className)} id={fid} type="text" {...props} />
    </>
  );
}

/** A textarea that grows with its content instead of scrolling. */
export function TextArea({
  label,
  className,
  id,
  value,
  ...props
}: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const fid = useFieldId(id);
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight + 1}px`;
    }
  }, [value]);

  return (
    <>
      {label && (
        <label className="sr-only" htmlFor={fid}>
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        className={cn(styles.field, styles.area, className)}
        id={fid}
        rows={1}
        value={value}
        {...props}
      />
    </>
  );
}
