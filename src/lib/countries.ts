// Canonical country names for the signup and onboarding location selects,
// paired with ISO 3166-1 alpha-2 codes for ad-platform matching (Meta hashes
// `country` as the lowercase two-letter code — a hashed "united states" never
// matches a hashed "us", so display names must resolve to codes before they
// touch a pixel or CAPI payload). users.country stores the display name
// verbatim; legacy rows hold free text from the old onboarding input, which
// countryToIso2 below tolerates where it can.
export const COUNTRY_ENTRIES: readonly (readonly [string, string])[] = [
  ["Afghanistan", "af"], ["Albania", "al"], ["Algeria", "dz"],
  ["Andorra", "ad"], ["Angola", "ao"], ["Antigua and Barbuda", "ag"],
  ["Argentina", "ar"], ["Armenia", "am"], ["Australia", "au"],
  ["Austria", "at"], ["Azerbaijan", "az"], ["Bahamas", "bs"],
  ["Bahrain", "bh"], ["Bangladesh", "bd"], ["Barbados", "bb"],
  ["Belarus", "by"], ["Belgium", "be"], ["Belize", "bz"], ["Benin", "bj"],
  ["Bhutan", "bt"], ["Bolivia", "bo"], ["Bosnia and Herzegovina", "ba"],
  ["Botswana", "bw"], ["Brazil", "br"], ["Brunei", "bn"], ["Bulgaria", "bg"],
  ["Burkina Faso", "bf"], ["Burundi", "bi"], ["Cabo Verde", "cv"],
  ["Cambodia", "kh"], ["Cameroon", "cm"], ["Canada", "ca"],
  ["Central African Republic", "cf"], ["Chad", "td"], ["Chile", "cl"],
  ["China", "cn"], ["Colombia", "co"], ["Comoros", "km"], ["Congo", "cg"],
  ["Congo (DRC)", "cd"], ["Costa Rica", "cr"], ["Croatia", "hr"],
  ["Cuba", "cu"], ["Cyprus", "cy"], ["Czechia", "cz"], ["Denmark", "dk"],
  ["Djibouti", "dj"], ["Dominica", "dm"], ["Dominican Republic", "do"],
  ["Ecuador", "ec"], ["Egypt", "eg"], ["El Salvador", "sv"],
  ["Equatorial Guinea", "gq"], ["Eritrea", "er"], ["Estonia", "ee"],
  ["Eswatini", "sz"], ["Ethiopia", "et"], ["Fiji", "fj"], ["Finland", "fi"],
  ["France", "fr"], ["Gabon", "ga"], ["Gambia", "gm"], ["Georgia", "ge"],
  ["Germany", "de"], ["Ghana", "gh"], ["Greece", "gr"], ["Grenada", "gd"],
  ["Guatemala", "gt"], ["Guinea", "gn"], ["Guinea-Bissau", "gw"],
  ["Guyana", "gy"], ["Haiti", "ht"], ["Honduras", "hn"], ["Hungary", "hu"],
  ["Iceland", "is"], ["India", "in"], ["Indonesia", "id"], ["Iran", "ir"],
  ["Iraq", "iq"], ["Ireland", "ie"], ["Israel", "il"], ["Italy", "it"],
  ["Ivory Coast", "ci"], ["Jamaica", "jm"], ["Japan", "jp"],
  ["Jordan", "jo"], ["Kazakhstan", "kz"], ["Kenya", "ke"],
  ["Kiribati", "ki"], ["Kosovo", "xk"], ["Kuwait", "kw"],
  ["Kyrgyzstan", "kg"], ["Laos", "la"], ["Latvia", "lv"], ["Lebanon", "lb"],
  ["Lesotho", "ls"], ["Liberia", "lr"], ["Libya", "ly"],
  ["Liechtenstein", "li"], ["Lithuania", "lt"], ["Luxembourg", "lu"],
  ["Madagascar", "mg"], ["Malawi", "mw"], ["Malaysia", "my"],
  ["Maldives", "mv"], ["Mali", "ml"], ["Malta", "mt"],
  ["Marshall Islands", "mh"], ["Mauritania", "mr"], ["Mauritius", "mu"],
  ["Mexico", "mx"], ["Micronesia", "fm"], ["Moldova", "md"],
  ["Monaco", "mc"], ["Mongolia", "mn"], ["Montenegro", "me"],
  ["Morocco", "ma"], ["Mozambique", "mz"], ["Myanmar", "mm"],
  ["Namibia", "na"], ["Nauru", "nr"], ["Nepal", "np"],
  ["Netherlands", "nl"], ["New Zealand", "nz"], ["Nicaragua", "ni"],
  ["Niger", "ne"], ["Nigeria", "ng"], ["North Korea", "kp"],
  ["North Macedonia", "mk"], ["Norway", "no"], ["Oman", "om"],
  ["Pakistan", "pk"], ["Palau", "pw"], ["Palestine", "ps"],
  ["Panama", "pa"], ["Papua New Guinea", "pg"], ["Paraguay", "py"],
  ["Peru", "pe"], ["Philippines", "ph"], ["Poland", "pl"],
  ["Portugal", "pt"], ["Qatar", "qa"], ["Romania", "ro"], ["Russia", "ru"],
  ["Rwanda", "rw"], ["Saint Kitts and Nevis", "kn"], ["Saint Lucia", "lc"],
  ["Saint Vincent and the Grenadines", "vc"], ["Samoa", "ws"],
  ["San Marino", "sm"], ["Sao Tome and Principe", "st"],
  ["Saudi Arabia", "sa"], ["Senegal", "sn"], ["Serbia", "rs"],
  ["Seychelles", "sc"], ["Sierra Leone", "sl"], ["Singapore", "sg"],
  ["Slovakia", "sk"], ["Slovenia", "si"], ["Solomon Islands", "sb"],
  ["Somalia", "so"], ["South Africa", "za"], ["South Korea", "kr"],
  ["South Sudan", "ss"], ["Spain", "es"], ["Sri Lanka", "lk"],
  ["Sudan", "sd"], ["Suriname", "sr"], ["Sweden", "se"],
  ["Switzerland", "ch"], ["Syria", "sy"], ["Taiwan", "tw"],
  ["Tajikistan", "tj"], ["Tanzania", "tz"], ["Thailand", "th"],
  ["Timor-Leste", "tl"], ["Togo", "tg"], ["Tonga", "to"],
  ["Trinidad and Tobago", "tt"], ["Tunisia", "tn"], ["Turkey", "tr"],
  ["Turkmenistan", "tm"], ["Tuvalu", "tv"], ["Uganda", "ug"],
  ["Ukraine", "ua"], ["United Arab Emirates", "ae"],
  ["United Kingdom", "gb"], ["United States", "us"], ["Uruguay", "uy"],
  ["Uzbekistan", "uz"], ["Vanuatu", "vu"], ["Vatican City", "va"],
  ["Venezuela", "ve"], ["Vietnam", "vn"], ["Yemen", "ye"],
  ["Zambia", "zm"], ["Zimbabwe", "zw"],
];

// The select options — display names in list order.
export const COUNTRIES: readonly string[] = COUNTRY_ENTRIES.map(([name]) => name);

const NAME_TO_CODE = new Map(
  COUNTRY_ENTRIES.map(([name, code]) => [name.toLowerCase(), code])
);
const CODES = new Set(COUNTRY_ENTRIES.map(([, code]) => code));

// Legacy spellings seen in free-text rows (and provider quirks) that should
// still resolve. Extend as real values surface — never guess-map here.
const ALIASES: Record<string, string> = {
  "usa": "us",
  "u.s.": "us",
  "u.s.a.": "us",
  "united states of america": "us",
  "america": "us",
  "uk": "gb",
  "u.k.": "gb",
  "great britain": "gb",
  "england": "gb",
  "scotland": "gb",
  "wales": "gb",
  "northern ireland": "gb",
  "czech republic": "cz",
  "holland": "nl",
  "the netherlands": "nl",
  "south korea (republic of korea)": "kr",
  "republic of korea": "kr",
  "cote d'ivoire": "ci",
  "côte d'ivoire": "ci",
  "cape verde": "cv",
  "burma": "mm",
  "swaziland": "sz",
  "macedonia": "mk",
  "east timor": "tl",
  "democratic republic of the congo": "cd",
  "republic of the congo": "cg",
  "turkiye": "tr",
  "türkiye": "tr",
};

/**
 * Resolve a stored country value — canonical name, legacy free text, or an
 * already-ISO code (Stripe billing addresses arrive as alpha-2) — to the
 * lowercase ISO 3166-1 alpha-2 code ad platforms match on. Returns undefined
 * when the value can't be resolved confidently: sending nothing beats
 * sending a hash that can never match.
 */
export function countryToIso2(value: string | null | undefined): string | undefined {
  const v = value?.trim().toLowerCase();
  if (!v) return undefined;
  if (v.length === 2 && CODES.has(v)) return v;
  return NAME_TO_CODE.get(v) ?? ALIASES[v];
}
