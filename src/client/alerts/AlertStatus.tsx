import { useEffect, useState } from "react";
import { useSettingsStore } from "../stores/settingsStore";

export function AlertStatus() {
  const saveStatus = useSettingsStore(s => s.saveStatus);
  const [status, setStatus] = useState("Checking alert backend…");
  const [testResult, setTestResult] = useState("");
  useEffect(() => {
    let stopped = false;
    const update = async () => {
      try {
        const response = await fetch("/api/alerts", { signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error();
        const data = await response.json();
        const failed = data.pending.some((e: { acknowledged: number; error: string | null }) => !e.acknowledged && e.error);
        if (!stopped) setStatus(data.delivery === "unsupported" ? "Desktop delivery unavailable on this server."
          : !data.monitoring ? "Live alerts paused in synthetic / startup replay mode."
          : !data.enabled ? "Alerts are switched off."
          : !data.selected ? "Choose levels using the bell icons in settings."
          : failed ? "Notification delivery failed — backend is retrying."
          : !data.fresh ? "Waiting for fresh live prices."
          : "Backend is watching live prices.");
      } catch { if (!stopped) setStatus("Alert backend unreachable."); }
    };
    void update();
    const timer = setInterval(() => void update(), 3000);
    return () => { stopped = true; clearInterval(timer); };
  }, []);
  const test = async () => {
    setTestResult("Sending…");
    try {
      const response = await fetch("/api/alerts/test", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error();
      setTestResult("Sent to macOS. Check for a banner and sound.");
    } catch { setTestResult("Test failed — check the backend and macOS permissions."); }
  };
  return <div className="space-y-1 px-1.5 py-1 text-[11px] text-muted-foreground" role="status">
    <div>{saveStatus === "saved" ? "Settings saved on backend." : saveStatus === "saving" ? "Saving settings…"
      : saveStatus === "loading" ? "Loading saved settings…" : "Settings not confirmed saved — retrying."}</div>
    <div>{status}</div>
    <button className="cursor-pointer underline" onClick={() => void test()}>Test desktop alert</button>
    {testResult && <div>{testResult}</div>}
  </div>;
}
