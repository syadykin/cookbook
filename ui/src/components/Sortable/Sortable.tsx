import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  type UniqueIdentifier,
  closestCenter,
  useDroppable,
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
const useDragSensors = () =>
  useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

export function SortableList<T extends { key: string }>({
  items,
  onReorder,
  children,
}: ListProps<T>) {
  const sensors = useDragSensors();

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

type GroupsProps<G extends { key: string }, T extends { key: string }> = {
  groups: G[];
  itemsOf: (group: G) => T[];
  withItems: (group: G, items: T[]) => G;
  /** called while dragging (a row entering another group) and on drop */
  onChange: (groups: G[]) => void;
  /** one group; put `list.ref` on the element that holds `list.rows` */
  children: (
    group: G,
    index: number,
    list: { ref: (el: HTMLElement | null) => void; rows: ReactNode; empty: boolean },
  ) => ReactNode;
  renderItem: ListProps<T>['children'];
};

/**
 * Several reorderable lists whose rows can also be dragged from one list to another (ingredient
 * groups). A row moves into the other group as soon as it is dragged over it, so the gap opens
 * where it will land; an empty group is a drop target of its own.
 */
export function SortableGroups<G extends { key: string }, T extends { key: string }>({
  groups,
  itemsOf,
  withItems,
  onChange,
  children,
  renderItem,
}: GroupsProps<G, T>) {
  const sensors = useDragSensors();

  const groupOf = (id: UniqueIdentifier) =>
    groups.findIndex((g) => g.key === id || itemsOf(g).some((x) => x.key === id));

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) {
      return;
    }
    const from = groupOf(active.id);
    const to = groupOf(over.id);
    if (from < 0 || to < 0 || from === to) {
      return;
    }
    const source = itemsOf(groups[from]!);
    const target = itemsOf(groups[to]!);
    const item = source.find((x) => x.key === active.id)!;
    let at = target.findIndex((x) => x.key === over.id);
    if (at < 0) {
      at = target.length;
    } else {
      const dragged = active.rect.current.translated;
      // below the middle of the row it is over → lands after it
      if (dragged && dragged.top + dragged.height / 2 > over.rect.top + over.rect.height / 2) {
        at += 1;
      }
    }
    onChange(
      groups.map((g, i) =>
        i === from
          ? withItems(
              g,
              source.filter((x) => x.key !== active.id),
            )
          : i === to
            ? withItems(g, [...target.slice(0, at), item, ...target.slice(at)])
            : g,
      ),
    );
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      return;
    }
    const gi = groupOf(active.id);
    if (gi < 0 || gi !== groupOf(over.id)) {
      return;
    }
    const items = itemsOf(groups[gi]!);
    const from = items.findIndex((x) => x.key === active.id);
    const to = items.findIndex((x) => x.key === over.id);
    if (from >= 0 && to >= 0) {
      onChange(groups.map((g, i) => (i === gi ? withItems(g, arrayMove(items, from, to)) : g)));
    }
  };

  return (
    <DndContext
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      sensors={sensors}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
    >
      {groups.map((g, gi) => {
        const items = itemsOf(g);
        return (
          <SortableGroup key={g.key} id={g.key} itemIds={items.map((x) => x.key)}>
            {(ref) =>
              children(g, gi, {
                ref,
                empty: items.length === 0,
                rows: items.map((item, i) => (
                  <SortableRow key={item.key} id={item.key}>
                    {(row, handle) => renderItem(item, row, handle, i)}
                  </SortableRow>
                )),
              })
            }
          </SortableGroup>
        );
      })}
    </DndContext>
  );
}

function SortableGroup({
  id,
  itemIds,
  children,
}: {
  id: string;
  itemIds: string[];
  children: (ref: (el: HTMLElement | null) => void) => ReactNode;
}) {
  // only an empty group is a target itself: with rows in it, closestCenter must pick a row
  const { setNodeRef } = useDroppable({ id, disabled: itemIds.length > 0 });
  return (
    <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
      {children(setNodeRef)}
    </SortableContext>
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
