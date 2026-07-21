'use client';

import { useEffect } from 'react';

const MAX_RIPPLES = 5;
const TRAIL_RIPPLE_LIFETIME = 1300;
const PRESS_RIPPLE_LIFETIME = 1700;

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

  const length = Math.floor(context.sampleRate * 3.1);
  const impulse = context.createBuffer(2, length, context.sampleRate);

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const progress = index / length;
      const decay = Math.pow(1 - progress, 3.4);
      const softTail = 0.6 + 0.4 * Math.sin(progress * Math.PI);
      data[index] = (Math.random() * 2 - 1) * decay * softTail;
    }
  }

  landingReverbBuffer = impulse;
  landingReverbSampleRate = context.sampleRate;
  return impulse;
}

function playResonantBloom(intensity = 1, brightness = 0.5) {
  const context = getAudioContext();
  if (!context) return;

  const now = context.currentTime;
  const strength = Math.max(0.08, Math.min(intensity, 1));
  const tone = Math.max(0, Math.min(brightness, 1));
  const duration = 3.15;
  const master = context.createGain();
  const lowPass = context.createBiquadFilter();
  const convolver = context.createConvolver();
  const dry = context.createGain();
  const wet = context.createGain();

  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.038 * strength, now + 0.14);
  master.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  lowPass.type = 'lowpass';
  lowPass.frequency.setValueAtTime(1450 + tone * 650, now);
  lowPass.Q.setValueAtTime(0.65, now);

  convolver.buffer = getReverbBuffer(context);
  dry.gain.setValueAtTime(0.7, now);
  wet.gain.setValueAtTime(0.34, now);

  master.connect(lowPass);
  lowPass.connect(dry);
  lowPass.connect(convolver);
  convolver.connect(wet);
  dry.connect(context.destination);
  wet.connect(context.destination);

  const baseFrequency = 210 + tone * 16;
  const partials = [
    { ratio: 1, gain: 0.72, detune: -2.4 },
    { ratio: 4 / 3, gain: 0.38, detune: 1.6 },
    { ratio: 2, gain: 0.5, detune: -0.9 },
    { ratio: 8 / 3, gain: 0.18, detune: 2.2 },
  ];

  partials.forEach((partial, index) => {
    const oscillator = context.createOscillator();
    const companion = context.createOscillator();
    const partialGain = context.createGain();
    const companionGain = context.createGain();
    const breath = context.createOscillator();
    const breathDepth = context.createGain();
    const frequency = baseFrequency * partial.ratio;
    const attack = 0.1 + index * 0.035;
    const stop = now + duration + index * 0.08;

    oscillator.type = 'sine';
    companion.type = index === partials.length - 1 ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);
    companion.frequency.setValueAtTime(frequency, now);
    oscillator.detune.setValueAtTime(partial.detune, now);
    companion.detune.setValueAtTime(-partial.detune - 1.2, now);

    breath.type = 'sine';
    breath.frequency.setValueAtTime(0.18 + index * 0.045, now);
    breathDepth.gain.setValueAtTime(0.75 + index * 0.25, now);
    breath.connect(breathDepth);
    breathDepth.connect(oscillator.detune);
    breathDepth.connect(companion.detune);

    partialGain.gain.setValueAtTime(0.0001, now);
    partialGain.gain.exponentialRampToValueAtTime(partial.gain, now + attack);
    partialGain.gain.exponentialRampToValueAtTime(0.0001, stop);

    companionGain.gain.setValueAtTime(0.0001, now);
    companionGain.gain.exponentialRampToValueAtTime(partial.gain * 0.32, now + attack + 0.045);
    companionGain.gain.exponentialRampToValueAtTime(0.0001, stop);

    oscillator.connect(partialGain);
    companion.connect(companionGain);
    partialGain.connect(master);
    companionGain.connect(master);

    oscillator.start(now);
    companion.start(now);
    breath.start(now);
    oscillator.stop(stop);
    companion.stop(stop);
    breath.stop(stop);
  });

  const airLength = Math.floor(context.sampleRate * 1.7);
  const airBuffer = context.createBuffer(1, airLength, context.sampleRate);
  const airData = airBuffer.getChannelData(0);

  for (let index = 0; index < airLength; index += 1) {
    const progress = index / airLength;
    const envelope = Math.sin(progress * Math.PI) * Math.pow(1 - progress, 0.7);
    airData[index] = (Math.random() * 2 - 1) * envelope;
  }

  const air = context.createBufferSource();
  const airFilter = context.createBiquadFilter();
  const airGain = context.createGain();
  air.buffer = airBuffer;
  airFilter.type = 'bandpass';
  airFilter.frequency.setValueAtTime(720 + tone * 260, now);
  airFilter.frequency.exponentialRampToValueAtTime(430, now + 1.7);
  airFilter.Q.setValueAtTime(0.8, now);
  airGain.gain.setValueAtTime(0.0001, now);
  airGain.gain.exponentialRampToValueAtTime(0.018 * strength, now + 0.28);
  airGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.7);
  air.connect(airFilter);
  airFilter.connect(airGain);
  airGain.connect(master);
  air.start(now);
  air.stop(now + 1.72);
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
      soundButton.setAttribute('aria-label', soundMuted ? 'Unmute ambient resonance' : 'Mute ambient resonance');
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
      if (!soundMuted) playResonantBloom(intensity, brightness);
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
      if (trailDistance >= 82 && now - lastTrail.time >= 125) {
        addRipple(x, y, 'trail', angle);
        lastTrail = { x, y, time: now };
      }

      if (audioUnlocked && !soundMuted) {
        soundTravel += movement;
        if (soundTravel >= 240 && now - lastSound >= 1200) {
          playResonantBloom(0.14, brightness);
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
      unlockAndPlay(0.62, brightness);
    };

    const handlePointerLeave = () => {
      lastPointer.initialized = false;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const bounds = landing.getBoundingClientRect();
      addRipple(bounds.width / 2, bounds.height / 2, 'press');
      unlockAndPlay(0.62, 0.5);
    };

    const handleClick = () => {
      if (!audioUnlocked) unlockAndPlay(0.5, 0.5);
    };

    const handleSoundToggle = () => {
      soundMuted = !soundMuted;
      landingSoundMuted = soundMuted;
      updateSoundButton();
      if (!soundMuted) unlockAndPlay(0.42, 0.5);
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
