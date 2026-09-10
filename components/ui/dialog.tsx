"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

/**
 * What `mobileFullscreen` swaps in below `md`.
 *
 * A centred dialog is the wrong shape on a phone for a form of any size: it is
 * capped at `calc(100% - 2rem)`, so a long form scrolls inside a box that is
 * itself floating inside a scrim, with its own edges eating 32px of a 360px
 * screen. Every native equivalent — an iOS sheet, an Android full-screen
 * dialog — takes the whole viewport instead, and so does this.
 *
 * `h-dvh`, not `h-screen`: `100vh` on mobile Safari is the height the viewport
 * has with the URL bar HIDDEN, so a `h-screen` panel is taller than the visible
 * area and its footer sits under the browser chrome — which is exactly where
 * the Save button would be.
 *
 * The content box itself is the scroller (`overflow-y-auto`) rather than some
 * designated inner body, so a call site that passes a plain `<div>` still
 * scrolls instead of being clipped, and the header and footer can pin
 * themselves with `sticky`.
 *
 * FLEX, NOT GRID, below `md` — and that swap is load-bearing, not tidying. A
 * grid item's containing block is its own grid area, which is sized to the
 * item, so a `sticky` grid child has nowhere to travel and simply never sticks.
 * A flex item's containing block is the flex container's content box, which
 * here is the full scroll height. Same two classes on the header and footer,
 * working in one layout mode and silently inert in the other.
 */
const MOBILE_FULLSCREEN =
  "max-md:flex max-md:flex-col max-md:top-0 max-md:left-0 max-md:h-dvh max-md:max-h-none max-md:w-screen max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:overflow-y-auto max-md:overscroll-contain max-md:rounded-none max-md:ring-0 max-md:data-open:zoom-in-100 max-md:data-open:slide-in-from-bottom-4 max-md:data-closed:zoom-out-100 max-md:data-closed:slide-out-to-bottom-4"

function DialogContent({
  className,
  children,
  showCloseButton = true,
  mobileFullscreen = false,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  /**
   * Take the whole viewport below `md`, keeping the centred dialog above it.
   *
   * Turn it on for anything with a form in it. Leave it off for a short
   * confirmation, where a full-screen takeover overstates what is being asked.
   *
   * `<DialogHeader>` and `<DialogFooter>` read this off the content element and
   * pin themselves accordingly, so a call site normally needs nothing else.
   */
  mobileFullscreen?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-mobile-fullscreen={mobileFullscreen ? "true" : undefined}
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          mobileFullscreen && MOBILE_FULLSCREEN,
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              // `fixed` rather than `absolute` in a full-screen mobile dialog:
              // the content box is the scroller, so an absolutely-positioned
              // close button scrolls off the top and strands anyone who opened
              // the wrong record. It resolves against the content box either
              // way, which at full screen is the viewport.
              className="absolute top-2 right-2 in-data-[mobile-fullscreen=true]:max-md:fixed"
              size="icon-sm"
            >
              <XIcon
              />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "flex flex-col gap-2",
        // In a full-screen mobile dialog this is the top action bar, so it
        // stays put while the body scrolls under it. The negative margins pull
        // it out into the content's own 16px padding so the rule under it spans
        // the full width, and `top-0` then pins it flush with the viewport.
        "in-data-[mobile-fullscreen=true]:max-md:bg-popover in-data-[mobile-fullscreen=true]:max-md:shrink-0 in-data-[mobile-fullscreen=true]:max-md:sticky in-data-[mobile-fullscreen=true]:max-md:top-0 in-data-[mobile-fullscreen=true]:max-md:z-10 in-data-[mobile-fullscreen=true]:max-md:-mx-4 in-data-[mobile-fullscreen=true]:max-md:-mt-4 in-data-[mobile-fullscreen=true]:max-md:border-b in-data-[mobile-fullscreen=true]:max-md:px-4 in-data-[mobile-fullscreen=true]:max-md:pt-4 in-data-[mobile-fullscreen=true]:max-md:pb-3",
        className
      )}
      {...props}
    />
  )
}


function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        // The full-screen counterpart of the sticky header: the actions stay on
        // screen no matter how long the form is, so "Save" is never something
        // an operator has to scroll to find. `pb-safe-4` (globals.css) keeps
        // the buttons clear of the home indicator, which `viewportFit: cover`
        // otherwise lets them sit under.
        "in-data-[mobile-fullscreen=true]:max-md:bg-popover in-data-[mobile-fullscreen=true]:max-md:shrink-0 in-data-[mobile-fullscreen=true]:max-md:pb-safe-4 in-data-[mobile-fullscreen=true]:max-md:sticky in-data-[mobile-fullscreen=true]:max-md:bottom-0 in-data-[mobile-fullscreen=true]:max-md:z-10 in-data-[mobile-fullscreen=true]:max-md:rounded-none",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
