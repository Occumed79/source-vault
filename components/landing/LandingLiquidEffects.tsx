'use client';

import { useEffect } from 'react';

const MAX_RIPPLES = 5;
const TRAIL_RIPPLE_LIFETIME = 1350;
const PRESS_RIPPLE_LIFETIME = 1750;

let landingAudioContext: AudioContext | null = null;
let landingReverbBuffer: AudioBuffer | null = null;
let landingReverbSampleRate = 0;
let landingSoundMuted = false;

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

function getReverbBuffer(context: AudioContext) {
  if (landingReverbBuffer && landingReverbSampleRate === context.sampleRate) {
    return landingReverbBuffer;
  }

  const length = Math.floor(context.sampleRate * 2.85);
  const impulse = context.createBuffer(2, length, context.sampleRate);

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const progress = index / length;
      const decay = Math.pow(1 - progress, 2.9);
      const diffusion = 0.78 + Math.sin(progress * Math.PI * 5.5) * 0.08;
      data[index] = (Math.random() * 2 - 1) * decay * diffusion;
    }
  }

  landingReverbBuffer = impulse;
  landingReverbSampleRate = context.sampleRate;
  return impulse;
}

function playCrystalBloom(intensity = 1, brightness = 0.5, movement = false) {
  const context = getAudioContext();
  if (!context) return;

  const now = context.currentTime;
  const strength = Math.max(0.06, Math.min(intensity, 1));
  const tone = Math.max(0, Math.min(brightness, 1));
  const duration = movement ? 2.35 : 3.05;
  const master = context.createGain();
  const highPass = context.createBiquadFilter();
  const lowPass = context.createBiquadFilter();
  const convolver = context.createConvolver();
  const wetHighPass = context.createBiquadFilter();
  const dry = context.createGain();
  const wet = context.createGain();

  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.048 * strength, now + 0.095);
  master.gain.exponentialRampToValueAtTime(0.018 * strength, now + 0.55);
  master.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  highPass.type = 'highpass';
  highPass.frequency.setValueAtTime(420, now);
  highPass.Q.setValueAtTime(0.55, now);

  lowPass.type = 'lowpass';
  lowPass.frequency.setValueAtTime(6200 + tone * 900, now);
  lowPass.Q.setValueAtTime(0.45, now);

  wetHighPass.type = 'highpass';
  wetHighPass.frequency.setValueAtTime(720, now);
  wetHighPass.Q.setValueAtTime(0.4, now);

  convolver.buffer = getReverbBuffer(context);
  dry.gain.setValueAtTime(movement ? 0.5 : 0.66, now);
  wet.gain.setValueAtTime(movement ? 0.3 : 0.43, now);

  master.connect(highPass);
  highPass.connect(lowPass);
  lowPass.connect(dry);
  lowPass.connect(convolver);
  convolver.connect(wetHighPass);
  wetHighPass.connect(wet);
  dry.connect(context.destination);
  wet.connect(context.destination);

  const roots = [587.33, 659.25, 698.46];
  const root = roots[Math.min(roots.length - 1, Math.floor(tone * roots.length))];
  const fullPartials = [
    { ratio: 1, gain: 0.52, delay: 0 },
    { ratio: 1.503, gain: 0.42, delay: 0.018 },
    { ratio: 2.011, gain: 0.34, delay: 0.052 },
    { ratio: 2.676, gain: 0.22, delay: 0.09 },
    { ratio: 3.492, gain: 0.13, delay: 0.14 },
  ];
  const partials = movement ? fullPartials.slice(1) : fullPartials;

  partials.forEach((partial, index) => {
    const oscillator = context.createOscillator();
    const partialGain = context.createGain();
    const panner = context.createStereoPanner();
    const start = now + partial.delay;
    const attack = 0.055 + index * 0.024;
    const stop = now + duration + index * 0.06;
    const frequency = root * partial.ratio;
    const organicDetune = (Math.random() - 0.5) * 5.5;

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency * 0.9985, start);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.0015, stop);
    oscillator.detune.setValueAtTime(organicDetune, start);

    partialGain.gain.setValueAtTime(0.0001, start);
    partialGain.gain.exponentialRampToValueAtTime(partial.gain, start + attack);
    partialGain.gain.exponentialRampToValueAtTime(partial.gain * 0.34, start + 0.5);
    partialGain.gain.exponentialRampToValueAtTime(0.0001, stop);

    panner.pan.setValueAtTime((index % 2 === 0 ? -1 : 1) * Math.min(0.38, 0.12 + index * 0.07), start);

    oscillator.connect(partialGain);
    partialGain.connect(panner);
    panner.connect(master);
    oscillator.start(start);
    oscillator.stop(stop);
  });

  const airLength = Math.floor(context.sampleRate * 1.45);
  const airBuffer = context.createBuffer(1, airLength, context.sampleRate);
  const airData = airBuffer.getChannelData(0);

  for (let index = 0; index < airLength; index += 1) {
    const progress = index / airLength;
    const envelope = Math.sin(progress * Math.PI) * Math.pow(1 - progress, 0.35);
    airData[index] = (Math.random() * 2 - 1) * envelope;
  }

  const air = context.createBufferSource();
  const airFilter = context.createBiquadFilter();
  const airGain = context.createGain();
  const airPan = context.createStereoPanner();
  air.buffer = airBuffer;
  airFilter.type = 'bandpass';
  airFilter.frequency.setValueAtTime(4700 + tone * 1300, now);
  airFilter.frequency.exponentialRampToValueAtTime(3200 + tone * 700, now + 1.45);
  airFilter.Q.setValueAtTime(1.15, now);
  airGain.gain.setValueAtTime(0.0001, now);
  airGain.gain.exponentialRampToValueAtTime(0.01 * strength, now + 0.18);
  airGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.45);
  airPan.pan.setValueAtTime(0.22, now);
  air.connect(airFilter);
  airFilter.connect(airGain);
  airGain.connect(airPan);
  airPan.connect(master);
  air.start(now);
  air.stop(now + 1.48);
}

export default function LandingLiquidEffects() {
  useEffect(() => {
    const landing = document.querySelector<HTMLElement>('.docbox-landing');
    if (!landing) return;

    const soundButton = document.createElement('button');
    soundButton.type = 'button';
    soundButton.className = 'landing-sound-toggle';
    soundButton.innerHTML = '<span class="landing-sound-label"></span>';
    document.body.appendChild(soundButton);

    const soundLabel = soundButton.querySelector<HTMLElement>('.landing-sound-label');
    const layer = document.createElement('div');
    layer.className = 'landing-liquid-layer';
    layer.setAttribute('aria-hidden', 'true');
    landing.appendChild(layer);

    let audioUnlocked = landingAudioContext?.state === 'running';
    let soundMuted = landingSoundMuted;
    let soundTravel = 0;
    let lastSound = 0;
    let lastPointer = { x: 0, y: 0, initialized: false };
    let lastTrail = { x: -1000, y: -1000, time: 0 };
    const rippleTimers = new Set<number>();

    const updateSoundButton = () => {
      soundButton.setAttribute('aria-pressed', soundMuted ? 'true' : 'false');
      soundButton.setAttribute('aria-label', soundMuted ? 'Unmute crystal resonance' : 'Mute crystal resonance');
      soundButton.dataset.muted = soundMuted ? 'true' : 'false';
      if (soundLabel) soundLabel.textContent = soundMuted ? 'Unmute' : 'Mute';
    };
    updateSoundButton();

    const addRipple = (x: number, y: number, kind: 'trail' | 'press', angle = 0) => {
      const ripple = document.createElement('span');
      ripple.className = `landing-liquid-ripple landing-liquid-ripple-${kind}`;
      ripple.style.setProperty('--landing-ripple-x', `${x}px`);
      ripple.style.setProperty('--landing-ripple-y', `${y}px`);
      ripple.style.setProperty('--landing-ripple-angle', `${angle}rad`);
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

    const unlockAndPlay = (intensity: number, brightness: number) => {
      audioUnlocked = true;
      if (!soundMuted) playCrystalBloom(intensity, brightness, false);
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
      const angle = lastPointer.initialized
        ? Math.atan2(y - lastPointer.y, x - lastPointer.x)
        : 0;
      const brightness = bounds.width > 0 ? x / bounds.width : 0.5;

      const trailDistance = Math.hypot(x - lastTrail.x, y - lastTrail.y);
      if (trailDistance >= 76 && now - lastTrail.time >= 115) {
        addRipple(x, y, 'trail', angle);
        lastTrail = { x, y, time: now };
      }

      if (audioUnlocked && !soundMuted) {
        soundTravel += movement;
        if (soundTravel >= 320 && now - lastSound >= 1600) {
          playCrystalBloom(0.13, brightness, true);
          soundTravel = 0;
          lastSound = now;
        }
      }

      lastPointer = { x, y, initialized: true };
    };

    const handlePointerDown = (event: PointerEvent) => {
      const bounds = landing.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      const brightness = bounds.width > 0 ? x / bounds.width : 0.5;
      addRipple(x, y, 'press');
      unlockAndPlay(0.54, brightness);
    };

    const handlePointerLeave = () => {
      lastPointer.initialized = false;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const bounds = landing.getBoundingClientRect();
      addRipple(bounds.width / 2, bounds.height / 2, 'press');
      unlockAndPlay(0.54, 0.5);
    };

    const handleClick = () => {
      if (!audioUnlocked) unlockAndPlay(0.42, 0.5);
    };

    const handleSoundToggle = () => {
      soundMuted = !soundMuted;
      landingSoundMuted = soundMuted;
      updateSoundButton();
      if (!soundMuted) unlockAndPlay(0.36, 0.5);
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
    };
  }, []);

  return null;
}
