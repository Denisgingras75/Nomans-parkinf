// Two-note "bing-bong" pickup chime. Extracted so /admin can preview the
// sound on the owner's phone without waiting for a real ping. iOS Safari
// requires the AudioContext to be created inside a user-gesture handler,
// so createChimeContext must run from a tap/click.

export function createChimeContext(): AudioContext | null {
  try {
    const Ctor =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    const ctx: AudioContext = new Ctor();
    ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

export function playChime(ctx: AudioContext | null) {
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const now = ctx.currentTime;
  // A5 then E6.
  for (const { freq, t } of [
    { freq: 880, t: 0 },
    { freq: 1320, t: 0.18 },
  ]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + t);
    gain.gain.linearRampToValueAtTime(0.35, now + t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + t);
    osc.stop(now + t + 0.55);
  }
}
