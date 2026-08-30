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
import {
  calculateTecpeyMotionMarkFrame,
  hashTecpeyMotionRoute,
  seededTecpeyMotionUnit,
  TECPEY_MOTION_MARKS,
} from "@/components/brand/tecpey-scroll-motion-field";

type NavigatorWithConnection = Navigator & {
  connection?: {
    saveData?: boolean;
  };
};

const subscribeToHydration = () => () => undefined;
const getHydratedSnapshot = () => true;
const getServerSnapshot = () => false;
const MOTION_FADE_MS = 260;
const MOTION_ROUTE_EXIT_MS = 220;

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
  const renderedPathRef = useRef<string | null>(null);
  const [renderedSource, setRenderedSource] = useState<string | null>(null);
  const [renderedPath, setRenderedPath] = useState<string | null>(null);
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

    const commitSurface = (source: string | null, path: string | null) => {
      renderedSourceRef.current = source;
      renderedPathRef.current = path;
      setRenderedSource(source);
      setRenderedPath(path);
    };

    const revealSurface = (source: string, path: string) => {
      commitSurface(source, path);
      setIsVisible(false);
      enterFrame = window.requestAnimationFrame(() => setIsVisible(true));
    };

    transitionFrame = window.requestAnimationFrame(() => {
      const currentSource = renderedSourceRef.current;

      if (!requestedSource) {
        setIsVisible(false);
        if (currentSource) {
          exitTimer = window.setTimeout(
            () => commitSurface(null, null),
            MOTION_FADE_MS
          );
        }
      } else if (!currentSource) {
        revealSurface(requestedSource, pathname);
      } else if (
        currentSource === requestedSource &&
        renderedPathRef.current === pathname
      ) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
        exitTimer = window.setTimeout(
          () => revealSurface(requestedSource, pathname),
          MOTION_ROUTE_EXIT_MS
        );
      }
    });

    return () => {
      if (transitionFrame) window.cancelAnimationFrame(transitionFrame);
      if (enterFrame) window.cancelAnimationFrame(enterFrame);
      if (exitTimer) window.clearTimeout(exitTimer);
    };
  }, [pathname, requestedSource]);

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
    let videoStartSeeded = false;
    const routeSeed = hashTecpeyMotionRoute(renderedPath || "/");

    const seedPlaybackPhase = () => {
      if (
        videoStartSeeded ||
        reducedMotion.matches ||
        !Number.isFinite(video.duration) ||
        video.duration <= 0
      ) {
        return;
      }

      video.currentTime = seededTecpeyMotionUnit(routeSeed) * video.duration;
      videoStartSeeded = true;
    };

    const syncPlayback = () => {
      const shouldPlay =
        !reducedMotion.matches && !saveData && document.visibilityState === "visible";

      if (shouldPlay) {
        seedPlaybackPhase();
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
          if (!mark) continue;
          mark.style.opacity = "0";
          mark.style.transform = "translate3d(0, 0, 0)";
        }
        return;
      }

      const maximumTravel = Math.min(window.innerHeight * 0.12, 112);
      const offset = Math.min(window.scrollY * 0.055, maximumTravel);
      mediaLayer.style.transform = `translate3d(0, -${offset.toFixed(2)}px, 0)`;

      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      TECPEY_MOTION_MARKS.forEach((mark, index) => {
        const element = markRefs.current[index];
        if (!element) return;
        const frame = calculateTecpeyMotionMarkFrame(mark, {
          scrollY: window.scrollY,
          viewportWidth,
          viewportHeight,
          routeSeed,
        });

        element.style.opacity = frame.opacity.toFixed(3);
        element.style.transform = `translate3d(${frame.x.toFixed(2)}px, ${frame.y.toFixed(2)}px, 0)`;
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
  }, [renderedPath, renderedSource]);

  if (!renderedSource) return null;

  return (
    <div
      className="tecpey-scroll-motion-background"
      data-visible={isVisible ? "true" : "false"}
      aria-hidden="true"
    >
      <div ref={mediaLayerRef} className="tecpey-scroll-motion-background__media">
        <video
          key={`${renderedSource}:${renderedPath}`}
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
        {TECPEY_MOTION_MARKS.map((mark, index) => (
          <span
            key={mark.seed}
            ref={(element) => {
              markRefs.current[index] = element;
            }}
            className="tecpey-scroll-motion-background__mark"
            style={{
              width: mark.size,
              height: mark.size,
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
