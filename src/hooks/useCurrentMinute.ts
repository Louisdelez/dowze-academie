import { useEffect, useState } from "react";

const MINUTE_IN_MILLISECONDS = 60_000;

/** Horloge légère qui se recale à la minute et au retour de veille. */
export function useCurrentMinute() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let refreshTimer: number | undefined;
    const refreshAtNextMinute = () => {
      const current = new Date();
      setNow(current);
      const elapsedInMinute = current.getSeconds() * 1_000 + current.getMilliseconds();
      refreshTimer = window.setTimeout(refreshAtNextMinute, MINUTE_IN_MILLISECONDS - elapsedInMinute);
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      refreshAtNextMinute();
    };
    refreshAtNextMinute();
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  return now;
}
