# plugin-throttling.js

> Octokit plugin for GitHub’s recommended request throttling

[![npm](https://img.shields.io/npm/v/@octokit/plugin-throttling.svg)](https://www.npmjs.com/package/@octokit/plugin-throttling)
[![Build Status](https://travis-ci.com/octokit/plugin-throttling.js.svg)](https://travis-ci.com/octokit/plugin-throttling.js)
[![Coverage Status](https://img.shields.io/coveralls/github/octokit/plugin-throttling.js.svg)](https://coveralls.io/github/octokit/plugin-throttling.js)
[![Greenkeeper](https://badges.greenkeeper.io/octokit/plugin-throttling.js.svg)](https://greenkeeper.io/)

Implements all [recommended best practises](https://developer.github.com/v3/guides/best-practices-for-integrators/) to prevent hitting abuse rate limits.

## Usage

The code below creates a "Hello, world!" issue on every repository in a given organization. Without the throttling plugin it would send many requests in parallel and would hit rate limits very quickly. But the `@octokit/plugin-throttling` slows down your requests according to the official guidelines, so you don't get blocked before your quota is exhausted.

The `throttle.onAbuseLimit` and `throttle.onRateLimit` options are required. Return `true` to automatically retry the request after `retryAfter` seconds.

```js
const Octokit = require('@octokit/rest')
  .plugin(require('@octokit/plugin-throttling'))

const octokit = new Octokit({
  auth: `token ${process.env.TOKEN}`,
  throttle: {
    onRateLimit: (retryAfter, options) => {
      console.warn(`Request quota exhausted for request ${options.method} ${options.url}`)

      if (options.request.retryCount === 0) { // only retries once
        console.log(`Retrying after ${retryAfter} seconds!`)
        return true
      }
    },
    onAbuseLimit: (retryAfter, options) => {
      // does not retry, only logs a warning
      console.warn(`Abuse detected for request ${options.method} ${options.url}`)
    }
  }
})

async function createIssueOnAllRepos (org) {
  const repos = await octokit.paginate(octokit.repos.listForOrg.endpoint({ org }))
  return Promise.all(repos.forEach(({ name } => {
    octokit.issues.create({
      owner,
      repo: name,
      title: 'Hello, world!'
    })
  })))
}
```

Pass `{ throttle: { enabled: false } }` to disable this plugin.

### Clustering

Enabling Clustering support ensures that your application will not go over rate limits **across Octokit instances and across Nodejs processes**.

First install either `redis` or `ioredis`:
```
# NodeRedis (https://github.com/NodeRedis/node_redis)
npm install --save redis

# or ioredis (https://github.com/luin/ioredis)
npm install --save ioredis
```

Then in your application:
```js
const Bottleneck = require('bottleneck')
const Redis = require('redis')

const client = Redis.createClient({ /* options */ })
const connection = new Bottleneck.RedisConnection({ client })
connection.on('error', err => console.error(err))

const octokit = new Octokit({
  throttle: {
    onAbuseLimit: (retryAfter, options) => { /* ... */ },
    onRateLimit: (retryAfter, options) => { /* ... */ },

    // The Bottleneck connection object
    connection,

    // A "throttling ID". All octokit instances with the same ID
    // using the same Redis server will share the throttling.
    id: 'my-super-app',

    // Otherwise the plugin uses a lighter version of Bottleneck without Redis support
    Bottleneck
  }
})

// To close the connection and allow your application to exit cleanly:
await connection.disconnect()
```

To use the `ioredis` library instead:
```js
const Redis = require('ioredis')
const client = new Redis({ /* options */ })
const connection = new Bottleneck.IORedisConnection({ client })
connection.on('error', err => console.error(err))
```

## LICENSE

[MIT](LICENSE)
