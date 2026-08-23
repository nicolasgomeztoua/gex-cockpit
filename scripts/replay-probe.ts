import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseUrl = "http://127.0.0.1:4321";
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--window-size=1920,1080"],
  defaultViewport: { width: 1920, height: 1080 },
});

try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    (window as any).__replayProbe = { updates: 0, statuses: [], resets: [] };
    const stream = new EventSource("/api/stream");
    stream.addEventListener("update", () => (window as any).__replayProbe.updates++);
    stream.addEventListener("replay-status", event => {
      (window as any).__replayProbe.statuses.push(JSON.parse((event as MessageEvent).data));
    });
    stream.addEventListener("replay-reset", event => {
      const payload = JSON.parse((event as MessageEvent).data);
      (window as any).__replayProbe.resets.push({
        clock: payload.replay.clock,
        ndxPoints: payload.spotHistory.NDX.length,
      });
    });
  });
  await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 20_000 });
  await page.waitForSelector('[data-probe="replay-badge"]', { timeout: 10_000 });

  const speed30 = await page.evaluate(() =>
    fetch("/api/replay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "speed", value: 30 }),
    }).then(response => response.json()),
  );
  const startClock = speed30.replay.clock as number;
  await page.screenshot({ path: "/tmp/replay-t0.png" });
  await sleep(8_000);
  await page.screenshot({ path: "/tmp/replay-t8.png" });
  const afterPlay = await page.evaluate(() => ({ ...(window as any).__replayProbe }));

  const paused = await page.evaluate(() =>
    fetch("/api/replay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pause" }),
    }).then(response => response.json()),
  );
  await sleep(500);
  await page.screenshot({ path: "/tmp/replay-paused-a.png" });
  await sleep(3_000);
  await page.screenshot({ path: "/tmp/replay-paused-b.png" });

  const target = paused.replay.endTs - 60;
  const sought = await page.evaluate(targetClock =>
    fetch("/api/replay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "seek", value: targetClock }),
    }).then(response => response.json()), target);
  await sleep(1_000);
  await page.screenshot({ path: "/tmp/replay-near-end.png" });

  const speed5 = await page.evaluate(() =>
    fetch("/api/replay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "speed", value: 5 }),
    }).then(response => response.json()),
  );
  await sleep(300);
  const finalProbe = await page.evaluate(() => ({ ...(window as any).__replayProbe }));
  const reflectedSpeed = finalProbe.statuses.at(-1)?.speed;

  console.log(
    JSON.stringify(
      {
        badge: await page.$eval('[data-probe="replay-badge"]', element => element.textContent?.trim()),
        playback: {
          startClock,
          pauseClock: paused.replay.clock,
          clockAdvanceSec: paused.replay.clock - startClock,
          updateEvents: afterPlay.updates,
          t0Hash: hash("/tmp/replay-t0.png"),
          t8Hash: hash("/tmp/replay-t8.png"),
        },
        pause: {
          playing: paused.replay.playing,
          screenshotAHash: hash("/tmp/replay-paused-a.png"),
          screenshotBHash: hash("/tmp/replay-paused-b.png"),
          identical: hash("/tmp/replay-paused-a.png") === hash("/tmp/replay-paused-b.png"),
        },
        seek: {
          requested: target,
          returnedClock: sought.replay.clock,
          reset: finalProbe.resets.at(-1),
        },
        speed: { response: speed5.replay.speed, reflectedStatusEvent: reflectedSpeed },
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
