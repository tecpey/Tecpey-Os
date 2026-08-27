"use client";

import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";
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

export function TecpeyScrollMotionBackground() {
  const pathname = normalizeTecpeyScrollMotionPathname(usePathname() || "/");
  const enabled = isTecpeyScrollMotionRoute(pathname);
  const usesDarkSurface = isTecpeyDarkScrollMotionSurface(pathname);
  const { resolvedTheme } = useTheme();
  const mediaLayerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoSource = !usesDarkSurface && resolvedTheme === "light"
    ? "/media/tecpey-scroll-motion-light.mp4"
    : usesDarkSurface || resolvedTheme === "dark"
      ? "/media/tecpey-scroll-motion-dark.mp4"
      : null;

  useEffect(() => {
    if (!enabled || !videoSource) return;

    document.body.classList.add("tecpey-motion-route");
    return () => document.body.classList.remove("tecpey-motion-route");
  }, [enabled, videoSource]);

  useEffect(() => {
    if (!enabled || !videoSource) return;

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
        return;
      }

      const maximumTravel = Math.min(window.innerHeight * 0.12, 112);
      const offset = Math.min(window.scrollY * 0.055, maximumTravel);
      mediaLayer.style.transform = `translate3d(0, -${offset.toFixed(2)}px, 0)`;
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
  }, [enabled, videoSource]);

  if (!enabled || !videoSource) return null;

  return (
    <div className="tecpey-scroll-motion-background" aria-hidden="true">
      <div ref={mediaLayerRef} className="tecpey-scroll-motion-background__media">
        <video
          key={videoSource}
          ref={videoRef}
          className="tecpey-scroll-motion-background__video"
          src={videoSource}
          muted
          loop
          playsInline
          preload="metadata"
          disablePictureInPicture
          disableRemotePlayback
        />
      </div>
      <div className="tecpey-scroll-motion-background__wash" />
    </div>
  );
}
