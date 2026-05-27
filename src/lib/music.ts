// Shared ambient-soundtrack singleton. One audio element lives for the whole SPA
// session so it survives the entrance → gallery client navigation (router.push,
// same document). The visitor's click on the entrance door — a user gesture —
// starts it playing *silently*, which "unlocks" it under the browser autoplay
// policy (and on WebKit it must be this same element that was played in the
// gesture). The gallery then resets it to 0:00 and fades the volume up as the
// room is revealed, so sound and picture arrive together.
//
// The track is data-driven: the exhibition's `backgroundMusic` file in Sanity
// (resolved to `backgroundMusicUrl` by the API) overrides this bundled default,
// so the soundtrack can be swapped from the CMS without a code change. The
// bundled file is the fallback (dev, no CMS track, or URL not ready in time).

const DEFAULT_SRC = "/music/gymnopedie-no-1.mp3";

let audio: HTMLAudioElement | null = null;
let armed = false;

export function getMusic(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!audio) {
    audio = new Audio(DEFAULT_SRC);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0;
  }
  return audio;
}

// Point the soundtrack at a CMS-provided track. Safe to call repeatedly: it only
// swaps the source when it actually changes AND nothing is playing yet, so it
// never cuts off a track that's already running (e.g. armed from the door).
export function setMusicSrc(url?: string | null): void {
  const a = getMusic();
  if (!a || !url) return;
  if (a.src === url || a.currentSrc === url) return;
  if (!a.paused) return; // already playing — don't interrupt
  a.src = url;
}

// Call from a user gesture (the entrance door). Optionally points at a CMS track,
// then begins silent playback to satisfy the autoplay policy and arms the gallery
// to fade the music in on reveal.
export function armMusic(url?: string | null): void {
  const a = getMusic();
  if (!a) return;
  setMusicSrc(url);
  armed = true;
  a.volume = 0;
  a.play().catch(() => { /* blocked — the in-gallery ♪ button is the fallback */ });
}

// The gallery calls this once when the room is revealed: returns true if the
// visitor came through the door (so the music should auto-start), and clears the
// flag so a later re-render or mode switch doesn't restart it.
export function consumeMusicArmed(): boolean {
  const wasArmed = armed;
  armed = false;
  return wasArmed;
}
