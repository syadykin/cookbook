import cn from 'classnames';

import { Button } from '@/components/Button';
import { BellIcon, PauseIcon, PlayIcon, ResetIcon } from '@/components/icons';
import { useTimer } from '@/contexts/Cooking';
import { formatTimer } from '@/lib/recipe';

import styles from './TimerButton.module.scss';

type Props = {
  timerKey: string;
  seconds: number;
  /** cook mode uses a bigger button */
  size?: 'normal' | 'large';
};

/**
 * «▶ 10:00» → running «⏸ 9:42» (accent) → paused «▶ 6:12»; ↺ resets while running or paused.
 * When it runs out it pulses peach with «🔔 Час вийшов» until pressed, which also stops the alarm.
 */
export function TimerButton({ timerKey, seconds, size = 'normal' }: Props) {
  const { status, left, toggle, reset } = useTimer(timerKey, seconds);
  const large = size === 'large';
  const icon = large ? 13 : 11;

  const label =
    status === 'done'
      ? 'Час вийшов. Зупинити сигнал'
      : status === 'running'
        ? `Пауза. Залишилось ${formatTimer(left)}`
        : `Запустити таймер на ${formatTimer(left)}`;

  return (
    <div className={styles.row}>
      <button
        aria-label={label}
        className={cn(styles.timer, styles[status], large && styles.large)}
        type="button"
        onClick={toggle}
      >
        {status === 'done' ? (
          <BellIcon size={large ? 17 : 15} />
        ) : status === 'running' ? (
          <PauseIcon size={icon} />
        ) : (
          <PlayIcon size={icon} />
        )}
        <span>{status === 'done' ? 'Час вийшов' : formatTimer(left)}</span>
      </button>
      {(status === 'running' || status === 'paused') && (
        <Button
          aria-label="Скинути таймер"
          className={cn(styles.reset, large && styles.resetLarge)}
          iconOnly
          onClick={reset}
        >
          <ResetIcon size={large ? 17 : 15} />
        </Button>
      )}
      <span aria-live="assertive" className="sr-only">
        {status === 'done' ? 'Час вийшов' : ''}
      </span>
    </div>
  );
}
