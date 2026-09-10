'use client';

import { createContext, useContext, useMemo } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GripVertical } from 'lucide-react';
import { toast } from 'sonner';

import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { normalizeError } from '@/lib/api/errors';
import { cn } from '@/lib/utils';

/**
 * Drag-to-reorder for the ordered CMS collections (banners, categories, home
 * sections).
 *
 * All three backend routers speak the same contract: `PATCH .../reorder` with
 * `{ids}` — the FULL list in its desired top-to-bottom sequence — and the
 * server renumbers the order column to 0..n-1 in one `bulkWrite`. Because the
 * contract is identical, the plumbing lives here once and the tables differ
 * only in their columns.
 *
 * Three deliberate choices:
 *
 *  - **This component owns the `<table>`, header included.** `DndContext`
 *    renders its own screen-reader description and live region as ordinary
 *    `div`s among its children, and a `div` between `<table>` and `<tbody>` is
 *    invalid HTML: the browser hoists it out while parsing, the server markup
 *    and the client tree stop matching, and React reports a hydration
 *    mismatch. Owning the table is what keeps the context strictly outside it.
 *  - **Dragging is handle-only.** The listeners are attached to the grip, not
 *    the row, because these rows carry a Live switch and a delete button; a
 *    row-wide drag sensor turns every toggle into a 5px drag gesture that
 *    sometimes toggles and sometimes doesn't.
 *  - **The ↑/↓ buttons stay.** dnd-kit's keyboard sensor works, but it requires
 *    knowing to focus the grip and press space first. The arrows are the
 *    discoverable keyboard path, and they post the same `{ids}` payload.
 */

// Derived from `useSortable` rather than imported: dnd-kit exports
// `DraggableAttributes` from the package root but the synthetic listener map
// only from a deep `dist/` path, and one of the two has to be spelled out.
type Sortable = ReturnType<typeof useSortable>;

interface HandleProps {
  attributes: Sortable['attributes'];
  listeners: Sortable['listeners'];
  disabled: boolean;
}

const HandleContext = createContext<HandleProps | null>(null);

/**
 * The grip cell. Renders inside `SortableRow`, which supplies the drag
 * listeners through context so the caller composes its own columns without
 * threading dnd-kit props through every table.
 */
export function DragHandleCell({ label }: { label: string }) {
  const handle = useContext(HandleContext);
  if (!handle) return null;

  return (
    <TableCell className="w-10 pr-0">
      <button
        type="button"
        {...handle.attributes}
        {...handle.listeners}
        disabled={handle.disabled}
        aria-label={`Reorder ${label}`}
        className={cn(
          'text-muted-foreground flex size-7 items-center justify-center rounded-md',
          'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
          handle.disabled
            ? 'cursor-not-allowed opacity-40'
            : 'hover:bg-muted cursor-grab active:cursor-grabbing',
        )}
      >
        <GripVertical className="size-4" />
      </button>
    </TableCell>
  );
}

function SortableRow({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });

  const handle = useMemo<HandleProps>(
    () => ({ attributes, listeners, disabled }),
    [attributes, listeners, disabled],
  );

  return (
    <HandleContext.Provider value={handle}>
      <TableRow
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        // The dragged row is lifted above its neighbours; without the opaque
        // background the rows it passes over show through it.
        className={cn(isDragging && 'bg-background relative z-10 shadow-sm')}
      >
        {children}
      </TableRow>
    </HandleContext.Provider>
  );
}

/**
 * Renders `items` as a sortable table.
 *
 * `items` must already be in display order — this component reorders the array
 * it is handed and reports the resulting id sequence; it does not sort.
 */
export function SortableTable<T extends { id: string }>({
  items,
  onReorder,
  disabled = false,
  header,
  children,
}: {
  items: T[];
  onReorder: (ids: string[]) => void;
  disabled?: boolean;
  /** The `<TableHeader>` to render inside the `<Table>` this owns. */
  header: React.ReactNode;
  children: (row: T, index: number) => React.ReactNode;
}) {
  const sensors = useSensors(
    // A few pixels of slop, so a click that lands on the grip and drifts is
    // still a click rather than a no-op drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = useMemo(() => items.map((i) => i.id), [items]);

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;

    onReorder(arrayMove(ids, from, to));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      // Rows can only trade places within their own table; without these a row
      // can be dragged sideways out of the table and dropped anywhere.
      // `restrictToParentElement` measures the dragged row's own parent — the
      // `<tbody>` — so it is unaffected by the context sitting outside the
      // table.
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <Table>
          {header}
          <TableBody>
            {items.map((row, index) => (
              <SortableRow key={row.id} id={row.id} disabled={disabled}>
                {children(row, index)}
              </SortableRow>
            ))}
          </TableBody>
        </Table>
      </SortableContext>
    </DndContext>
  );
}

/**
 * The reorder mutation, patched optimistically.
 *
 * Optimistic on purpose, unlike most mutations in this console: a row that
 * springs back to where it started while a round trip completes reads as a
 * failed drag, and the admin drags it again. This follows the rollback shape
 * `care-services-panel.tsx` established for the same reason.
 *
 * Rows absent from `ids` are preserved at the front of the cached list. That is
 * the `CARE_SERVICES` case — the home-sections table filters it out of the
 * sortable set but it is still in the cache, and it holds `orderIndex: -1`, so
 * the front is where the server puts it too.
 */
export function useOptimisticReorder<T extends { id: string }>({
  queryKey,
  mutationFn,
  orderField,
}: {
  queryKey: readonly unknown[];
  mutationFn: (ids: string[]) => Promise<T[]>;
  /** The order column to renumber locally, mirroring the server's 0..n-1. */
  orderField?: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,

    onMutate: async (ids: string[]) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<T[]>(queryKey);

      queryClient.setQueryData<T[]>(queryKey, (old) => {
        if (!old) return old;
        const byId = new Map(old.map((row) => [row.id, row]));
        const moved = ids
          .map((id) => byId.get(id))
          .filter((row): row is T => row !== undefined)
          .map((row, index) =>
            orderField ? { ...row, [orderField]: index } : row,
          );
        const untouched = old.filter((row) => !ids.includes(row.id));
        return [...untouched, ...moved];
      });

      return { previous };
    },

    onError: (error, _ids, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      toast.error(normalizeError(error).message);
    },

    // No success toast: the row is already where it was dropped, and a toast on
    // every drag is noise during a bulk reshuffle.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });
}
