"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canonSourceCount, catalogNames, entries, sourceCount, totalRuntime, type WatchEntry } from "./data";
import { episodeMetadata } from "./episode-metadata";
import { episodeMetadataOverrides, metadataKey, metadataOverrides, normalizeGenres } from "./metadata-overrides";
import { achievementData, divisionFor, franchiseFor, infinityStones, orderEntries, permanentSearchText, presetMatches, themes, upcomingProjects, yearFor, type EditEvent, type Profile, type ThemeId, type UpcomingProject, type WatchOrder } from "./catalog";
import { deleteCloudArchive, observeAuth, readCloudArchive, signInWithGoogle, signOutGoogle, writeCloudArchive, type AuthUser, type CloudArchive } from "./firebase";

type View = "archive" | "history" | "analytics" | "timeline" | "settings";
type Filter = "all" | "movie" | "episode" | "special" | "short" | "remaining" | "favorites";
type Scope = "completionist" | "official";

const STORAGE_KEY = "hall-of-justice-archives-progress-v1";
// Bump when the resolver changes so inaccurate cached records are discarded.
const DETAILS_KEY = "hall-of-justice-archives-details-v1";
const HISTORY_KEY = "hall-of-justice-archives-history-v1";
const SPOILER_KEY = "hall-of-justice-archives-hide-spoilers";
const HIDE_WATCHED_KEY = "hall-of-justice-archives-hide-watched";
const PROFILES_KEY = "hall-of-justice-archives-profiles-v1";
const ACTIVE_PROFILE_KEY = "hall-of-justice-archives-active-profile-v1";
const APP_VERSION = "2.0.0";
const METADATA_VERSION = "2026.07.21.2";
const CATALOG_VERSION = "HOJ-CURATED-2026.07.21-2";
const ACHIEVEMENTS_SEEN_KEY = "hall-of-justice-archives-achievements-seen-v1";
type CloudStatus = "local" | "connecting" | "syncing" | "synced" | "offline" | "error";
type ArchiveBackup = {
  version: number; appVersion: string; catalogVersion: string; exportedAt: string;
  activeProfileId: string; profiles: Profile[];
  preferences?: { hideSpoilers?: boolean; hideWatched?: boolean };
  achievementsSeen?: Record<string, string[]>;
};
const posterCache = new Map<string, string | null>();
type MediaDetails = { episodeTitle?: string; releaseDate?: string; genres?: string[]; cast?: string[]; description?: string };
const detailsCache = new Map<string, MediaDetails>();
const titleColors = [
  ["#6f1520", "#151c2a"], ["#283b59", "#111827"], ["#6f4c20", "#15120d"],
  ["#293f36", "#0d1714"], ["#42305f", "#110f1b"], ["#4d2732", "#151015"],
];

function normalizeProfiles(value: unknown): Profile[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Profile => !!item && typeof item === "object" && typeof (item as Profile).id === "string").map((profile) => ({
    ...profile,
    completed: Array.isArray(profile.completed) ? profile.completed : [],
    history: Array.isArray(profile.history) ? profile.history : [],
    edits: Array.isArray(profile.edits) ? profile.edits : [],
    ratings: profile.ratings || {},
    favorites: Array.isArray(profile.favorites) ? profile.favorites : [],
    notes: profile.notes || {},
    theme: profile.theme || "justice",
    passport: profile.passport || {},
  }));
}

function backupFingerprint(backup: Pick<ArchiveBackup, "activeProfileId" | "profiles" | "preferences" | "achievementsSeen">) {
  return JSON.stringify({
    activeProfileId: backup.activeProfileId,
    profiles: backup.profiles.map((profile) => ({ ...profile, updatedAt: "" })),
    preferences: backup.preferences || {},
    achievementsSeen: backup.achievementsSeen || {},
  });
}

function uniqueBy<T>(items: T[], key: (item: T) => string) {
  return [...new Map(items.map((item) => [key(item), item])).values()];
}

function mergeProfile(local: Profile, cloud: Profile): Profile {
  const localWins = (local.updatedAt || "") >= (cloud.updatedAt || "");
  const newest = localWins ? local : cloud;
  return {
    ...newest,
    completed: [...new Set([...(local.completed || []), ...(cloud.completed || [])])],
    history: uniqueBy([...(local.history || []), ...(cloud.history || [])], (event) => `${event.id}|${event.at}`).sort((a, b) => a.at.localeCompare(b.at)),
    edits: uniqueBy([...(local.edits || []), ...(cloud.edits || [])], (event) => `${event.id}|${event.field}|${event.at}`).sort((a, b) => a.at.localeCompare(b.at)).slice(-500),
    createdAt: [local.createdAt, cloud.createdAt].filter(Boolean).sort()[0] || newest.createdAt,
    updatedAt: [local.updatedAt, cloud.updatedAt].filter(Boolean).sort().at(-1) || newest.updatedAt,
  };
}

function mergeBackups(local: ArchiveBackup, cloud: ArchiveBackup): ArchiveBackup {
  const byId = new Map(local.profiles.map((profile) => [profile.id, profile]));
  cloud.profiles.forEach((profile) => {
    const existing = byId.get(profile.id);
    byId.set(profile.id, existing ? mergeProfile(existing, profile) : profile);
  });
  const profiles = [...byId.values()];
  const localWins = local.exportedAt >= cloud.exportedAt;
  const newest = localWins ? local : cloud;
  const preferredActive = newest.activeProfileId;
  return {
    ...newest,
    version: 4,
    appVersion: APP_VERSION,
    catalogVersion: CATALOG_VERSION,
    exportedAt: new Date().toISOString(),
    profiles,
    activeProfileId: profiles.some((profile) => profile.id === preferredActive) ? preferredActive : profiles[0]?.id || "default",
    achievementsSeen: { ...(cloud.achievementsSeen || {}), ...(local.achievementsSeen || {}) },
  };
}

function hasMeaningfulProgress(backup: ArchiveBackup) {
  if (backup.profiles.length > 1) return true;
  const profile = backup.profiles[0];
  if (!profile) return false;
  return profile.completed.length > 0 || profile.history.length > 0 || profile.favorites.length > 0
    || Object.keys(profile.ratings).length > 0 || Object.values(profile.notes).some(Boolean)
    || profile.order !== "release" || profile.scope !== "official" || (profile.theme || "justice") !== "justice";
}

function firebaseMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code) : "";
  if (code.includes("popup-closed")) return "Google sign-in was closed before it finished.";
  if (code.includes("popup-blocked")) return "The browser blocked Google sign-in. Allow pop-ups and try again.";
  if (code.includes("permission-denied")) return "Firestore denied access. Publish the supplied security rules, then try again.";
  if (code.includes("network-request-failed") || code.includes("unavailable")) return "Cloud sync is temporarily offline. Your local progress is safe.";
  return error instanceof Error ? error.message : "Cloud sync could not be completed.";
}

function formatTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function posterStyle(title: string) {
  const hash = [...title].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const [a, b] = titleColors[hash % titleColors.length];
  return { background: `radial-gradient(circle at 68% 28%, ${a} 0, transparent 38%), linear-gradient(145deg, ${b}, #05070b 78%)` };
}

function trailerUrl(title: string) {
  if (metadataOverrides[title]?.trailer) return metadataOverrides[title].trailer!;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} official trailer DC`)}`;
}

function withOverride(entry: WatchEntry, details: MediaDetails): MediaDetails {
  const override = episodeMetadataOverrides[metadataKey(entry.collection, entry.season, entry.episode)] || metadataOverrides[entry.collection] || {};
  return { ...details, episodeTitle: override.title || details.episodeTitle, releaseDate: override.releaseDate || details.releaseDate, genres: normalizeGenres(override.genres || details.genres), cast: override.cast || details.cast, description: override.description || details.description };
}

function cleanMarkup(value?: string | null) {
  if (!value) return undefined;
  const document = new DOMParser().parseFromString(value, "text/html");
  return document.body.textContent?.trim() || undefined;
}

function miniSynopsis(value?: string, limit = 680) {
  if (!value) return undefined;
  const cleaned = value.replace(/\[\d+\]/g, "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= limit) return cleaned;
  const excerpt = cleaned.slice(0, limit + 1);
  const sentenceEnd = Math.max(excerpt.lastIndexOf(". "), excerpt.lastIndexOf("! "), excerpt.lastIndexOf("? "));
  return `${excerpt.slice(0, sentenceEnd > limit * .55 ? sentenceEnd + 1 : limit).trim()}…`;
}

function displayDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, "0"); const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function watchedTimestamp(date: string) { return `${date}T12:00:00`; }
function displayWatchedDate(value: string) { return new Date(value.length === 10 ? watchedTimestamp(value) : value).toLocaleDateString(); }

async function wikidataLabels(ids: string[]) {
  if (!ids.length) return [];
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join("|")}&props=labels&languages=en&format=json&origin=*`;
  const data = await fetch(url).then((response) => response.json());
  return ids.map((id) => data.entities?.[id]?.labels?.en?.value).filter(Boolean);
}

async function resolveWikipediaTitle(entry: WatchEntry) {
  const query = encodeURIComponent(`"${entry.collection}" DC ${entry.kind === "movie" ? "film" : "television series"}`);
  const data = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${query}&srlimit=8&format=json&origin=*`).then((response) => response.json());
  const target = entry.collection.toLowerCase();
  const results = (data.query?.search || []) as Array<{ title: string; snippet?: string }>;
  const score = (result: { title: string; snippet?: string }) => {
    const title = result.title.toLowerCase(); const snippet = cleanMarkup(result.snippet)?.toLowerCase() || "";
    let points = title === target ? 12 : title.startsWith(`${target} (`) ? 15 : title.includes(target) ? 5 : 0;
    if (/\bfilm\b/.test(title)) points += 7;
    if (/marvel|cinematic universe|superhero/.test(snippet)) points += 5;
    if (/soundtrack|character|armor|comic|disambiguation|video game/.test(title)) points -= 25;
    return points;
  };
  return results.sort((a, b) => score(b) - score(a))[0]?.title || entry.collection;
}

async function fetchPlotSynopsis(pageTitle: string, fallback?: string) {
  try {
    const sectionsData = await fetch(`https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(pageTitle)}&prop=sections&format=json&origin=*`).then((response) => response.json());
    const sections = (sectionsData.parse?.sections || []) as Array<{ index: string; line: string }>;
    const section = sections.find((item) => /^(plot|premise|synopsis|summary)$/i.test(cleanMarkup(item.line) || ""));
    if (!section) return miniSynopsis(fallback);
    const plotData = await fetch(`https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(pageTitle)}&section=${section.index}&prop=text&format=json&origin=*`).then((response) => response.json());
    const html = plotData.parse?.text?.["*"];
    if (!html) return miniSynopsis(fallback);
    const document = new DOMParser().parseFromString(html, "text/html");
    const paragraphs = [...document.querySelectorAll("p")].map((paragraph) => paragraph.textContent?.trim()).filter(Boolean).slice(0, 3).join(" ");
    return miniSynopsis(paragraphs || fallback);
  } catch { return miniSynopsis(fallback); }
}

async function fetchFilmDetails(entry: WatchEntry): Promise<MediaDetails> {
  const pageTitle = await resolveWikipediaTitle(entry);
  const summary = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`).then((response) => response.json());
  const description = await fetchPlotSynopsis(pageTitle, summary.extract);
  const itemId = summary.wikibase_item;
  if (!itemId) return withOverride(entry, { description });
  const entityData = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${itemId}.json`).then((response) => response.json());
  const claims = entityData.entities?.[itemId]?.claims || {};
  const ids = (property: string, limit: number) => (claims[property] || []).map((claim: { mainsnak?: { datavalue?: { value?: { id?: string } } } }) => claim.mainsnak?.datavalue?.value?.id).filter(Boolean).slice(0, limit);
  const releaseDate = claims.P577?.[0]?.mainsnak?.datavalue?.value?.time?.replace(/^\+/, "").slice(0, 10);
  const [genres, cast] = await Promise.all([wikidataLabels(ids("P136", 3)), wikidataLabels(ids("P161", 3))]);
  return withOverride(entry, { releaseDate, genres, cast, description });
}

async function fetchEpisodeDetails(entry: WatchEntry): Promise<MediaDetails> {
  const details = episodeMetadata[metadataKey(entry.collection, entry.season, entry.episode)] || {};
  return withOverride(entry, { ...details, description: miniSynopsis(details.description) });
}

function useMediaDetails(entry?: WatchEntry) {
  const [details, setDetails] = useState<MediaDetails | undefined>(() => entry ? detailsCache.get(entry.id) : undefined);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!entry) return;
    let active = true;
    const saved = (() => { try { return JSON.parse(localStorage.getItem(DETAILS_KEY) || "{}")[entry.id] as MediaDetails | undefined; } catch { return undefined; } })();
    const cached = detailsCache.get(entry.id) || saved;
    if (cached) {
      // Saved metadata may predate a hand-reviewed correction. Always reapply
      // the current override before rendering instead of trusting it verbatim.
      const corrected = withOverride(entry, cached);
      detailsCache.set(entry.id, corrected);
      try { const all = JSON.parse(localStorage.getItem(DETAILS_KEY) || "{}"); all[entry.id] = corrected; localStorage.setItem(DETAILS_KEY, JSON.stringify(all)); } catch { /* cache is optional */ }
      queueMicrotask(() => active && setDetails(corrected));
      return () => { active = false; };
    }
    queueMicrotask(() => active && setLoading(true));
    (entry.kind === "episode" ? fetchEpisodeDetails(entry) : fetchFilmDetails(entry)).then((result) => {
      detailsCache.set(entry.id, result);
      try { const all = JSON.parse(localStorage.getItem(DETAILS_KEY) || "{}"); all[entry.id] = result; localStorage.setItem(DETAILS_KEY, JSON.stringify(all)); } catch { /* cache is optional */ }
      if (active) setDetails(result);
    }).catch(() => { if (active) setDetails(withOverride(entry, {})); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [entry]);
  return { details, loading };
}

function PosterArt({ title, hero = false }: { title: string; hero?: boolean }) {
  const [src, setSrc] = useState<string | null | undefined>(() => posterCache.get(title));
  useEffect(() => {
    let active = true;
    if (posterCache.has(title)) return () => { active = false; };
    const likelySeries = entries.some((entry) => entry.collection === title && entry.kind === "episode");
    const candidates = [title, `${title} (${likelySeries ? "TV series" : "film"})`, `${title} (DC)`];
    (async () => {
      for (const candidate of candidates) {
        try {
          const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(candidate)}`);
          if (!response.ok) continue;
          const data = await response.json();
          const image = data.originalimage?.source || data.thumbnail?.source;
          if (image) { posterCache.set(title, image); if (active) setSrc(image); return; }
        } catch { /* use the designed fallback */ }
      }
      posterCache.set(title, null); if (active) setSrc(null);
    })();
    return () => { active = false; };
  }, [title]);
  if (hero) return src ? <img className="hero-art" src={src} alt="" /> : null;
  return <span className={`mini-poster ${src ? "has-art" : ""}`} style={src ? undefined : posterStyle(title)}>
    {src ? <img src={src} alt={`${title} poster artwork`} loading="lazy" /> : <b>{title.split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}</b>}
  </span>;
}

function Icon({ name }: { name: "check" | "search" | "chevron" | "download" | "upload" | "menu" | "play" }) {
  const paths = {
    check: <path d="m5 12 4 4L19 6" />,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    download: <><path d="M12 3v12m0 0 5-5m-5 5-5-5" /><path d="M5 20h14" /></>,
    upload: <><path d="M12 16V4m0 0 5 5m-5-5L7 9" /><path d="M5 20h14" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    play: <><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4Z" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function ProgressRing({ value }: { value: number }) {
  return <div className="progress-ring" style={{ "--progress": `${value * 3.6}deg` } as React.CSSProperties}><div><strong>{Math.round(value)}%</strong><span>complete</span></div></div>;
}

function DetailDrawer({ entry, completed, hideSpoilers, rating, favorite, note, watchedDates, onClose, onToggle, onRating, onFavorite, onNote, onWatchedDate, onAddRewatch }: { entry?: WatchEntry; completed: boolean; hideSpoilers: boolean; rating: number; favorite: boolean; note: string; watchedDates: string[]; onClose: () => void; onToggle: () => void; onRating: (value: number) => void; onFavorite: () => void; onNote: (value: string) => void; onWatchedDate: (value: string) => void; onAddRewatch: (value: string) => void }) {
  const { details, loading } = useMediaDetails(entry);
  useEffect(() => {
    if (!entry) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.body.classList.add("drawer-open"); document.addEventListener("keydown", close);
    return () => { document.body.classList.remove("drawer-open"); document.removeEventListener("keydown", close); };
  }, [entry, onClose]);
  if (!entry) return null;
  const concealed = hideSpoilers && !completed;
  const watchedDate = watchedDates[0]?.slice(0, 10) || "";
  return <div className="drawer-backdrop" onMouseDown={onClose} role="presentation">
    <aside className="detail-drawer" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${entry.title} details`}>
      <button className="drawer-close" onClick={onClose} aria-label="Close details">×</button>
      <div className="drawer-art" style={posterStyle(entry.collection)}><PosterArt title={entry.collection} hero /></div>
      <div className="drawer-content">
        <p className="eyebrow">{entry.phase} · {entry.kind}</p>
        <h2>{entry.title}</h2>
        {details?.episodeTitle && <h3>{concealed ? "Episode title hidden" : `“${details.episodeTitle}”`}</h3>}
        <p className="drawer-meta">{entry.detail} · {displayDate(details?.releaseDate) || "Release date unavailable"} · {entry.runtime} min</p>
        {!!details?.genres?.length && !concealed && <p className="genre-row">{details.genres.join(" · ")}</p>}
        <div className={`drawer-description ${concealed ? "concealed" : ""}`}>{loading ? "Retrieving archive details…" : concealed ? "Episode description hidden until you complete it." : details?.description || "Detailed information is not available for this entry yet."}</div>
        {!!details?.cast?.length && !concealed && <p className="cast-row"><span>Starring</span>{details.cast.join(" · ")}</p>}
        <section className="personal-record"><div><span>Your rating</span><div className="stars" aria-label="Your rating">{[1,2,3,4,5].map((star) => <button key={star} className={star <= rating ? "active" : ""} onClick={() => onRating(star === rating ? 0 : star)} aria-label={star === rating ? "Clear rating" : `${star} stars`}>★</button>)}{rating > 0 && <button className="clear-rating" onClick={() => onRating(0)}>Clear</button>}</div></div><button className={favorite ? "favorite active" : "favorite"} onClick={onFavorite}>{favorite ? "♥ Favorite" : "♡ Add favorite"}</button><label className="watched-date"><span>Original watch date</span><input type="date" max={localDateKey()} value={watchedDate} onChange={(event) => onWatchedDate(event.target.value)} /><small>{watchedDate ? "The first viewing is preserved when rewatches are added." : "Selecting a date also marks this entry complete."}</small></label>{completed && <div className="rewatch-control"><span>{watchedDates.length} total viewing{watchedDates.length === 1 ? "" : "s"}</span><input id="rewatch-date" type="date" max={localDateKey()} defaultValue={localDateKey()} /><button onClick={() => { const input = document.getElementById("rewatch-date") as HTMLInputElement | null; if (input?.value) onAddRewatch(input.value); }}>Record rewatch</button><small>{watchedDates.map(displayWatchedDate).join(" · ")}</small></div>}<label><span>Private notes</span><textarea value={note} onChange={(event) => onNote(event.target.value)} placeholder="Add thoughts, callbacks, or rewatch notes…" /></label><small>Saved locally, included in backups, and synced privately when Google Sync is enabled.</small></section>
        <div className="drawer-actions"><button className={completed ? "drawer-complete done" : "drawer-complete"} onClick={onToggle}><Icon name="check" />{completed ? "Completed" : "Mark complete"}</button><a href={trailerUrl(entry.collection)} target="_blank" rel="noreferrer"><Icon name="play" />Official trailer</a></div>
      </div>
    </aside>
  </div>;
}

function UpcomingDrawer({ project, onClose }: { project?: UpcomingProject; onClose: () => void }) {
  useEffect(() => { if (!project) return; const close = (event: KeyboardEvent) => event.key === "Escape" && onClose(); document.body.classList.add("drawer-open"); document.addEventListener("keydown", close); return () => { document.body.classList.remove("drawer-open"); document.removeEventListener("keydown", close); }; }, [project, onClose]);
  if (!project) return null;
  return <div className="drawer-backdrop" onMouseDown={onClose} role="presentation"><aside className="detail-drawer" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${project.title} preview`}><button className="drawer-close" onClick={onClose} aria-label="Close details">×</button><div className="drawer-art" style={posterStyle(project.title)}><PosterArt title={project.title} hero /></div><div className="drawer-content"><p className="eyebrow">On the horizon · {project.type}</p><h2>{project.title}</h2><p className="drawer-meta">{displayDate(project.date)} · Upcoming theatrical release</p><p className="genre-row">{project.genres.join(" · ")}</p><div className="drawer-description">{project.description}</div><p className="cast-row"><span>Starring</span>{project.cast.join(" · ")}</p><div className="release-lock">Completion unlocks on release day</div><div className="drawer-actions"><a href={project.trailer} target="_blank" rel="noreferrer"><Icon name="play" />Official trailer</a></div></div></aside></div>;
}

function EpisodeRow({ item, completed, onOpen, onToggle }: { item: WatchEntry; completed: boolean; onOpen: () => void; onToggle: () => void }) {
  const { details } = useMediaDetails(item);
  return <div className={`episode-row ${completed ? "done" : ""}`}>
    <button className="episode-check" onClick={onToggle} aria-label={completed ? `Mark ${item.detail} incomplete` : `Complete ${item.detail}`}><span><Icon name="check" /></span></button>
    <button className="episode-details" onClick={onOpen}><b>{item.detail}{details?.episodeTitle ? ` · ${details.episodeTitle}` : ""}</b><small>{details?.releaseDate ? displayDate(details.releaseDate) : `${item.runtime} min`}</small></button>
  </div>;
}

export default function Home() {
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [view, setView] = useState<View>("archive");
  const [filter, setFilter] = useState<Filter>("all");
  const [scope, setScope] = useState<Scope>("official");
  const [query, setQuery] = useState("");
  const [openCollections, setOpenCollections] = useState<Set<string>>(new Set());
  const [mobileNav, setMobileNav] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<WatchEntry>();
  const [selectedUpcoming, setSelectedUpcoming] = useState<UpcomingProject>();
  const [hideSpoilers, setHideSpoilers] = useState(true);
  const [hideWatched, setHideWatched] = useState(false);
  const [heroExpanded, setHeroExpanded] = useState(false);
  const [toast, setToast] = useState<{ message: string; ids: string[]; wasComplete: boolean; previous?: string[] }>();
  const [history, setHistory] = useState<Array<{ id: string; at: string }>>([]);
  const [edits, setEdits] = useState<EditEvent[]>([]);
  const [theme, setTheme] = useState<ThemeId>("justice");
  const [calendarMonth, setCalendarMonth] = useState(localDateKey().slice(0, 7));
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState("default");
  const [watchOrder, setWatchOrder] = useState<WatchOrder>("release");
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [phaseFilter, setPhaseFilter] = useState<string>("DCEU");
  const [franchiseFilter, setFranchiseFilter] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [preset, setPreset] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [bulkWatchDate, setBulkWatchDate] = useState("");
  const [achievementToast, setAchievementToast] = useState<{ name: string; description: string; icon: string }>();
  const [installPrompt, setInstallPrompt] = useState<(Event & { prompt: () => Promise<void> }) | null>(null);
  const [today, setToday] = useState<Date>();
  const [cloudUser, setCloudUser] = useState<AuthUser | null>(null);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>("local");
  const [cloudMessage, setCloudMessage] = useState("Sign in to sync this archive across your devices.");
  const [lastCloudSync, setLastCloudSync] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const skipInitialProfileSave = useRef(true);
  const archiveSnapshotRef = useRef<ArchiveBackup | undefined>(undefined);
  const lastSyncedFingerprint = useRef("");
  const closeDetails = useCallback(() => setSelectedEntry(undefined), []);

  useEffect(() => {
    queueMicrotask(() => {
      let savedProfiles: Profile[] = [];
      try { savedProfiles = JSON.parse(localStorage.getItem(PROFILES_KEY) || "[]"); } catch { savedProfiles = []; }
      if (!savedProfiles.length) {
        let legacyCompleted: string[] = []; let legacyHistory: Array<{ id: string; at: string }> = [];
        try { legacyCompleted = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { /* migrate empty */ }
        try { legacyHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { /* migrate empty */ }
        const now = new Date().toISOString();
        savedProfiles = [{ id: "default", name: "My Hall of Justice Archive", order: "release", scope: "official", completed: legacyCompleted, history: legacyHistory, ratings: {}, favorites: [], notes: {}, createdAt: now, updatedAt: now }];
      }
      const preferred = localStorage.getItem(ACTIVE_PROFILE_KEY) || savedProfiles[0].id;
      const active = savedProfiles.find((profile) => profile.id === preferred) || savedProfiles[0];
      savedProfiles = normalizeProfiles(savedProfiles);
      setProfiles(savedProfiles); setActiveProfileId(active.id); setCompleted(new Set(active.completed)); setHistory(active.history || []); setEdits(active.edits || []); setTheme(active.theme || "justice"); setWatchOrder(active.order); setScope(active.scope); setRatings(active.ratings || {}); setFavorites(new Set(active.favorites || [])); setNotes(active.notes || {});
      setHideSpoilers(localStorage.getItem(SPOILER_KEY) !== "false");
      setHideWatched(localStorage.getItem(HIDE_WATCHED_KEY) === "true");
      setToday(new Date());
      setBulkWatchDate(localDateKey());
      setHydrated(true);
    });
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    if (skipInitialProfileSave.current) {
      skipInitialProfileSave.current = false;
      localStorage.setItem(ACTIVE_PROFILE_KEY, activeProfileId);
      return;
    }
    const now = new Date().toISOString();
    queueMicrotask(() => setProfiles((current) => {
      const next = current.map((profile) => profile.id === activeProfileId ? { ...profile, order: watchOrder, scope, completed: [...completed], history, edits, theme, ratings, favorites: [...favorites], notes, updatedAt: now } : profile);
      localStorage.setItem(PROFILES_KEY, JSON.stringify(next)); return next;
    }));
    localStorage.setItem(ACTIVE_PROFILE_KEY, activeProfileId);
  }, [activeProfileId, completed, edits, favorites, history, hydrated, notes, ratings, scope, theme, watchOrder]);
  useEffect(() => { if (hydrated) localStorage.setItem(SPOILER_KEY, String(hideSpoilers)); }, [hideSpoilers, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem(HIDE_WATCHED_KEY, String(hideWatched)); }, [hideWatched, hydrated]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(undefined), 4500); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(() => undefined);
    const capture = (event: Event) => { event.preventDefault(); setInstallPrompt(event as Event & { prompt: () => Promise<void> }); };
    window.addEventListener("beforeinstallprompt", capture); return () => window.removeEventListener("beforeinstallprompt", capture);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    return observeAuth((user) => {
      setCloudUser(user);
      if (!user) {
        setCloudStatus("local");
        setCloudMessage("Sign in to sync this archive across your devices.");
        lastSyncedFingerprint.current = "";
        return;
      }
      void reconcileCloud(user);
    });
  // Authentication is registered once after local state has hydrated. Current
  // archive data is read through archiveSnapshotRef inside the callback.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);
  useEffect(() => {
    if (!hydrated || !cloudUser || cloudStatus !== "synced") return;
    const backup = makeBackup();
    const fingerprint = backupFingerprint(backup);
    if (fingerprint === lastSyncedFingerprint.current) return;
    const timer = window.setTimeout(() => void syncNow(true), 1400);
    return () => window.clearTimeout(timer);
  // The complete local record is debounced into one Firestore write.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfileId, cloudStatus, cloudUser, completed, edits, favorites, hideSpoilers, hideWatched, history, hydrated, notes, profiles, ratings, scope, theme, watchOrder]);
  useEffect(() => {
    const online = () => { if (cloudUser) void syncNow(); };
    const offline = () => { if (cloudUser) { setCloudStatus("offline"); setCloudMessage("You’re offline. Local progress is safe and will sync when you reconnect."); } };
    window.addEventListener("online", online); window.addEventListener("offline", offline);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  // Network recovery reads current values through archiveSnapshotRef.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudUser]);

  const scopedEntries = useMemo(() => orderEntries((scope === "official" ? entries.filter((e) => e.continuity === "core") : entries).filter((e) => e.phase === phaseFilter), watchOrder), [scope, watchOrder, phaseFilter]);
  const scopedComplete = scopedEntries.filter((e) => completed.has(e.id)).length;
  const percentage = scopedEntries.length ? (scopedComplete / scopedEntries.length) * 100 : 0;
  const nextEntry = scopedEntries.find((e) => !completed.has(e.id)) || scopedEntries[0];
  useEffect(() => { queueMicrotask(() => setHeroExpanded(false)); }, [nextEntry?.id]);
  const { details: nextDetails, loading: detailsLoading } = useMediaDetails(nextEntry);
  const heroConcealed = hideSpoilers && nextEntry?.kind === "episode" && !completed.has(nextEntry.id);
  const remainingRuntime = scopedEntries.filter((e) => !completed.has(e.id)).reduce((sum, e) => sum + e.runtime, 0);

  const filtered = useMemo(() => scopedEntries.filter((entry) => {
    if (hideWatched && completed.has(entry.id)) return false;
    if (filter === "remaining" && completed.has(entry.id)) return false;
    if (filter === "favorites" && !favorites.has(entry.id)) return false;
    if (!["all", "remaining"].includes(filter) && entry.kind !== filter) return false;
    if (franchiseFilter && franchiseFor(entry) !== franchiseFilter) return false;
    if (divisionFilter && divisionFor(entry) !== divisionFilter) return false;
    if (yearFilter && String(yearFor(entry)) !== yearFilter) return false;
    if (!presetMatches(entry, preset)) return false;
    const episode = episodeMetadata[metadataKey(entry.collection, entry.season, entry.episode)] || {};
    const haystack = [entry.title, entry.collection, entry.detail, entry.phase, entry.kind, entry.format, franchiseFor(entry), divisionFor(entry), notes[entry.id], episode.episodeTitle, episode.description, ...(episode.cast || []), permanentSearchText(entry)].join(" ");
    return haystack.toLowerCase().includes(query.trim().toLowerCase());
  }), [scopedEntries, filter, query, completed, favorites, hideWatched, notes, franchiseFilter, divisionFilter, yearFilter, preset]);

  const collections = useMemo(() => {
    const groups = new Map<string, WatchEntry[]>();
    filtered.forEach((entry) => groups.set(entry.collection, [...(groups.get(entry.collection) || []), entry]));
    return [...groups.entries()];
  }, [filtered]);

  function currentProfilesSnapshot() {
    return profiles.map((profile) => profile.id === activeProfileId ? {
      ...profile,
      order: watchOrder,
      scope,
      completed: [...completed],
      history,
      edits,
      theme,
      ratings,
      favorites: [...favorites],
      notes,
    } : profile);
  }

  function makeBackup(): ArchiveBackup {
    let achievementsSeen: Record<string, string[]> = {};
    try { achievementsSeen = JSON.parse(localStorage.getItem(ACHIEVEMENTS_SEEN_KEY) || "{}"); } catch { /* optional history */ }
    return {
      version: 4,
      appVersion: APP_VERSION,
      catalogVersion: CATALOG_VERSION,
      exportedAt: new Date().toISOString(),
      activeProfileId,
      profiles: currentProfilesSnapshot(),
      preferences: { hideSpoilers, hideWatched },
      achievementsSeen,
    };
  }

  archiveSnapshotRef.current = hydrated ? makeBackup() : undefined;

  function cloudAsBackup(cloud: CloudArchive): ArchiveBackup | null {
    const cloudProfiles = normalizeProfiles(cloud.profiles);
    if (!cloudProfiles.length) return null;
    return {
      version: cloud.schemaVersion || 4,
      appVersion: cloud.appVersion || APP_VERSION,
      catalogVersion: cloud.catalogVersion || CATALOG_VERSION,
      exportedAt: cloud.updatedAt,
      activeProfileId: cloudProfiles.some((profile) => profile.id === cloud.activeProfileId) ? cloud.activeProfileId : cloudProfiles[0].id,
      profiles: cloudProfiles,
      preferences: cloud.preferences,
      achievementsSeen: cloud.achievementsSeen,
    };
  }

  function applyBackup(backup: ArchiveBackup) {
    const restoredProfiles = normalizeProfiles(backup.profiles);
    if (!restoredProfiles.length) throw new Error("The archive backup does not contain any profiles.");
    const active = restoredProfiles.find((profile) => profile.id === backup.activeProfileId) || restoredProfiles[0];
    localStorage.setItem(PROFILES_KEY, JSON.stringify(restoredProfiles));
    localStorage.setItem(ACTIVE_PROFILE_KEY, active.id);
    if (backup.achievementsSeen) localStorage.setItem(ACHIEVEMENTS_SEEN_KEY, JSON.stringify(backup.achievementsSeen));
    const nextHideSpoilers = backup.preferences?.hideSpoilers ?? hideSpoilers;
    const nextHideWatched = backup.preferences?.hideWatched ?? hideWatched;
    localStorage.setItem(SPOILER_KEY, String(nextHideSpoilers));
    localStorage.setItem(HIDE_WATCHED_KEY, String(nextHideWatched));
    setProfiles(restoredProfiles); setActiveProfileId(active.id); setCompleted(new Set(active.completed)); setHistory(active.history || []); setEdits(active.edits || []); setTheme(active.theme || "justice"); setWatchOrder(active.order); setScope(active.scope); setRatings(active.ratings || {}); setFavorites(new Set(active.favorites || [])); setNotes(active.notes || {}); setHideSpoilers(nextHideSpoilers); setHideWatched(nextHideWatched);
  }

  async function uploadCloudBackup(user: AuthUser, backup = makeBackup(), automatic = false) {
    try {
      setCloudStatus("syncing");
      setCloudMessage(automatic ? "Saving your latest changes…" : "Syncing this device’s archive…");
      const updatedAt = new Date().toISOString();
      await writeCloudArchive(user.uid, {
        schemaVersion: backup.version,
        archiveId: "hall-of-justice",
        appVersion: APP_VERSION,
        catalogVersion: CATALOG_VERSION,
        updatedAt,
        activeProfileId: backup.activeProfileId,
        profiles: backup.profiles,
        preferences: backup.preferences,
        achievementsSeen: backup.achievementsSeen,
      });
      lastSyncedFingerprint.current = backupFingerprint(backup);
      setLastCloudSync(updatedAt);
      setCloudStatus("synced");
      setCloudMessage("Cloud archive is up to date.");
    } catch (error) {
      setCloudStatus("error");
      setCloudMessage(firebaseMessage(error));
    }
  }

  async function reconcileCloud(user: AuthUser) {
    try {
      setCloudStatus("connecting");
      setCloudMessage("Comparing local and cloud archives…");
      const local = archiveSnapshotRef.current;
      if (!local) return;
      const cloud = await readCloudArchive(user.uid);
      const remote = cloud ? cloudAsBackup(cloud) : null;
      if (!cloud || !remote) {
        await uploadCloudBackup(user, local);
        return;
      }
      const localFingerprint = backupFingerprint(local);
      const remoteFingerprint = backupFingerprint(remote);
      if (localFingerprint === remoteFingerprint) {
        lastSyncedFingerprint.current = localFingerprint;
        setLastCloudSync(cloud.updatedAt);
        setCloudStatus("synced");
        setCloudMessage("Cloud archive is up to date.");
        return;
      }
      if (!hasMeaningfulProgress(local)) {
        applyBackup(remote);
        lastSyncedFingerprint.current = remoteFingerprint;
        setLastCloudSync(cloud.updatedAt);
        setCloudStatus("synced");
        setCloudMessage("Cloud progress restored to this device.");
        return;
      }
      const merge = confirm("Cloud profiles were found for this Google account.\n\nChoose OK to safely merge them with the profiles on this device. Choose Cancel for replacement options.");
      let selected: ArchiveBackup;
      if (merge) selected = mergeBackups(local, remote);
      else {
        const useCloud = confirm("Choose OK to replace this device with the cloud archive.\n\nChoose Cancel to keep this device's archive and replace the cloud copy. Exporting a manual backup first is always available in Settings.");
        selected = useCloud ? remote : { ...local, exportedAt: new Date().toISOString() };
      }
      applyBackup(selected);
      await uploadCloudBackup(user, selected);
    } catch (error) {
      setCloudStatus("error");
      setCloudMessage(firebaseMessage(error));
    }
  }

  async function syncNow(automatic = false) {
    if (!cloudUser || !archiveSnapshotRef.current) return;
    if (!navigator.onLine) { setCloudStatus("offline"); setCloudMessage("You’re offline. Local progress is safe and will sync when you reconnect."); return; }
    try {
      setCloudStatus("syncing"); setCloudMessage(automatic ? "Saving your latest changes…" : "Syncing local and cloud profiles…");
      const local = archiveSnapshotRef.current;
      const cloud = await readCloudArchive(cloudUser.uid);
      const remote = cloud ? cloudAsBackup(cloud) : null;
      const next = remote ? mergeBackups(local, remote) : { ...local, exportedAt: new Date().toISOString() };
      applyBackup(next);
      await uploadCloudBackup(cloudUser, next, automatic);
    } catch (error) { setCloudStatus("error"); setCloudMessage(firebaseMessage(error)); }
  }

  async function beginGoogleSignIn() {
    try { setCloudStatus("connecting"); setCloudMessage("Opening Google sign-in…"); await signInWithGoogle(); }
    catch (error) { setCloudStatus("error"); setCloudMessage(firebaseMessage(error)); }
  }

  async function removeCloudArchive() {
    if (!cloudUser || !confirm("Permanently delete the Hall of Justice Archives profiles stored in this Google account? The profiles currently saved on this device will remain local.")) return;
    try { await deleteCloudArchive(cloudUser.uid); await signOutGoogle(); setCloudStatus("local"); setCloudMessage("Cloud archive deleted. This device remains local-only."); }
    catch { alert("The cloud archive could not be deleted. Please try again while online."); }
  }

  function loadProfile(profile: Profile) {
    setActiveProfileId(profile.id); setCompleted(new Set(profile.completed)); setHistory(profile.history || []); setEdits(profile.edits || []); setTheme(profile.theme || "justice"); setWatchOrder(profile.order); setScope(profile.scope); setRatings(profile.ratings || {}); setFavorites(new Set(profile.favorites || [])); setNotes(profile.notes || {}); setView("archive");
  }
  function createProfile() {
    const name = prompt("Name this watch-through", `Watch-through ${profiles.length + 1}`)?.trim(); if (!name) return;
    const now = new Date().toISOString(); const profile: Profile = { id: `profile-${Date.now()}`, name, order: watchOrder, scope, completed: [], history: [], edits: [], theme, ratings: {}, favorites: [], notes: {}, passport: {}, createdAt: now, updatedAt: now };
    setProfiles((current) => [...current, profile]); loadProfile(profile);
  }
  function deleteProfile(id: string) {
    if (profiles.length === 1) return alert("Keep at least one watch-through profile.");
    if (!confirm("Delete this watch-through and all of its local progress?")) return;
    const next = profiles.filter((profile) => profile.id !== id); setProfiles(next); if (id === activeProfileId) loadProfile(next[0]);
  }

  function toggleEntry(id: string, label = "Item") {
    const wasComplete = completed.has(id);
    setCompleted((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    setHistory((current) => wasComplete ? current.filter((event) => event.id !== id) : [...current, { id, at: watchedTimestamp(localDateKey()) }]);
    setToast({ message: `${label} marked ${wasComplete ? "incomplete" : "complete"}`, ids: [id], wasComplete });
  }
  function completeCollection(items: WatchEntry[]) {
    const allDone = items.every((item) => completed.has(item.id));
    setCompleted((current) => { const next = new Set(current); items.forEach((item) => allDone ? next.delete(item.id) : next.add(item.id)); return next; });
    const now = watchedTimestamp(localDateKey()); setHistory((current) => allDone ? current.filter((event) => !items.some((item) => item.id === event.id)) : [...current, ...items.filter((item) => !current.some((event) => event.id === item.id)).map((item) => ({ id: item.id, at: now }))]);
    setToast({ message: `${items[0].collection} marked ${allDone ? "incomplete" : "complete"}`, ids: items.map((item) => item.id), wasComplete: allDone });
  }
  function setScopedCompletion(makeComplete: boolean, date = bulkWatchDate || localDateKey()) {
    const ids = scopedEntries.map((item) => item.id);
    const previous = ids.filter((id) => completed.has(id));
    setCompleted((current) => {
      const next = new Set(current);
      ids.forEach((id) => makeComplete ? next.add(id) : next.delete(id));
      return next;
    });
    const now = watchedTimestamp(date);
    setHistory((current) => makeComplete
      ? [...current, ...ids.filter((id) => !current.some((event) => event.id === id)).map((id) => ({ id, at: now }))]
      : current.filter((event) => !ids.includes(event.id)));
    setToast({ message: `${makeComplete ? "Selected" : "Deselected"} all ${scope === "official" ? "Canon" : "Expanded Archive"} items`, ids, wasComplete: !makeComplete, previous });
  }
  function setEntryWatchedDate(id: string, date: string) {
    if (!date) {
      setCompleted((current) => { const next = new Set(current); next.delete(id); return next; });
      setHistory((current) => current.filter((event) => event.id !== id));
      return;
    }
    setCompleted((current) => new Set(current).add(id));
    setHistory((current) => {
      const itemDates = current.filter((event) => event.id === id).sort((a, b) => a.at.localeCompare(b.at));
      const first = itemDates[0];
      return first ? current.map((event) => event === first ? { id, at: watchedTimestamp(date) } : event) : [...current, { id, at: watchedTimestamp(date) }];
    });
    recordEdit(id, "watched-date");
  }
  function addRewatch(id: string, date: string) {
    setCompleted((current) => new Set(current).add(id));
    setHistory((current) => [...current, { id, at: watchedTimestamp(date) }]);
    recordEdit(id, "watched-date");
    setToast({ message: "Rewatch added to viewing history", ids: [], wasComplete: true });
  }
  function recordEdit(id: string, field: EditEvent["field"]) {
    setEdits((current) => [...current, { id, field, at: new Date().toISOString() }].slice(-500));
  }
  function undoToast() {
    if (!toast) return;
    setCompleted((current) => {
      const next = new Set(current);
      if (toast.previous) {
        toast.ids.forEach((id) => next.delete(id));
        toast.previous.forEach((id) => next.add(id));
      } else toast.ids.forEach((id) => toast.wasComplete ? next.add(id) : next.delete(id));
      return next;
    });
    setHistory((current) => {
      if (toast.previous) {
        const now = new Date().toISOString();
        return [...current.filter((event) => !toast.ids.includes(event.id)), ...toast.previous.map((id) => ({ id, at: now }))];
      }
      return toast.wasComplete ? [...current, ...toast.ids.map((id) => ({ id, at: new Date().toISOString() }))] : current.filter((event) => !toast.ids.includes(event.id));
    });
    setToast(undefined);
  }
  function exportProgress() {
    const blob = new Blob([JSON.stringify(makeBackup(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "hall-of-justice-archives-progress.json"; link.click(); URL.revokeObjectURL(url);
  }
  async function importProgress(file?: File) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (Array.isArray(data.profiles)) applyBackup(data as ArchiveBackup);
      else if (Array.isArray(data.completed)) setCompleted(new Set(data.completed));
      else throw new Error();
    } catch { alert("That file is not a valid Hall of Justice Archives backup."); }
  }

  async function shareProgress() {
    const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 630; const ctx = canvas.getContext("2d"); if (!ctx) return;
    const gradient = ctx.createLinearGradient(0, 0, 1200, 630); gradient.addColorStop(0, "#060a10"); gradient.addColorStop(1, "#182331"); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1200, 630);
    ctx.strokeStyle = "#c6a45e"; ctx.lineWidth = 3; ctx.strokeRect(32, 32, 1136, 566);
    try { const logo = new Image(); logo.src = "./hall-of-justice-logo.svg"; await new Promise<void>((resolve, reject) => { logo.onload = () => resolve(); logo.onerror = () => reject(); }); ctx.drawImage(logo, 76, 62, 430, 114); } catch { ctx.fillStyle = "#d8b95d"; ctx.font = "600 34px sans-serif"; ctx.fillText("HALL OF JUSTICE ARCHIVES", 80, 105); }
    ctx.fillStyle = "#f3efe7"; ctx.font = "700 96px sans-serif"; ctx.fillText(`${Math.round(percentage)}% COMPLETE`, 80, 265); ctx.font = "500 35px sans-serif"; ctx.fillStyle = "#aeb7c4"; ctx.fillText(`${scopedComplete} of ${scopedEntries.length} entries · ${formatTime(watchedRuntime)} watched`, 84, 330);
    infinityStones.forEach((stone, index) => { const earned = phaseStats.find((phase) => phase.phase === stone.phase)?.percent === 100; const x = 110 + index * 118; const y = 418; ctx.beginPath(); for (let point = 0; point < 6; point++) { const angle = Math.PI / 3 * point - Math.PI / 2; const px = x + Math.cos(angle) * 35; const py = y + Math.sin(angle) * 35; if (point) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.closePath(); ctx.fillStyle = earned ? stone.color : "#202a35"; ctx.globalAlpha = earned ? 1 : .55; ctx.fill(); ctx.strokeStyle = earned ? "#f4e3b2" : "#52606f"; ctx.stroke(); ctx.globalAlpha = 1; ctx.fillStyle = earned ? "#d9dde3" : "#687483"; ctx.font = "500 14px sans-serif"; ctx.textAlign = "center"; ctx.fillText(`P${index + 1}`, x, 475); }); ctx.textAlign = "left";
    ctx.fillStyle = "#d8b95d"; ctx.font = "600 24px sans-serif"; ctx.fillText(profiles.find((profile) => profile.id === activeProfileId)?.name.toUpperCase() || "MY WATCH-THROUGH", 84, 535); ctx.fillStyle = "#7e8997"; ctx.font = "20px sans-serif"; ctx.fillText(`${watchOrder === "release" ? "Release order" : "Chronological order"} · ${infinityStones.filter((stone) => phaseStats.find((phase) => phase.phase === stone.phase)?.percent === 100).length}/6 era records secured`, 84, 568);
    const link = document.createElement("a"); link.download = "hall-of-justice-archives-progress.png"; link.href = canvas.toDataURL("image/png"); link.click();
  }

  function downloadPassport() {
    const canvas = document.createElement("canvas"); canvas.width = 1400; canvas.height = 1800; const ctx = canvas.getContext("2d"); if (!ctx) return;
    const gradient = ctx.createLinearGradient(0, 0, 1400, 1800); gradient.addColorStop(0, "#05080d"); gradient.addColorStop(1, "#18232d"); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1400, 1800);
    ctx.strokeStyle = "#c6a45e"; ctx.lineWidth = 5; ctx.strokeRect(55, 55, 1290, 1690); ctx.fillStyle = "#d8b95d"; ctx.font = "700 48px sans-serif"; ctx.fillText("HALL OF JUSTICE ARCHIVES", 110, 145); ctx.fillStyle = "#f3efe7"; ctx.font = "700 92px sans-serif"; ctx.fillText("ARCHIVE PASSPORT", 110, 275);
    ctx.font = "600 42px sans-serif"; ctx.fillStyle = "#d8b95d"; ctx.fillText(currentProfile?.name || "Hall of Justice Archive", 110, 370); ctx.fillStyle = "#f3efe7"; ctx.font = "700 150px sans-serif"; ctx.fillText(`${Math.round(percentage)}%`, 110, 570); ctx.font = "34px sans-serif"; ctx.fillStyle = "#aeb7c4"; ctx.fillText(`${scopedComplete} / ${scopedEntries.length} entries · ${history.length} total viewings · ${history.length - new Set(history.map((event) => event.id)).size} rewatches`, 115, 635);
    ctx.fillStyle = "#d8b95d"; ctx.font = "700 35px sans-serif"; ctx.fillText("COMPLETED ERA SEALS", 110, 760); phaseStats.forEach((stat, index) => { const x = 135 + (index % 3) * 410; const y = 865 + Math.floor(index / 3) * 175; ctx.beginPath(); ctx.arc(x, y, 55, 0, Math.PI * 2); ctx.fillStyle = stat.percent === 100 ? infinityStones.find((stone) => stone.phase === stat.phase)?.color || "#c6a45e" : "#26303b"; ctx.fill(); ctx.fillStyle = stat.percent === 100 ? "#f3efe7" : "#697584"; ctx.font = "600 22px sans-serif"; ctx.fillText(stat.phase, x + 75, y - 5); ctx.font = "22px sans-serif"; ctx.fillText(`${Math.round(stat.percent)}% · ${stat.done}/${stat.total}`, x + 75, y + 30); });
    const first = history.slice().sort((a,b) => a.at.localeCompare(b.at))[0]?.at; const latest = history.slice().sort((a,b) => b.at.localeCompare(a.at))[0]?.at;
    ctx.fillStyle = "#d8b95d"; ctx.font = "700 35px sans-serif"; ctx.fillText("VIEWING RECORD", 110, 1290); ctx.fillStyle = "#d6d9de"; ctx.font = "30px sans-serif"; [
      `First watch: ${first ? displayWatchedDate(first) : "—"}`, `Latest watch: ${latest ? displayWatchedDate(latest) : "—"}`, `Favorites: ${favorites.size}`, `Average rating: ${averageRating ? averageRating.toFixed(1) : "—"}`, `Viewing time: ${formatTime(history.reduce((sum, event) => sum + (entries.find((item) => item.id === event.id)?.runtime || 0), 0))}`
    ].forEach((line, index) => ctx.fillText(line, 120, 1370 + index * 62));
    ctx.fillStyle = "#788493"; ctx.font = "22px sans-serif"; ctx.fillText(`Catalog ${CATALOG_VERSION} · Generated ${new Date().toLocaleDateString()}`, 110, 1690);
    const link = document.createElement("a"); link.download = "hall-of-justice-archives-passport.png"; link.href = canvas.toDataURL("image/png"); link.click();
  }

  function downloadEraRecap(phase: string) {
    const phaseItems = scopedEntries.filter((entry) => entry.phase === phase); const watched = history.filter((event) => phaseItems.some((entry) => entry.id === event.id));
    const favoriteTitles = phaseItems.filter((entry) => favorites.has(entry.id)).map((entry) => entry.title); const highest = phaseItems.filter((entry) => ratings[entry.id]).sort((a,b) => ratings[b.id] - ratings[a.id])[0];
    const text = [`${phase} — Hall of Justice Archives Recap`, "", `Completed: ${phaseItems.filter((entry) => completed.has(entry.id)).length}/${phaseItems.length}`, `Viewing time: ${formatTime(watched.reduce((sum, event) => sum + (entries.find((entry) => entry.id === event.id)?.runtime || 0), 0))}`, `First watch: ${watched.sort((a,b) => a.at.localeCompare(b.at))[0] ? displayWatchedDate(watched[0].at) : "—"}`, `Latest watch: ${watched.sort((a,b) => b.at.localeCompare(a.at))[0] ? displayWatchedDate(watched[0].at) : "—"}`, `Rewatches: ${watched.length - new Set(watched.map((event) => event.id)).size}`, `Favorites: ${favoriteTitles.join(", ") || "—"}`, `Highest rated: ${highest ? `${highest.title} (${ratings[highest.id]}/5)` : "—"}`, `Collectible: ${infinityStones.find((stone) => stone.phase === phase)?.name || "Era seal"}`].join("\n");
    const blob = new Blob([text], { type: "text/plain" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${phase.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-recap.txt`; link.click(); URL.revokeObjectURL(url);
  }

  const phaseStats = [...new Set(entries.map((entry) => entry.phase))].map((phase) => {
    const phaseEntries = scopedEntries.filter((e) => e.phase === phase); const done = phaseEntries.filter((e) => completed.has(e.id)).length;
    return { phase, total: phaseEntries.length, done, percent: phaseEntries.length ? done / phaseEntries.length * 100 : 0 };
  });
  const watchedRuntime = scopedEntries.filter((entry) => completed.has(entry.id)).reduce((sum, entry) => sum + entry.runtime, 0);
  const completedMovies = scopedEntries.filter((entry) => entry.kind === "movie" && completed.has(entry.id)).length;
  const completedEpisodes = scopedEntries.filter((entry) => entry.kind === "episode" && completed.has(entry.id)).length;
  const recentEntries = history.slice().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5).map((event) => ({ ...event, entry: entries.find((item) => item.id === event.id) })).filter((item) => item.entry);
  const recentEdits = edits.slice().sort((a,b) => b.at.localeCompare(a.at)).slice(0, 8).map((event) => ({ ...event, entry: entries.find((item) => item.id === event.id) })).filter((item) => item.entry);
  const calendarDays = useMemo(() => { const map = new Map<string, Array<{ id: string; at: string }>>(); history.filter((event) => event.at.startsWith(calendarMonth)).forEach((event) => { const day = event.at.slice(0,10); map.set(day, [...(map.get(day) || []), event]); }); return map; }, [calendarMonth, history]);
  const activeDays = new Set(history.map((event) => event.at.slice(0, 10)));
  let streak = 0; const cursor = today ? new Date(today) : undefined;
  while (cursor && activeDays.has(localDateKey(cursor))) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
  const estimatedFinish = today ? new Date(today.valueOf() + Math.ceil(remainingRuntime / 120) * 86400000) : undefined;
  const nextQueue = scopedEntries.filter((entry) => !completed.has(entry.id)).slice(0, 8);
  const franchises = [...new Set(entries.map(franchiseFor))].sort();
  const divisions = [...new Set(entries.map(divisionFor))].sort();
  const years = [...new Set(entries.map(yearFor))].sort((a, b) => a - b);
  const achievements = achievementData(scopedEntries, completed);
  const unlockedSignature = achievements.filter((item) => item.unlocked).map((item) => item.name).join("|");
  const rated = Object.entries(ratings).filter(([id, value]) => value > 0 && scopedEntries.some((entry) => entry.id === id));
  const averageRating = rated.length ? rated.reduce((sum, [, value]) => sum + value, 0) / rated.length : 0;
  const currentProfile = profiles.find((profile) => profile.id === activeProfileId);
  useEffect(() => {
    if (!hydrated || !activeProfileId) return;
    let seenByProfile: Record<string, string[]> = {}; try { seenByProfile = JSON.parse(localStorage.getItem(ACHIEVEMENTS_SEEN_KEY) || "{}"); } catch { /* start fresh */ }
    const unlocked = achievements.filter((item) => item.unlocked); const seen = seenByProfile[activeProfileId];
    if (!seen) { seenByProfile[activeProfileId] = unlocked.map((item) => item.name); localStorage.setItem(ACHIEVEMENTS_SEEN_KEY, JSON.stringify(seenByProfile)); return; }
    const newlyUnlocked = unlocked.find((item) => !seen.includes(item.name));
    if (newlyUnlocked) { seenByProfile[activeProfileId] = [...seen, newlyUnlocked.name]; localStorage.setItem(ACHIEVEMENTS_SEEN_KEY, JSON.stringify(seenByProfile)); queueMicrotask(() => setAchievementToast(newlyUnlocked)); }
  // The stable signature changes only when an achievement crosses its threshold.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfileId, hydrated, unlockedSignature]);
  useEffect(() => { if (!achievementToast) return; const timer = window.setTimeout(() => setAchievementToast(undefined), 6000); return () => window.clearTimeout(timer); }, [achievementToast]);

  return <main data-theme={theme}>
    <header className="topbar">
      <button className="mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="Open navigation"><Icon name="menu" /></button>
      <button className="brand" onClick={() => setView("archive")} aria-label="Hall of Justice Archives home"><img src="./hall-of-justice-logo.svg" alt="Hall of Justice Archives" /></button>
      <nav className={mobileNav ? "open" : ""}>
        <button className={view === "archive" ? "active" : ""} onClick={() => { setView("archive"); setMobileNav(false); }}>Archive</button>
        <button className={view === "history" ? "active" : ""} onClick={() => { setView("history"); setMobileNav(false); }}>History</button>
        <button className={view === "timeline" ? "active" : ""} onClick={() => { setView("timeline"); setMobileNav(false); }}>Journey</button>
        <button className={view === "analytics" ? "active" : ""} onClick={() => { setView("analytics"); setMobileNav(false); }}>Analytics</button>
        <button className={view === "settings" ? "active" : ""} onClick={() => { setView("settings"); setMobileNav(false); }}>Settings</button>
      </nav>
      <div className="header-tools">
        <select className="profile-picker" value={activeProfileId} onChange={(event) => { const profile = profiles.find((item) => item.id === event.target.value); if (profile) loadProfile(profile); }} aria-label="Watch-through profile">{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select>
        {installPrompt && <button onClick={async () => { await installPrompt.prompt(); setInstallPrompt(null); }} title="Install app"><Icon name="download" /><span>Install</span></button>}
        <button onClick={exportProgress} title="Export progress"><Icon name="download" /><span>Backup</span></button>
        <button onClick={() => importRef.current?.click()} title="Import progress"><Icon name="upload" /><span>Restore</span></button>
        <input ref={importRef} type="file" accept="application/json" hidden onChange={(e) => importProgress(e.target.files?.[0])} />
      </div>
    </header>

    {view === "archive" && <>
      <section className="hero" style={posterStyle(nextEntry?.title || "Archive")}>
        {nextEntry && <PosterArt key={nextEntry.id} title={nextEntry.collection} hero />}
        <div className="hero-noise" />
        <div className="hero-content">
          <p className="eyebrow">Next in {watchOrder === "release" ? "release order" : "chronological order"}</p>
          <h1>{heroConcealed ? "Unwatched archive entry" : nextEntry?.title}</h1>
          {nextDetails?.episodeTitle && <h2 className="episode-title">{heroConcealed ? "Title concealed" : `“${nextDetails.episodeTitle}”`}</h2>}
          <p className="hero-meta">{nextEntry?.detail} <i /> {nextDetails?.releaseDate ? displayDate(nextDetails.releaseDate) : nextEntry?.kind} <i /> {nextEntry?.runtime} min</p>
          {!!nextDetails?.genres?.length && <p className="genre-row">{nextDetails.genres.join(" · ")}</p>}
          <p className={`hero-copy ${heroExpanded ? "expanded" : ""} ${detailsLoading ? "loading-copy" : ""}`}>{detailsLoading ? "Retrieving archive details…" : heroConcealed ? "Episode description hidden until you complete it." : nextDetails?.description || "Detailed information is not available for this archive entry yet."}</p>
          {!detailsLoading && !heroConcealed && (nextDetails?.description?.length || 0) > 220 && <button className="read-more" onClick={() => setHeroExpanded(!heroExpanded)}>{heroExpanded ? "Show less" : "Read more"}</button>}
          {!!nextDetails?.cast?.length && !heroConcealed && <p className="cast-row"><span>Starring</span>{nextDetails.cast.join(" · ")}</p>}
          <div className="hero-actions">
            <button className="primary" onClick={() => nextEntry && toggleEntry(nextEntry.id, nextEntry.episode ? `${nextEntry.title} ${nextEntry.detail}` : nextEntry.title)}><span className="button-check"><Icon name="check" /></span>{nextEntry && completed.has(nextEntry.id) ? "Completed" : "Mark complete"}</button>
            <button className="secondary" onClick={() => setSelectedEntry(nextEntry)}>View details <Icon name="chevron" /></button>
            {nextEntry && <a className="trailer-action" href={trailerUrl(nextEntry.collection)} target="_blank" rel="noreferrer"><Icon name="play" />Official trailer</a>}
          </div>
        </div>
        <ProgressRing value={percentage} />
      </section>

      <section className="stat-strip">
        <article><span className="stat-icon"><Icon name="check" /></span><div><strong>{scopedComplete}</strong><small>Completed</small></div></article>
        <article><span className="stat-icon lines">≡</span><div><strong>{scopedEntries.length - scopedComplete}</strong><small>Remaining</small></div></article>
        <article><span className="stat-icon clock">◷</span><div><strong>{Math.round(remainingRuntime / 60)}h</strong><small>Estimated time</small></div></article>
        <article className="scope-stat"><div><strong>{scope === "official" ? canonSourceCount : sourceCount}</strong><small>{scope === "official" ? "Curated titles" : "Expanded titles"}</small></div><span>{scopedEntries.length} trackable items</span></article>
      </section>

      <section className="next-up-shell"><div className="section-title"><div><p className="eyebrow">Up next</p><h2>Your queue</h2></div><span>{currentProfile?.name} · {watchOrder === "release" ? "Release order" : "Chronological order"}</span></div><div className="next-queue">{nextQueue.map((item, index) => <article key={item.id}><button className="queue-open" onClick={() => setSelectedEntry(item)}><span>{String(index + 1).padStart(2, "0")}</span><PosterArt title={item.collection} /><div><small>{item.detail}</small><strong>{item.title}</strong></div></button><button className="queue-check" onClick={() => toggleEntry(item.id, item.title)} aria-label={`Complete ${item.title}`}><Icon name="check" /></button></article>)}</div></section>

      <section className="upcoming-shell"><div className="section-title"><div><p className="eyebrow">On the horizon</p><h2>Upcoming releases</h2></div><span>Future titles stay separate until release</span></div><div className="upcoming-grid">{upcomingProjects.map((project) => { const days = today ? Math.ceil((new Date(`${project.date}T12:00:00`).valueOf() - today.valueOf()) / 86400000) : 0; return <article key={project.title}><button className="upcoming-main" onClick={() => setSelectedUpcoming(project)}><PosterArt title={project.title} /><span><small>{project.type} · {displayDate(project.date)}</small><strong>{project.title}</strong><em>{days > 0 ? `${days} days` : "Released — awaiting archive update"}</em><b>View details →</b></span></button><a href={project.trailer} target="_blank" rel="noreferrer" aria-label={`Watch the ${project.title} trailer`}><Icon name="play" />Trailer</a></article>; })}</div></section>

      <section className="catalog-wing-shell" aria-label="Choose a DC catalog">
        <div className="section-title"><div><p className="eyebrow">Hall wings</p><h2>Choose your archive</h2></div><span>Each universe keeps its own completion total</span></div>
        <div className="catalog-wing-tabs">{catalogNames.map((name) => {
          const wingEntries = entries.filter((entry) => entry.phase === name && (scope === "completionist" || entry.continuity === "core"));
          const wingDone = wingEntries.filter((entry) => completed.has(entry.id)).length;
          return <button key={name} className={phaseFilter === name ? "active" : ""} onClick={() => { setPhaseFilter(name); setQuery(""); setFilter("all"); }}><strong>{name}</strong><span>{wingDone} / {wingEntries.length} complete</span></button>;
        })}</div>
      </section>

      <section className="archive-shell" id="watchlist">
        <div className="control-bar">
          <div className="order-toggle" aria-label="Watch order"><button className={watchOrder === "release" ? "active" : ""} onClick={() => setWatchOrder("release")}>Release Order</button><button className={watchOrder === "chronological" ? "active" : ""} onClick={() => setWatchOrder("chronological")}>Chronological Order</button></div>
          <div className="scope-toggle"><button className={scope === "official" ? "active" : ""} onClick={() => setScope("official")} title="Core titles in the selected catalog">Core Catalog</button><button className={scope === "completionist" ? "active" : ""} onClick={() => setScope("completionist")} title="Includes adjacent titles such as Superman & Lois">Expanded Catalog</button></div>
          <div className="filter-tabs">
            {(["all", "favorites", "remaining", "movie", "episode", "special", "short"] as Filter[]).map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item === "all" ? "All" : item}</button>)}
          </div>
          <label className="search"><Icon name="search" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the archive…" /></label>
          <div className="archive-actions" aria-label="Archive display and selection controls">
            <label className="option-toggle"><input type="checkbox" checked={hideSpoilers} onChange={(event) => setHideSpoilers(event.target.checked)} /><span />Spoiler-safe mode</label>
            <label className="option-toggle"><input type="checkbox" checked={hideWatched} onChange={(event) => setHideWatched(event.target.checked)} /><span />Hide watched</label>
            <label className="bulk-date"><span>Bulk watched</span><input type="date" max={localDateKey()} value={bulkWatchDate} onChange={(event) => setBulkWatchDate(event.target.value)} /></label>
            <button type="button" onClick={() => setScopedCompletion(true, bulkWatchDate)}>Select all</button>
            <button type="button" onClick={() => setScopedCompletion(false)}>Deselect all</button>
            <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}>{showAdvanced ? "Hide filters" : "Advanced filters"}</button>
          </div>
          {showAdvanced && <div className="advanced-filters"><select value={franchiseFilter} onChange={(e) => setFranchiseFilter(e.target.value)}><option value="">All story groups</option>{franchises.map((value) => <option key={value}>{value}</option>)}</select><select value={divisionFilter} onChange={(e) => setDivisionFilter(e.target.value)}><option value="">All formats</option>{divisions.map((value) => <option key={value}>{value}</option>)}</select><select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}><option value="">All release years</option>{years.map((value) => <option key={value} value={value}>{value}</option>)}</select><select value={preset} onChange={(e) => setPreset(e.target.value)}><option value="">No preset</option><option value="worlds-finest">World’s Finest</option><option value="dcu">DC Universe</option><option value="arrowverse">Arrowverse</option><option value="animation">Animation</option></select><button onClick={() => { setFranchiseFilter(""); setDivisionFilter(""); setYearFilter(""); setPreset(""); }}>Clear</button></div>}
        </div>
        <div className="results-heading"><div><p className="eyebrow">{watchOrder === "release" ? "Release-order archive" : "In-universe chronology"}</p><h2>{collections.length} titles shown</h2></div><span>{filtered.length} trackable items</span></div>
        <div className="watchlist">
          {collections.map(([collection, items], titleIndex) => {
            const segmentKey = collection;
            const isSeries = items.some((i) => i.season); const open = openCollections.has(segmentKey) || query.length > 0;
            const done = items.filter((item) => completed.has(item.id)).length; const allDone = done === items.length;
            const seasons = [...new Set(items.flatMap((item) => item.season || []))].sort((a, b) => a - b);
            const scopeLabel = items[0].continuity === "core" ? "Canon" : items[0].phase;
            return <article className={`watch-card ${allDone ? "complete" : ""}`} key={segmentKey}>
              <button className="card-main" onClick={() => { if (isSeries) setOpenCollections((current) => { const next = new Set(current); if (next.has(segmentKey)) next.delete(segmentKey); else next.add(segmentKey); return next; }); else setSelectedEntry(items[0]); }}>
                <span className="sequence">{String(titleIndex + 1).padStart(3, "0")}</span>
                <PosterArt title={collection} />
                <span className="card-copy"><small>{scopeLabel} · {items[0].phase} · {isSeries ? `${seasons.length} season${seasons.length === 1 ? "" : "s"}` : items[0].kind}</small><strong>{collection}</strong><span className="mini-progress"><i style={{ width: `${done / items.length * 100}%` }} /></span><em>{done} of {items.length} complete</em></span>
                {isSeries && <span className={`expand ${open ? "open" : ""}`}><Icon name="chevron" /></span>}
              </button>
              <a className="card-trailer" href={trailerUrl(collection)} target="_blank" rel="noreferrer" aria-label={`Find the official ${collection} trailer on YouTube`}><Icon name="play" /><span>Trailer</span></a>
              <button className={`complete-button ${allDone ? "done" : ""}`} onClick={() => completeCollection(items)} aria-label={allDone ? `Mark ${collection} incomplete` : `Complete ${collection}`}><Icon name="check" /></button>
              {isSeries && open && <div className="season-list">
                {seasons.map((season) => {
                  const seasonKey = `${collection}::${season}`; const seasonItems = items.filter((item) => item.season === season);
                  const seasonDone = seasonItems.filter((item) => completed.has(item.id)).length;
                  const seasonOpen = openCollections.has(seasonKey) || query.length > 0;
                  return <section className="season-group" key={seasonKey}>
                    <button className="season-heading" onClick={() => setOpenCollections((current) => { const next = new Set(current); if (next.has(seasonKey)) next.delete(seasonKey); else next.add(seasonKey); return next; })}>
                      <span>Season {season}</span><small>{seasonDone} of {seasonItems.length} complete</small><span className={`expand ${seasonOpen ? "open" : ""}`}><Icon name="chevron" /></span>
                    </button>
                    {seasonOpen && <div className="episodes">{seasonItems.map((item) => <EpisodeRow key={item.id} item={item} completed={completed.has(item.id)} onOpen={() => setSelectedEntry(item)} onToggle={() => toggleEntry(item.id, `${item.title} ${item.detail}`)} />)}</div>}
                  </section>;
                })}
              </div>}
            </article>;
          })}
          {!collections.length && <div className="empty"><strong>No records found</strong><span>Try another filter or search term.</span></div>}
        </div>
      </section>
    </>}

    {view === "history" && <section className="inner-page history-page">
      <div className="page-heading"><p className="eyebrow">Archive log</p><h1>Your viewing history.</h1><p>Every original viewing, rewatch, and personal record change—kept away from the main Archive.</p></div>
      <div className="history-grid">
        <article><div className="panel-heading"><h2>Recently Viewed</h2><span>Uses the dates you entered</span></div>{recentEntries.length ? recentEntries.map((item, index) => <button key={`${item.id}-${item.at}-${index}`} onClick={() => setSelectedEntry(item.entry)}><strong>{item.entry?.title}</strong><small>{item.entry?.detail} · {displayWatchedDate(item.at)}</small></button>) : <p>No viewing activity yet.</p>}</article>
        <article><div className="panel-heading"><h2>Recently Edited</h2><span>Ratings, favorites, notes, and dates</span></div>{recentEdits.length ? recentEdits.map((item, index) => <button key={`${item.id}-${item.at}-${index}`} onClick={() => setSelectedEntry(item.entry)}><strong>{item.entry?.title}</strong><small>{item.field.replace("-", " ")} · {displayWatchedDate(item.at)}</small></button>) : <p>Your edited records will appear here.</p>}</article>
        <article className="rewatch-panel"><div className="panel-heading"><h2>Rewatch History</h2><span>Original dates remain intact</span></div>{[...new Set(history.map((event) => event.id))].map((id) => ({ id, dates: history.filter((event) => event.id === id).sort((a,b) => a.at.localeCompare(b.at)), entry: entries.find((entry) => entry.id === id) })).filter((item) => item.dates.length > 1).sort((a,b) => b.dates.at(-1)!.at.localeCompare(a.dates.at(-1)!.at)).map((item) => <button key={item.id} onClick={() => setSelectedEntry(item.entry)}><strong>{item.entry?.title}</strong><small>{item.dates.length} viewings · {item.dates.map((event) => displayWatchedDate(event.at)).join(" · ")}</small></button>)}</article>
        <article className="calendar-panel"><div className="panel-heading"><h2>Monthly Watch Calendar</h2><input type="month" max={localDateKey().slice(0,7)} value={calendarMonth} onChange={(event) => setCalendarMonth(event.target.value)} /></div><div className="watch-calendar">{Array.from({ length: new Date(Number(calendarMonth.slice(0,4)), Number(calendarMonth.slice(5,7)), 0).getDate() }, (_, index) => { const day = `${calendarMonth}-${String(index + 1).padStart(2,"0")}`; const events = calendarDays.get(day) || []; return <div className={events.length ? "active" : ""} key={day}><b>{index + 1}</b>{events.map((event, eventIndex) => <button key={`${event.id}-${eventIndex}`} onClick={() => setSelectedEntry(entries.find((entry) => entry.id === event.id))}>{entries.find((entry) => entry.id === event.id)?.title}</button>)}</div>; })}</div></article>
      </div>
    </section>}

    {view === "analytics" && <section className="inner-page analytics-page">
      <div className="page-heading"><p className="eyebrow">Mission intelligence</p><h1>Your journey, decoded.</h1><p>Live calculations based entirely on your saved archive progress.</p></div>
      <div className="analytics-grid">
        <article className="analytics-hero"><ProgressRing value={percentage} /><div><small>Archive completion</small><strong>{scopedComplete} / {scopedEntries.length}</strong><p>{formatTime(remainingRuntime)} remain across {scopedEntries.length - scopedComplete} trackable items.</p></div></article>
        <article className="metric"><small>Time watched</small><strong>{formatTime(watchedRuntime)}</strong><span>Of {formatTime(totalRuntime)} in the archive</span></article>
        <article className="metric"><small>Current streak</small><strong>{streak} day{streak === 1 ? "" : "s"}</strong><span>Complete at least one item daily</span></article>
        <article className="metric"><small>Movies completed</small><strong>{completedMovies}</strong><span>{completedEpisodes} individual episodes completed</span></article>
        <article className="metric"><small>Estimated finish</small><strong className="date-metric">{estimatedFinish ? estimatedFinish.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Calculating…"}</strong><span>At an average of two hours per day</span></article>
        <article className="phase-panel"><div className="panel-heading"><h2>Era progress</h2><span>Completion inside the selected archive</span></div>{phaseStats.map((stat) => <div className="phase-row" key={stat.phase}><b>{stat.phase}</b><div><i style={{ width: `${stat.percent}%` }} /></div><span>{stat.done}/{stat.total}</span></div>)}</article>
        <article className="breakdown"><div className="panel-heading"><h2>Archive composition</h2><span>What this selected catalog contains</span></div>{(["movie", "episode", "special", "short"] as const).map((kind) => { const count = scopedEntries.filter(e => e.kind === kind).length; return <div key={kind}><span>{kind}</span><strong>{count}</strong><i style={{ width: `${count / scopedEntries.length * 100}%` }} /></div>; })}</article>
        <article className="recent-panel"><div className="panel-heading"><h2>Recently completed</h2><span>Your latest archive activity</span></div>{recentEntries.length ? recentEntries.map((item) => <button key={item.id} onClick={() => setSelectedEntry(item.entry)}><span>{item.entry?.title}</span><small>{item.entry?.detail} · {displayWatchedDate(item.at)}</small></button>) : <p>Complete an item to begin your viewing history.</p>}</article>
        <article className="metric"><small>Average rating</small><strong>{averageRating ? averageRating.toFixed(1) : "—"}</strong><span>{rated.length} rated · {favorites.size} favorites</span></article>
        <article className="stone-panel"><div className="panel-heading"><h2>Archive Medallions & Universe Recaps</h2><span>{infinityStones.filter((stone) => phaseStats.find((phase) => phase.phase === stone.phase)?.percent === 100).length} of 6 era records secured</span></div><div className="stone-grid">{infinityStones.map((stone) => { const earned = phaseStats.find((phase) => phase.phase === stone.phase)?.percent === 100; return <div className={earned ? "stone earned" : "stone"} key={stone.name}><i style={{ "--stone": stone.color } as React.CSSProperties} /><strong>{stone.name}</strong><span>{stone.phase} · {earned ? "Secured" : "Locked"}</span>{earned && <button onClick={() => downloadEraRecap(stone.phase)}>Download recap</button>}</div>; })}</div></article>
        <article className="achievement-panel"><div className="panel-heading"><h2>Milestones</h2><span>{achievements.filter((item) => item.unlocked).length} of {achievements.length} unlocked</span></div><div className="achievement-grid">{achievements.map((item) => <div className={item.unlocked ? "achievement unlocked" : "achievement"} key={item.name}><i>{item.icon}</i><div><strong>{item.name}</strong><span>{item.description}</span></div></div>)}</div></article>
      </div>
    </section>}

    {view === "timeline" && <section className="inner-page timeline-page">
      <div className="page-heading"><p className="eyebrow">A multiverse through time</p><h1>Every wing. Its own archive.</h1><p>Move between curated DC universes without combining them into one enormous completion list.</p></div>
      <div className="timeline-track">{phaseStats.map((stat, index) => <article key={stat.phase}><div className="timeline-node"><span>{index + 1}</span></div><div><small>Era {String(index + 1).padStart(2, "0")}</small><h2>{stat.phase}</h2><p>{stat.total} items · {Math.round(stat.percent)}% complete</p><div className="phase-line"><i style={{ width: `${stat.percent}%` }} /></div></div></article>)}</div>
    </section>}
    {view === "settings" && <section className="inner-page settings-page">
      <div className="page-heading"><p className="eyebrow">Archive control center</p><h1>Your archive, everywhere.</h1><p>Keep using the archive locally, or connect Google to securely sync your profiles between devices.</p></div>
      <div className="settings-grid">
        <article className="cloud-sync-card">
          <div className="panel-heading"><h2>Google profile sync</h2><span className={`sync-badge ${cloudStatus}`}>{cloudStatus === "local" ? "Local only" : cloudStatus}</span></div>
          {cloudUser ? <>
            <div className="google-account">{cloudUser.photoURL && <img src={cloudUser.photoURL} alt="" referrerPolicy="no-referrer" />}<span><strong>{cloudUser.displayName || "Google account"}</strong><small>{cloudUser.email}</small></span></div>
            <p>Your profiles save locally first and sync automatically. Watched dates and rewatches are merged safely when devices reconnect.</p>
            {(cloudStatus === "offline" || cloudStatus === "error") && <p className="sync-message">{cloudMessage}</p>}
            {lastCloudSync && <p className="last-sync">Last synced {new Date(lastCloudSync).toLocaleString()}</p>}
            <div className="settings-actions"><button onClick={() => void syncNow()}>Sync now</button><button onClick={() => void signOutGoogle()}>Sign out</button><button className="danger" onClick={() => void removeCloudArchive()}>Delete cloud archive</button></div>
          </> : <>
            <p>Google sign-in is optional. Connecting uploads your current local profiles and makes them available on your other signed-in devices.</p>
            <button className="google-signin" onClick={() => void beginGoogleSignIn()}>Continue with Google</button>
          </>}
          <small className="cloud-privacy">Stored separately from Infinity Archive in your private Hall of Justice Archives cloud record.</small>
        </article>
        <article><div className="panel-heading"><h2>Watch-through profiles</h2><button onClick={createProfile}>New profile</button></div><p>Each profile keeps its own progress, history, theme, Passport, ratings, and preferences.</p>{profiles.map((profile) => <div className={`profile-row ${profile.id === activeProfileId ? "active" : ""}`} key={profile.id}><button onClick={() => loadProfile(profile)}><strong>{profile.name}</strong><span>{profile.completed.length} completed · {profile.order === "release" ? "Release order" : "Chronological order"}</span></button><button onClick={() => deleteProfile(profile.id)} aria-label={`Delete ${profile.name}`}>×</button></div>)}</article>
        <article><div className="panel-heading"><h2>Data & Passport</h2></div><p>Backup every profile, viewing date, rewatch, theme, rating, favorite, note, edit record, and Passport field.</p><div className="settings-actions"><button onClick={exportProgress}>Export full backup</button><button onClick={() => importRef.current?.click()}>Restore backup</button><button onClick={shareProgress}>Quick-share progress card</button><button onClick={downloadPassport}>Download full Archive Passport</button><button className="danger" onClick={() => { if (confirm("Reset only this profile?")) { setCompleted(new Set()); setHistory([]); setEdits([]); setRatings({}); setFavorites(new Set()); setNotes({}); } }}>Reset active profile</button></div></article>
        <article className="theme-center"><div className="panel-heading"><h2>Profile Theme</h2></div><p>Atmosphere changes; layout and readability remain consistent.</p><div className="theme-grid">{themes.map((item) => <button className={theme === item.id ? "active" : ""} key={item.id} onClick={() => setTheme(item.id)}><i data-swatch={item.id} /><strong>{item.name}</strong><span>{item.description}</span></button>)}</div></article>
        <article className="update-center"><div className="panel-heading"><h2>Catalog Update Center</h2><span>Catalog and app releases are tracked separately</span></div><dl><div><dt>Application version</dt><dd>{APP_VERSION}</dd></div><div><dt>Catalog version</dt><dd>{CATALOG_VERSION}</dd></div><div><dt>Metadata revision</dt><dd>{METADATA_VERSION}</dd></div><div><dt>Items indexed</dt><dd>{entries.length}</dd></div></dl><div className="catalog-changes"><p><b>New content</b> Expanded Archive additions and 2026 canon releases are included.</p><p><b>Catalog corrections</b> Series now remain nested while exact watch order stays entry-level.</p><p><b>Metadata</b> Permanent DC actor, character, creator, era, format, synopsis, and note search indexing added.</p><p><b>Cloud sync</b> Google sign-in now protects a private, cross-device Hall of Justice Archives record.</p></div></article>
      </div>
    </section>}
    <DetailDrawer key={selectedEntry?.id || "closed"} entry={selectedEntry} completed={!!selectedEntry && completed.has(selectedEntry.id)} hideSpoilers={hideSpoilers} rating={selectedEntry ? ratings[selectedEntry.id] || 0 : 0} favorite={!!selectedEntry && favorites.has(selectedEntry.id)} note={selectedEntry ? notes[selectedEntry.id] || "" : ""} watchedDates={selectedEntry ? history.filter((event) => event.id === selectedEntry.id).sort((a,b) => a.at.localeCompare(b.at)).map((event) => event.at) : []} onClose={closeDetails} onToggle={() => selectedEntry && toggleEntry(selectedEntry.id, selectedEntry.episode ? `${selectedEntry.title} ${selectedEntry.detail}` : selectedEntry.title)} onRating={(value) => selectedEntry && (recordEdit(selectedEntry.id, "rating"), setRatings((current) => { const next = { ...current }; if (value) next[selectedEntry.id] = value; else delete next[selectedEntry.id]; return next; }))} onFavorite={() => selectedEntry && (recordEdit(selectedEntry.id, "favorite"), setFavorites((current) => { const next = new Set(current); if (next.has(selectedEntry.id)) next.delete(selectedEntry.id); else next.add(selectedEntry.id); return next; }))} onNote={(value) => selectedEntry && (recordEdit(selectedEntry.id, "note"), setNotes((current) => ({ ...current, [selectedEntry.id]: value })))} onWatchedDate={(value) => selectedEntry && setEntryWatchedDate(selectedEntry.id, value)} onAddRewatch={(value) => selectedEntry && addRewatch(selectedEntry.id, value)} />
    <UpcomingDrawer key={selectedUpcoming?.title || "upcoming-closed"} project={selectedUpcoming} onClose={() => setSelectedUpcoming(undefined)} />
    {achievementToast && <div className="achievement-splash" role="status"><button onClick={() => setAchievementToast(undefined)} aria-label="Dismiss achievement">×</button><div className="achievement-badge"><span>{achievementToast.icon}</span></div><p>Achievement unlocked</p><h2>{achievementToast.name}</h2><div>{achievementToast.description}</div></div>}
    {toast && <div className="undo-toast" role="status"><span>{toast.message}</span><button onClick={undoToast}>Undo</button></div>}
    <footer><strong>HALL OF JUSTICE ARCHIVES</strong><span>Unofficial fan-made tracker. Poster imagery is retrieved from Wikipedia/Wikimedia. Trailer buttons open YouTube; no movies or episodes are hosted or streamed here.</span><button onClick={exportProgress}>Export your progress</button></footer>
  </main>;
}
