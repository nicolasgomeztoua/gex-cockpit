import { useEffect } from "react";

/** The client only acknowledges delivered alerts. Detection and delivery run on the server. */
export function useLevelAlerts(): void {
  useEffect(() => {
    let stopped = false;
    let busy = false;
    const acknowledge = async () => {
      if (stopped || busy || document.visibilityState !== "visible" || !document.hasFocus()) return;
      busy = true;
      try {
        const response = await fetch("/api/alerts", { signal: AbortSignal.timeout(10_000) });
        if (!response.ok) return;
        const { pending: events } = await response.json() as { pending: { id: number; deliveries: number; acknowledged: number; notify: string }[] };
        const pending = events.filter(e => e.notify === "untilFocus" && e.deliveries > 0 && !e.acknowledged);
        if (stopped || !pending.length || document.visibilityState !== "visible" || !document.hasFocus()) return;
        await fetch("/api/alerts/ack", {
          method: "POST", signal: AbortSignal.timeout(10_000), headers: { "content-type": "application/json" },
          body: JSON.stringify({ through: Math.max(...pending.map(e => e.id)) }),
        });
      } catch { /* A later focus/heartbeat retries acknowledgement. */ }
      finally { busy = false; }
    };
    const onFocus = () => void acknowledge();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const timer = setInterval(onFocus, 3000);
    onFocus();
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);
}
