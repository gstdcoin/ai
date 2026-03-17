import { useEffect, useRef } from 'react';

/**
 * useScrollReveal — Intersection Observer hook for scroll-reveal animations
 * 
 * Usage:
 *   const ref = useScrollReveal();
 *   <div ref={ref} className="reveal">content</div>
 * 
 * Variants:
 *   <div className="reveal from-left">from left</div>
 *   <div className="reveal from-right">from right</div>
 *   <div className="reveal scale-in">scale in</div>
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  options?: IntersectionObserverInit
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Check for reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('visible');
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px', ...options }
    );

    observer.observe(el);

    return () => {
      observer.unobserve(el);
    };
  }, []);

  return ref;
}

/**
 * useScrollRevealAll — Observes all `.reveal` children inside a container
 * 
 * Usage:
 *   const containerRef = useScrollRevealAll();
 *   <div ref={containerRef}>
 *     <div className="reveal">item 1</div>
 *     <div className="reveal">item 2</div>
 *   </div>
 */
export function useScrollRevealAll<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      container.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );

    container.querySelectorAll('.reveal').forEach(el => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return ref;
}
