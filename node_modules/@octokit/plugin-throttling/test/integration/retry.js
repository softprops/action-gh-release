const Bottleneck = require('bottleneck')
const expect = require('chai').expect
const Octokit = require('./octokit')

describe('Retry', function () {
  describe('REST', function () {
    it('Should retry \'abuse-limit\' and succeed', async function () {
      let eventCount = 0
      const octokit = new Octokit({
        throttle: {
          minimumAbuseRetryAfter: 0,
          retryAfterBaseValue: 50,
          onAbuseLimit: (retryAfter, options) => {
            expect(options).to.include({ method: 'GET', url: '/route' })
            expect(options.request.retryCount).to.equal(eventCount)
            expect(retryAfter).to.equal(eventCount + 1)
            eventCount++
            return true
          },
          onRateLimit: () => 1
        }
      })

      const res = await octokit.request('GET /route', {
        request: {
          responses: [
            { status: 403, headers: { 'retry-after': '1' }, data: { message: 'You have been rate limited to prevent abuse' } },
            { status: 200, headers: {}, data: { message: 'Success!' } }
          ]
        }
      })

      expect(res.status).to.equal(200)
      expect(res.data).to.include({ message: 'Success!' })
      expect(eventCount).to.equal(1)
      expect(octokit.__requestLog).to.deep.equal([
        'START GET /route',
        'START GET /route',
        'END GET /route'
      ])
      expect(octokit.__requestTimings[1] - octokit.__requestTimings[0]).to.be.closeTo(50, 20)
    })

    it('Should retry \'abuse-limit\' twice and fail', async function () {
      let eventCount = 0
      const octokit = new Octokit({
        throttle: {
          minimumAbuseRetryAfter: 0,
          retryAfterBaseValue: 50,
          onAbuseLimit: (retryAfter, options) => {
            expect(options).to.include({ method: 'GET', url: '/route' })
            expect(options.request.retryCount).to.equal(eventCount)
            expect(retryAfter).to.equal(eventCount + 1)
            eventCount++
            return true
          },
          onRateLimit: () => 1
        }
      })

      const message = 'You have been rate limited to prevent abuse'
      try {
        await octokit.request('GET /route', {
          request: {
            responses: [
              { status: 403, headers: { 'retry-after': '1' }, data: { message } },
              { status: 403, headers: { 'retry-after': '2' }, data: { message } },
              { status: 404, headers: { 'retry-after': '3' }, data: { message: 'Nope!' } }
            ]
          }
        })
        throw new Error('Should not reach this point')
      } catch (error) {
        expect(error.status).to.equal(404)
        expect(error.message).to.equal('Nope!')
      }

      expect(eventCount).to.equal(2)
      expect(octokit.__requestLog).to.deep.equal([
        'START GET /route',
        'START GET /route',
        'START GET /route'
      ])
      expect(octokit.__requestTimings[1] - octokit.__requestTimings[0]).to.be.closeTo(50, 20)
      expect(octokit.__requestTimings[2] - octokit.__requestTimings[1]).to.be.closeTo(100, 20)
    })

    it('Should retry \'rate-limit\' and succeed', async function () {
      let eventCount = 0
      const octokit = new Octokit({
        throttle: {
          onRateLimit: (retryAfter, options) => {
            expect(options).to.include({ method: 'GET', url: '/route' })
            expect(options.request.retryCount).to.equal(eventCount)
            expect(retryAfter).to.equal(0)
            eventCount++
            return true
          },
          onAbuseLimit: () => 1
        }
      })

      const res = await octokit.request('GET /route', {
        request: {
          responses: [
            { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': `123` }, data: {} },
            { status: 202, headers: {}, data: { message: 'Yay!' } }
          ]
        }
      })

      expect(res.status).to.equal(202)
      expect(res.data).to.include({ message: 'Yay!' })
      expect(eventCount).to.equal(1)
      expect(octokit.__requestLog).to.deep.equal([
        'START GET /route',
        'START GET /route',
        'END GET /route'
      ])
      expect(octokit.__requestTimings[1] - octokit.__requestTimings[0]).to.be.closeTo(0, 20)
    })
  })

  describe('GraphQL', function () {
    it('Should retry \'rate-limit\' and succeed', async function () {
      let eventCount = 0
      const octokit = new Octokit({
        throttle: {
          write: new Bottleneck.Group({ minTime: 50 }),
          onRateLimit: (retryAfter, options) => {
            expect(options).to.include({ method: 'POST', url: '/graphql' })
            expect(options.request.retryCount).to.equal(eventCount)
            expect(retryAfter).to.equal(0)
            eventCount++
            return true
          },
          onAbuseLimit: () => 1
        }
      })

      const res = await octokit.request('POST /graphql', {
        request: {
          responses: [
            { status: 200, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': `123` }, data: { errors: [{ type: 'RATE_LIMITED' }] } },
            { status: 200, headers: {}, data: { message: 'Yay!' } }
          ]
        }
      })

      expect(res.status).to.equal(200)
      expect(res.data).to.include({ message: 'Yay!' })
      expect(eventCount).to.equal(1)
      expect(octokit.__requestLog).to.deep.equal([
        'START POST /graphql',
        'END POST /graphql',
        'START POST /graphql',
        'END POST /graphql'
      ])
      expect(octokit.__requestTimings[2] - octokit.__requestTimings[0]).to.be.closeTo(50, 20)
    })

    it('Should ignore other error types', async function () {
      let eventCount = 0
      const octokit = new Octokit({
        throttle: {
          write: new Bottleneck.Group({ minTime: 50 }),
          onRateLimit: (retryAfter, options) => {
            eventCount++
            return true
          },
          onAbuseLimit: () => 1
        }
      })

      const res = await octokit.request('POST /graphql', {
        request: {
          responses: [
            { status: 200, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': `123` }, data: { errors: [{ type: 'HELLO_WORLD' }] } },
            { status: 200, headers: {}, data: { message: 'Yay!' } }
          ]
        }
      })

      expect(res.status).to.equal(200)
      expect(res.data).to.deep.equal({ errors: [ { type: 'HELLO_WORLD' } ] })
      expect(eventCount).to.equal(0)
      expect(octokit.__requestLog).to.deep.equal([
        'START POST /graphql',
        'END POST /graphql'
      ])
    })
  })
})
