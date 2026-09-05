'use client';

import { Badge } from '@/components/ui/badge';
import { ContentCollection } from '../content-collection';
import { BannerFormDialog } from './banner-form-dialog';
import {
  BANNER_ACTION_LABEL,
  BANNER_CATEGORY_LABEL,
  banners,
  type PromoBannerWire,
} from '@/lib/api/content';
import { qk } from '@/lib/api/query-keys';
import { dateOnly } from '@/lib/format';

export function BannersTable() {
  return (
    <ContentCollection<PromoBannerWire>
      title="Banners"
      queryKey={qk.banners}
      api={banners}
      emptyHint="Banners appear at the top of the patient home screen."
      // Drag order IS carousel order. The form dialog keeps a `priorityOrder`
      // number input for setting an exact value, but nobody reasons about a
      // carousel by typing integers.
      orderField="priorityOrder"
      rowLabel="banner"
      toolbar={
        <div className="flex justify-end">
          <BannerFormDialog />
        </div>
      }
      rowActions={(b) => <BannerFormDialog banner={b} />}
      columns={[
        {
          header: 'Banner',
          cell: (b) => (
            <div className="flex items-center gap-3">
              {b.imageUrl ? (
                // Remote, operator-uploaded image on the API origin. A plain
                // <img> avoids configuring next/image remotePatterns for a
                // host that changes per environment.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={b.imageUrl}
                  alt=""
                  className="h-10 w-16 rounded border object-cover"
                />
              ) : (
                <div className="bg-muted h-10 w-16 rounded border" />
              )}
              <div className="min-w-0">
                {/* `title`, not `titleEn` — see the note on PromoBannerWire.
                    The old name is not on the wire, so this column used to
                    render an em dash for every row.

                    `||`, not `??`: the title is optional now, so a
                    picture-only banner carries an empty string rather than
                    null and would otherwise render as a blank cell. */}
                <div className="truncate font-medium">
                  {b.title || (
                    <span className="text-muted-foreground italic">
                      Image only
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground truncate text-xs">
                  {b.tagText ?? ''}
                </div>
              </div>
            </div>
          ),
        },
        {
          header: 'Tag',
          cell: (b) => (
            <Badge variant="secondary">
              {BANNER_CATEGORY_LABEL[b.categoryTag ?? 'ANNOUNCEMENT']}
            </Badge>
          ),
        },
        {
          header: 'Action',
          // The destination under the label when there is one to show: an
          // operator scanning the list for the banner pointing at the wrong
          // screen should not have to open five dialogs to find it.
          cell: (b) => (
            <div className="min-w-0">
              <div>{BANNER_ACTION_LABEL[b.actionType ?? 'NONE']}</div>
              {b.actionType === 'CUSTOM_ROUTE' && b.targetRoute ? (
                <code className="text-muted-foreground block truncate text-xs">
                  {b.targetRoute}
                </code>
              ) : null}
            </div>
          ),
        },
        {
          header: 'Priority',
          className: 'tabular-nums',
          cell: (b) => b.priorityOrder ?? '—',
        },
        {
          header: 'Window',
          cell: (b) =>
            b.startDate || b.endDate
              ? `${dateOnly(b.startDate)} – ${dateOnly(b.endDate)}`
              : 'Always',
        },
      ]}
    />
  );
}
