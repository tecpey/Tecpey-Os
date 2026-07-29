import { useEffect, useRef, useState } from "react";

export default function useScrollReveal(options?: IntersectionObserverInit) {
  const ref = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        } else {
          setIsVisible(false);
        }
      },
      {
        threshold: 0.2,
        ...options,
      }
    );

    observer.observe(ref.current);

    return () => observer.disconnect();
  }, [options]);

  return { ref, isVisible };
}
