'use client';

import { Stethoscope } from 'lucide-react';

import type { HomeLayoutType } from '@/lib/api/content';

/**
 * A phone-width render of a home block, so an operator can see the layout they
 * are choosing rather than read its name.
 *
 * TWO SURFACES, AND CAROUSEL MEANS DIFFERENT THINGS ON THEM. Care Services
 * retired the horizontal rail: `LayoutEngine` (`care_services_section.dart`)
 * now draws CAROUSEL as the same 2-column grid as GRID_2_COL. The templated
 * home sections did not — `_DynamicCardRail` (`dynamic_home_sections.dart`)
 * still draws a swipeable 240x260 rail on a phone. So the caller says which
 * surface it is previewing, and a preview that guessed would show one of them
 * a layout the phone never draws.
 *
 * WHY THE FRAME IS PINNED TO 360px, and why that is not cosmetic: the care
 * grid derives a tile's height from its MEASURED width, so the tile's shape
 * depends on the frame it is drawn in; and `_DynamicCardRail` reflows into a
 * grid above a 700px viewport. Rendering either at the console's own window
 * width would show proportions the phone never draws. 360px sits below that
 * breakpoint and close to the devices this actually ships to.
 *
 * The geometry below is transcribed from those two files so they cannot
 * disagree; each constant is annotated with its Dart source. This is a
 * reimplementation, not a shared component — the engine is a Flutter widget and
 * cannot be embedded in a web page — so drift is the standing risk, and the
 * annotations are how it gets caught.
 */

/** Which app surface is being previewed. See the CAROUSEL note above. */
export type PreviewSurface = 'care-services' | 'section';

/** `kCareServiceCardWidth` / `kCareServiceCardRailHeight` — care_service_card.dart */
const CARD_WIDTH = 240;
const CARD_HEIGHT = 260;
/** `_kGap` — care_services_section.dart */
const GAP = 12;
/** `_kInset` — the inset every block on Home re-applies. */
const INSET = 16;
/**
 * `_kTileAspect` / `_kMinTileHeight` / `_kMaxTileHeight` — same file.
 *
 * TILE_ASPECT and the column count are DEFAULTS here, not constants: both are
 * admin-owned now (App Content → Appearance) and arrive as props. They stay
 * spelled out so a caller that does not care — the layout selector, which is
 * choosing a shape rather than tuning one — renders what ships by default.
 */
const TILE_ASPECT = 0.8;
const COLUMNS = 2;
const MIN_TILE_HEIGHT = 200;
const MAX_TILE_HEIGHT = 300;
/** `_CareServiceListRow._minHeight` / `._thumb` — care_services_section.dart */
const ROW_HEIGHT = 108;

/** The web mirror of `_careGridDelegate`. */
function tileAspectRatio(
  frameWidth: number,
  columns = COLUMNS,
  tileAspect = TILE_ASPECT,
): string {
  const tile = (frameWidth - INSET * 2 - GAP * (columns - 1)) / columns;
  const height = Math.min(
    MAX_TILE_HEIGHT,
    Math.max(MIN_TILE_HEIGHT, tile / tileAspect),
  );
  return `${tile} / ${height}`;
}

/** The patient home canvas. Matches the app's dark dashboard background. */
export const PREVIEW_CANVAS = '#0E0B1A';

export interface PreviewCard {
  id: string;
  title: string;
  category?: string;
  imageUrl?: string;
}

export function PhonePreview({
  layoutType,
  cards,
  width = 360,
  surface = 'section',
  columns = COLUMNS,
  tileAspect = TILE_ASPECT,
  header = true,
}: {
  layoutType: HomeLayoutType;
  cards: PreviewCard[];
  width?: number;
  surface?: PreviewSurface;
  /** Care Services grid columns — admin-owned. Ignored on `section`. */
  columns?: number;
  /** Care tile width:height — admin-owned. Ignored on `section`. */
  tileAspect?: number;
  /** The "Care services" strapline. Off when the caller draws its own frame. */
  header?: boolean;
}) {
  return (
    <div
      className="overflow-hidden rounded-2xl border"
      style={{ width, backgroundColor: PREVIEW_CANVAS }}
    >
      <div className="py-4">
        {/* The section header the app draws above the cards, so the preview
            reads as a slice of Home rather than a bare card dump. */}
        {header && (
          <div className="mb-3 flex items-baseline justify-between" style={{ paddingInline: INSET }}>
            <span className="text-[11px] font-bold tracking-widest text-white/70 uppercase">
              Care services
            </span>
            <span className="text-[11px] text-white/40">সেবা</span>
          </div>
        )}
        <LayoutBody
          layoutType={layoutType}
          cards={cards}
          width={width}
          surface={surface}
          columns={columns}
          tileAspect={tileAspect}
        />
      </div>
    </div>
  );
}

function LayoutBody({
  layoutType,
  cards,
  width,
  surface,
  columns,
  tileAspect,
}: {
  layoutType: HomeLayoutType;
  cards: PreviewCard[];
  width: number;
  surface: PreviewSurface;
  columns: number;
  tileAspect: number;
}) {
  // On Care Services, CAROUSEL is an alias for the 2-column grid — the rail is
  // gone, and the wire value survives only because it is the enum's
  // unknown-value fallback and older rows still carry it.
  if (layoutType === 'CAROUSEL' && surface === 'section') {
    return (
      // The 16px inset lives INSIDE the scroller, matching `_DynamicCardRail`:
      // at rest the first card aligns with the header, mid-swipe the cards clip
      // flush against the screen edge.
      <div
        className="flex overflow-x-auto"
        style={{ gap: GAP, paddingInline: INSET, scrollbarWidth: 'thin' }}
      >
        {cards.map((card) => (
          <div key={card.id} style={{ width: CARD_WIDTH, height: CARD_HEIGHT, flexShrink: 0 }}>
            <PreviewTile card={card} />
          </div>
        ))}
      </div>
    );
  }

  switch (layoutType) {
    case 'CAROUSEL':
    case 'GRID_2_COL':
      return (
        <div
          className="grid"
          style={{
            // An inline template rather than `grid-cols-2`: the column count is
            // admin-owned now, and Tailwind cannot generate a class for a value
            // that only exists at runtime.
            gridTemplateColumns: `repeat(${surface === 'care-services' ? columns : 2}, minmax(0, 1fr))`,
            gap: GAP,
            paddingInline: INSET,
          }}
        >
          {cards.map((card) => (
            // Care Services derives the tile's height from its MEASURED width
            // and then clamps it, so the shape changes with the frame;
            // `aspect-ratio` is the CSS equivalent. A templated section's grid
            // still uses `careServiceGridAspectRatio`, which pins the tile to
            // the 260px rail height.
            <div
              key={card.id}
              style={{
                aspectRatio:
                  surface === 'care-services'
                    ? tileAspectRatio(width, columns, tileAspect)
                    : `${(width - INSET * 2 - GAP) / 2} / ${CARD_HEIGHT}`,
              }}
            >
              <PreviewTile card={card} />
            </div>
          ))}
        </div>
      );

    case 'LIST':
    default:
      return (
        <div className="flex flex-col" style={{ gap: GAP, paddingInline: INSET }}>
          {cards.map((card) => (
            <PreviewRow key={card.id} card={card} />
          ))}
        </div>
      );
  }
}

/**
 * The card as it appears in a bounded box (grid tile or rail cell): full-bleed
 * photo under a bottom scrim carrying the title.
 *
 * NO PRICE. `CareServiceCard` deliberately has no price parameter and
 * `care_services_layout_test.dart` asserts no `৳` renders in any layout — a
 * preview that showed one would be advertising a number the app never draws.
 */
function PreviewTile({ card }: { card: PreviewCard }) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-[20px] bg-white/5">
      <PreviewImage card={card} />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3 pt-8">
        {card.category && (
          <span className="mb-1 inline-block rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-medium text-white">
            {card.category}
          </span>
        )}
        <p className="line-clamp-2 text-[12px] leading-tight font-semibold text-white">
          {card.title}
        </p>
      </div>
    </div>
  );
}

/** The full-width row form — square thumb left, text right (`_CareServiceListRow`). */
function PreviewRow({ card }: { card: PreviewCard }) {
  return (
    <div
      className="flex items-center gap-3 overflow-hidden rounded-[20px] bg-white/5 pr-3"
      style={{ minHeight: ROW_HEIGHT }}
    >
      <div className="relative shrink-0 overflow-hidden" style={{ width: ROW_HEIGHT, height: ROW_HEIGHT }}>
        <PreviewImage card={card} />
      </div>
      <div className="min-w-0 flex-1 py-2">
        {card.category && (
          <span className="mb-1 inline-block rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-medium text-white">
            {card.category}
          </span>
        )}
        <p className="line-clamp-2 text-[12px] leading-tight font-semibold text-white">
          {card.title}
        </p>
      </div>
    </div>
  );
}

function PreviewImage({ card }: { card: PreviewCard }) {
  if (card.imageUrl) {
    return (
      // Plain <img>: these are absolute URLs off the API/Cloudinary, and
      // next/image would need each host allow-listed in next.config for a
      // decorative thumbnail in a 360px preview.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={card.imageUrl} alt="" className="h-full w-full object-cover" />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-white/10">
      <Stethoscope className="size-6 text-white/30" />
    </div>
  );
}
