const expect = require('chai').expect
const Octokit = require('./octokit')

describe('Events', function () {
  it('Should support non-limit 403s', async function () {
    const octokit = new Octokit({ throttle: { onAbuseLimit: () => 1, onRateLimit: () => 1 } })
    let caught = false

    await octokit.request('GET /route1', {
      request: {
        responses: [{ status: 201, headers: {}, data: {} }]
      }
    })

    try {
      await octokit.request('GET /route2', {
        request: {
          responses: [{ status: 403, headers: {}, data: {} }]
        }
      })
    } catch (error) {
      expect(error.message).to.equal('Test failed request (403)')
      caught = true
    }

    expect(caught).to.equal(true)
    expect(octokit.__requestLog).to.deep.equal([
      'START GET /route1',
      'END GET /route1',
      'START GET /route2'
    ])
  })

  describe('\'abuse-limit\'', function () {
    it('Should detect abuse limit and broadcast event', async function () {
      let eventCount = 0
      const octokit = new Octokit({
        throttle: {
          onAbuseLimit: (retryAfter, options) => {
            expect(retryAfter).to.equal(60)
            expect(options).to.include({ method: 'GET', url: '/route2' })
            expect(options.request.retryCount).to.equal(0)
            eventCount++
          },
          onRateLimit: () => 1
        }
      })

      await octokit.request('GET /route1', {
        request: {
          responses: [{ status: 201, headers: {}, data: {} }]
        }
      })
      try {
        await octokit.request('GET /route2', {
          request: {
            responses: [{ status: 403, headers: { 'retry-after': '60' }, data: { message: 'You have been rate limited to prevent abuse' } }]
          }
        })
        throw new Error('Should not reach this point')
      } catch (error) {
        expect(error.status).to.equal(403)
      }

      expect(eventCount).to.equal(1)
    })

    it('Should ensure retryAfter is a minimum of 5s', async function () {
      let eventCount = 0
      const octokit = new Octokit({
        throttle: {
          onAbuseLimit: (retryAfter, options) => {
            expect(retryAfter).to.equal(5)
            expect(options).to.include({ method: 'GET', url: '/route2' })
            expect(options.request.retryCount).to.equal(0)
            eventCount++
          },
          onRateLimit: () => 1
        }
      })

      await octokit.request('GET /route1', {
        request: {
          responses: [{ status: 201, headers: {}, data: {} }]
        }
      })
      try {
        await octokit.request('GET /route2', {
          request: {
            responses: [{ status: 403, headers: { 'retry-after': '2' }, data: { message: 'You have been rate limited to prevent abuse' } }]
          }
        })
        throw new Error('Should not reach this point')
      } catch (error) {
        expect(error.status).to.equal(403)
      }

      expect(eventCount).to.equal(1)
    })

    it('Should broadcast retryAfter of 5s even when the header is missing', async function () {
      let eventCount = 0
      const octokit = new Octokit({
        throttle: {
          onAbuseLimit: (retryAfter, options) => {
            expect(retryAfter).to.equal(5)
            expect(options).to.include({ method: 'GET', url: '/route2' })
            expect(options.request.retryCount).to.equal(0)
            eventCount++
          },
          onRateLimit: () => 1
        }
      })

      await octokit.request('GET /route1', {
        request: {
          responses: [{ status: 201, headers: {}, data: {} }]
        }
      })
      try {
        await octokit.request('GET /route2', {
          request: {
            responses: [{ status: 403, headers: {}, data: { message: 'You have been rate limited to prevent abuse' } }]
          }
        })
        throw new Error('Should not reach this point')
      } catch (error) {
        expect(error.status).to.equal(403)
      }

      expect(eventCount).to.equal(1)
    })
  })

  describe('\'rate-limit\'', function () {
    it('Should detect rate limit exceeded and broadcast event', async function () {
      let eventCount = 0
      const octokit = new Octokit({
        throttle: {
          onRateLimit: (retryAfter, options) => {
            expect(retryAfter).to.be.closeTo(30, 1)
            expect(options).to.include({ method: 'GET', url: '/route2' })
            expect(options.request.retryCount).to.equal(0)
            eventCount++
          },
          onAbuseLimit: () => 1
        }
      })
      const t0 = Date.now()

      await octokit.request('GET /route1', {
        request: {
          responses: [{ status: 201, headers: {}, data: {} }]
        }
      })
      try {
        await octokit.request('GET /route2', {
          request: {
            responses: [{ status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': `${Math.round(t0 / 1000) + 30}` }, data: {} }]
          }
        })
        throw new Error('Should not reach this point')
      } catch (error) {
        expect(error.status).to.equal(403)
      }

      expect(eventCount).to.equal(1)
    })
  })
})
