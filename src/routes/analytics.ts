import type { FastifyInstance, RegisterOptions, DoneFuncWithErrOrRes } from 'fastify'

import { Route } from '@/structures'
import { toArray } from '@/utils'
import { BetaAnalyticsDataClient } from '@google-analytics/data'

import key from '@/keys/adrian-salvador-website-9e67e3e8a223.json' assert { type: 'json' }

interface Dimensions {
  name: string
}

interface Metrics {
  name: string
}

interface OrderBys {
  metric: { metricName: string }
  desc: boolean
}

interface ReportStructure {
  property: string
  dateRanges: Array<{ startDate: string; endDate: string }>
  dimensions: Array<Dimensions>
  metrics: Array<Metrics>
  orderBys?: Array<OrderBys>
}

interface Results {
  [key: string]: any
}

interface Summary {
  basic?: object
  popular?: Array<object>
  trending?: Array<object>
  fileCount?: number
}

export default class Analytics extends Route {
  constructor() {
    super({
      position: 2,
      path: '/analytics',
      middlewares: ['auth']
    })
  }

  routes(app: FastifyInstance, _options: RegisterOptions, done: DoneFuncWithErrOrRes) {
    const reportStructure = (startDate: string, dimensions: Array<{ name: string }>, metrics: Array<{ name: string }>, orderBys?: Array<{ metric: { metricName: string }; desc: boolean }>): ReportStructure => ({
      property: 'properties/325424669',
      dateRanges: [
        {
          startDate,
          endDate: 'today'
        }
      ],
      dimensions,
      metrics,
      orderBys
    })

    const fillDimensionsAndPagePath = (item: any, removals: string[], reportQuery: ReportStructure, row: any, pagePath: string) => {
      row.dimensionValues.forEach((dimension, idx) => {
        let dimensionValue = dimension.value

        // If we have any strings to remove from the dimension value
        removals.forEach((toReplace: string) => {
          dimensionValue = dimensionValue.replace(toReplace, '')
        })

        const dimensionKey = reportQuery.dimensions[idx].name
        if (dimensionKey === 'pagePath') {
          if (dimensionValue !== '/') {
            dimensionValue = dimensionValue.replace(/\/$/, '')
          }
          pagePath = dimensionValue
        } else {
          item[dimensionKey] = dimensionValue
        }
      })
    }

    const fillMetrics = (item: any, reportQuery: ReportStructure, row: any) => {
      row.metricValues.forEach((metric, idx) => {
        const metricKey = reportQuery.metrics[idx].name
        item[metricKey] = metric.value
      })
    }

    const getResults = (reportQuery: ReportStructure, response: any, alias: string) => {
      const results: Results = {}
      const removals = []

      if (response && response.rows) {
        response.rows.forEach(row => {
          if (row && row.dimensionValues && row.dimensionValues.length > 0 && row.metricValues) {
            const item = {}
            let pagePath

            fillDimensionsAndPagePath(item, removals, reportQuery, row, pagePath)
            fillMetrics(item, reportQuery, row)

            results[pagePath] = item
          }

          if (alias === 'basic') {
            results.pageViews = row.metricValues[0]?.value || null
            results.totalVisitors = row.metricValues[1]?.value || null
            results.newVisitors = row.metricValues[2]?.value || null
            results.engagementRate = row.metricValues[3]?.value || null
          }
        })
      }

      return results
    }

    const getReportData = async (analyticsData: BetaAnalyticsDataClient, reports: {
      trending: () => ReportStructure
      basic: () => ReportStructure
      popular: () => ReportStructure
    }) => {
      const summary: Summary = {}

      for (const [alias, report] of Object.entries(reports)) {
        const reportQuery = report()
        const response = await analyticsData.runReport(reportQuery)
          .then((value) => value[0])
          .catch(err => console.error(err))
        summary[alias] = getResults(reportQuery, response, alias)
      }

      return summary
    }

    app.get('/', async () => {
      const analyticsData = new BetaAnalyticsDataClient({
        credentials: {
          client_email: key.client_email,
          private_key: key.private_key
        }
      })

      const reports = {
        basic: () => reportStructure('7daysAgo', [],
          [{ name: 'screenPageViews' }, { name: 'totalUsers' }, { name: 'newUsers' }, { name: 'engagementRate' }]
        ),
        popular: () => reportStructure('30daysAgo',
          [{ name: 'pagePath' }, { name: 'pageTitle' }],
          [{ name: 'screenPageViews' }],
          [{ metric: { metricName: 'screenPageViews' }, desc: true }]
        ),
        trending: () => reportStructure('1daysAgo',
          [{ name: 'pagePath' }, { name: 'pageTitle' }],
          [{ name: 'screenPageViews' }],
          [{ metric: { metricName: 'screenPageViews' }, desc: true }]
        )
      }

      const summary: Summary = await getReportData(analyticsData, reports)

      summary.popular = toArray(summary.popular)
      summary.trending = toArray(summary.trending)

      return summary
    })

    done()
  }
}
