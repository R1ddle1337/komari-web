/** Decode the canonical points_v1 metric wire format at the transport boundary. */
export function decodeMetricResponse<T>(value: T): T {
  if (!value || typeof value !== 'object')
    throw new Error('Invalid metric response')
  const result = value as Record<string, unknown>
  if (!Array.isArray(result.series))
    throw new Error('Invalid metric series')
  const series = result.series.map((item: unknown) => {
    if (!item || typeof item !== 'object')
      throw new Error('Invalid metric series')
    const entry = item as Record<string, unknown>
    if (entry.point_format !== 'points_v1')
      throw new Error('Unsupported metric point format')
    if (!Array.isArray(entry.points))
      throw new Error('Invalid compact metric points')
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
  return { ...result, series } as T
}
