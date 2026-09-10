import { describe, expect, it } from "vitest";
import { sseDecoder } from "./stream";

describe("desktop streaming", () => {
  it("keeps events intact across every possible byte split", () => {
    const encoded = new TextEncoder().encode(': hb\r\n\r\nevent: init\r\ndata: {"name":"sesión"}\r\n\r\nevent: update\ndata: one\ndata: two\n\n');
    for (let split = 0; split <= encoded.length; split++) {
      const events: string[][] = [];
      const consume = sseDecoder((event, data) => events.push([event, data]));
      const decoder = new TextDecoder();
      consume(decoder.decode(encoded.slice(0, split), { stream: true }));
      consume(decoder.decode(encoded.slice(split), { stream: true }));
      expect(events).toEqual([["init", '{"name":"sesión"}'], ["update", "one\ntwo"]]);
    }
  });
  it("does not apply partial updates before their frame is complete", () => {
    const events: string[][] = [];
    const consume = sseDecoder((event, data) => events.push([event, data]));
    consume('event: replay-reset\ndata: {"feeds":');
    expect(events).toHaveLength(0);
    consume('[]}\n\n');
    expect(events).toEqual([["replay-reset", '{"feeds":[]}']]);
  });
});
