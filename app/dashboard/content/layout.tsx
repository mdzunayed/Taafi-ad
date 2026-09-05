import { SectionTabs } from '@/components/layout/section-tabs';

/**
 * The App Content shell. Every CMS page renders inside it, so the five
 * surfaces read as one section rather than five unrelated destinations that
 * happen to share a sidebar group.
 *
 * A layout rather than a component each page renders: it keeps the tab bar
 * mounted across navigations (no flicker, no re-measure of the scroll
 * position) and means a new CMS page gets the tabs by existing in `NAV`,
 * without having to remember to add them.
 */
export default function ContentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <SectionTabs href="/dashboard/content" />
      {children}
    </div>
  );
}
