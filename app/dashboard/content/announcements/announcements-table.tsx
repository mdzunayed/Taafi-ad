'use client';

import { Badge } from '@/components/ui/badge';
import { ContentCollection } from '../content-collection';
import { AnnouncementFormDialog } from './announcement-form-dialog';
import {
  BANNER_CATEGORY_LABEL,
  announcements,
  type PromoBannerWire,
} from '@/lib/api/content';
import { qk } from '@/lib/api/query-keys';
import { dateOnly } from '@/lib/format';

/**
 * The bulletins, listed by what an operator writing one cares about: the pill,
 * the headline, the body, and when it is live.
 *
 * Not sortable, deliberately. `priorityOrder` IS carousel order, and it is the
 * Banners tab's job — reordering here would silently rearrange the carousel,
 * which is not what "move this announcement up" means to anyone. The server
 * picks the single announcement the app surfaces by lowest `priorityOrder`, so
 * that ordering stays where it is visible.
 */
export function AnnouncementsTable() {
  return (
    <ContentCollection<PromoBannerWire>
      title="Announcements"
      queryKey={qk.announcements}
      api={announcements}
      emptyHint="An announcement is a banner with something to read. Write one and it appears in the home carousel and opens as a sheet."
      rowLabel="announcement"
      toolbar={
        <div className="flex justify-end">
          <AnnouncementFormDialog />
        </div>
      }
      rowActions={(a) => <AnnouncementFormDialog announcement={a} />}
      columns={[
        {
          header: 'Pill',
          cell: (a) => (
            <div className="space-y-1">
              <Badge variant="secondary">
                {BANNER_CATEGORY_LABEL[a.categoryTag ?? 'ANNOUNCEMENT']}
              </Badge>
              {a.tagText ? (
                <div className="text-muted-foreground truncate text-xs">
                  {a.tagText}
                </div>
              ) : null}
            </div>
          ),
        },
        {
          header: 'Headline',
          cell: (a) => (
            <div className="max-w-[220px] truncate font-medium">
              {a.title || (
                <span className="text-muted-foreground italic">Untitled</span>
              )}
            </div>
          ),
        },
        {
          header: 'Body',
          cell: (a) => (
            <p className="text-muted-foreground max-w-[320px] truncate text-xs">
              {String(a.detailContent ?? '').replace(/\s+/g, ' ').trim()}
            </p>
          ),
        },
        {
          header: 'Window',
          cell: (a) =>
            a.startDate || a.endDate
              ? `${dateOnly(a.startDate)} – ${dateOnly(a.endDate)}`
              : 'Always',
        },
      ]}
    />
  );
}
