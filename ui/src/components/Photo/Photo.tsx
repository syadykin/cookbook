import cn from 'classnames';
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

import { type Reveal, revealClass } from '@/components/Button';
import { CloseIcon, ImageIcon, PlusIcon } from '@/components/icons';
import { type TPhotoWidth, photoUrl } from '@/lib/api';

import styles from './Photo.module.scss';

export type PhotoSource = { id?: string; preview?: string };

type ImgProps = {
  photo?: PhotoSource;
  /** variant to load; `sizes` additionally enables a srcset for big images */
  w?: TPhotoWidth;
  sizes?: string;
  alt?: string;
  tint?: string;
  className?: string;
  style?: CSSProperties;
  /** shown on the placeholder when there is no photo */
  empty?: ReactNode;
};

/**
 * A photo filling its box (object-fit: cover) over a pastel placeholder, so layout never jumps
 * while it loads. A local preview (object URL) wins over the server copy.
 */
export function Photo({
  photo,
  w = 640,
  sizes,
  alt = '',
  tint,
  className,
  style,
  empty,
}: ImgProps) {
  const src = photo?.preview ?? (photo?.id ? photoUrl(photo.id, w) : undefined);
  const srcSet =
    sizes && photo?.id && !photo.preview
      ? `${photoUrl(photo.id, 640)} 640w, ${photoUrl(photo.id, 1280)} 1280w, ${photoUrl(photo.id, 2048)} 2048w`
      : undefined;

  return (
    <div className={cn(styles.box, className)} style={{ background: tint, ...style }}>
      {src ? (
        <img
          alt={alt}
          className={styles.img}
          decoding="async"
          draggable={false}
          loading="lazy"
          sizes={srcSet ? sizes : undefined}
          src={src}
          srcSet={srcSet}
        />
      ) : (
        empty && <div className={styles.empty}>{empty}</div>
      )}
    </div>
  );
}

export const NoPhoto = ({ label = 'Немає фото' }: { label?: string }) => (
  <>
    <ImageIcon size={28} strokeWidth={1.4} />
    <span>{label}</span>
  </>
);

type ThumbProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  photo: PhotoSource;
  w?: TPhotoWidth;
  tint?: string;
  selected?: boolean;
  uploading?: boolean;
  failed?: boolean;
};

/** A tappable photo (thumbnail, step photo). Size it with className/style. */
export function PhotoButton({
  photo,
  w = 160,
  tint,
  selected,
  uploading,
  failed,
  className,
  ...props
}: ThumbProps) {
  return (
    <button
      className={cn(
        styles.button,
        selected && styles.selected,
        uploading && styles.uploading,
        failed && styles.failed,
        className,
      )}
      type="button"
      {...props}
    >
      <Photo className={styles.fill} photo={photo} tint={tint} w={w} />
      {failed && <span className={styles.badge}>!</span>}
    </button>
  );
}

type RemoveProps = { label: string; onClick: () => void; reveal?: Reveal };

/** The round × in a photo's corner (edit mode). */
export function RemovePhotoButton({ label, onClick, reveal = 'touch' }: RemoveProps) {
  return (
    <button
      aria-label={label}
      className={cn(styles.remove, revealClass(reveal))}
      type="button"
      onClick={onClick}
    >
      <CloseIcon size={12} strokeWidth={2} />
    </button>
  );
}

type AddProps = ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode };

/** Dashed «+» tile that starts adding a photo. */
export function AddPhotoTile({ className, icon, ...props }: AddProps) {
  return (
    <button className={cn(styles.add, className)} type="button" {...props}>
      {icon ?? <PlusIcon size={18} />}
    </button>
  );
}
