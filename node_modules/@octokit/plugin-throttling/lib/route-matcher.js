module.exports = routeMatcher

function routeMatcher (paths) {
  // EXAMPLE. For the following paths:
  /* [
      "/orgs/:org/invitations",
      "/repos/:owner/:repo/collaborators/:username"
  ] */

  const regexes = paths.map(p =>
    p.split('/')
      .map(c => c.startsWith(':') ? '(?:.+?)' : c)
      .join('/')
  )
  // 'regexes' would contain:
  /* [
      '/orgs/(?:.+?)/invitations',
      '/repos/(?:.+?)/(?:.+?)/collaborators/(?:.+?)'
  ] */

  const regex = `^(?:${regexes.map(r => `(?:${r})`).join('|')})[^/]*$`
  // 'regex' would contain:
  /*
    ^(?:(?:\/orgs\/(?:.+?)\/invitations)|(?:\/repos\/(?:.+?)\/(?:.+?)\/collaborators\/(?:.+?)))[^\/]*$

    It may look scary, but paste it into https://www.debuggex.com/
    and it will make a lot more sense!
  */

  return new RegExp(regex, 'i')
}
