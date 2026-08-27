"use client";

import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { TecpeyMark } from "@/components/brand/TecpeyMark";
import {
  isTecpeyDarkScrollMotionSurface,
  isTecpeyScrollMotionRoute,
  normalizeTecpeyScrollMotionPathname,
} from "@/components/brand/tecpey-scroll-motion-routes";

type NavigatorWithConnection = Navigator & {
  connection?: {
    saveData?: boolean;
  };
};

const subscribeToHydration = () => () => undefined;
const getHydratedSnapshot = () => true;
const getServerSnapshot = () => false;
const MOTION_FADE_MS = 260;

const motionMarks = [
  { left: "7%", top: "16%", size: 30, opacity: 0.16, depth: 0.42 },
  { left: "84%", top: "11%", size: 24, opacity: 0.12, depth: 0.68 },
  { left: "18%", top: "43%", size: 42, opacity: 0.12, depth: 0.86 },
  { left: "73%", top: "35%", size: 32, opacity: 0.14, depth: 0.54 },
  { left: "91%", top: "61%", size: 26, opacity: 0.10, depth: 0.74 },
  { left: "11%", top: "72%", size: 34, opacity: 0.13, depth: 0.62 },
  { left: "58%", top: "78%", size: 22, opacity: 0.10, depth: 0.92 },
  { left: "38%", top: "24%", size: 20, opacity: 0.09, depth: 0.48 },
  { left: "47%", top: "56%", size: 28, opacity: 0.11, depth: 0.78 },
] as const;

export function TecpeyScrollMotionBackground() {
  const pathname = normalizeTecpeyScrollMotionPathname(usePathname() || "/");
  const enabled = isTecpeyScrollMotionRoute(pathname);
  const usesDarkSurface = isTecpeyDarkScrollMotionSurface(pathname);
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerSnapshot
  );
  const { resolvedTheme } = useTheme();
  const mediaLayerRef = useRef<HTMLDivElement>(null);
  const markRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const renderedSourceRef = useRef<string | null>(null);
  const [renderedSource, setRenderedSource] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const videoSource = hydrated && !usesDarkSurface && resolvedTheme === "light"
    ? "/media/tecpey-scroll-motion-light.mp4"
    : hydrated && (usesDarkSurface || resolvedTheme === "dark")
      ? "/media/tecpey-scroll-motion-dark.mp4"
      : null;
  const requestedSource = enabled ? videoSource : null;

  useEffect(() => {
    let transitionFrame = 0;
    let enterFrame = 0;
    let exitTimer = 0;

    const commitSource = (source: string | null) => {
      renderedSourceRef.current = source;
      setRenderedSource(source);
    };

    const revealSource = (source: string) => {
      commitSource(source);
      setIsVisible(false);
      enterFrame = window.requestAnimationFrame(() => setIsVisible(true));
    };

    transitionFrame = window.requestAnimationFrame(() => {
      const currentSource = renderedSourceRef.current;

      if (!requestedSource) {
        setIsVisible(false);
        if (currentSource) {
          exitTimer = window.setTimeout(() => commitSource(null), MOTION_FADE_MS);
        }
      } else if (!currentSource) {
        revealSource(requestedSource);
      } else if (currentSource === requestedSource) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
        exitTimer = window.setTimeout(() => revealSource(requestedSource), MOTION_FADE_MS);
      }
    });

    return () => {
      if (transitionFrame) window.cancelAnimationFrame(transitionFrame);
      if (enterFrame) window.cancelAnimationFrame(enterFrame);
      if (exitTimer) window.clearTimeout(exitTimer);
    };
  }, [requestedSource]);

  useEffect(() => {
    if (!renderedSource) return;

    document.body.classList.add("tecpey-motion-route");
    return () => document.body.classList.remove("tecpey-motion-route");
  }, [renderedSource]);

  useEffect(() => {
    if (!renderedSource) return;

    const mediaLayer = mediaLayerRef.current;
    const video = videoRef.current;
    if (!mediaLayer || !video) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const saveData = (navigator as NavigatorWithConnection).connection?.saveData === true;
    let animationFrame = 0;

    const syncPlayback = () => {
      const shouldPlay =
        !reducedMotion.matches && !saveData && document.visibilityState === "visible";

      if (shouldPlay) {
        void video.play().catch(() => undefined);
        return;
      }

      video.pause();
      if (reducedMotion.matches && video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        video.currentTime = 0;
      }
    };

    const updatePosition = () => {
      animationFrame = 0;

      if (reducedMotion.matches) {
        mediaLayer.style.transform = "translate3d(0, 0, 0)";
        for (const mark of markRefs.current) {
          if (mark) mark.style.transform = "translate3d(0, 0, 0)";
        }
        return;
      }

      const maximumTravel = Math.min(window.innerHeight * 0.12, 112);
      const offset = Math.min(window.scrollY * 0.055, maximumTravel);
      mediaLayer.style.transform = `translate3d(0, -${offset.toFixed(2)}px, 0)`;
      motionMarks.forEach((mark, index) => {
        const element = markRefs.current[index];
        if (!element) return;
        const markOffset = offset * mark.depth;
        element.style.transform = `translate3d(0, -${markOffset.toFixed(2)}px, 0)`;
      });
    };

    const schedulePositionUpdate = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(updatePosition);
    };

    const handleMotionPreference = () => {
      syncPlayback();
      schedulePositionUpdate();
    };

    updatePosition();
    syncPlayback();

    window.addEventListener("scroll", schedulePositionUpdate, { passive: true });
    window.addEventListener("resize", schedulePositionUpdate, { passive: true });
    document.addEventListener("visibilitychange", syncPlayback);
    video.addEventListener("loadedmetadata", syncPlayback);
    reducedMotion.addEventListener("change", handleMotionPreference);

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", schedulePositionUpdate);
      window.removeEventListener("resize", schedulePositionUpdate);
      document.removeEventListener("visibilitychange", syncPlayback);
      video.removeEventListener("loadedmetadata", syncPlayback);
      reducedMotion.removeEventListener("change", handleMotionPreference);
      video.pause();
    };
  }, [renderedSource]);

  if (!renderedSource) return null;

  return (
    <div
      className="tecpey-scroll-motion-background"
      data-visible={isVisible ? "true" : "false"}
      aria-hidden="true"
    >
      <div ref={mediaLayerRef} className="tecpey-scroll-motion-background__media">
        <video
          key={renderedSource}
          ref={videoRef}
          className="tecpey-scroll-motion-background__video"
          src={renderedSource}
          muted
          loop
          playsInline
          preload="metadata"
          disablePictureInPicture
          disableRemotePlayback
        />
      </div>
      <div className="tecpey-scroll-motion-background__marks">
        {motionMarks.map((mark, index) => (
          <span
            key={`${mark.left}-${mark.top}`}
            ref={(element) => {
              markRefs.current[index] = element;
            }}
            className="tecpey-scroll-motion-background__mark"
            style={{
              left: mark.left,
              top: mark.top,
              width: mark.size,
              height: mark.size,
              opacity: mark.opacity,
            }}
          >
            <TecpeyMark alt="" width={mark.size} height={mark.size} />
          </span>
        ))}
      </div>
      <div className="tecpey-scroll-motion-background__wash" />
    </div>
  );
}
