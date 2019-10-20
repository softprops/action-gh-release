const Octokit = require('@octokit/rest')
const HttpError = require('@octokit/request/lib/http-error')
const throttlingPlugin = require('../..')

module.exports = Octokit
  .plugin((octokit) => {
    octokit.__t0 = Date.now()
    octokit.__requestLog = []
    octokit.__requestTimings = []

    octokit.hook.wrap('request', async (request, options) => {
      octokit.__requestLog.push(`START ${options.method} ${options.url}`)
      octokit.__requestTimings.push(Date.now() - octokit.__t0)
      await new Promise(resolve => setTimeout(resolve, 0))

      const res = options.request.responses.shift()
      if (res.status >= 400) {
        const message = res.data.message != null ? res.data.message : `Test failed request (${res.status})`
        const error = new HttpError(message, res.status, res.headers, options)
        throw error
      } else {
        octokit.__requestLog.push(`END ${options.method} ${options.url}`)
        octokit.__requestTimings.push(Date.now() - octokit.__t0)
        return res
      }
    })
  })
  .plugin(throttlingPlugin)
