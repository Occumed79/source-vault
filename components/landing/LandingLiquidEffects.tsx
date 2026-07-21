'use client';

import { useEffect } from 'react';

const MAX_RIPPLES = 8;
const TRAIL_RIPPLE_LIFETIME = 940;
const PRESS_RIPPLE_LIFETIME = 1250;

let landingAudioContext: AudioContext | null = null;
let landingSoundEnabled = false;

type AudioWindow = typeof window & {
  webkitAudioContext?: typeof AudioContext;
};

function getAudioContext() {
  if (typeof window === 'undefined') return null;

  const AudioContextClass = window.AudioContext
    ?? (window as AudioWindow).webkitAudioContext;

  if (!AudioContextClass) return null;
  landingAudioContext ??= new AudioContextClass();

  if (landingAudioContext.state === 'suspended') {
    void landingAudioContext.resume();
  }

  return landingAudioContext;
}

function playLiquidGlassChime(intensity = 1) {
  const context = getAudioContext();
  if (!context) return;

  const now = context.currentTime;
  const strength = Math.max(0.2, Math.min(intensity, 1));
  const master = context.createGain();
  const delay = context.createDelay(0.4);
  const feedback = context.createGain();
  const echoTone = context.createBiquadFilter();

  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.105 * strength, now + 0.014);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 1.08);

  delay.delayTime.setValueAtTime(0.118, now);
  feedback.gain.setValueAtTime(0.18, now);
  echoTone.type = 'lowpass';
  echoTone.frequency.setValueAtTime(4200, now);
  echoTone.Q.setValueAtTime(0.7, now);

  master.connect(context.destination);
  master.connect(delay);
  delay.connect(echoTone);
  echoTone.connect(feedback);
  feedback.connect(delay);
  echoTone.connect(context.destination);

  const harmonics = [
    { frequency: 659.25, gain: 0.9, type: 'sine' as OscillatorType },
    { frequency: 987.77, gain: 0.46, type: 'sine' as OscillatorType },
    { frequency: 1318.51, gain: 0.28, type: 'triangle' as OscillatorType },
    { frequency: 1975.53, gain: 0.12, type: 'sine' as OscillatorType },
  ];

  harmonics.forEach((harmonic, index) => {
    const oscillator = context.createOscillator();
    const harmonicGain = context.createGain();
    const shimmer = context.createOscillator();
    const shimmerDepth = context.createGain();
    const start = now + index * 0.008;
    const stop = now + 0.78 + index * 0.055;

    oscillator.type = harmonic.type;
    oscillator.frequency.setValueAtTime(harmonic.frequency * 0.986, start);
    oscillator.frequency.exponentialRampToValueAtTime(harmonic.frequency * 1.008, stop);

    shimmer.type = 'sine';
    shimmer.frequency.setValueAtTime(4.7 + index * 0.55, start);
    shimmerDepth.gain.setValueAtTime(2.4 + index * 0.9, start);
    shimmer.connect(shimmerDepth);
    shimmerDepth.connect(oscillator.frequency);

    harmonicGain.gain.setValueAtTime(0.0001, start);
    harmonicGain.gain.exponentialRampToValueAtTime(harmonic.gain, start + 0.012);
    harmonicGain.gain.exponentialRampToValueAtTime(0.0001, stop);

    oscillator.connect(harmonicGain);
    harmonicGain.connect(master);
    oscillator.start(start);
    shimmer.start(start);
    oscillator.stop(stop);
    shimmer.stop(stop);
  });

  const waterLength = Math.floor(context.sampleRate * 0.19);
  const waterBuffer = context.createBuffer(1, waterLength, context.sampleRate);
  const waterData = waterBuffer.getChannelData(0);

  for (let index = 0; index < waterLength; index += 1) {
    const envelope = Math.pow(1 - index / waterLength, 2.8);
    waterData[index] = (Math.random() * 2 - 1) * envelope;
  }

  const water = context.createBufferSource();
  const waterFilter = context.createBiquadFilter();
  const waterGain = context.createGain();
  water.buffer = waterBuffer;
  waterFilter.type = 'bandpass';
  waterFilter.frequency.setValueAtTime(1850, now);
  waterFilter.frequency.exponentialRampToValueAtTime(720, now + 0.19);
  waterFilter.Q.setValueAtTime(1.7, now);
  waterGain.gain.setValueAtTime(0.12 * strength, now);
  waterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
  water.connect(waterFilter);
  waterFilter.connect(waterGain);
  waterGain.connect(master);
  water.start(now);
  water.stop(now + 0.2);
}

export default function LandingLiquidEffects() {
  useEffect(() => {
    const landing = document.querySelector<HTMLElement>('.docbox-landing');
    if (!landing) return;

    const soundButton = document.createElement('button');
    soundButton.type = 'button';
    soundButton.className = 'landing-sound-toggle';
    soundButton.innerHTML = '<span class="landing-sound-wave" aria-hidden="true"><i></i><i></i><i></i></span><span>Sound</span>';
    document.body.appendChild(soundButton);

    const layer = document.createElement('div');
    layer.className = 'landing-liquid-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = '<span class="landing-liquid-lens"></span><span class="landing-liquid-caustic"></span>';
    landing.appendChild(layer);
    landing.dataset.pointerActive = 'false';

    let audioUnlocked = landingAudioContext?.state === 'running';
    let soundEnabled = landingSoundEnabled;
    let soundTravel = 0;
    let lastSound = 0;
    let lastPointer = { x: 0, y: 0, initialized: false };
    let lastTrail = { x: -1000, y: -1000, time: 0 };
    const rippleTimers = new Set<number>();

    const updateSoundButton = () => {
      soundButton.setAttribute('aria-pressed', soundEnabled ? 'true' : 'false');
      soundButton.setAttribute('aria-label', soundEnabled ? 'Disable liquid glass sound' : 'Enable liquid glass sound');
      soundButton.dataset.enabled = soundEnabled ? 'true' : 'false';
    };
    updateSoundButton();

    const setPointerPosition = (x: number, y: number, active: boolean) => {
      landing.style.setProperty('--landing-pointer-x', `${x}px`);
      landing.style.setProperty('--landing-pointer-y', `${y}px`);
      landing.dataset.pointerActive = active ? 'true' : 'false';
    };

    const addRipple = (x: number, y: number, kind: 'trail' | 'press') => {
      const ripple = document.createElement('span');
      ripple.className = `landing-liquid-ripple landing-liquid-ripple-${kind}`;
      ripple.style.setProperty('--landing-ripple-x', `${x}px`);
      ripple.style.setProperty('--landing-ripple-y', `${y}px`);
      layer.appendChild(ripple);

      const activeRipples = layer.querySelectorAll('.landing-liquid-ripple');
      if (activeRipples.length > MAX_RIPPLES) {
        activeRipples[0]?.remove();
      }

      const lifetime = kind === 'press' ? PRESS_RIPPLE_LIFETIME : TRAIL_RIPPLE_LIFETIME;
      const timer = window.setTimeout(() => {
        ripple.remove();
        rippleTimers.delete(timer);
      }, lifetime);
      rippleTimers.add(timer);
    };

    const unlockAndPlay = (intensity: number) => {
      audioUnlocked = true;
      playLiquidGlassChime(intensity);
      lastSound = performance.now();
      soundTravel = 0;
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;

      const bounds = landing.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      const now = performance.now();
      const movement = lastPointer.initialized
        ? Math.hypot(x - lastPointer.x, y - lastPointer.y)
        : 0;

      setPointerPosition(x, y, true);
      lastPointer = { x, y, initialized: true };

      const trailDistance = Math.hypot(x - lastTrail.x, y - lastTrail.y);
      if (trailDistance >= 52 && now - lastTrail.time >= 90) {
        addRipple(x, y, 'trail');
        lastTrail = { x, y, time: now };
      }

      if (audioUnlocked && soundEnabled) {
        soundTravel += movement;
        if (soundTravel >= 150 && now - lastSound >= 680) {
          playLiquidGlassChime(0.28);
          soundTravel = 0;
          lastSound = now;
        }
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      const bounds = landing.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      setPointerPosition(x, y, true);
      addRipple(x, y, 'press');
      unlockAndPlay(0.92);
    };

    const handlePointerLeave = () => {
      landing.dataset.pointerActive = 'false';
      lastPointer.initialized = false;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const bounds = landing.getBoundingClientRect();
      setPointerPosition(bounds.width / 2, bounds.height / 2, true);
      addRipple(bounds.width / 2, bounds.height / 2, 'press');
      unlockAndPlay(0.92);
    };

    const handleClick = () => {
      if (!audioUnlocked) unlockAndPlay(0.88);
    };

    const handleSoundToggle = () => {
      soundEnabled = !soundEnabled;
      landingSoundEnabled = soundEnabled;
      updateSoundButton();
      if (soundEnabled) unlockAndPlay(0.76);
    };

    landing.addEventListener('pointermove', handlePointerMove);
    landing.addEventListener('pointerdown', handlePointerDown);
    landing.addEventListener('pointerleave', handlePointerLeave);
    landing.addEventListener('keydown', handleKeyDown, true);
    landing.addEventListener('click', handleClick, true);
    soundButton.addEventListener('click', handleSoundToggle);

    return () => {
      landing.removeEventListener('pointermove', handlePointerMove);
      landing.removeEventListener('pointerdown', handlePointerDown);
      landing.removeEventListener('pointerleave', handlePointerLeave);
      landing.removeEventListener('keydown', handleKeyDown, true);
      landing.removeEventListener('click', handleClick, true);
      soundButton.removeEventListener('click', handleSoundToggle);
      rippleTimers.forEach(timer => window.clearTimeout(timer));
      layer.remove();
      soundButton.remove();
      landing.dataset.pointerActive = 'false';
      landing.style.removeProperty('--landing-pointer-x');
      landing.style.removeProperty('--landing-pointer-y');
    };
  }, []);

  return null;
}
