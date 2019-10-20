module.exports = throttlingPlugin

const BottleneckLight = require('bottleneck/light')
const wrapRequest = require('./wrap-request')
const triggersNotificationPaths = require('./triggers-notification-paths')
const routeMatcher = require('./route-matcher')(triggersNotificationPaths)

// Workaround to allow tests to directly access the triggersNotification function.
const triggersNotification = throttlingPlugin.triggersNotification =
  routeMatcher.test.bind(routeMatcher)

const groups = {}

const createGroups = function (Bottleneck, common) {
  groups.global = new Bottleneck.Group({
    id: 'octokit-global',
    maxConcurrent: 10,
    ...common
  })
  groups.search = new Bottleneck.Group({
    id: 'octokit-search',
    maxConcurrent: 1,
    minTime: 2000,
    ...common
  })
  groups.write = new Bottleneck.Group({
    id: 'octokit-write',
    maxConcurrent: 1,
    minTime: 1000,
    ...common
  })
  groups.notifications = new Bottleneck.Group({
    id: 'octokit-notifications',
    maxConcurrent: 1,
    minTime: 3000,
    ...common
  })
}

function throttlingPlugin (octokit, octokitOptions = {}) {
  const {
    enabled = true,
    Bottleneck = BottleneckLight,
    id = 'no-id',
    timeout = 1000 * 60 * 2, // Redis TTL: 2 minutes
    connection
  } = octokitOptions.throttle || {}
  if (!enabled) {
    return
  }
  const common = { connection, timeout }

  if (groups.global == null) {
    createGroups(Bottleneck, common)
  }

  const state = Object.assign({
    clustering: connection != null,
    triggersNotification,
    minimumAbuseRetryAfter: 5,
    retryAfterBaseValue: 1000,
    retryLimiter: new Bottleneck(),
    id,
    ...groups
  }, octokitOptions.throttle)

  if (typeof state.onAbuseLimit !== 'function' || typeof state.onRateLimit !== 'function') {
    throw new Error(`octokit/plugin-throttling error:
        You must pass the onAbuseLimit and onRateLimit error handlers.
        See https://github.com/octokit/rest.js#throttling

        const octokit = new Octokit({
          throttle: {
            onAbuseLimit: (error, options) => {/* ... */},
            onRateLimit: (error, options) => {/* ... */}
          }
        })
    `)
  }

  const events = {}
  const emitter = new Bottleneck.Events(events)
  events.on('abuse-limit', state.onAbuseLimit)
  events.on('rate-limit', state.onRateLimit)
  events.on('error', e => console.warn('Error in throttling-plugin limit handler', e))

  state.retryLimiter.on('failed', async function (error, info) {
    const options = info.args[info.args.length - 1]
    const isGraphQL = options.url.startsWith('/graphql')

    if (!(isGraphQL || error.status === 403)) {
      return
    }

    const retryCount = ~~options.request.retryCount
    options.request.retryCount = retryCount

    const { wantRetry, retryAfter } = await (async function () {
      if (/\babuse\b/i.test(error.message)) {
        // The user has hit the abuse rate limit. (REST only)
        // https://developer.github.com/v3/#abuse-rate-limits

        // The Retry-After header can sometimes be blank when hitting an abuse limit,
        // but is always present after 2-3s, so make sure to set `retryAfter` to at least 5s by default.
        const retryAfter = Math.max(~~error.headers['retry-after'], state.minimumAbuseRetryAfter)
        const wantRetry = await emitter.trigger('abuse-limit', retryAfter, options)
        return { wantRetry, retryAfter }
      }
      if (error.headers != null && error.headers['x-ratelimit-remaining'] === '0') {
        // The user has used all their allowed calls for the current time period (REST and GraphQL)
        // https://developer.github.com/v3/#rate-limiting

        const rateLimitReset = new Date(~~error.headers['x-ratelimit-reset'] * 1000).getTime()
        const retryAfter = Math.max(Math.ceil((rateLimitReset - Date.now()) / 1000), 0)
        const wantRetry = await emitter.trigger('rate-limit', retryAfter, options)
        return { wantRetry, retryAfter }
      }
      return {}
    })()

    if (wantRetry) {
      options.request.retryCount++
      return retryAfter * state.retryAfterBaseValue
    }
  })

  octokit.hook.wrap('request', wrapRequest.bind(null, state))
}
