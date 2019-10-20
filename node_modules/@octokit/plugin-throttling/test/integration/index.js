const Bottleneck = require('bottleneck')
const expect = require('chai').expect
const Octokit = require('./octokit')

describe('General', function () {
  it('Should be possible to disable the plugin', async function () {
    const octokit = new Octokit({ throttle: { enabled: false } })

    const req1 = octokit.request('GET /route1', {
      request: {
        responses: [{ status: 201, headers: {}, data: {} }]
      }
    })

    const req2 = octokit.request('GET /route2', {
      request: {
        responses: [{ status: 202, headers: {}, data: {} }]
      }
    })

    const req3 = octokit.request('GET /route3', {
      request: {
        responses: [{ status: 203, headers: {}, data: {} }]
      }
    })

    await Promise.all([req1, req2, req3])
    expect(octokit.__requestLog).to.deep.equal([
      'START GET /route1',
      'START GET /route2',
      'START GET /route3',
      'END GET /route1',
      'END GET /route2',
      'END GET /route3'
    ])
  })

  it('Should require the user to pass both limit handlers', function () {
    const message = 'You must pass the onAbuseLimit and onRateLimit error handlers'

    expect(() => new Octokit()).to.throw(message)
    expect(() => new Octokit({ throttle: {} })).to.throw(message)
    expect(() => new Octokit({ throttle: { onAbuseLimit: 5, onRateLimit: 5 } })).to.throw(message)
    expect(() => new Octokit({ throttle: { onAbuseLimit: 5, onRateLimit: () => 1 } })).to.throw(message)
    expect(() => new Octokit({ throttle: { onAbuseLimit: () => 1 } })).to.throw(message)
    expect(() => new Octokit({ throttle: { onRateLimit: () => 1 } })).to.throw(message)
    expect(() => new Octokit({ throttle: { onAbuseLimit: () => 1, onRateLimit: () => 1 } })).to.not.throw()
  })
})

describe('Github API best practices', function () {
  it('Should linearize requests', async function () {
    const octokit = new Octokit({ throttle: { onAbuseLimit: () => 1, onRateLimit: () => 1 } })
    const req1 = octokit.request('GET /route1', {
      request: {
        responses: [{ status: 201, headers: {}, data: {} }]
      }
    })

    const req2 = octokit.request('GET /route2', {
      request: {
        responses: [{ status: 202, headers: {}, data: {} }]
      }
    })

    const req3 = octokit.request('GET /route3', {
      request: {
        responses: [{ status: 203, headers: {}, data: {} }]
      }
    })

    await Promise.all([req1, req2, req3])
    expect(octokit.__requestLog).to.deep.equal([
      'START GET /route1',
      'END GET /route1',
      'START GET /route2',
      'END GET /route2',
      'START GET /route3',
      'END GET /route3'
    ])
  })

  it('Should maintain 1000ms between mutating or GraphQL requests', async function () {
    const octokit = new Octokit({
      throttle: {
        write: new Bottleneck.Group({ minTime: 50 }),
        onAbuseLimit: () => 1,
        onRateLimit: () => 1
      }
    })

    const req1 = octokit.request('POST /route1', {
      request: {
        responses: [{ status: 201, headers: {}, data: {} }]
      }
    })
    const req2 = octokit.request('GET /route2', {
      request: {
        responses: [{ status: 202, headers: {}, data: {} }]
      }
    })
    const req3 = octokit.request('POST /route3', {
      request: {
        responses: [{ status: 203, headers: {}, data: {} }]
      }
    })
    const req4 = octokit.request('POST /graphql', {
      request: {
        responses: [{ status: 200, headers: {}, data: {} }]
      }
    })

    await Promise.all([req1, req2, req3, req4])
    expect(octokit.__requestLog).to.deep.equal([
      'START GET /route2',
      'END GET /route2',
      'START POST /route1',
      'END POST /route1',
      'START POST /route3',
      'END POST /route3',
      'START POST /graphql',
      'END POST /graphql'
    ])
    expect(octokit.__requestTimings[4] - octokit.__requestTimings[0]).to.be.closeTo(50, 20)
    expect(octokit.__requestTimings[6] - octokit.__requestTimings[4]).to.be.closeTo(50, 20)
  })

  it('Should maintain 3000ms between requests that trigger notifications', async function () {
    const octokit = new Octokit({
      throttle: {
        write: new Bottleneck.Group({ minTime: 50 }),
        notifications: new Bottleneck.Group({ minTime: 100 }),
        onAbuseLimit: () => 1,
        onRateLimit: () => 1
      }
    })

    const req1 = octokit.request('POST /orgs/:org/invitations', {
      request: {
        responses: [{ status: 201, headers: {}, data: {} }]
      }
    })
    const req2 = octokit.request('POST /route2', {
      request: {
        responses: [{ status: 202, headers: {}, data: {} }]
      }
    })
    const req3 = octokit.request('POST /repos/:owner/:repo/commits/:sha/comments', {
      request: {
        responses: [{ status: 302, headers: {}, data: {} }]
      }
    })

    await Promise.all([req1, req2, req3])
    expect(octokit.__requestLog).to.deep.equal([
      'START POST /orgs/:org/invitations',
      'END POST /orgs/:org/invitations',
      'START POST /route2',
      'END POST /route2',
      'START POST /repos/:owner/:repo/commits/:sha/comments',
      'END POST /repos/:owner/:repo/commits/:sha/comments'
    ])
    expect(octokit.__requestTimings[5] - octokit.__requestTimings[0]).to.be.closeTo(100, 20)
  })

  it('Should match custom routes when checking notification triggers', function () {
    const plugin = require('../../lib')

    expect(plugin.triggersNotification('/abc/def')).to.equal(false)
    expect(plugin.triggersNotification('/orgs/abc/invitation')).to.equal(false)
    expect(plugin.triggersNotification('/repos/abc/releases')).to.equal(false)
    expect(plugin.triggersNotification('/repos/abc/def/pulls/5')).to.equal(false)

    expect(plugin.triggersNotification('/repos/abc/def/pulls')).to.equal(true)
    expect(plugin.triggersNotification('/repos/abc/def/pulls/5/comments')).to.equal(true)
    expect(plugin.triggersNotification('/repos/foo/bar/issues')).to.equal(true)

    expect(plugin.triggersNotification('/repos/:owner/:repo/pulls')).to.equal(true)
    expect(plugin.triggersNotification('/repos/:owner/:repo/pulls/5/comments')).to.equal(true)
    expect(plugin.triggersNotification('/repos/:foo/:bar/issues')).to.equal(true)
  })

  it('Should maintain 2000ms between search requests', async function () {
    const octokit = new Octokit({
      throttle: {
        search: new Bottleneck.Group({ minTime: 50 }),
        onAbuseLimit: () => 1,
        onRateLimit: () => 1
      }
    })

    const req1 = octokit.request('GET /search/route1', {
      request: {
        responses: [{ status: 201, headers: {}, data: {} }]
      }
    })
    const req2 = octokit.request('GET /route2', {
      request: {
        responses: [{ status: 202, headers: {}, data: {} }]
      }
    })
    const req3 = octokit.request('GET /search/route3', {
      request: {
        responses: [{ status: 203, headers: {}, data: {} }]
      }
    })

    await Promise.all([req1, req2, req3])
    expect(octokit.__requestLog).to.deep.equal([
      'START GET /route2',
      'END GET /route2',
      'START GET /search/route1',
      'END GET /search/route1',
      'START GET /search/route3',
      'END GET /search/route3'
    ])
    expect(octokit.__requestTimings[4] - octokit.__requestTimings[2]).to.be.closeTo(50, 20)
  })

  it('Should optimize throughput rather than maintain ordering', async function () {
    const octokit = new Octokit({
      throttle: {
        write: new Bottleneck.Group({ minTime: 50 }),
        notifications: new Bottleneck.Group({ minTime: 150 }),
        onAbuseLimit: () => 1,
        onRateLimit: () => 1
      }
    })

    const req1 = octokit.request('POST /orgs/abc/invitations', {
      request: {
        responses: [{ status: 200, headers: {}, data: {} }]
      }
    })
    const req2 = octokit.request('GET /route2', {
      request: {
        responses: [{ status: 200, headers: {}, data: {} }]
      }
    })
    const req3 = octokit.request('GET /route3', {
      request: {
        responses: [{ status: 200, headers: {}, data: {} }]
      }
    })
    const req4 = octokit.request('POST /route4', {
      request: {
        responses: [{ status: 200, headers: {}, data: {} }]
      }
    })
    const req5 = octokit.request('POST /repos/abc/def/commits/12345/comments', {
      request: {
        responses: [{ status: 200, headers: {}, data: {} }]
      }
    })
    const req6 = octokit.request('PATCH /orgs/abc/invitations', {
      request: {
        responses: [{ status: 200, headers: {}, data: {} }]
      }
    })

    await Promise.all([req1, req2, req3, req4, req5, req6])
    await octokit.request('GET /route6', {
      request: {
        responses: [{ status: 200, headers: {}, data: {} }]
      }
    })
    expect(octokit.__requestLog).to.deep.equal([
      'START GET /route2',
      'END GET /route2',
      'START GET /route3',
      'END GET /route3',
      'START POST /orgs/abc/invitations',
      'END POST /orgs/abc/invitations',
      'START POST /route4',
      'END POST /route4',
      'START POST /repos/abc/def/commits/12345/comments',
      'END POST /repos/abc/def/commits/12345/comments',
      'START PATCH /orgs/abc/invitations',
      'END PATCH /orgs/abc/invitations',
      'START GET /route6',
      'END GET /route6'
    ])

    expect(octokit.__requestTimings[2] - octokit.__requestTimings[0]).to.be.closeTo(0, 20)
    expect(octokit.__requestTimings[4] - octokit.__requestTimings[2]).to.be.closeTo(0, 20)
    expect(octokit.__requestTimings[6] - octokit.__requestTimings[4]).to.be.closeTo(50, 20)
    expect(octokit.__requestTimings[8] - octokit.__requestTimings[6]).to.be.closeTo(100, 20)
    expect(octokit.__requestTimings[10] - octokit.__requestTimings[8]).to.be.closeTo(150, 20)
    expect(octokit.__requestTimings[12] - octokit.__requestTimings[10]).to.be.closeTo(0, 30)
  })
})
