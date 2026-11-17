import cn from 'classnames';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';

import styles from './ScrollRow.module.scss';

type Props = {
  /** the outer box: margins, the area the arrows sit over */
  className?: string;
  /** the scrolling row itself: gap, padding */
  trackClassName?: string;
  children: ReactNode;
  'aria-label'?: string;
  role?: string;
};

/**
 * A horizontally scrolling row with arrow buttons at the ends that can still scroll. A mouse
 * has no obvious way to scroll sideways; on touch screens the arrows are hidden and a swipe
 * does it.
 */
export function ScrollRow({ className, trackClassName, children, ...aria }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const [ends, setEnds] = useState({ left: false, right: false });

  useEffect(() => {
    const el = track.current;
    if (!el) {
      return;
    }
    const update = () => {
      // a pixel of slack: fractional widths leave scrollLeft just short of the end
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setEnds((e) => (e.left === left && e.right === right ? e : { left, right }));
    };
    // the track resizes with the window; its content changes when items load or are added
    const resize = new ResizeObserver(update);
    resize.observe(el);
    const mutate = new MutationObserver(update);
    mutate.observe(el, { childList: true, subtree: true, characterData: true });
    el.addEventListener('scroll', update, { passive: true });
    return () => {
      resize.disconnect();
      mutate.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, []);

  const scroll = (dir: -1 | 1) =>
    track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.8, behavior: 'smooth' });

  return (
    <div className={cn(styles.row, className)}>
      <div ref={track} className={cn(styles.track, trackClassName)} {...aria}>
        {children}
      </div>
      {/* out of the tab order: the items themselves are, and focusing one scrolls it into view */}
      {ends.left && (
        <button
          aria-label="Прокрутити ліворуч"
          className={cn(styles.arrow, styles.left)}
          tabIndex={-1}
          type="button"
          onClick={() => scroll(-1)}
        >
          <ChevronLeftIcon size={16} />
        </button>
      )}
      {ends.right && (
        <button
          aria-label="Прокрутити праворуч"
          className={cn(styles.arrow, styles.right)}
          tabIndex={-1}
          type="button"
          onClick={() => scroll(1)}
        >
          <ChevronRightIcon size={16} />
        </button>
      )}
    </div>
  );
}
