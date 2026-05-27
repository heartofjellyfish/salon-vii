// Shared ambient-soundtrack singleton. One audio element lives for the whole SPA
// session so it survives the entrance → gallery client navigation (router.push,
// same document). The visitor's click on the entrance door — a user gesture —
// starts it playing *silently*, which "unlocks" it under the browser autoplay
// policy (and on WebKit it must be this same element that was played in the
// gesture). The gallery then resets it to 0:00 and fades the volume up as the
// room is revealed, so sound and picture arrive together.

let audio: HTMLAudioElement | null = null;
let armed = false;

export function getMusic(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!audio) {
    audio = new Audio("/music/gymnopedie-no-1.mp3");
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0;
  }
  return audio;
}

// Call from a user gesture (the entrance door). Begins silent playback to satisfy
// the autoplay policy, and arms the gallery to fade the music in on reveal.
export function armMusic(): void {
  const a = getMusic();
  if (!a) return;
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
