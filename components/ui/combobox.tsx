'use client';

import * as React from 'react';
import { ChevronsUpDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Second line under the label — a price, a unit, a category. */
  hint?: string;
  /** Optional heading to file this option under. */
  group?: string;
  /** Rendered inline after the label. Use for "Admin only" / "Inactive". */
  badge?: React.ReactNode;
  disabled?: boolean;
  /**
   * Extra text the filter matches on but never renders — a category name, a
   * generic drug name, an alias. Without it an operator searching "antibiotic"
   * finds nothing, because the label says "Amoxicillin".
   */
  keywords?: string;
}

/**
 * A searchable single-select built on cmdk.
 *
 * ## Why the filtering is ours
 *
 * cmdk ships a fuzzy filter and it is turned OFF here (`shouldFilter={false}`).
 * Its scorer matches subsequences, so typing "ban" ranks "**B**andage,
 * **A**dhesive, 100mm **N**on-woven" against a literal "Bandage" on similar
 * footing. That is a fine behaviour for a command palette, where every entry is
 * an action the user already knows the name of, and a bad one for a price list,
 * where the operator is scanning for a substring and any surprise ordering
 * reads as a missing item. So: case-insensitive substring, ranked by where the
 * match lands, which is predictable enough to trust at speed.
 *
 * ## Why the list is capped
 *
 * A few hundred supplies is a few hundred DOM nodes inside a popover, re-rendered
 * on every keystroke. `MAX_VISIBLE` caps what is painted and the footer says how
 * many more matched, so the operator knows to keep typing rather than assuming
 * the catalog ends there. Virtualising would be the answer at a few thousand
 * rows; it is not worth the dependency at this size.
 *
 * ## Why the popover carries its own height rules
 *
 * `CommandList` ships a flat `max-h-72`, which is a fine default on a page and
 * the wrong one inside the invoice modal on a phone: the trigger sits low in a
 * full-height dialog, 288px of list runs off the bottom of the screen, and the
 * dialog behind it is the thing that scrolls instead. So two caps are in play
 * and the smaller wins — `max-h-64` for the ordinary case, and Radix's
 * `--radix-popover-content-available-height` for the short-viewport one, which
 * is the real distance from the trigger to the edge of the screen.
 *
 * That only bounds the box; making the box the SCROLLER needs `min-h-0` on
 * `Command` and the list, because a flex child's default `min-height: auto`
 * refuses to shrink below its content and the overflow escapes the cap it was
 * just given. `overscroll-contain` stops a flick that reaches the end of the
 * list from scrolling the invoice behind it.
 *
 * The truncation footer sits OUTSIDE the scroller. Inside, "40 more match" is
 * pinned to the bottom of a list nobody scrolls to the bottom of — which is
 * exactly the operator who needed to read it.
 */
const MAX_VISIBLE = 50;

/** Case-insensitive substring rank. Lower is better; -1 means no match. */
function rankOf(option: ComboboxOption, needle: string): number {
  if (!needle) return 0;
  const haystacks = [option.label, option.hint ?? '', option.keywords ?? ''];
  let best = -1;
  for (let i = 0; i < haystacks.length; i += 1) {
    const at = haystacks[i].toLowerCase().indexOf(needle);
    if (at === -1) continue;
    // A hit in the label beats a hit in the hint, and an earlier hit beats a
    // later one. The field weight dominates so "Bandage" always outranks a
    // supply that merely mentions bandages in its description.
    const score = i * 1000 + at;
    if (best === -1 || score < best) best = score;
  }
  return best;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No match.',
  disabled,
  className,
  id,
}: {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string, option: ComboboxOption) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');

  const selected = options.find((o) => o.value === value) ?? null;

  const { visible, hiddenCount } = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matched = options
      .map((option) => ({ option, rank: rankOf(option, needle) }))
      .filter((entry) => entry.rank !== -1);
    // Stable within a rank: `sort` is stable in every engine this ships to, so
    // equal-ranked options keep the catalog's own order rather than shuffling
    // as the operator types.
    matched.sort((a, b) => a.rank - b.rank);
    return {
      visible: matched.slice(0, MAX_VISIBLE).map((entry) => entry.option),
      hiddenCount: Math.max(0, matched.length - MAX_VISIBLE),
    };
  }, [options, search]);

  // Group headings, in first-appearance order so the list does not reorder
  // itself as the ranking changes.
  const groups = React.useMemo(() => {
    const byGroup = new Map<string, ComboboxOption[]>();
    for (const option of visible) {
      const key = option.group ?? '';
      const bucket = byGroup.get(key);
      if (bucket) bucket.push(option);
      else byGroup.set(key, [option]);
    }
    return [...byGroup.entries()];
  }, [visible]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Reset on close so re-opening shows the whole catalog rather than
        // whatever was typed last time — an operator who found nothing and gave
        // up should not reopen to the same empty list.
        if (!next) setSearch('');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', className)}
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) max-h-(--radix-popover-content-available-height) p-0"
        align="start"
      >
        <Command shouldFilter={false} className="max-h-full min-h-0">
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-64 min-h-0 flex-1 overscroll-contain overflow-y-auto [-webkit-overflow-scrolling:touch]">
            <CommandEmpty>{emptyText}</CommandEmpty>
            {groups.map(([group, groupOptions]) => (
              <CommandGroup key={group || 'ungrouped'} heading={group || undefined}>
                {groupOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    // cmdk keys its selection off `value`, so this must be the
                    // option's id and not its label: two supplies can share a
                    // name, and the highlight would jump between them.
                    value={option.value}
                    disabled={option.disabled}
                    data-checked={option.value === value}
                    onSelect={() => {
                      onChange(option.value, option);
                      setOpen(false);
                    }}
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-1.5 truncate">
                        {option.label}
                        {option.badge}
                      </span>
                      {option.hint && (
                        <span className="text-muted-foreground truncate text-xs">
                          {option.hint}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
          {hiddenCount > 0 && (
            <div className="text-muted-foreground shrink-0 border-t px-2 py-1.5 text-xs">
              {hiddenCount} more match — keep typing to narrow.
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
