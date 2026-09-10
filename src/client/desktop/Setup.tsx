import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { connectDesktop, isDesktop, saveDesktopKey, type DesktopContext } from "./connection";

const copy = {
  en: {
    intro: "State and Classic. Together.", description: "Your GexBot feeds in one screen, with local recordings and desktop alerts.",
    key: "GexBot API key", connect: "Connect", checking: "Checking your State and Classic access…", loading: "Opening GEX Cockpit…",
    privacy: "Your key is saved in this computer’s credential store and sent only to GexBot. You need your own State and Classic API access.",
    help: "Find your key in your GexBot account", back: "Back to charts", replace: "Update connection", retry: "Try again",
    close: "Keep the app open and your computer awake to record sessions and receive alerts. Closing the window stops both.",
    storage: "Recordings and settings", update: "Check for updates", install: "Install update and restart", current: "You’re up to date.",
    checkingUpdate: "Checking for updates…", unpublished: "No update has been published for this version yet.", downloading: "Downloading update…", available: "Update available:",
    errors: { KEY_REJECTED: "That key wasn’t accepted. Check it and try again.", ACCESS_DENIED: "This key needs State and Classic access for NDX and QQQ.", RATE_LIMITED: "GexBot is limiting requests. Wait a minute and try again.", PROVIDER_UNAVAILABLE: "Couldn’t reach GexBot. Check your connection and try again.", KEYCHAIN_UNAVAILABLE: "Couldn’t access your computer’s credential store. Allow access if your system asks, then try again.", BACKEND_FAILED: "The local data service stopped or couldn’t start. Try reopening the app. Your recordings are still saved.", UPDATE_FAILED: "Couldn’t check or install the update. Try again later, or download it from GitHub." },
  },
  es: {
    intro: "State y Classic. Juntos.", description: "Tus datos de GexBot en una pantalla, con grabaciones locales y alertas de escritorio.",
    key: "Clave API de GexBot", connect: "Conectar", checking: "Comprobando tu acceso a State y Classic…", loading: "Abriendo GEX Cockpit…",
    privacy: "Tu clave se guarda en el almacén de credenciales de este ordenador y solo se envía a GexBot. Necesitas tu propio acceso API a State y Classic.",
    help: "Busca tu clave en tu cuenta de GexBot", back: "Volver a los gráficos", replace: "Cambiar conexión", retry: "Reintentar",
    close: "Mantén la app abierta y el ordenador despierto para grabar sesiones y recibir alertas. Al cerrar la ventana, ambas se detienen.",
    storage: "Grabaciones y ajustes", update: "Buscar actualizaciones", install: "Instalar actualización y reiniciar", current: "Ya tienes la última versión.",
    checkingUpdate: "Buscando actualizaciones…", unpublished: "Todavía no hay una actualización publicada para esta versión.", downloading: "Descargando actualización…", available: "Actualización disponible:",
    errors: { KEY_REJECTED: "No se ha aceptado la clave. Revísala e inténtalo de nuevo.", ACCESS_DENIED: "Esta clave necesita acceso a State y Classic para NDX y QQQ.", RATE_LIMITED: "GexBot está limitando las peticiones. Espera un minuto e inténtalo de nuevo.", PROVIDER_UNAVAILABLE: "No se pudo conectar con GexBot. Revisa tu conexión e inténtalo de nuevo.", KEYCHAIN_UNAVAILABLE: "No se pudo acceder al almacén de credenciales. Permite el acceso si el sistema lo solicita y vuelve a intentarlo.", BACKEND_FAILED: "El servicio de datos se ha detenido o no ha podido iniciarse. Prueba a abrir la app de nuevo. Tus grabaciones siguen guardadas.", UPDATE_FAILED: "No se pudo comprobar o instalar la actualización. Inténtalo más tarde o descárgala de GitHub." },
  },
};

export function DesktopGate({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<"en" | "es">(() => localStorage.getItem("desktop-language") === "es" ? "es" : "en");
  const [context, setContext] = useState<DesktopContext>();
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [update, setUpdate] = useState<{ version?: string; status?: string }>({});
  const t = copy[language];
  const errorText = (code: unknown) => t.errors[String(code) as keyof typeof t.errors] ?? t.errors.BACKEND_FAILED;
  useEffect(() => {
    if (!isDesktop) return;
    void connectDesktop().then(setContext).catch(e => setError(String(e)));
    const edit = () => { setEditing(true); setKey(""); setError(""); };
    window.addEventListener("desktop-settings", edit);
    const off = listen("backend-exited", () => setError("BACKEND_FAILED"));
    const offProvider = listen<string>("provider-error", event => { setEditing(true); setError(event.payload); });
    const external = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest?.("a");
      if (anchor?.href.startsWith("https://")) {
        event.preventDefault();
        void invoke("open_link", { url: anchor.href });
      }
    };
    document.addEventListener("click", external);
    return () => { window.removeEventListener("desktop-settings", edit); document.removeEventListener("click", external); void off.then(unlisten => unlisten()); void offProvider.then(unlisten => unlisten()); };
  }, []);
  if (!isDesktop) return children;
  if (context?.hasKey && !editing && !error) return children;
  const save = async () => {
    if (busy) return;
    setBusy(true); setSaving(true); setError("");
    try { await saveDesktopKey(key.trim()); setKey(""); location.reload(); }
    catch (e) { setError(String(e)); setBusy(false); setSaving(false); }
  };
  const checkUpdate = async () => {
    setBusy(true); setUpdate({ status: t.checkingUpdate });
    try {
      const result = await invoke<{ version?: string; unpublished?: boolean }>("check_update");
      setUpdate(result.version ? { version: result.version } : { status: result.unpublished ? t.unpublished : t.current });
    } catch { setUpdate({ status: t.errors.UPDATE_FAILED }); }
    finally { setBusy(false); }
  };
  const installUpdate = async () => {
    setBusy(true); setUpdate({ status: t.downloading });
    try { await invoke("install_update"); }
    catch { setUpdate({ status: t.errors.UPDATE_FAILED }); setBusy(false); }
  };
  return <div className="flex h-screen w-full items-center justify-center overflow-y-auto bg-[#080a0d] p-6 text-white">
    <div className="my-auto w-full max-w-lg space-y-7 py-8">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold tracking-wide">GEX COCKPIT</span>
        <div className="flex gap-3 text-sm" aria-label="Language / Idioma">
          {(["en", "es"] as const).map(lang => <button key={lang} className={language === lang ? "text-white underline underline-offset-4" : "text-zinc-500"} onClick={() => { setLanguage(lang); localStorage.setItem("desktop-language", lang); }}>{lang === "en" ? "English" : "Español"}</button>)}
        </div>
      </div>
      <div><h1 className="text-3xl font-semibold tracking-tight">{t.intro}</h1><p className="mt-3 text-sm leading-6 text-zinc-400">{t.description}</p></div>
      {!context && !error ? <p role="status">{t.loading}</p> : <form className="space-y-4" onSubmit={e => { e.preventDefault(); void save(); }}>
        <label className="block text-sm" htmlFor="gex-key">{t.key}</label>
        <input id="gex-key" name="gex-key" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={1024} required value={key} disabled={busy} onChange={e => setKey(e.target.value)} placeholder="••••••••••••••••" className="w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-base outline-none focus:border-blue-400" />
        <p className="text-xs leading-5 text-zinc-400">{t.privacy}</p>
        <a className="block text-xs text-blue-300 hover:underline" href="https://www.gexbot.com/" target="_blank" rel="noreferrer">{t.help} ↗</a>
        {error && <p role="alert" className="text-sm leading-5 text-red-300">{errorText(error)}</p>}
        <button type="submit" disabled={busy || !key.trim()} className="w-full rounded-lg bg-blue-300 px-4 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-40">{saving ? t.checking : editing ? t.replace : t.connect}</button>
        {error === "BACKEND_FAILED" || error === "KEYCHAIN_UNAVAILABLE" ? <button type="button" className="text-sm text-blue-300" onClick={() => location.reload()}>{t.retry}</button> : null}
      </form>}
      <p className="text-xs leading-5 text-zinc-500">{t.close}</p>
      {context && <div className="space-y-3 border-t border-zinc-800 pt-5 text-xs text-zinc-400">
        {editing && <p>{t.storage}<br /><span className="block min-w-0 break-all select-text">{context.dataDir}</span></p>}
        <div className="flex items-center justify-between"><span>v{context.version}</span><button disabled={busy} className="text-blue-300 disabled:opacity-40" onClick={() => void checkUpdate()}>{t.update}</button></div>
        {update.status && <p role="status">{update.status}</p>}
        {update.version && <div><p>{t.available} {update.version}</p><button disabled={busy} className="mt-2 text-blue-300 underline" onClick={() => void installUpdate()}>{t.install}</button></div>}
      </div>}
      {editing && context?.hasKey && <button disabled={busy} className="text-sm text-blue-300" onClick={() => { setEditing(false); setError(""); setKey(""); }}>← {t.back}</button>}
    </div>
  </div>;
}
