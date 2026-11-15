import { type ChangeEvent, useRef, useState } from 'react';

import { Sheet, SheetCancel, SheetOption } from '@/components/Sheet';
import { CameraIcon, ImageIcon } from '@/components/icons';
import { useFinePointer } from '@/hooks/useMediaQuery';

/**
 * Picking photos: on a phone a bottom sheet offers the camera or the gallery; with a mouse the
 * file dialog opens straight away. `open(target)` starts it; `onFiles(target, files)` receives
 * the result. Returns the element to render once and the opener.
 */
export function usePhotoPicker<T>({
  title,
  onFiles,
}: {
  title: (target: T) => string;
  onFiles: (target: T, files: File[]) => void;
}) {
  const fine = useFinePointer();
  const [sheetFor, setSheetFor] = useState<{ target: T } | null>(null);
  const desktopInput = useRef<HTMLInputElement>(null);
  const desktopTarget = useRef<{ target: T } | null>(null);

  const take = (target: T | undefined, e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    // reset so picking the same file again still fires change
    e.target.value = '';
    if (target !== undefined && files.length) {
      onFiles(target, files);
    }
  };

  const open = (target: T) => {
    if (fine && desktopInput.current) {
      desktopTarget.current = { target };
      desktopInput.current.click();
    } else {
      setSheetFor({ target });
    }
  };

  const element = (
    <>
      <input
        ref={desktopInput}
        accept="image/*"
        aria-hidden="true"
        className="sr-only"
        multiple
        tabIndex={-1}
        type="file"
        onChange={(e) => {
          take(desktopTarget.current?.target, e);
          desktopTarget.current = null;
        }}
      />
      <Sheet
        open={sheetFor !== null}
        title={sheetFor ? title(sheetFor.target) : ''}
        onOpenChange={(o) => !o && setSheetFor(null)}
      >
        <SheetOption icon={<CameraIcon />} tint="var(--accent)">
          <span>Зробити фото</span>
          <input
            accept="image/*"
            capture="environment"
            className="sr-only"
            type="file"
            onChange={(e) => {
              take(sheetFor?.target, e);
              setSheetFor(null);
            }}
          />
        </SheetOption>
        <SheetOption icon={<ImageIcon />} tint="var(--pastel-lavender)">
          <span>Вибрати з галереї або файлів</span>
          <input
            accept="image/*"
            className="sr-only"
            multiple
            type="file"
            onChange={(e) => {
              take(sheetFor?.target, e);
              setSheetFor(null);
            }}
          />
        </SheetOption>
        <SheetCancel />
      </Sheet>
    </>
  );

  return { open, element };
}
