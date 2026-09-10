import { apiFetch, isDesktop } from "./connection";

/** Incremental SSE decoder: a UTF-8 character or CRLF may straddle network chunks. */
export function sseDecoder(dispatch: (event: string, data: string) => void) {
  let buffer = "";
  return (chunk: string) => {
    buffer += chunk;
    let match: RegExpExecArray | null;
    while ((match = /\r?\n\r?\n/.exec(buffer))) {
      const frame = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      let event = "message";
      const data: string[] = [];
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith("event:")) event = line.slice(6).replace(/^ /, "");
        if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (data.length) dispatch(event, data.join("\n"));
    }
    if (buffer.length > 16 * 1024 * 1024) throw new Error("SSE frame too large");
  };
}

/** EventSource cannot send the private desktop session header. */
export function openEventStream(): EventTarget {
  if (!isDesktop) return new EventSource("/api/stream");
  const events = new EventTarget();
  void (async () => {
    for (;;) {
      const controller = new AbortController();
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      const heartbeat = () => {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => controller.abort(), 30_000);
      };
      try {
        heartbeat();
        const res = await apiFetch("/api/stream", { signal: controller.signal });
        if (!res.ok || !res.body) throw new Error("Stream unavailable");
        events.dispatchEvent(new Event("open"));
        const reader = res.body.getReader();
        const text = new TextDecoder();
        const decode = sseDecoder((event, data) => events.dispatchEvent(new MessageEvent(event, { data })));
        try {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            heartbeat();
            decode(text.decode(chunk.value, { stream: true }));
          }
        } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      } catch { /* A reconnect receives a complete init snapshot, including replay state. */ }
      finally { clearTimeout(watchdog); controller.abort(); }
      events.dispatchEvent(new Event("error"));
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  })();
  return events;
}
