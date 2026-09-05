import type { NextConfig } from 'next';

/**
 * Intentionally empty — and that is the finding, not an oversight.
 *
 * This project lives on a 5400rpm external HDD (/dev/sda1, WDC WD10SPZX) while
 * the machine also has an idle NVMe SSD. The obvious instinct is to tune dev
 * performance here. Measured on this machine, there is nothing to tune:
 *
 *   next dev, warm boot ............. 0.42s   ("Ready in 398ms")
 *   next dev, cold boot ............. 0.40s   (cache deleted first)
 *   cold compile of /login .......... 3.6s
 *   cold `next build` (33 routes) ... 20.3s
 *
 * Turbopack is the default bundler in Next 16 and its filesystem cache is
 * ALREADY ON: `experimental.turbopackFileSystemCacheForDev` defaults to `true`
 * (since 16.1.0), writing to `.next/dev/cache/turbopack`. There is no caching
 * flag left to enable.
 *
 * If a start ever feels dramatically slower than the numbers above, it is the
 * OS page cache, not config: the first run after a reboot has to pull ~800MB of
 * node_modules off the platter. Every later run is served from RAM. The cure is
 * a warm cache or faster storage — not a setting in this file.
 *
 * ── Do not add these. Each was tried and each fails. ────────────────────────
 *
 * RELOCATING node_modules OR .next TO THE SSD VIA SYMLINK — both break the
 * build, verified by doing it:
 *   • `node_modules` → Turbopack panics outright:
 *       "Symlink [project]/node_modules is invalid, it points out of the
 *        filesystem root"
 *     Turbopack resolves modules only within the project root, by design (it is
 *     how cache validation and watch scope stay bounded).
 *   • `.next` → the build dies with "Cannot find module '@tailwindcss/postcss'".
 *     Turbopack executes generated chunks from the symlink's REAL path, so
 *     Node's require() walks up from the cache directory, where no node_modules
 *     exists.
 *   A bind mount (`mount --bind`) would work where a symlink cannot, because the
 *   path genuinely resolves inside the project — but it needs root and an fstab
 *   entry to survive a reboot. That is a system change, not a repo change.
 *
 * KEYS THAT DO NOT EXIST IN 16.3.0. The top-level config schema is a
 * `z.strictObject`, so an unknown key is a hard startup error, not a warning:
 *   • `turbopack.memoryLimit`  — removed along with `experimental.turbo`.
 *   • `eslint.ignoreDuringBuilds` — the whole `eslint` config key is gone;
 *                                   linting was removed from `next build`.
 *   • `experimental.turbopackPersistentCaching` — never a real name; the real
 *                                   one is `turbopackFileSystemCacheForDev`.
 *
 * KEYS THAT EXIST BUT ARE WRONG HERE:
 *   • `distDir` — cannot point at another disk: "should not leave your project
 *     directory" per its own doc page.
 *   • `watchOptions.pollIntervalMs` — real and honored by Turbopack, but it is
 *     for network/Docker mounts where inotify does not fire. This is a local
 *     ext4 disk where inotify works; polling would only burn CPU.
 *   • `experimental.useLightningcss` — explicitly "has no effect on Turbopack",
 *     which already uses Lightning CSS.
 *
 * Bundled docs for this exact version: node_modules/next/dist/docs/01-app/
 * (03-api-reference/08-turbopack.md and 05-config/01-next-config-js/).
 */
const nextConfig: NextConfig = {};

export default nextConfig;
