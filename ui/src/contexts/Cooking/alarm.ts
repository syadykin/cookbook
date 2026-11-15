type AudioContextCtor = typeof AudioContext;

let ctx: AudioContext | null = null;

/**
 * Creates or resumes the shared AudioContext. Browsers only allow that during a user gesture,
 * so this runs when a timer is started, long before the alarm needs to sound.
 */
export function unlockAudio() {
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
      if (Ctor) {
        ctx = new Ctor();
      }
    }
    if (ctx?.state === 'suspended') {
      void ctx.resume();
    }
  } catch {
    // no audio: the vibration and the visual pulse still work
  }
}

/** Three short 880 Hz tones and a vibration pattern. */
export function ring() {
  try {
    navigator.vibrate?.([300, 150, 300, 150, 300]);
  } catch {
    // vibrate throws in some embedded browsers
  }
  if (!ctx) {
    return;
  }
  try {
    const t0 = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const s = t0 + i * 0.45;
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, s);
      gain.gain.exponentialRampToValueAtTime(0.3, s + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, s + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(s);
      osc.stop(s + 0.32);
    }
  } catch {
    // a closed context; nothing to do
  }
}
