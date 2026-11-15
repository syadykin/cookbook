import styles from './StepNumber.module.scss';

/** The pastel circle with a handwritten step number. Decorative: the list gives the order. */
export function StepNumber({ n }: { n: number }) {
  return (
    <div aria-hidden="true" className={styles.num}>
      {n}
    </div>
  );
}
