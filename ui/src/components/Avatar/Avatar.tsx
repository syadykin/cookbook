import { Avatar as BaseAvatar } from '@base-ui/react/avatar';

import styles from './Avatar.module.scss';
import { initials } from './initials';

type Props = {
  name: string;
  src?: string | null;
  size?: number;
};

/** Profile picture, falling back to initials on the lavender circle while loading or on error. */
export function Avatar({ name, src, size = 30 }: Props) {
  return (
    <BaseAvatar.Root className={styles.root} style={{ width: size, height: size }}>
      {src && (
        <BaseAvatar.Image
          alt=""
          className={styles.image}
          // Google serves profile pictures only without a Referer from foreign origins
          referrerPolicy="no-referrer"
          src={src}
        />
      )}
      <BaseAvatar.Fallback className={styles.fallback}>{initials(name)}</BaseAvatar.Fallback>
    </BaseAvatar.Root>
  );
}
