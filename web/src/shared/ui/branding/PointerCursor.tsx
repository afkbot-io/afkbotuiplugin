import { useEffect, useRef, useState } from "react";

export function PointerCursor() {
  const dotRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const [hidden, setHidden] = useState(true);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    const coarsePointer = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    const reducedMotion =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (coarsePointer || reducedMotion) {
      return;
    }

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let ringX = mouseX;
    let ringY = mouseY;
    let frame = 0;

    const onMove = (event: MouseEvent) => {
      mouseX = event.clientX;
      mouseY = event.clientY;
      setHidden(false);
      const target = event.target as HTMLElement | null;
      setHovering(Boolean(target?.closest("a, button, [data-hover]")));
    };

    const onLeave = () => {
      setHidden(true);
    };

    const loop = () => {
      ringX += (mouseX - ringX) * 0.18;
      ringY += (mouseY - ringY) * 0.18;

      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
      }

      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;
      }

      frame = window.requestAnimationFrame(loop);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);
    loop();

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      <div className={`cursor-dot${hidden ? " is-hidden" : ""}`} ref={dotRef} />
      <div className={`cursor-ring${hidden ? " is-hidden" : ""}${hovering ? " is-hover" : ""}`} ref={ringRef} />
    </>
  );
}
