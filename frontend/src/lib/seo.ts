export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://suomiwow.vaarattu.tv"
).replace(/\/$/, "");
export const SITE_NAME = "Suomi WoW";
export const SITE_DESCRIPTION =
  "Suomi WoW tracks Finnish World of Warcraft guild progress, suomalaiset WoW-killat, raid progression, boss kills, schedules, livestreams, and events.";
export const SITE_IMAGE = `${SITE_URL}/logo.png`;
export const SITE_IMAGE_ALT = "Suomi WoW Finnish World of Warcraft guild progress tracker";

export const SEO_KEYWORDS = [
  "Suomi WoW",
  "SuomiWoW",
  "Finnish WoW guild",
  "Finnish WoW guilds",
  "Finnish World of Warcraft guild",
  "suomalaiset WoW-killat",
  "suomalainen WoW kilta",
  "suomi wow kilta",
  "suomi wowi kilta",
  "WoW kilta",
  "WoW raid progress Finland",
];

type Locale = "en" | "fi";

export type PageSeoMetadata = {
  title: string;
  description: string;
};

export const PUBLIC_ROUTES = [
  { path: "/", changeFrequency: "hourly", priority: 1 },
  { path: "/guilds", changeFrequency: "daily", priority: 0.9 },
  { path: "/character-rankings", changeFrequency: "daily", priority: 0.75 },
  { path: "/compare", changeFrequency: "daily", priority: 0.75 },
  { path: "/raid-analytics", changeFrequency: "daily", priority: 0.75 },
  { path: "/timetable", changeFrequency: "daily", priority: 0.75 },
  { path: "/livestreams", changeFrequency: "hourly", priority: 0.7 },
  { path: "/events", changeFrequency: "hourly", priority: 0.7 },
  { path: "/tierlists", changeFrequency: "weekly", priority: 0.65 },
  { path: "/pickems", changeFrequency: "daily", priority: 0.65 },
  { path: "/pickems-rules", changeFrequency: "monthly", priority: 0.35 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.2 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.2 },
] as const;

export function getCanonicalUrl(pathname: string = "/") {
  const normalizedPathname = pathname === "/" ? "" : pathname;
  return `${SITE_URL}${normalizedPathname}`;
}

export function getPageMetadata(
  pathname: string,
  locale: Locale,
): PageSeoMetadata {
  const isEnglish = locale === "en";

  const pages: Record<string, PageSeoMetadata> = {
    "/": {
      title: isEnglish
        ? "Finnish WoW Guild Progress"
        : "Suomalaisten WoW-kiltojen edistyminen",
      description: isEnglish
        ? "Track Finnish World of Warcraft guild progress on Suomi WoW: raid progression, boss kills, schedules, livestreams, and events for suomalaiset WoW-killat."
        : "Seuraa suomalaisten World of Warcraft -kiltojen raid-edistymista: boss-tapot, aikataulut, striimit ja tapahtumat yhdessa paikassa.",
    },
    "/progress": {
      title: isEnglish
        ? "Finnish WoW Guild Progress"
        : "Suomalaisten WoW-kiltojen edistyminen",
      description: isEnglish
        ? "Track Finnish World of Warcraft guild progress on Suomi WoW: raid progression, boss kills, schedules, livestreams, and events for suomalaiset WoW-killat."
        : "Seuraa suomalaisten World of Warcraft -kiltojen raid-edistymista: boss-tapot, aikataulut, striimit ja tapahtumat yhdessa paikassa.",
    },
    "/guilds": {
      title: isEnglish ? "Finnish WoW Guilds" : "Suomalaiset WoW-killat",
      description: isEnglish
        ? "Browse Finnish WoW guilds, Suomi WoW kilta listings, realms, factions, and raid progression."
        : "Selaa suomalaisia WoW-kiltoja, realmeja, factioneita ja raid-edistymista.",
    },
    "/character-rankings": {
      title: isEnglish ? "Character Rankings" : "Hahmorankingit",
      description: isEnglish
        ? "Rank Finnish WoW guild characters by raid performance, roles, specs, and boss progress."
        : "Katso suomalaisten WoW-kiltojen hahmorankingit roolin, specin ja raid-suoritusten mukaan.",
    },
    "/compare": {
      title: isEnglish
        ? "Compare Finnish WoW Guilds"
        : "Vertaile suomalaisia WoW-kiltoja",
      description: isEnglish
        ? "Compare Finnish WoW guild raid metrics by raid tier, progress, pulls, and boss kills."
        : "Vertaile suomalaisten WoW-kiltojen raid-mittareita raidin, edistymisen, yritysten ja boss-tappojen mukaan.",
    },
    "/raid-analytics": {
      title: isEnglish
        ? "Finnish WoW Raid Analytics"
        : "Suomalaisten WoW-raidien analytiikka",
      description: isEnglish
        ? "Analyze Finnish WoW guild raid progress, boss pull counts, kill times, and performance trends."
        : "Analysoi suomalaisten WoW-kiltojen raid-edistymista, pull-maaria, tappoaikoja ja suorituskehitysta.",
    },
    "/events": {
      title: isEnglish
        ? "Finnish WoW Guild Events"
        : "Suomalaisten WoW-kiltojen tapahtumat",
      description: isEnglish
        ? "Latest boss kills, best pulls, and raid events from Finnish WoW guilds."
        : "Viimeisimmat boss-tapot, parhaat yritykset ja raid-tapahtumat suomalaisilta WoW-killoilta.",
    },
    "/livestreams": {
      title: isEnglish
        ? "Finnish WoW Livestreams"
        : "Suomalaisten WoW-kiltojen striimit",
      description: isEnglish
        ? "Watch live World of Warcraft raid streams from Finnish guild members."
        : "Katso suomalaisten kiltalaisten World of Warcraft -raidistriimeja livena.",
    },
    "/timetable": {
      title: isEnglish
        ? "Finnish WoW Raid Timetable"
        : "Suomalaisten WoW-kiltojen raid-aikataulu",
      description: isEnglish
        ? "View raid schedules for Finnish WoW guilds and suomalaiset WoW-killat."
        : "Katso suomalaisten WoW-kiltojen raid-aikataulut ja raidipaivat.",
    },
    "/tierlists": {
      title: isEnglish
        ? "Finnish WoW Guild Tier Lists"
        : "Suomalaisten WoW-kiltojen tier-listat",
      description: isEnglish
        ? "Compare Finnish WoW guild tier lists by speed, efficiency, raid progress, and boss kills."
        : "Vertaile suomalaisten WoW-kiltojen tier-listoja nopeuden, tehokkuuden, raid-edistymisen ja boss-tappojen mukaan.",
    },
    "/pickems": {
      title: isEnglish
        ? "Finnish WoW Guild Pickems"
        : "Suomalaisten WoW-kiltojen veikkaukset",
      description: isEnglish
        ? "Make and follow Finnish WoW guild raid race pickems for current raid tiers."
        : "Tee ja seuraa suomalaisten WoW-kiltojen raid race -veikkauksia nykyisille raideille.",
    },
    "/pickems-rules": {
      title: isEnglish ? "Pickems Rules" : "Veikkausten saannot",
      description: isEnglish
        ? "Rules and scoring information for Finnish WoW guild raid race pickems."
        : "Saannot ja pisteytys suomalaisten WoW-kiltojen raid race -veikkauksille.",
    },
    "/privacy": {
      title: isEnglish ? "Privacy Policy" : "Tietosuojakaytanto",
      description: isEnglish
        ? "Privacy policy for Suomi WoW, the Finnish WoW guild progress tracker."
        : "Suomi WoW -sivuston tietosuojakaytanto.",
    },
    "/terms": {
      title: isEnglish ? "Terms of Service" : "Kayttoehdot",
      description: isEnglish
        ? "Terms of service for Suomi WoW, the Finnish WoW guild progress tracker."
        : "Suomi WoW -sivuston kayttoehdot.",
    },
    "/profile": {
      title: isEnglish ? "Profile" : "Profiili",
      description: isEnglish
        ? "View and manage your Suomi WoW profile."
        : "Nayta ja hallitse Suomi WoW -profiiliasi.",
    },
  };

  if (pathname.startsWith("/guilds/") && pathname.split("/").length >= 4) {
    const parts = pathname.split("/");
    const realm = decodeURIComponent(parts[2] || "");
    const guildName = decodeURIComponent(parts[3] || "");

    return {
      title: `${guildName} - ${realm}`,
      description: isEnglish
        ? `View ${guildName} raid progression, boss kills, logs, streams, and guild details on ${realm}.`
        : `Katso ${guildName}-killan raid-edistyminen, boss-tapot, logit, striimit ja tiedot realmilla ${realm}.`,
    };
  }

  return pages[pathname] || pages["/"];
}

export function buildWebSiteStructuredData() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: [
      "SuomiWoW",
      "Suomi WoW Progress",
      "Finnish WoW Guild Progress",
    ],
    url: `${SITE_URL}/`,
    description: SITE_DESCRIPTION,
    inLanguage: ["en", "fi"],
    keywords: SEO_KEYWORDS,
  };
}
