// @ts-ignore
export function routeMatcher(paths) {
    // EXAMPLE. For the following paths:
    /* [
        "/orgs/:org/invitations",
        "/repos/:owner/:repo/collaborators/:username"
    ] */
    // @ts-ignore
    const regexes = paths.map((path) => path
        .split("/")
        // @ts-ignore
        .map((c) => (c.startsWith(":") ? "(?:.+?)" : c))
        .join("/"));
    // 'regexes' would contain:
    /* [
        '/orgs/(?:.+?)/invitations',
        '/repos/(?:.+?)/(?:.+?)/collaborators/(?:.+?)'
    ] */
    // @ts-ignore
    const regex = `^(?:${regexes.map((r) => `(?:${r})`).join("|")})[^/]*$`;
    // 'regex' would contain:
    /*
      ^(?:(?:\/orgs\/(?:.+?)\/invitations)|(?:\/repos\/(?:.+?)\/(?:.+?)\/collaborators\/(?:.+?)))[^\/]*$
  
      It may look scary, but paste it into https://www.debuggex.com/
      and it will make a lot more sense!
    */
    return new RegExp(regex, "i");
}
