import LogoSvg from './logo.svg?react';

export const APP_NAME = 'Їжак з макітрою';

/** The hedgehog-in-a-makitra mark; the same drawing is public/icon.svg (favicon). */
export function Logo({ size = 96, decorative = true }: { size?: number; decorative?: boolean }) {
  return (
    <LogoSvg
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : APP_NAME}
      height={size}
      role={decorative ? undefined : 'img'}
      width={size}
    />
  );
}
