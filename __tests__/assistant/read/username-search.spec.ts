import {
  ApolloClient,
  ApolloLink,
  HttpLink,
  InMemoryCache,
  Observable,
} from "@apollo/client"
import { GraphQLError } from "graphql"

import { searchFlashUsernames } from "@app/assistant/rails/username-search"

const client = (answer: () => unknown) =>
  new ApolloClient<unknown>({
    cache: new InMemoryCache(),
    link: new ApolloLink(
      () =>
        new Observable((observer) => {
          try {
            observer.next(answer() as never)
            observer.complete()
          } catch (error) {
            observer.error(error)
          }
        }),
    ),
  })

it("uses a submitted literal hint and returns at most five valid public usernames", async () => {
  const request = jest.fn(() => ({
    data: {
      searchUsernames: [
        "ALICE",
        "alice",
        "bob",
        "carol",
        "dave",
        "emma",
        "frank",
        "bad*",
      ],
    },
  }))
  await expect(searchFlashUsernames(client(request), "@ali ce")).resolves.toEqual([
    "alice",
    "bob",
    "carol",
    "dave",
    "emma",
  ])
  expect(request).toHaveBeenCalledTimes(1)
})
it("does not issue invalid or wildcard searches", async () => {
  const request = jest.fn()
  for (const hint of ["a", "dre*", "a".repeat(81), "user@example.com"])
    await expect(searchFlashUsernames(client(request), hint)).resolves.toEqual([])
  expect(request).not.toHaveBeenCalled()
})
it("supports older servers while preserving actual network, auth and rate-limit failures", async () => {
  const old = client(() => ({
    errors: [new GraphQLError('Cannot query field "searchUsernames" on type "Query".')],
  }))
  await expect(searchFlashUsernames(old, "alice")).resolves.toEqual([])
  for (const message of ["offline", "Sign in", "Too many username searches"]) {
    const failed = client(() => ({ errors: [new GraphQLError(message)] }))
    await expect(searchFlashUsernames(failed, "alice")).rejects.toThrow(message)
  }
})
it("does not treat a missing answer as a successful empty directory", async () => {
  await expect(
    searchFlashUsernames(
      client(() => ({ data: {} })),
      "alice",
    ),
  ).rejects.toThrow("no answer")
})

it("handles an old server's HTTP 400 validation response without hiding other HTTP errors", async () => {
  const make = (message: string) =>
    new ApolloClient<unknown>({
      cache: new InMemoryCache(),
      link: new HttpLink({
        uri: "https://unused.invalid/graphql",
        fetch: jest.fn(async () => ({
          status: 400,
          headers: { get: () => "application/json" },
          text: async () => JSON.stringify({ errors: [{ message }] }),
        })) as never,
      }),
    })
  await expect(
    searchFlashUsernames(
      make('Cannot query field "searchUsernames" on type "Query".'),
      "alice",
    ),
  ).resolves.toEqual([])
  await expect(
    searchFlashUsernames(make("Authentication required"), "alice"),
  ).rejects.toThrow()
})
