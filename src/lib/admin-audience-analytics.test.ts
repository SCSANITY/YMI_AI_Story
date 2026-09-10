import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAudienceAnalyticsData,
  getAudienceDateRange,
  normalizeAudienceRange,
  parseVisitAggregateRows,
  selectTrendLabelIndexes,
} from './admin-audience-analytics'

test('normalizes the Admin audience range to the two supported MVP windows', () => {
  assert.equal(normalizeAudienceRange('30'), 30)
  assert.equal(normalizeAudienceRange(['7', '30']), 7)
  assert.equal(normalizeAudienceRange('90'), 7)
})

test('builds inclusive UTC date windows', () => {
  assert.deepEqual(
    getAudienceDateRange(7, new Date('2026-09-09T23:59:59.000Z')),
    { since: '2026-09-03', until: '2026-09-09' },
  )
})

test('spaces trend labels evenly while preserving the first and last dates', () => {
  assert.deepEqual(selectTrendLabelIndexes(30), [0, 7, 15, 22, 29])
  assert.deepEqual(selectTrendLabelIndexes(7), [0, 2, 4, 6])
  assert.deepEqual(selectTrendLabelIndexes(1), [0])
  assert.deepEqual(selectTrendLabelIndexes(0), [])
})

test('parses only valid aggregate rows and removes fractional counts', () => {
  assert.deepEqual(
    parseVisitAggregateRows({
      data: [
        { country: 'GB', pageviews: 12.2, visitors: '8' },
        { country: '', pageviews: 5, visitors: 4 },
        null,
      ],
    }, 'country'),
    [{ key: 'GB', pageviews: 12, visitors: 8 }],
  )
})

test('fills missing trend days and derives the lightweight summary', () => {
  const result = buildAudienceAnalyticsData(
    7,
    { since: '2026-09-03', until: '2026-09-09' },
    {
      day: [
        { key: '2026-09-03', pageviews: 10, visitors: 5 },
        { key: '2026-09-09', pageviews: 8, visitors: 4 },
      ],
      country: [
        { key: 'US', pageviews: 7, visitors: 4 },
        { key: 'GB', pageviews: 11, visitors: 5 },
      ],
    },
  )

  assert.equal(result.trend.length, 7)
  assert.equal(result.trend[1]?.pageviews, 0)
  assert.equal(result.pageviews, 18)
  assert.equal(result.visitors, 9)
  assert.equal(result.viewsPerVisitor, 2)
  assert.equal(result.countries[0]?.key, 'GB')
})
