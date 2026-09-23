/** Decode lossless metric tuples once at the transport boundary. Older servers
 * keep returning ordinary points and pass through without copying. */
export function decodeMetricResponse<T>(value: T): T {
  if (!value || typeof value !== 'object')
    return value
  const result = value as Record<string, unknown>
  if (!Array.isArray(result.series))
    return value
  let changed = false
  const series = result.series.map((item: unknown) => {
    if (!item || typeof item !== 'object')
      return item
    const entry = item as Record<string, unknown>
    if (entry.point_format !== 'points_v1')
      return item
    if (!Array.isArray(entry.points))
      throw new Error('Invalid compact metric points')
    changed = true
    return {
      ...entry,
      point_format: undefined,
      points: entry.points.map((tuple: unknown) => {
        if (!Array.isArray(tuple) || tuple.length < 3 || tuple.length > 4
          || !Number.isSafeInteger(tuple[0]) || Math.abs(tuple[0]) > 8640000000000000
          || (tuple[1] !== null && (typeof tuple[1] !== 'number' || !Number.isFinite(tuple[1])))
          || !Number.isSafeInteger(tuple[2]) || tuple[2] < 0)
          throw new Error('Invalid compact metric sample')
        return {
          time: new Date(tuple[0]).toISOString(),
          value: tuple[1] as number | null,
          count: tuple[2] as number,
          tags: entry.tags,
          ...(tuple[3] === undefined ? {} : { labels: tuple[3] }),
        }
      }),
    }
  })
  return changed ? { ...result, series } as T : value
}
