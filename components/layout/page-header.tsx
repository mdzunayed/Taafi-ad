/**
 * A screen's title and its actions.
 *
 * The two halves sit side by side once there is room for them and stack below
 * `sm`, where a row of four outline buttons beside a two-line heading wrapped
 * into an unreadable block. Stacked, the actions get the full width and lay
 * themselves out as a wrapping grid of equal-width buttons — which is what a
 * thumb wants, and what keeps every one of them at a 44px target.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 space-y-1">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground text-sm break-words">
            {description}
          </p>
        )}
      </div>
      {actions && (
        // `*:flex-1` on the small-screen grid only: on a desktop the buttons
        // keep their natural widths, so a two-word action does not stretch to
        // match a one-word one.
        <div className="flex flex-wrap items-center gap-2 max-sm:*:flex-1">
          {actions}
        </div>
      )}
    </div>
  );
}
