/**
 * Venue → eventType auto-mapping.
 *
 * Used in two places:
 *   1. Import flow — auto-selects the dropdown when a venue is recognized.
 *   2. Bulk-assign action — updates all existing events whose eventType
 *      is null, based on venue name or event name keywords.
 *
 * Mapping strategy:
 *   - VENUE_TO_SPORT: exact venue name → sport. Covers 95%+ of cases
 *     since most pro venues are single-sport.
 *   - EVENT_NAME_KEYWORDS: regex patterns matched against Event_Name.
 *     Catches shared-venue cases (e.g. MSG hosts both NHL Rangers and
 *     NBA Knicks) and generic names that don't map to a specific venue.
 *   - detectEventType(venue, eventName): the main entry point. Checks
 *     venue first, then event name keywords, returns null if no match.
 */

// ── Venue name → sport (case-insensitive match) ────────────────────
// Only include venues that are definitively ONE sport. Shared venues
// (e.g. Madison Square Garden) are handled by event-name keywords.

export const VENUE_TO_SPORT: Record<string, 'NFL' | 'MLB' | 'NHL' | 'NBA'> = {
  // ─── NFL ───────────────────────────────────────────────────────
  'Acrisure Stadium': 'NFL',
  'Allegiant Stadium': 'NFL',
  'Arrowhead Stadium': 'NFL',
  'AT&T Stadium': 'NFL',
  'Bank of America Stadium': 'NFL',
  'Caesars Superdome': 'NFL',
  'EverBank Stadium': 'NFL',
  'Empower Field at Mile High': 'NFL',
  'Ford Field': 'NFL',
  'Gillette Stadium': 'NFL',
  'Hard Rock Stadium': 'NFL',
  'Highmark Stadium': 'NFL',
  'Huntington Bank Field': 'NFL',
  'GEHA Field at Arrowhead Stadium': 'NFL',
  'Lambeau Field': 'NFL',
  'Levi\'s Stadium': 'NFL',
  'Lincoln Financial Field': 'NFL',
  'Lucas Oil Stadium': 'NFL',
  'Lumen Field': 'NFL',
  'M&T Bank Stadium': 'NFL',
  'Mercedes-Benz Stadium': 'NFL',
  'MetLife Stadium': 'NFL',
  'New Era Field': 'NFL',
  'Nissan Stadium': 'NFL',
  'Northwest Stadium': 'NFL',
  'NRG Stadium': 'NFL',
  'Paycor Stadium': 'NFL',
  'Raymond James Stadium': 'NFL',
  'SoFi Stadium': 'NFL',
  'Soldier Field': 'NFL',
  'State Farm Stadium': 'NFL',
  'U.S. Bank Stadium': 'NFL',

  // ─── MLB ───────────────────────────────────────────────────────
  'American Family Field': 'MLB',
  'Angel Stadium': 'MLB',
  'Busch Stadium': 'MLB',
  'Chase Field': 'MLB',
  'Citizens Bank Park': 'MLB',
  'Comerica Park': 'MLB',
  'Coors Field': 'MLB',
  'Dodger Stadium': 'MLB',
  'Fenway Park': 'MLB',
  'Globe Life Field': 'MLB',
  'Great American Ball Park': 'MLB',
  'Guaranteed Rate Field': 'MLB',
  'Kauffman Stadium': 'MLB',
  'loanDepot park': 'MLB',
  'Marlins Park': 'MLB',
  'Minute Maid Park': 'MLB',
  'Nationals Park': 'MLB',
  'Oakland Coliseum': 'MLB',
  'Oracle Park': 'MLB',
  'Oriole Park at Camden Yards': 'MLB',
  'Petco Park': 'MLB',
  'PNC Park': 'MLB',
  'Progressive Field': 'MLB',
  'Rate Field': 'MLB',
  'RingCentral Coliseum': 'MLB',
  'Rogers Centre': 'MLB',
  'Sacramento River Cats Ballpark': 'MLB',
  'T-Mobile Park': 'MLB',
  'Target Field': 'MLB',
  'Tropicana Field': 'MLB',
  'Truist Park': 'MLB',
  'Wrigley Field': 'MLB',
  'Yankee Stadium': 'MLB',

  // ─── NHL-only venues (arenas not shared with NBA) ──────────────
  'Amerant Bank Arena': 'NHL',
  'Climate Pledge Arena': 'NHL',
  'Lenovo Center': 'NHL',
  'Nationwide Arena': 'NHL',
  'PPG Paints Arena': 'NHL',
  'SAP Center': 'NHL',
  'UBS Arena': 'NHL',
  'Xcel Energy Center': 'NHL',

  // ─── NBA-only venues (arenas not shared with NHL) ──────────────
  'Chase Center': 'NBA',
  'Frost Bank Center': 'NBA',
  'Footprint Center': 'NBA',
  'Gainbridge Fieldhouse': 'NBA',
  'Spectrum Center': 'NBA',
  'Target Center': 'NBA',
  'Toyota Center': 'NBA',
};

// ── Shared venues — both NBA and NHL play here ─────────────────────
// These are NOT in VENUE_TO_SPORT because we can't determine the sport
// from the venue alone. detectEventType falls through to name keywords.
export const SHARED_VENUES = new Set([
  'Amalie Arena',           // Lightning (NHL) + no NBA
  'Ball Arena',             // Avalanche (NHL) + Nuggets (NBA)
  'Barclays Center',        // Islanders (NHL) + Nets (NBA)
  'Capital One Arena',      // Capitals (NHL) + Wizards (NBA)
  'crypto.com Arena',       // Kings (NHL) + Lakers/Clippers (NBA)
  'Crypto.com Arena',
  'Delta Center',           // Jazz (NBA) + Utah Hockey Club (NHL)
  'Enterprise Center',      // Blues (NHL)
  'FLA Live Arena',         // Panthers (NHL)
  'Honda Center',           // Ducks (NHL)
  'Intuit Dome',            // Clippers (NBA)
  'KeyBank Center',         // Sabres (NHL)
  'Little Caesars Arena',   // Red Wings (NHL) + Pistons (NBA)
  'Madison Square Garden',  // Rangers (NHL) + Knicks (NBA)
  'Moda Center',            // Trail Blazers (NBA)
  'Mullett Arena',          // Coyotes (NHL)
  'Prudential Center',      // Devils (NHL)
  'Scotiabank Arena',       // Maple Leafs (NHL) + Raptors (NBA)
  'Smoothie King Center',   // Pelicans (NBA)
  'State Farm Arena',       // Hawks (NBA)
  'TD Garden',              // Bruins (NHL) + Celtics (NBA)
  'United Center',          // Blackhawks (NHL) + Bulls (NBA)
  'Wells Fargo Center',     // Flyers (NHL) + 76ers (NBA)
]);

// ── Event name keyword patterns ────────────────────────────────────
// Checked when the venue doesn't resolve to a single sport.
// Order matters — first match wins. More specific patterns first.

export const EVENT_NAME_PATTERNS: Array<{ pattern: RegExp; type: 'NFL' | 'MLB' | 'NHL' | 'NBA' }> = [
  // NFL team names
  { pattern: /\b(Cardinals|Falcons|Ravens|Bills|Panthers|Bears|Bengals|Browns|Cowboys|Broncos|Lions|Packers|Texans|Colts|Jaguars|Chiefs|Raiders|Chargers|Rams|Dolphins|Vikings|Patriots|Saints|Giants|Jets|Eagles|Steelers|49ers|Seahawks|Buccaneers|Titans|Commanders|Football)\b/i, type: 'NFL' },
  { pattern: /\bNFL\b/, type: 'NFL' },

  // MLB team names
  { pattern: /\b(Diamondbacks|D-backs|Braves|Orioles|Red Sox|Cubs|White Sox|Reds|Guardians|Rockies|Tigers|Astros|Royals|Angels|Dodgers|Marlins|Brewers|Twins|Mets|Yankees|Athletics|Phillies|Pirates|Padres|Mariners|Blue Jays|Rays|Rangers|Nationals|Baseball)\b/i, type: 'MLB' },
  { pattern: /\bMLB\b/, type: 'MLB' },

  // NHL team names
  { pattern: /\b(Ducks|Coyotes|Bruins|Sabres|Flames|Hurricanes|Blackhawks|Avalanche|Blue Jackets|Stars|Red Wings|Oilers|Panthers|Kings|Wild|Canadiens|Predators|Devils|Islanders|Rangers|Senators|Flyers|Penguins|Sharks|Kraken|Blues|Lightning|Maple Leafs|Canucks|Golden Knights|Capitals|Jets|Hockey)\b/i, type: 'NHL' },
  { pattern: /\bNHL\b/, type: 'NHL' },

  // NBA team names
  { pattern: /\b(Hawks|Celtics|Nets|Hornets|Bulls|Cavaliers|Mavericks|Nuggets|Pistons|Warriors|Rockets|Pacers|Clippers|Lakers|Grizzlies|Heat|Bucks|Timberwolves|Pelicans|Knicks|Thunder|Magic|76ers|Sixers|Suns|Trail Blazers|Blazers|Kings|Spurs|Raptors|Jazz|Wizards|Basketball)\b/i, type: 'NBA' },
  { pattern: /\bNBA\b/, type: 'NBA' },
];

// ── Entertainment / non-sport signals ──────────────────────────────
// If an event name contains any of these, the venue is IGNORED and
// we return null — it's almost certainly a concert, comedy show,
// family performance, or other non-sport event. The user picks OTHER.
export const ENTERTAINMENT_PATTERNS: RegExp[] = [
  // Music / concert
  /\bconcert\b/i, /\bin concert\b/i, /\btour\b/i, /\bworld tour\b/i,
  /\blive\b/i, /\bfeat\.?\b/i, /\bfeaturing\b/i, /\bacoustic\b/i,
  /\bresidency\b/i, /\bunplugged\b/i,
  // Comedy
  /\bcomedy\b/i, /\bstand.?up\b/i,
  // Theater / stage
  /\bbroadway\b/i, /\bmusical\b/i, /\btheatre\b/i, /\bballet\b/i,
  /\bopera\b/i, /\bshakespeare\b/i,
  // Family / kid shows
  /\bdisney\b/i, /\bdisney on ice\b/i, /\bsesame street\b/i,
  /\bpaw patrol\b/i, /\bmonster jam\b/i, /\bon ice\b/i, /\bcircus\b/i,
  /\bharlem globetrotters\b/i, /\bcirque du soleil\b/i,
  // Wrestling / combat (tracked separately, not as major-sport)
  /\bwwe\b/i, /\baew\b/i, /\bufc\b/i, /\bmma\b/i, /\bboxing night\b/i,
];

// ── Game signals — indicate this IS a sporting event ──────────────
// Used to promote a venue match to confident when the event name alone
// doesn't have a team keyword but still clearly looks like a game.
export const GAME_SIGNAL_PATTERNS: RegExp[] = [
  /\bvs\.?\s+/i, /\bv\.\s+/i,             // "Team vs Team"
  /\bgame\s*\d+/i, /\bgm\s*\d+/i,          // "Game 1", "Gm 1"
  /\bround\s*\d+/i, /\brd\s*\d+/i,         // "Round 1", "Rd 1"
  /\bplayoffs?\b/i, /\bsemifinals?\b/i, /\bquarterfinals?\b/i,
  /\bworld series\b/i, /\bsuper bowl\b/i, /\bstanley cup\b/i,
  /\bhome\s*(gm|game)\b/i,
  /\bspring training\b/i, /\bopening day\b/i, /\ball.?star\b/i,
];

function hasEntertainmentSignal(name: string): boolean {
  return ENTERTAINMENT_PATTERNS.some(rx => rx.test(name));
}

function hasGameSignal(name: string): boolean {
  return GAME_SIGNAL_PATTERNS.some(rx => rx.test(name));
}

// ── Main entry point ───────────────────────────────────────────────

/**
 * Detect eventType from venue name and/or event name.
 * Returns 'NFL'|'MLB'|'NHL'|'NBA' if confident, null otherwise.
 *
 * Priority order (strict, conservative):
 *   1. Entertainment signal in event name (concert, comedy, etc.)
 *      → return null. The venue doesn't matter — concerts at Yankee
 *      Stadium aren't MLB.
 *   2. Team name or league acronym in event name → return that sport.
 *      This is the authoritative signal.
 *   3. Game signal (vs, game #, playoffs, etc.) + venue match → return
 *      venue's sport. Used when the event name is sport-shaped but
 *      doesn't mention a specific team (e.g. "Playoffs Home Game 1").
 *   4. Everything else → null. User picks manually.
 *
 * Critically: a venue match ALONE is never enough. "Jay-Z at Yankee
 * Stadium" returns null (not MLB) because no sport signal is present.
 */
export function detectEventType(
  venue: string | undefined | null,
  eventName: string | undefined | null,
): 'NFL' | 'MLB' | 'NHL' | 'NBA' | null {
  const v = (venue || '').trim();
  const n = (eventName || '').trim();

  // 1. Entertainment signals override everything. Concert at a sports
  //    stadium is still a concert.
  if (hasEntertainmentSignal(n)) return null;

  // 2. Team name or league acronym in event name — authoritative.
  for (const { pattern, type } of EVENT_NAME_PATTERNS) {
    if (pattern.test(n)) return type;
  }

  // 3. Game signal (vs, game #, playoffs, etc.) + matching venue.
  //    This catches sport-shaped events like "Home Game 1" or "Playoffs
  //    Round 1" at a known single-sport venue.
  if (v && hasGameSignal(n)) {
    const vLower = v.toLowerCase();
    for (const [venueName, sport] of Object.entries(VENUE_TO_SPORT)) {
      if (venueName.toLowerCase() === vLower) return sport;
    }
  }

  // 4. No confident signal — user picks manually.
  return null;
}
