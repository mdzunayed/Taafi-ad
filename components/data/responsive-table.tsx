import { cn } from '@/lib/utils';

/**
 * The table/card switch, and the card vocabulary that goes with it.
 *
 * ## Why this is a wrapper and not a `<DataGrid columns={…}>`
 *
 * A column-config table renders one cell per column and then has to guess what
 * a phone should do with seven of them. Every guess is wrong somewhere: the
 * bookings list wants the status beside the reference and the fee near the
 * actions, the service catalog wants two prices on one line and a Live switch
 * pulled out, and neither is expressible as "hide columns 4 through 6".
 *
 * So the two views are written separately and this component only decides which
 * one is on screen. That costs a few lines per table and buys a mobile view
 * that was actually designed rather than derived — and, just as importantly, it
 * leaves the desktop grid exactly as dense as it was. A card list is the right
 * shape for a thumb and the wrong shape for an operator scanning eighty rows.
 *
 * ## Both views render, one is hidden
 *
 * `hidden md:block` / `md:hidden` rather than a `useIsMobile()` branch. The
 * media query resolves during the first paint, so there is no flash of the
 * wrong layout and no hydration mismatch to suppress; the cost is that the row
 * data is walked twice, which is nothing next to the query that fetched it.
 */
export function ResponsiveTable({
  cards,
  children,
  className,
}: {
  /** The `< md` view: a stacked list, normally of `<DataCard>`s. */
  cards: React.ReactNode;
  /** The `>= md` view: a `<Table>`, exactly as it was before. */
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <>
      <div
        className={cn(
          'hidden overflow-x-auto rounded-lg border md:block',
          className,
        )}
      >
        {children}
      </div>
      <div className="space-y-2 md:hidden">{cards}</div>
    </>
  );
}

/**
 * One row, as a card.
 *
 * Not `<Card>` from `ui/card.tsx`: that carries a 24px padding and a gap scale
 * built for a dashboard panel, and eighty of them stacked is a very long scroll
 * of mostly whitespace. This is the compact form — the same border and radius,
 * a tighter box.
 */
export function DataCard({
  className,
  children,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="data-card"
      className={cn(
        'bg-card text-card-foreground overflow-hidden rounded-lg border',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * The card's identity line: what this row IS on the left, what state it is in
 * on the right. Both halves are given, so a caller can put a booking reference
 * opposite a status badge, or a service name opposite a Live switch.
 */
export function DataCardHeader({
  primary,
  secondary,
  className,
}: {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'bg-muted/40 flex items-center justify-between gap-2 border-b px-3 py-2',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">{primary}</div>
      {secondary && (
        <div className="flex shrink-0 items-center gap-2">{secondary}</div>
      )}
    </div>
  );
}

/** The card's body. Fields stack; nothing here may scroll sideways. */
export function DataCardBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-2 px-3 py-2.5', className)}>{children}</div>
  );
}

/**
 * A labelled value, laid out as a row rather than as a stacked pair.
 *
 * The label is what a table header would have said, and it has to be present:
 * once the header row is gone, an unlabelled "৳2,400" beside an unlabelled
 * "৳500" is two numbers with no way to tell the fee from the deposit.
 */
export function DataCardField({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3', className)}>
      <span className="text-muted-foreground shrink-0 text-xs">{label}</span>
      <span className="min-w-0 text-right text-sm break-words">
        {value ?? '—'}
      </span>
    </div>
  );
}

/**
 * The action footer.
 *
 * `*:flex-1` so two actions split the width and three split it three ways,
 * every one of them ending up wider than the 44px minimum without any of them
 * being measured. Buttons inside are expected to be `size="sm"` or larger; the
 * coarse-pointer floor in `globals.css` takes care of the height.
 */
export function DataCardActions({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 border-t px-3 py-2 *:flex-1',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A group heading inside a card list — the mobile answer to a `colSpan` divider
 * row, used by the grouped service catalog.
 */
export function DataCardGroupHeading({
  label,
  count,
  note,
}: {
  label: string;
  count?: number;
  note?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-2 pt-3 pb-1 first:pt-0">
      <span className="text-xs font-medium tracking-wide uppercase">
        {label}
      </span>
      {count !== undefined && (
        <span className="text-muted-foreground text-xs tabular-nums">
          {count}
        </span>
      )}
      {note && <span className="text-muted-foreground text-xs">{note}</span>}
    </div>
  );
}
