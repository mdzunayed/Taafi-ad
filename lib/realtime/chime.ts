'use client';

/**
 * The incoming-request chime.
 *
 * ## The autoplay problem, and why this file is bigger than "new Audio().play()"
 *
 * Chrome and Safari refuse to play audio until the document has received a
 * real user gesture. A console left open on the overview screen has, by
 * definition, not been touched — which is exactly the state ops are in when
 * the alert needs to fire. `play()` rejects with `NotAllowedError`, and if
 * nothing catches that, the alert fails SILENTLY: the banner appears, no sound
 * plays, and nobody learns the difference until a request is missed.
 *
 * So: we attempt playback, we detect the block, and we report it upward
 * (`onBlocked`) so the UI can show a one-click "Enable sound" affordance.
 * Once any gesture unlocks the element, the same element keeps working for the
 * life of the tab, so the prompt appears at most once per session.
 *
 * ## Recurring, not one-shot
 *
 * The requirement is that it keeps chiming until an admin acknowledges. We use
 * the element's `loop` flag rather than a setInterval that re-plays a clip:
 * an interval drifts against the clip length and eventually overlaps itself,
 * producing a garbled stack of chimes. The MP3 carries its own trailing
 * silence so the loop paces itself.
 */

const SOUND_URL = '/sounds/incoming-request.mp3';

let element: HTMLAudioElement | null = null;
let unlocked = false;

function audio(): HTMLAudioElement {
  if (element) return element;
  const el = new Audio(SOUND_URL);
  el.loop = true;
  el.preload = 'auto';
  // Loud, but not so loud it clips on laptop speakers at full system volume.
  el.volume = 0.85;
  element = el;
  return el;
}

/** True once the browser has let us play at least once in this tab. */
export function isUnlocked(): boolean {
  return unlocked;
}

/**
 * Start the recurring chime.
 *
 * @param onBlocked Called when the browser refused playback, so the caller can
 *   surface an "Enable sound" control. Not an error — it is the expected state
 *   on a freshly-loaded tab nobody has clicked yet.
 */
export function startChime(onBlocked?: () => void): void {
  const el = audio();
  // Restart from the top: a second request arriving mid-chime should sound
  // like a fresh alert, not join the tail of the previous one.
  el.currentTime = 0;
  void el
    .play()
    .then(() => {
      unlocked = true;
    })
    .catch(() => {
      unlocked = false;
      onBlocked?.();
    });
}

export function stopChime(): void {
  if (!element) return;
  element.pause();
  element.currentTime = 0;
}

/**
 * Unlock audio from inside a user-gesture handler.
 *
 * Plays and immediately pauses, which is enough to satisfy the autoplay
 * policy and mark the element as user-activated for the rest of the session.
 * Returns whether the unlock took, so the caller can keep the prompt up if the
 * browser is still refusing (an OS-level mute, say).
 */
export async function unlockAudio(): Promise<boolean> {
  const el = audio();
  try {
    await el.play();
    el.pause();
    el.currentTime = 0;
    unlocked = true;
    return true;
  } catch {
    unlocked = false;
    return false;
  }
}
