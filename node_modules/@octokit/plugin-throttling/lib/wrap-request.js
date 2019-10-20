module.exports = wrapRequest

const noop = () => Promise.resolve()

function wrapRequest (state, request, options) {
  return state.retryLimiter.schedule(doRequest, state, request, options)
}

async function doRequest (state, request, options) {
  const isWrite = options.method !== 'GET' && options.method !== 'HEAD'
  const isSearch = options.method === 'GET' && options.url.startsWith('/search/')
  const isGraphQL = options.url.startsWith('/graphql')

  const retryCount = ~~options.request.retryCount
  const jobOptions = retryCount > 0 ? { priority: 0, weight: 0 } : {}
  if (state.clustering) {
    // Remove a job from Redis if it has not completed or failed within 60s
    // Examples: Node process terminated, client disconnected, etc.
    jobOptions.expiration = 1000 * 60
  }

  // Guarantee at least 1000ms between writes
  // GraphQL can also trigger writes
  if (isWrite || isGraphQL) {
    await state.write.key(state.id).schedule(jobOptions, noop)
  }

  // Guarantee at least 3000ms between requests that trigger notifications
  if (isWrite && state.triggersNotification(options.url)) {
    await state.notifications.key(state.id).schedule(jobOptions, noop)
  }

  // Guarantee at least 2000ms between search requests
  if (isSearch) {
    await state.search.key(state.id).schedule(jobOptions, noop)
  }

  const req = state.global.key(state.id).schedule(jobOptions, request, options)
  if (isGraphQL) {
    const res = await req
    if (res.data.errors != null && res.data.errors.some((err) => err.type === 'RATE_LIMITED')) {
      const err = new Error('GraphQL Rate Limit Exceeded')
      err.headers = res.headers
      err.data = res.data
      throw err
    }
  }
  return req
}
