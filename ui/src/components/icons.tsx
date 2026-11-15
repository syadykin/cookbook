import type { SVGProps } from 'react';

// Line icons from the mockup: 24px grid, 1.6 stroke, round caps. Decorative by default — the
// control that holds one carries the accessible name.

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const Icon = ({ size = 20, children, ...props }: IconProps) => (
  <svg
    aria-hidden="true"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.6}
    viewBox="0 0 24 24"
    width={size}
    {...props}
  >
    {children}
  </svg>
);

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4-4" />
  </Icon>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
);

export const ArrowLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Icon>
);

export const LoginIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 17l5-5-5-5" />
    <path d="M15 12H3" />
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
  </Icon>
);

export const LogoutIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
    <path d="M15 16l4-4-4-4" />
    <path d="M19 12H9" />
  </Icon>
);

/** Google's "G" mark, drawn in its brand colours as the sign-in branding guidelines require. */
export const GoogleIcon = ({ size = 18 }: { size?: number }) => (
  <svg aria-hidden="true" height={size} viewBox="0 0 48 48" width={size}>
    <path
      d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      fill="#FFC107"
    />
    <path
      d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      fill="#FF3D00"
    />
    <path
      d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      fill="#4CAF50"
    />
    <path
      d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      fill="#1976D2"
    />
  </svg>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 18l-6-6 6-6" />
  </Icon>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);

export const TimerIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 9.5v4l2.5 2M10 3h4" />
  </Icon>
);

export const PencilIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16v4z" />
    <path d="M13.5 6.5l4 4" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const MinusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 12h12" />
  </Icon>
);

export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </Icon>
);

export const GripIcon = ({ size = 12 }: { size?: number }) => (
  <svg aria-hidden="true" fill="currentColor" height={size} viewBox="0 0 24 24" width={size}>
    <circle cx="9" cy="6" r="1.6" />
    <circle cx="15" cy="6" r="1.6" />
    <circle cx="9" cy="12" r="1.6" />
    <circle cx="15" cy="12" r="1.6" />
    <circle cx="9" cy="18" r="1.6" />
    <circle cx="15" cy="18" r="1.6" />
  </svg>
);

export const CameraIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.7l1.4-2h4.8l1.4 2h1.7A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
    <circle cx="12" cy="12.5" r="3.5" />
  </Icon>
);

export const ImageIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect height="14" rx="2.5" width="18" x="3" y="5" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M21 16l-5-5-8 8" />
  </Icon>
);

export const ImagePlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect height="14" rx="2.5" width="18" x="3" y="5" />
    <path d="M12 9v6M9 12h6" />
  </Icon>
);

export const PlayIcon = ({ size = 11 }: { size?: number }) => (
  <svg aria-hidden="true" fill="currentColor" height={size} viewBox="0 0 24 24" width={size}>
    <path d="M7 4.5v15l12.5-7.5z" />
  </svg>
);

export const PauseIcon = ({ size = 11 }: { size?: number }) => (
  <svg aria-hidden="true" fill="currentColor" height={size} viewBox="0 0 24 24" width={size}>
    <path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z" />
  </svg>
);

export const BellIcon = (p: IconProps) => (
  <Icon strokeWidth={1.7} {...p}>
    <path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </Icon>
);

export const ResetIcon = (p: IconProps) => (
  <Icon strokeWidth={1.7} {...p}>
    <path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5" />
    <path d="M4.5 4v4h4" />
  </Icon>
);

export const SunIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3.6" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
  </Icon>
);

export const MoonIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
  </Icon>
);

export const ClipboardIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect height="16" rx="2.5" width="14" x="5" y="5" />
    <path d="M9 5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M9 11h6M9 15h4" />
  </Icon>
);
