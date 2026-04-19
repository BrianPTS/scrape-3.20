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

// ── Main entry point ───────────────────────────────────────────────

/**
 * Detect eventType from venue name and/or event name.
 * Returns 'NFL'|'MLB'|'NHL'|'NBA' if confident, null otherwise.
 * Does NOT return 'OTHER' — callers choose whether to default to that.
 */
export function detectEventType(
  venue: string | undefined | null,
  eventName: string | undefined | null,
): 'NFL' | 'MLB' | 'NHL' | 'NBA' | null {
  const v = (venue || '').trim();
  const n = (eventName || '').trim();

  // 1. Check venue name (case-insensitive exact match)
  if (v) {
    const vLower = v.toLowerCase();
    for (const [venueName, sport] of Object.entries(VENUE_TO_SPORT)) {
      if (venueName.toLowerCase() === vLower) return sport;
    }
  }

  // 2. Check event name keywords (covers shared venues + generic names)
  if (n) {
    for (const { pattern, type } of EVENT_NAME_PATTERNS) {
      if (pattern.test(n)) return type;
    }
  }

  return null;
}
