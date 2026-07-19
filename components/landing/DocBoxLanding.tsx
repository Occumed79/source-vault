'use client';

import Image from 'next/image';
import { useEffect, type CSSProperties, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';

const LANDING_ART = '/docbox-landing.png?v=20260719-0942';

type ParticleKind = 'dust' | 'firefly' | 'bloom';

type Particle = {
  id: string;
  kind: ParticleKind;
  top: number;
  left: number;
  size: number;
  delay: number;
  duration: number;
  driftX: number;
  driftY: number;
  opacity: number;
  blur: number;
};

function randomGenerator(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function createParticles(kind: ParticleKind, count: number, seed: number): Particle[] {
  const random = randomGenerator(seed);
  const settings = {
    dust: { minSize: 1, maxSize: 2.6, minDuration: 8, maxDuration: 19, minOpacity: 0.18, maxOpacity: 0.76, drift: 34, blur: 0.3 },
    firefly: { minSize: 3, maxSize: 7.5, minDuration: 7, maxDuration: 16, minOpacity: 0.35, maxOpacity: 1, drift: 48, blur: 0.8 },
    bloom: { minSize: 8, maxSize: 15, minDuration: 9, maxDuration: 20, minOpacity: 0.2, maxOpacity: 0.72, drift: 26, blur: 1.6 },
  }[kind];

  return Array.from({ length: count }, (_, index) => ({
    id: `${kind}-${index}`,
    kind,
    top: random() * 100,
    left: random() * 100,
    size: settings.minSize + random() * (settings.maxSize - settings.minSize),
    delay: -(random() * settings.maxDuration),
    duration: settings.minDuration + random() * (settings.maxDuration - settings.minDuration),
    driftX: (random() - 0.5) * settings.drift,
    driftY: -(12 + random() * settings.drift),
    opacity: settings.minOpacity + random() * (settings.maxOpacity - settings.minOpacity),
    blur: settings.blur + random() * settings.blur,
  }));
}

const PARTICLE_LAYERS = [
  { kind: 'dust' as const, particles: createParticles('dust', 120, 1447) },
  { kind: 'firefly' as const, particles: createParticles('firefly', 48, 2771) },
  { kind: 'bloom' as const, particles: createParticles('bloom', 16, 3907) },
];

export default function DocBoxLanding() {
  const router = useRouter();

  useEffect(() => {
    router.prefetch('/vault');
  }, [router]);

  const enterVault = () => router.push('/vault');

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      enterVault();
    }
  };

  return (
    <main
      className="docbox-landing"
      role="button"
      tabIndex={0}
      aria-label="Enter Occu-Med DocBox"
      onClick={enterVault}
      onKeyDown={handleKeyDown}
    >
      <Image
        className="docbox-landing-art"
        src={LANDING_ART}
        alt=""
        aria-hidden="true"
        fill
        priority
        sizes="100vw"
      />

      <div className="landing-circuit-glow circuit-glow-one" aria-hidden="true" />
      <div className="landing-circuit-glow circuit-glow-two" aria-hidden="true" />
      <div className="landing-light-sweep landing-light-sweep-one" aria-hidden="true" />
      <div className="landing-light-sweep landing-light-sweep-two" aria-hidden="true" />

      <div className="landing-particle-system" aria-hidden="true">
        {PARTICLE_LAYERS.map(layer => (
          <div key={layer.kind} className={`landing-particle-layer ${layer.kind}-layer`}>
            {layer.particles.map(particle => (
              <span
                key={particle.id}
                className={`landing-particle landing-particle-${particle.kind}`}
                style={{
                  '--landing-top': `${particle.top}%`,
                  '--landing-left': `${particle.left}%`,
                  '--landing-size': `${particle.size}px`,
                  '--landing-delay': `${particle.delay}s`,
                  '--landing-duration': `${particle.duration}s`,
                  '--landing-drift-x': `${particle.driftX}px`,
                  '--landing-drift-y': `${particle.driftY}px`,
                  '--landing-opacity': particle.opacity,
                  '--landing-blur': `${particle.blur}px`,
                } as CSSProperties}
              />
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}
