// Shared ambient-soundtrack singleton. One audio element lives for the whole SPA
// session so it survives the entrance → gallery client navigation (router.push,
// same document). The visitor's click on the entrance door — a user gesture —
// starts it playing *silently*, which "unlocks" it under the browser autoplay
// policy (and on WebKit it must be this same element that was played in the
// gesture). The gallery then resets it to 0:00 and fades the volume up as the
// room is revealed, so sound and picture arrive together.
//
// The track is entirely CMS-driven: it plays ONLY when the exhibition has a
// `backgroundMusic` file in Sanity (resolved to `backgroundMusicUrl` by the API).
// With no CMS track there is no audio element, no sound, and the gallery hides
// the ♪ button — there is no bundled fallback.

let audio: HTMLAudioElement | null = null;
let armed = false;
let src: string | null = null;

// Point the soundtrack at the CMS track. Safe to call repeatedly: it records the
// URL and, if the element already exists and isn't mid-play, swaps its source —
// so it never cuts off a track that's already running (e.g. armed from the door).
export function setMusicSrc(url?: string | null): void {
  if (!url || url === src) return;
  src = url;
  if (audio && audio.src !== url && audio.paused) audio.src = url;
}

export function getMusic(): HTMLAudioElement | null {
  if (typeof window === "undefined" || !src) return null;
  if (!audio) {
    audio = new Audio(src);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0;
  }
  return audio;
}

// Call from a user gesture (the entrance door), passing the CMS track URL. With
// no track it does nothing — silence, nothing armed. Otherwise it begins silent
// playback to satisfy the autoplay policy and arms the gallery to fade it in.
export function armMusic(url?: string | null): void {
  setMusicSrc(url);
  const a = getMusic();
  if (!a) return; // no CMS track → stay silent
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
