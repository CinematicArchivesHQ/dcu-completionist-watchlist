export type Continuity = "core" | "expanded";
export type WatchEntry = {
  id:string; order:number; chronologicalOrder:number; title:string;
  kind:"movie"|"episode"|"special"|"short"; detail:string; phase:string;
  collection:string; sourceTitle:string; episode?:number; season?:number;
  runtime:number; scope:"official"|"adjacent"|"promotional";
  continuity:Continuity; format:"live-action"|"animation"; releaseDate:string;
};

type Film = { title:string; date:string; runtime:number; phase:string; chronology?:number; kind?:"movie"|"special"|"short"; format?:"live-action"|"animation"; continuity?:Continuity };
type Series = { title:string; date:string; phase:string; seasons:number[]; runtime:number; chronology?:number; format?:"live-action"|"animation"; continuity?:Continuity };

const films: Film[] = [
  // DCEU — the primary archive
  {title:"Man of Steel",date:"2013-06-14",runtime:143,phase:"DCEU",chronology:30},
  {title:"Batman v Superman: Dawn of Justice",date:"2016-03-25",runtime:151,phase:"DCEU",chronology:40},
  {title:"Suicide Squad",date:"2016-08-05",runtime:123,phase:"DCEU",chronology:50},
  {title:"Wonder Woman",date:"2017-06-02",runtime:141,phase:"DCEU",chronology:10},
  {title:"Justice League",date:"2017-11-17",runtime:120,phase:"DCEU",chronology:60},
  {title:"Aquaman",date:"2018-12-21",runtime:143,phase:"DCEU",chronology:70},
  {title:"Shazam!",date:"2019-04-05",runtime:132,phase:"DCEU",chronology:80},
  {title:"Birds of Prey",date:"2020-02-07",runtime:109,phase:"DCEU",chronology:90},
  {title:"Wonder Woman 1984",date:"2020-12-25",runtime:151,phase:"DCEU",chronology:20},
  {title:"Zack Snyder's Justice League",date:"2021-03-18",runtime:242,phase:"DCEU",chronology:61},
  {title:"The Suicide Squad",date:"2021-08-05",runtime:132,phase:"DCEU",chronology:100},
  {title:"Black Adam",date:"2022-10-21",runtime:125,phase:"DCEU",chronology:120},
  {title:"Shazam! Fury of the Gods",date:"2023-03-17",runtime:130,phase:"DCEU",chronology:130},
  {title:"The Flash",date:"2023-06-16",runtime:144,phase:"DCEU",chronology:140},
  {title:"Blue Beetle",date:"2023-08-18",runtime:127,phase:"DCEU",chronology:150},
  {title:"Aquaman and the Lost Kingdom",date:"2023-12-22",runtime:124,phase:"DCEU",chronology:160},

  // DCU — released/watchable only
  {title:"Superman",date:"2025-07-11",runtime:129,phase:"DCU — Gods and Monsters",chronology:20},
  {title:"Supergirl",date:"2026-06-26",runtime:125,phase:"DCU — Gods and Monsters",chronology:40},

  // Dark Knight Trilogy
  {title:"Batman Begins",date:"2005-06-15",runtime:140,phase:"Dark Knight Trilogy",chronology:10},
  {title:"The Dark Knight",date:"2008-07-18",runtime:152,phase:"Dark Knight Trilogy",chronology:20},
  {title:"The Dark Knight Rises",date:"2012-07-20",runtime:165,phase:"Dark Knight Trilogy",chronology:30},

  // LEGO DC
  {title:"Lego Batman: The Movie – DC Super Heroes Unite",date:"2013-05-21",runtime:71,phase:"LEGO DC",format:"animation"},
  {title:"Lego DC Comics Super Heroes: Batman Be-Leaguered",date:"2014-10-27",runtime:22,phase:"LEGO DC",format:"animation",kind:"special"},
  {title:"Lego DC Comics Super Heroes: Justice League vs. Bizarro League",date:"2015-02-10",runtime:49,phase:"LEGO DC",format:"animation"},
  {title:"Lego DC Comics Super Heroes: Justice League – Attack of the Legion of Doom!",date:"2015-08-25",runtime:77,phase:"LEGO DC",format:"animation"},
  {title:"Lego DC Comics Super Heroes: Justice League – Cosmic Clash",date:"2016-02-09",runtime:78,phase:"LEGO DC",format:"animation"},
  {title:"Lego DC Comics Super Heroes: Justice League – Gotham City Breakout",date:"2016-07-12",runtime:78,phase:"LEGO DC",format:"animation"},
  {title:"The Lego Batman Movie",date:"2017-02-10",runtime:104,phase:"LEGO DC",format:"animation"},
  {title:"Lego DC Comics Super Heroes: The Flash",date:"2018-02-13",runtime:78,phase:"LEGO DC",format:"animation"},
  {title:"Lego DC Comics Super Heroes: Aquaman – Rage of Atlantis",date:"2018-07-31",runtime:77,phase:"LEGO DC",format:"animation"},
  {title:"Lego DC Batman: Family Matters",date:"2019-08-20",runtime:72,phase:"LEGO DC",format:"animation"},
  {title:"Lego DC Shazam!: Magic and Monsters",date:"2020-04-28",runtime:81,phase:"LEGO DC",format:"animation"},

  // DCAMU / New 52 connected universe
  {title:"Justice League: The Flashpoint Paradox",date:"2013-07-30",runtime:81,phase:"DCAMU — New 52",format:"animation",chronology:10},
  {title:"Justice League: War",date:"2014-02-04",runtime:79,phase:"DCAMU — New 52",format:"animation",chronology:20},
  {title:"Son of Batman",date:"2014-05-06",runtime:74,phase:"DCAMU — New 52",format:"animation",chronology:30},
  {title:"Justice League: Throne of Atlantis",date:"2015-01-27",runtime:72,phase:"DCAMU — New 52",format:"animation",chronology:40},
  {title:"Nightwing and Robin",date:"2015-01-14",runtime:1,phase:"DCAMU — New 52",format:"animation",kind:"short",chronology:45},
  {title:"Batman vs. Robin",date:"2015-04-14",runtime:80,phase:"DCAMU — New 52",format:"animation",chronology:50},
  {title:"Batman: Bad Blood",date:"2016-02-02",runtime:72,phase:"DCAMU — New 52",format:"animation",chronology:60},
  {title:"Justice League vs. Teen Titans",date:"2016-03-29",runtime:79,phase:"DCAMU — New 52",format:"animation",chronology:70},
  {title:"Justice League Dark",date:"2017-02-07",runtime:75,phase:"DCAMU — New 52",format:"animation",chronology:80},
  {title:"Teen Titans: The Judas Contract",date:"2017-04-18",runtime:84,phase:"DCAMU — New 52",format:"animation",chronology:90},
  {title:"Suicide Squad: Hell to Pay",date:"2018-04-10",runtime:86,phase:"DCAMU — New 52",format:"animation",chronology:100},
  {title:"The Death of Superman",date:"2018-07-24",runtime:81,phase:"DCAMU — New 52",format:"animation",chronology:110},
  {title:"Constantine: City of Demons",date:"2018-10-09",runtime:90,phase:"DCAMU — New 52",format:"animation",chronology:105},
  {title:"Reign of the Supermen",date:"2019-01-15",runtime:87,phase:"DCAMU — New 52",format:"animation",chronology:120},
  {title:"Sgt. Rock",date:"2019-07-20",runtime:15,phase:"DCAMU — New 52",format:"animation",kind:"short",chronology:125},
  {title:"Batman: Hush",date:"2019-07-20",runtime:82,phase:"DCAMU — New 52",format:"animation",chronology:130},
  {title:"Wonder Woman: Bloodlines",date:"2019-10-05",runtime:83,phase:"DCAMU — New 52",format:"animation",chronology:140},
  {title:"Justice League Dark: Apokolips War",date:"2020-05-05",runtime:90,phase:"DCAMU — New 52",format:"animation",chronology:150},
  {title:"Constantine: The House of Mystery",date:"2022-05-03",runtime:27,phase:"DCAMU — New 52",format:"animation",kind:"short",chronology:160},

  // Tomorrowverse
  {title:"Superman: Man of Tomorrow",date:"2020-08-23",runtime:86,phase:"Tomorrowverse",format:"animation",chronology:10},
  {title:"Adam Strange",date:"2020-05-19",runtime:16,phase:"Tomorrowverse",format:"animation",kind:"short",chronology:15},
  {title:"Justice Society: World War II",date:"2021-04-27",runtime:84,phase:"Tomorrowverse",format:"animation",chronology:20},
  {title:"Kamandi: The Last Boy on Earth!",date:"2021-04-27",runtime:18,phase:"Tomorrowverse",format:"animation",kind:"short",chronology:25},
  {title:"Batman: The Long Halloween, Part One",date:"2021-06-22",runtime:85,phase:"Tomorrowverse",format:"animation",chronology:30},
  {title:"Batman: The Long Halloween, Part Two",date:"2021-07-27",runtime:87,phase:"Tomorrowverse",format:"animation",chronology:40},
  {title:"Blue Beetle",date:"2021-07-27",runtime:16,phase:"Tomorrowverse",format:"animation",kind:"short",chronology:45},
  {title:"Green Lantern: Beware My Power",date:"2022-07-26",runtime:88,phase:"Tomorrowverse",format:"animation",chronology:50},
  {title:"Legion of Super-Heroes",date:"2023-02-07",runtime:83,phase:"Tomorrowverse",format:"animation",chronology:60},
  {title:"Justice League: Warworld",date:"2023-07-25",runtime:90,phase:"Tomorrowverse",format:"animation",chronology:70},
  {title:"Justice League: Crisis on Infinite Earths – Part One",date:"2024-01-09",runtime:93,phase:"Tomorrowverse",format:"animation",chronology:80},
  {title:"Justice League: Crisis on Infinite Earths – Part Two",date:"2024-04-23",runtime:94,phase:"Tomorrowverse",format:"animation",chronology:90},
  {title:"Justice League: Crisis on Infinite Earths – Part Three",date:"2024-07-16",runtime:99,phase:"Tomorrowverse",format:"animation",chronology:100},

  // Curated standalone and loosely connected animation
  {title:"Gen¹³",date:"2000-10-31",runtime:73,phase:"Animated Elseworlds",format:"animation"},
  {title:"The Batman vs. Dracula",date:"2005-10-18",runtime:83,phase:"Animated Elseworlds",format:"animation"},
  {title:"Superman: Doomsday",date:"2007-09-18",runtime:77,phase:"Animated Elseworlds",format:"animation"},
  {title:"Justice League: The New Frontier",date:"2008-02-26",runtime:75,phase:"Animated Elseworlds",format:"animation"},
  {title:"Batman: Gotham Knight",date:"2008-07-08",runtime:76,phase:"Animated Elseworlds",format:"animation"},
  {title:"Green Lantern: First Flight",date:"2009-07-28",runtime:77,phase:"Animated Elseworlds",format:"animation"},
  {title:"The Spectre",date:"2010-02-23",runtime:12,phase:"Animated Elseworlds",format:"animation",kind:"short"},
  {title:"Batman: Under the Red Hood",date:"2010-07-27",runtime:75,phase:"Animated Elseworlds",format:"animation"},
  {title:"Jonah Hex",date:"2010-07-27",runtime:13,phase:"Animated Elseworlds",format:"animation",kind:"short"},
  {title:"Superman/Shazam!: The Return of Black Adam",date:"2010-11-09",runtime:25,phase:"Animated Elseworlds",format:"animation",kind:"short"},
  {title:"Green Arrow",date:"2010-09-28",runtime:12,phase:"Animated Elseworlds",format:"animation",kind:"short"},
  {title:"The Losers",date:"2010-11-09",runtime:15,phase:"Animated Elseworlds",format:"animation",kind:"short"},
  {title:"All-Star Superman",date:"2011-02-22",runtime:76,phase:"Animated Elseworlds",format:"animation"},
  {title:"Green Lantern: Emerald Knights",date:"2011-06-07",runtime:84,phase:"Animated Elseworlds",format:"animation"},
  {title:"Batman: Year One",date:"2011-10-18",runtime:64,phase:"Animated Elseworlds",format:"animation"},
  {title:"Catwoman",date:"2011-10-18",runtime:15,phase:"Animated Elseworlds",format:"animation",kind:"short"},
  {title:"Superman vs. The Elite",date:"2012-06-12",runtime:74,phase:"Animated Elseworlds",format:"animation"},
  {title:"Batman: The Dark Knight Returns, Part One",date:"2012-09-25",runtime:76,phase:"Animated Elseworlds",format:"animation"},
  {title:"Batman: The Dark Knight Returns, Part Two",date:"2013-01-29",runtime:78,phase:"Animated Elseworlds",format:"animation"},
  {title:"Superman: Unbound",date:"2013-05-07",runtime:75,phase:"Animated Elseworlds",format:"animation"},
  {title:"JLA Adventures: Trapped in Time",date:"2014-01-21",runtime:52,phase:"Animated Elseworlds",format:"animation"},
  {title:"Batman: Strange Days",date:"2014-04-09",runtime:3,phase:"Animated Elseworlds",format:"animation",kind:"short"},
  {title:"Batman: Assault on Arkham",date:"2014-08-12",runtime:76,phase:"Animated Elseworlds",format:"animation"},
  {title:"Justice League: Gods and Monsters",date:"2015-07-28",runtime:76,phase:"Animated Elseworlds",format:"animation"},
  {title:"Constantine: John Con Noir",date:"2015-10-08",runtime:5,phase:"Animated Elseworlds",format:"animation",kind:"short"},
  {title:"Batman: The Killing Joke",date:"2016-07-25",runtime:77,phase:"Animated Elseworlds",format:"animation"},
  {title:"Batman: Return of the Caped Crusaders",date:"2016-10-11",runtime:78,phase:"Animated Elseworlds",format:"animation"},
  {title:"Joker's Playhouse",date:"2016-12-01",runtime:4,phase:"Animated Elseworlds",format:"animation",kind:"short"},
  {title:"Batman vs. Two-Face",date:"2017-10-10",runtime:72,phase:"Animated Elseworlds",format:"animation"},
  {title:"Batman: Gotham by Gaslight",date:"2018-01-23",runtime:78,phase:"Animated Elseworlds",format:"animation"},
  {title:"Scooby-Doo! & Batman: The Brave and the Bold",date:"2018-01-09",runtime:75,phase:"Animated Elseworlds",format:"animation"},
  {title:"Batman Ninja",date:"2018-04-24",runtime:85,phase:"Animated Elseworlds",format:"animation"},
  {title:"Batman vs. Teenage Mutant Ninja Turtles",date:"2019-05-14",runtime:87,phase:"Animated Elseworlds",format:"animation"},
  {title:"Death",date:"2019-10-22",runtime:19,phase:"Animated Elseworlds",format:"animation",kind:"short"},
  {title:"Justice League vs. the Fatal Five",date:"2019-03-30",runtime:77,phase:"Animated Elseworlds",format:"animation"},
  {title:"Deathstroke: Knights & Dragons",date:"2020-08-04",runtime:87,phase:"Animated Elseworlds",format:"animation"},
  {title:"The Phantom Stranger",date:"2020-03-17",runtime:15,phase:"Animated Elseworlds",format:"animation",kind:"short"},
  {title:"Batman: Death in the Family",date:"2020-10-13",runtime:96,phase:"Animated Elseworlds",format:"animation"},
  {title:"Superman: Red Son",date:"2020-02-25",runtime:84,phase:"Animated Elseworlds",format:"animation"},
  {title:"Batman: Soul of the Dragon",date:"2021-01-12",runtime:83,phase:"Animated Elseworlds",format:"animation"},
  {title:"Injustice",date:"2021-10-19",runtime:78,phase:"Animated Elseworlds",format:"animation"},
  {title:"Catwoman: Hunted",date:"2022-02-08",runtime:78,phase:"Animated Elseworlds",format:"animation"},
  {title:"DC League of Super-Pets",date:"2022-07-29",runtime:105,phase:"Animated Elseworlds",format:"animation"},
  {title:"Batman and Superman: Battle of the Super Sons",date:"2022-10-18",runtime:79,phase:"Animated Elseworlds",format:"animation"},
  {title:"Batman: The Doom That Came to Gotham",date:"2023-03-28",runtime:86,phase:"Animated Elseworlds",format:"animation"},
  {title:"Justice League x RWBY: Super Heroes & Huntsmen, Part One",date:"2023-04-25",runtime:83,phase:"Animated Elseworlds",format:"animation"},
  {title:"Justice League x RWBY: Super Heroes & Huntsmen, Part Two",date:"2023-10-17",runtime:75,phase:"Animated Elseworlds",format:"animation"},
  {title:"Scooby-Doo! and Krypto, Too!",date:"2023-09-26",runtime:79,phase:"Animated Elseworlds",format:"animation"},
  {title:"Merry Little Batman",date:"2023-12-08",runtime:97,phase:"Animated Elseworlds",format:"animation"},
  {title:"Watchmen Chapter I",date:"2024-08-13",runtime:83,phase:"Animated Elseworlds",format:"animation"},
  {title:"Watchmen Chapter II",date:"2024-11-26",runtime:89,phase:"Animated Elseworlds",format:"animation"},
  {title:"Batman Ninja vs. Yakuza League",date:"2025-03-18",runtime:89,phase:"Animated Elseworlds",format:"animation"},
  {title:"Aztec Batman: Clash of Empires",date:"2025-09-18",runtime:90,phase:"Animated Elseworlds",format:"animation"}
];

const series: Series[] = [
  {title:"Peacemaker",date:"2022-01-13",phase:"DCEU",seasons:[8],runtime:45,chronology:110},
  {title:"Creature Commandos",date:"2024-12-05",phase:"DCU — Gods and Monsters",seasons:[7],runtime:24,format:"animation",chronology:10},
  {title:"Peacemaker",date:"2025-08-21",phase:"DCU — Gods and Monsters",seasons:[8],runtime:45,chronology:30},

  {title:"Arrow",date:"2012-10-10",phase:"Arrowverse",seasons:[23,23,23,23,23,23,22,10],runtime:42},
  {title:"Arrow: Blood Rush",date:"2013-11-06",phase:"Arrowverse",seasons:[6],runtime:2},
  {title:"The Flash",date:"2014-10-07",phase:"Arrowverse",seasons:[23,23,23,23,22,19,18,20,13],runtime:42},
  {title:"Constantine",date:"2014-10-24",phase:"Arrowverse",seasons:[13],runtime:43},
  {title:"Vixen",date:"2015-08-25",phase:"Arrowverse",seasons:[6,6],runtime:5,format:"animation"},
  {title:"Supergirl",date:"2015-10-26",phase:"Arrowverse",seasons:[20,22,23,22,19,20],runtime:42},
  {title:"DC's Legends of Tomorrow",date:"2016-01-21",phase:"Arrowverse",seasons:[16,17,18,16,15,15,13],runtime:42},
  {title:"Freedom Fighters: The Ray",date:"2017-12-08",phase:"Arrowverse",seasons:[6,6],runtime:7,format:"animation"},
  {title:"Black Lightning",date:"2018-01-16",phase:"Arrowverse",seasons:[13,16,16,13],runtime:42},
  {title:"Batwoman",date:"2019-10-06",phase:"Arrowverse",seasons:[20,18,13],runtime:42},
  {title:"Superman & Lois",date:"2021-02-23",phase:"Arrowverse",seasons:[15,15,13,10],runtime:43,continuity:"expanded"}
];

const slug = (value:string) => value.toLowerCase().replace(/&/g,"and").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const dateValue = (value:string) => new Date(`${value}T12:00:00Z`).valueOf();

const sortedFilms = [...films].sort((a,b)=>dateValue(a.date)-dateValue(b.date));
const sortedSeries = [...series].sort((a,b)=>dateValue(a.date)-dateValue(b.date));
let sequence = 1;
const result: WatchEntry[] = [];

for (const item of sortedFilms) {
  result.push({
    id:`${slug(item.phase)}-${slug(item.title)}`, order:sequence++, chronologicalOrder:item.chronology ?? sequence,
    title:item.title, kind:item.kind || "movie", detail:item.kind === "short" ? "Short film" : item.kind === "special" ? "Special" : "Feature film",
    phase:item.phase, collection:item.title, sourceTitle:item.title, runtime:item.runtime,
    scope:"official", continuity:item.continuity || "core", format:item.format || "live-action", releaseDate:item.date
  });
}

for (const show of sortedSeries) {
  let epOrder = 0;
  show.seasons.forEach((count, seasonIndex) => {
    for (let episode=1; episode<=count; episode++) {
      epOrder += 1;
      result.push({
        id:`${slug(show.phase)}-${slug(show.title)}-s${seasonIndex+1}e${episode}`,
        order:sequence++, chronologicalOrder:(show.chronology ?? sequence) + epOrder/1000,
        title:show.title, kind:"episode", detail:`S${seasonIndex+1} E${episode}`,
        phase:show.phase, collection:show.title, sourceTitle:show.title, season:seasonIndex+1, episode,
        runtime:show.runtime, scope:"official", continuity:show.continuity || "core",
        format:show.format || "live-action", releaseDate:show.date
      });
    }
  });
}

result.sort((a,b)=>dateValue(a.releaseDate)-dateValue(b.releaseDate) || a.chronologicalOrder-b.chronologicalOrder);
result.forEach((entry,index)=>{ entry.order=index+1; });

export const entries = result;
export const catalogNames = ["DCEU","DCU — Gods and Monsters","Dark Knight Trilogy","Arrowverse","DCAMU — New 52","Tomorrowverse","LEGO DC","Animated Elseworlds"] as const;
export const sourceCount = new Set(entries.map((entry)=>entry.collection)).size;
export const canonSourceCount = new Set(entries.filter((entry)=>entry.continuity==="core").map((entry)=>entry.collection)).size;
export const totalRuntime = entries.reduce((sum,entry)=>sum+entry.runtime,0);
