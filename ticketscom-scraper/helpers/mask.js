/**
 * Bitmask range utilities for tickets.com seat config ID masks.
 *
 * tickets.com represents seat availability and pricescale assignments as
 * pipe-delimited ranges of seatConfigIds, e.g. "9601-9602|9612".
 */

/**
 * Expand a mask string like "9601-9602|9612" into a Set of integers.
 * @param {string} mask - Pipe-delimited ranges, e.g. "9601-9602|9612"
 * @returns {Set<number>}
 */
export function expandMask(mask) {
  const result = new Set();
  if (!mask || mask.trim() === '') return result;

  const parts = mask.split('|');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed === '') continue;

    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      for (let i = start; i <= end; i++) {
        result.add(i);
      }
    } else {
      result.add(parseInt(trimmed, 10));
    }
  }
  return result;
}

/**
 * Check if a seatConfigId falls within a mask string.
 * @param {number} configId
 * @param {string} mask
 * @returns {boolean}
 */
export function isInMask(configId, mask) {
  if (!mask || mask.trim() === '') return false;

  const parts = mask.split('|');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed === '') continue;

    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (configId >= start && configId <= end) return true;
    } else {
      if (configId === parseInt(trimmed, 10)) return true;
    }
  }
  return false;
}

/**
 * Find which pricescale a seatConfigId belongs to.
 * @param {number} configId
 * @param {Array<{id: string|number, mask: string, ref_price: string}>} pricescaleRanges
 * @returns {object|null} The matching pricescale range object, or null
 */
export function findPricescaleForConfigId(configId, pricescaleRanges) {
  for (const ps of pricescaleRanges) {
    if (isInMask(configId, ps.mask)) return ps;
  }
  return null;
}
