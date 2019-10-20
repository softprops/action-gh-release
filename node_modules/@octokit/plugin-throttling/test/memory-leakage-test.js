const { iterate } = require('leakage')
const Octokit = require('@octokit/rest')
  .plugin(require('..'))

const result = iterate(() => {
  Octokit({
    throttle: {
      onAbuseLimit: () => {},
      onRateLimit: () => {}
    }
  })
})

result.printSummary()
