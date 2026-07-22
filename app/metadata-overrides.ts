export type MetadataOverride = { title?: string; releaseDate?: string; genres?: string[]; cast?: string[]; description?: string; trailer?: string };
export function metadataKey(collection:string,season?:number,episode?:number){return season&&episode?`${collection}|S${season}E${episode}`:collection}
export function normalizeGenres(genres?:string[]){return genres?.filter(Boolean) || []}
export const metadataOverrides:Record<string,MetadataOverride>={
  "Superman": { description: "A new chapter in the DC Universe follows Superman as he balances his Kryptonian heritage with his human upbringing and his belief in humanity.", trailer: "https://www.youtube.com/results?search_query=Superman+2025+official+trailer" },
  "The Batman": { description: "In his second year of fighting crime, Batman uncovers corruption in Gotham while pursuing a serial killer who leaves cryptic clues.", trailer: "https://www.youtube.com/results?search_query=The+Batman+official+trailer" },
  "Batman: The Animated Series": { description: "The landmark animated series follows Batman through noir-inspired cases across Gotham City." },
  "Creature Commandos": { description: "A classified team of incarcerated monsters is assembled for missions considered too dangerous for humans." },
};
export const episodeMetadataOverrides:Record<string,MetadataOverride>={};
