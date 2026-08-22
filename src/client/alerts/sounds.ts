import type { AlertSound } from "../theme";

let ctx: AudioContext | null = null;

/**
 * Create/resume the shared AudioContext. Must be called from a user gesture
 * (the alerts enable toggle or the preview button) or the context stays
 * suspended and sounds silently no-op.
 */
export function ensureAudio(): void {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
}

function tone(
  freq: number,
  type: OscillatorType,
  startOffset: number,
  duration: number,
  peak = 0.2,
): void {
  if (!ctx) return;
  const t0 = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(peak, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration);
}

export function playSound(kind: AlertSound): void {
  if (kind === "off" || !ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
    if (ctx.state === "suspended") return;
  }
  switch (kind) {
    case "ping":
      tone(880, "sine", 0, 0.4);
      break;
    case "chime":
      tone(660, "sine", 0, 0.35);
      tone(990, "sine", 0.12, 0.45);
      break;
    case "blip":
      tone(440, "square", 0, 0.08, 0.15);
      break;
  }
}
