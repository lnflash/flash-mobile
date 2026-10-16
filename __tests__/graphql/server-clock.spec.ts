import * as fs from "fs"
import * as path from "path"

import { ApolloLink, execute, gql, Observable } from "@apollo/client"

import { createServerClock, parseHttpDate } from "@app/graphql/server-clock"

// The phone's clock against the API's, as the HTTP chain notes it from each
// GraphQL answer's Date header (app/graphql/server-clock.ts). The assistant's
// dispatch journal records it with each dispatch, so its reconciler can read
// the transaction list back to the dispatch on the server's clock (ENG-688).

const PROBE = gql`
  query ServerClockProbe {
    __typename
  }
`
const RESULT = { data: { __typename: "Query" } }

/** A fetch Response's headers, by lower-case name, as Headers.get reads them. */
const responseWith = (headers: Record<string, string>) => ({
  headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
})

/**
 * The end of the HTTP chain, answering as HttpLink does: the fetch Response
 * goes on the operation's context, then the parsed result follows. With
 * `fails`, the answer is an error instead, as HttpLink gives for a status it
 * refuses or a body that is not a GraphQL result.
 */
const http = (response: unknown, { fails = false }: { fails?: boolean } = {}) =>
  new ApolloLink((operation) => {
    if (response !== undefined) operation.setContext({ response })
    return fails
      ? new Observable((observer) => observer.error(new Error("Response not successful")))
      : Observable.of(RESULT)
  })

/** Run one answer through `clockLink`, then `answer`. */
const answer = (clockLink: ApolloLink, answering: ApolloLink) =>
  new Promise((resolve, reject) => {
    execute(ApolloLink.from([clockLink, answering]), { query: PROBE }).subscribe({
      next: resolve,
      error: reject,
    })
  })

/** 10:00:00 GMT on 16 October 2026, as a server's Date header names it. */
const SERVER_DATE = "Fri, 16 Oct 2026 10:00:00 GMT"
const SERVER_MS = Date.UTC(2026, 9, 16, 10, 0, 0)

describe("parseHttpDate", () => {
  it("reads IMF-fixdate, the form a server sends its Date header in", () => {
    // RFC 9110 §5.6.7's own example.
    expect(parseHttpDate("Sun, 06 Nov 1994 08:49:37 GMT")).toBe(
      Date.UTC(1994, 10, 6, 8, 49, 37),
    )
    expect(parseHttpDate(SERVER_DATE)).toBe(SERVER_MS)
    expect(parseHttpDate(new Date(SERVER_MS + 86_399_000).toUTCString())).toBe(
      SERVER_MS + 86_399_000,
    )
  })

  it("reads nothing else, so a header it cannot be sure of names no moment", () => {
    const unreadable = [
      "",
      "not a date",
      // Date.parse in V8 reads these as moments in 2001 and 2099.
      "1",
      "x 2099",
      // The obsolete forms, which a sender must not send (RFC 9110 §5.6.7).
      "Sunday, 06-Nov-94 08:49:37 GMT",
      "Sun Nov  6 08:49:37 1994",
      // ISO 8601, which is no form a Date header takes.
      "2026-10-16T10:00:00Z",
      // Not a moment that exists.
      "Fri, 31 Nov 2026 10:00:00 GMT",
      "Fri, 16 Oct 2026 24:00:00 GMT",
      "Fri, 16 Oct 2026 10:60:00 GMT",
      // A year Date.UTC would read as 1926.
      "Fri, 16 Oct 0026 10:00:00 GMT",
      // Not GMT.
      "Fri, 16 Oct 2026 10:00:00 EST",
    ]

    unreadable.forEach((value) =>
      expect([value, parseHttpDate(value)]).toEqual([value, null]),
    )
  })
})

describe("the server clock", () => {
  it("knows nothing until an answer shows the server's clock", () => {
    expect(createServerClock().offsetMs()).toBeNull()
  })

  it("takes the phone's clock less the server's from an answer's Date header", async () => {
    // The phone reads the answer five minutes and a quarter second after the
    // server stamped it: its clock runs ahead, or the answer was slow.
    let phone = SERVER_MS + 300_250
    const clock = createServerClock(() => phone)

    await expect(
      answer(clock.link, http(responseWith({ date: SERVER_DATE }))),
    ).resolves.toEqual(RESULT)
    expect(clock.offsetMs()).toBe(300_250)

    // The latest answer's counts: a phone a minute behind the server.
    phone = SERVER_MS - 60_000
    await answer(clock.link, http(responseWith({ date: SERVER_DATE })))
    expect(clock.offsetMs()).toBe(-60_000)
  })

  it("keeps what it knew when an answer has no Date header, or one it cannot read", async () => {
    const clock = createServerClock(() => SERVER_MS + 1_000)
    const unreadable = [
      undefined,
      {},
      { headers: {} },
      responseWith({}),
      responseWith({ date: "" }),
      responseWith({ date: "garbage 2099" }),
      responseWith({ date: "Fri, 32 Oct 2026 10:00:00 GMT" }),
      {
        headers: {
          get: () => {
            throw new Error("no headers here")
          },
        },
      },
    ]

    // Before any answer showed it: still nothing, and every answer goes on.
    for (const response of unreadable) {
      await expect(answer(clock.link, http(response))).resolves.toEqual(RESULT)
    }
    expect(clock.offsetMs()).toBeNull()

    // After one did: still that.
    await answer(clock.link, http(responseWith({ date: SERVER_DATE })))
    expect(clock.offsetMs()).toBe(1_000)
    for (const response of unreadable) {
      await expect(answer(clock.link, http(response))).resolves.toEqual(RESULT)
    }
    expect(clock.offsetMs()).toBe(1_000)
  })

  it("takes nothing from an answer that failed", async () => {
    // A status HttpLink refuses, or a body that is not a GraphQL result: a
    // captive portal's page, a proxy's error. Its Date header may not be the
    // API's clock.
    const clock = createServerClock(() => SERVER_MS)

    await expect(
      answer(clock.link, http(responseWith({ date: SERVER_DATE }), { fails: true })),
    ).rejects.toThrow("Response not successful")
    expect(clock.offsetMs()).toBeNull()
  })

  it("sits in the app's HTTP chain, just before the HttpLink", () => {
    // Without it every dispatch is journaled with no offset, and no lost
    // answer can ever be shown absent: safe, but every repeat is blocked.
    const source = fs.readFileSync(
      path.join(__dirname, "../../app/graphql/client.tsx"),
      "utf8",
    )
    const chain = /ApolloLink\.from\(\[([^\]]*)\]\)/.exec(source)?.[1] ?? ""
    const links = chain
      .replace(/\/\/.*$/gm, "")
      .split(",")
      .map((link) => link.trim())
      .filter(Boolean)

    expect(links.slice(-2)).toEqual(["serverClock.link", "httpLink"])
  })
})
