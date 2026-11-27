'use client';

import gsap from 'gsap';
import Image from 'next/image';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const steps = [
  { label: 'Pago', status: 'Plata reservada', detail: 'El comprador paga. La plata queda protegida y el vendedor todavía no la recibe.', symbol: '↳' },
  { label: 'Archivo', status: 'Archivo desbloqueado', detail: 'El comprador desbloquea y descarga el archivo que compró.', symbol: '↓' },
  { label: 'Listo', status: 'Trato hecho', detail: 'El comprador confirma con un botón y la plata llega al vendedor al instante.', symbol: '✓' },
];

const layers = Array.from({ length: 10 }, (_, index) => index * 2);

function GlassRing({ second = false }: { second?: boolean }) {
  return (
    <div className={second ? 'glass-ring glass-ring-second' : 'glass-ring'}>
      {layers.map((depth) => (
        <span key={depth} style={{ transform: `translateZ(${depth}px)` }} />
      ))}
    </div>
  );
}

export default function DealPreview() {
  const [selected, setSelected] = useState(0);
  const content = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const sculpture = useRef<HTMLDivElement>(null);
  const orbit = useRef<HTMLDivElement>(null);
  const hasChanged = useRef(false);
  const step = steps[selected];

  useEffect(() => {
    const motion = gsap.matchMedia();
    motion.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.timeline({ defaults: { ease: 'power3.out' } })
        .from('[data-intro-line]', { y: 22, opacity: 0, duration: 0.65, stagger: 0.09 })
        .from('[data-intro-copy]', { y: 12, opacity: 0, duration: 0.45, stagger: 0.07 }, '-=0.43')
        .from('.preview', { y: 22, opacity: 0, duration: 0.7 }, 0.15);
    });

    motion.add('(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)', () => {
      const surface = stage.current;
      const object = sculpture.current;
      if (!surface || !object) return;

      const tiltX = gsap.quickTo(object, 'rotationX', { duration: 0.65, ease: 'power3.out' });
      const tiltY = gsap.quickTo(object, 'rotationY', { duration: 0.65, ease: 'power3.out' });

      function follow(event: PointerEvent) {
        const bounds = event.currentTarget instanceof HTMLElement
          ? event.currentTarget.getBoundingClientRect()
          : null;
        if (!bounds) return;
        tiltX((0.5 - (event.clientY - bounds.top) / bounds.height) * 28);
        tiltY(((event.clientX - bounds.left) / bounds.width - 0.5) * 36);
      }

      function reset() {
        tiltX(0);
        tiltY(0);
      }

      surface.addEventListener('pointermove', follow);
      surface.addEventListener('pointerleave', reset);
      return () => {
        surface.removeEventListener('pointermove', follow);
        surface.removeEventListener('pointerleave', reset);
      };
    });

    return () => motion.revert();
  }, []);

  useLayoutEffect(() => {
    if (!hasChanged.current || !content.current || !orbit.current) return;

    const motion = gsap.matchMedia();
    motion.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo(content.current, { y: 7, opacity: 0.45 }, {
        y: 0, opacity: 1, duration: 0.32, ease: 'power2.out', clearProps: 'transform,opacity',
      });
      gsap.fromTo(orbit.current, { rotationZ: selected === 1 ? 20 : -20, scale: 0.94 }, {
        rotationZ: 0, scale: 1, duration: 0.85, ease: 'elastic.out(1, 0.7)',
      });
    });
    return () => motion.revert();
  }, [selected]);

  return (
    <section className="preview" id="demo" tabIndex={-1} aria-labelledby="demo-title">
      <div className="preview-stage" data-step={selected} ref={stage}>
        <div className="preview-bar">
          <h2 id="demo-title">Simulación del trato</h2>
          <span>Sin plata real</span>
        </div>
        <div className="sculpture" ref={sculpture} aria-hidden="true">
          <div className="sculpture-orbit" ref={orbit}>
            <GlassRing />
            <GlassRing second />
          </div>
        </div>
      </div>
      <div className="preview-body">
        <div className="preview-item">
          <Image src="/demo-headphones.webp" alt="" width={42} height={42} />
          <strong>Beat trap con licencia</strong>
          <span>$45.000</span>
        </div>
        <div className="preview-status" aria-live="polite" ref={content}>
          <span className="status-symbol" aria-hidden="true">{step.symbol}</span>
          <div>
            <strong>{step.status}</strong>
            <p>{step.detail}</p>
          </div>
        </div>
        <div className="step-controls" role="group" aria-label="Etapas del trato de ejemplo">
          {steps.map(({ label }, index) => (
            <button key={label} type="button" aria-pressed={index === selected} onClick={() => {
              hasChanged.current = true;
              setSelected(index);
            }}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
