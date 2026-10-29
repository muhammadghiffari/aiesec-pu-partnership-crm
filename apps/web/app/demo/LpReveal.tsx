"use client";

import { useEffect } from "react";

/**
 * Wires IntersectionObserver to add the `.in` class on `.lp-reveal` elements
 * when they enter the viewport, triggering the CSS entrance transition.
 * Skipped when the user has requested reduced motion.
 */
export function LpReveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const els = document.querySelectorAll<HTMLElement>(".lp-reveal");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.08 },
    );
    for (const el of els) io.observe(el);
    return () => io.disconnect();
  }, []);

  return null;
}
