import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import cn from 'classnames';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

import { revealClass } from '@/components/Button';
import { GripIcon } from '@/components/icons';

import styles from './Sortable.module.scss';

type HandleProps = HTMLAttributes<HTMLButtonElement>;

type ListProps<T extends { key: string }> = {
  items: T[];
  onReorder: (items: T[]) => void;
  /** spread `handle` on the drag handle; `style`/`ref` go on the row */
  children: (
    item: T,
    row: { ref: (el: HTMLElement | null) => void; style: CSSProperties; dragging: boolean },
    handle: HandleProps,
    index: number,
  ) => ReactNode;
};

/**
 * A vertically reorderable list driven by drag handles. On touch a drag starts after a long
 * press on the handle, so a quick swipe over it still scrolls the page; mouse drags start after a
 * few pixels; the keyboard works too (Space to lift, arrows to move).
 */
export function SortableList<T extends { key: string }>({
  items,
  onReorder,
  children,
}: ListProps<T>) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      return;
    }
    const from = items.findIndex((x) => x.key === active.id);
    const to = items.findIndex((x) => x.key === over.id);
    if (from >= 0 && to >= 0) {
      onReorder(arrayMove(items, from, to));
    }
  };

  return (
    <DndContext
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      sensors={sensors}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={items.map((x) => x.key)} strategy={verticalListSortingStrategy}>
        {items.map((item, i) => (
          <SortableRow key={item.key} id={item.key}>
            {(row, handle) => children(item, row, handle, i)}
          </SortableRow>
        ))}
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  children,
}: {
  id: string;
  children: (
    row: { ref: (el: HTMLElement | null) => void; style: CSSProperties; dragging: boolean },
    handle: HandleProps,
  ) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    position: 'relative',
    zIndex: isDragging ? 2 : undefined,
  };

  return children({ ref: setNodeRef, style, dragging: isDragging }, {
    ...attributes,
    ...listeners,
    ref: setActivatorNodeRef,
  } as HandleProps);
}

type DragHandleProps = HandleProps & { className?: string };

/** The six-dot grip; hidden until hover on desktop, always shown on touch screens. */
export function DragHandle({ className, ...props }: DragHandleProps) {
  return (
    <button
      aria-label="Перетягнути, щоб змінити порядок"
      className={cn(styles.handle, revealClass('touch'), className)}
      type="button"
      {...props}
    >
      <GripIcon />
    </button>
  );
}
