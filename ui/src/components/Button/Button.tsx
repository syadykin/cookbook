import cn from 'classnames';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { Link } from 'react-router';

import { type ButtonVariant, type Reveal, buttonClass } from './classes';

type Common = {
  variant?: ButtonVariant;
  /** square 44×44, for a lone icon; requires aria-label */
  iconOnly?: boolean;
  reveal?: Reveal;
  className?: string;
  children?: ReactNode;
  ref?: Ref<HTMLButtonElement & HTMLAnchorElement>;
};

type AsButton = Common & ButtonHTMLAttributes<HTMLButtonElement> & { to?: never; href?: never };
/** in-app navigation */
type AsLink = Common & AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; href?: never };
/** full page navigation (login redirects) */
type AsAnchor = Common & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; to?: never };

export type ButtonProps = AsButton | AsLink | AsAnchor;

export function Button(props: ButtonProps) {
  const { variant = 'ghost', iconOnly, reveal, className, children, ...rest } = props;
  const classes = cn(buttonClass(variant, { iconOnly, reveal }), className);

  if ('to' in rest && rest.to !== undefined) {
    const { to, ...anchor } = rest as AsLink;
    return (
      <Link className={classes} to={to} {...anchor}>
        {children}
      </Link>
    );
  }

  if ('href' in rest && rest.href !== undefined) {
    return (
      <a className={classes} {...(rest as AsAnchor)}>
        {children}
      </a>
    );
  }

  const { type = 'button', ...button } = rest as AsButton;
  return (
    <button className={classes} type={type} {...button}>
      {children}
    </button>
  );
}
