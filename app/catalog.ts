import type { WatchEntry } from "./data";
export type WatchOrder = "release" | "chronological";
export type ThemeId = "justice" | "gotham" | "metropolis" | "themyscira" | "watchtower";
export type EditEvent={id:string;at:string;field:"rating"|"favorite"|"note"|"watched-date"};
export type Profile={id:string;name:string;order:WatchOrder;scope:"completionist"|"official";completed:string[];history:Array<{id:string;at:string}>;ratings:Record<string,number>;favorites:string[];notes:Record<string,string>;theme?:ThemeId;edits?:EditEvent[];passport?:{generatedAt?:string;recapEras?:string[]};createdAt:string;updatedAt:string};
export const themes:Array<{id:ThemeId;name:string;description:string}>=[
{id:"justice",name:"Hall of Justice",description:"Marble, midnight navy, and museum brass"},
{id:"gotham",name:"Gotham Archive",description:"Charcoal stone and restrained crimson"},
{id:"metropolis",name:"Metropolis Gallery",description:"Bright limestone and heroic blue"},
{id:"themyscira",name:"Themysciran Hall",description:"Warm stone, bronze, and ceremonial red"},
{id:"watchtower",name:"Watchtower",description:"Deep space glass and cool silver"},];
const assoc:Array<[RegExp,string]>=[
[/Batman|Penguin|Joker/,"Batman Bruce Wayne Gotham Robin Nightwing Catwoman Selina Kyle Commissioner Gordon"],
[/Superman|Smallville/,"Superman Clark Kent Kal-El Lois Lane Lex Luthor Metropolis Krypton"],
[/Wonder Woman/,"Wonder Woman Diana Prince Themyscira Amazon"],
[/Flash/,"The Flash Barry Allen Central City Speed Force"],
[/Arrow|Legends|Supergirl/,"Arrowverse Oliver Queen Green Arrow Crisis on Infinite Earths"],
[/Justice League/,"Justice League Batman Superman Wonder Woman Flash Green Lantern Aquaman"],
[/Peacemaker|Creature Commandos/,"DCU Amanda Waller Viola Davis James Gunn"],
];
export function permanentSearchText(e:WatchEntry){return assoc.filter(([r])=>r.test(e.collection)).map(([,t])=>t).join(" ")}
export function orderEntries(items:WatchEntry[],order:WatchOrder){return [...items].sort((a,b)=>order==="release"?a.order-b.order:a.chronologicalOrder-b.chronologicalOrder||a.order-b.order)}
export function franchiseFor(e:WatchEntry){if(/Batman|Penguin|Joker/.test(e.collection))return "Gotham";if(/Superman|Smallville/.test(e.collection))return "Superman";if(/Arrow|Flash|Supergirl|Legends/.test(e.collection))return "Arrowverse";return e.phase}
export function divisionFor(e:WatchEntry){return e.format==="animation"?"Animation Wing":e.kind==="movie"?"Feature Film Wing":"Television Wing"}
export function yearFor(e:WatchEntry){return Number(e.releaseDate.slice(0,4))}
export function presetMatches(e:WatchEntry,preset:string){if(!preset)return true;if(preset==="worlds-finest")return /Batman|Superman|Wonder Woman|Justice League/.test(e.collection);if(preset==="dcu")return e.phase==="DCU";if(preset==="arrowverse")return /Arrowverse/.test(e.phase);if(preset==="animation")return e.format==="animation";return true}
export type UpcomingProject={title:string;date:string;type:string;runtime?:number;genres:string[];cast:string[];description:string;trailer:string};
export const upcomingProjects:UpcomingProject[]=[
{title:"Lanterns",date:"2026-08-01",type:"DCU series",genres:["Mystery","Science fiction"],cast:["Kyle Chandler","Aaron Pierre"],description:"Hal Jordan and John Stewart investigate a terrestrial mystery in the connected DC Universe. It remains outside completion totals until its HBO premiere.",trailer:"https://www.youtube.com/results?search_query=Lanterns+official+trailer"},
{title:"Clayface",date:"2026-09-11",type:"DCU film",genres:["Horror","Drama"],cast:[],description:"A DC Studios feature centered on Gotham's shape-shifting performer. It will enter the DCU catalog after release.",trailer:"https://www.youtube.com/results?search_query=Clayface+official+trailer"},
{title:"Man of Tomorrow",date:"2027-07-09",type:"DCU film",genres:["Action","Science fiction"],cast:["David Corenswet"],description:"The next Superman-family chapter from DC Studios, scheduled for 2027. The release remains separate from completion tracking until watchable.",trailer:"https://www.youtube.com/results?search_query=Man+of+Tomorrow+DC+Studios"},
{title:"The Batman Part II",date:"2027-10-01",type:"DC Elseworlds film",genres:["Crime","Drama"],cast:["Robert Pattinson"],description:"The next chapter in The Batman Epic Crime Saga. Listed for awareness but not part of the selected completion catalogs.",trailer:"https://www.youtube.com/results?search_query=The+Batman+Part+II+official"},
{title:"The Brave and the Bold",date:"2028-12-31",type:"DCU film · date pending",genres:["Action","Adventure"],cast:[],description:"The announced DCU Batman and Damian Wayne feature. Its placeholder date keeps the undated project outside completion totals.",trailer:"https://www.youtube.com/results?search_query=The+Brave+and+the+Bold+DC+Studios"},
{title:"Booster Gold",date:"2028-12-31",type:"DCU series · date pending",genres:["Comedy","Science fiction"],cast:[],description:"An announced Chapter One series centered on the time-traveling hero. It remains in Upcoming Releases until officially dated and watchable.",trailer:"https://www.youtube.com/results?search_query=Booster+Gold+DCU"}
];
export const infinityStones=[
{phase:"DCEU",name:"Unity Seal",color:"#8f9daa"},{phase:"DCU — Gods and Monsters",name:"Founders Medallion",color:"#c8a24a"},{phase:"Dark Knight Trilogy",name:"Gotham Crest",color:"#59636e"},{phase:"Arrowverse",name:"Crisis Emblem",color:"#9b3340"},{phase:"DCAMU — New 52",name:"Flashpoint Mark",color:"#457aa2"},{phase:"Tomorrowverse",name:"Tomorrow Seal",color:"#6e5a8d"},{phase:"LEGO DC",name:"Brick Archive",color:"#b88746"},{phase:"Animated Elseworlds",name:"Elseworlds Mark",color:"#765b8f"},
];
export function achievementData(items:WatchEntry[],completed:Set<string>){const done=items.filter(i=>completed.has(i.id));const a=(name:string,description:string,unlocked:boolean,icon:string)=>({name,description,unlocked,icon});return [a("Archive Visitor","Complete your first entry",done.length>=1,"I"),a("Junior Curator","Complete 10 entries",done.length>=10,"X"),a("Master Archivist","Complete 100 entries",done.length>=100,"100"),a("Serial Scholar","Complete 100 episodes",done.filter(e=>e.kind==="episode").length>=100,"TV"),a("World's Finest","Complete every Batman and Superman entry",items.filter(e=>/Batman|Superman/.test(e.collection)).every(e=>completed.has(e.id)),"WF"),a("Wing Complete","Complete the selected catalog",items.length > 0 && items.every(e=>completed.has(e.id)),"HJ"),a("Hall Complete","Complete the full archive",items.every(e=>completed.has(e.id)),"HJ")];}
