import { ApolloClient, gql, InMemoryCache } from "@apollo/client"
import { AssistantUsernameDocument } from "@app/graphql/generated"
import {
  createOwnUsernameReader,
  ownFlashAddress,
} from "@app/assistant/ui/own-flash-address"

const makeClient = () =>
  new ApolloClient({ cache: new InMemoryCache(), connectToDevTools: false })
it("reuses the username cached by Home without a network request, including offline", async () => {
  const client = makeClient()
  client.writeQuery({
    query: gql`
      query HomeIdentity {
        me {
          id
          username
        }
      }
    `,
    data: { me: { __typename: "User", id: "user-1", username: "alice" } },
  })
  const query = jest.spyOn(client, "query")
  const read = createOwnUsernameReader(client, true)
  expect(await read(false)).toBe("alice")
  expect(await read(true)).toBe("alice")
  expect(query).not.toHaveBeenCalled()
})
it("fetches only identity when online and missing from the cache", async () => {
  const client = makeClient()
  const query = jest.spyOn(client, "query").mockResolvedValue({
    data: { me: { id: "user-1", username: "alice" } },
    loading: false,
    networkStatus: 7,
  })
  expect(await createOwnUsernameReader(client, true)(false)).toBe("alice")
  expect(query).toHaveBeenCalledWith({
    query: AssistantUsernameDocument,
    fetchPolicy: "network-only",
  })
})
it("does not fetch while offline or expose a cached identity while signed out", async () => {
  const client = makeClient()
  const query = jest.spyOn(client, "query")
  expect(await createOwnUsernameReader(client, true)(true)).toBeUndefined()
  client.writeQuery({
    query: AssistantUsernameDocument,
    data: { me: { __typename: "User", id: "user-1", username: "alice" } },
  })
  expect(await createOwnUsernameReader(client, false)(false)).toBeUndefined()
  expect(query).not.toHaveBeenCalled()
})
it("uses the active instance and refuses missing or malformed address components", () => {
  expect(ownFlashAddress("alice", "test.flashapp.me")).toBe("alice@test.flashapp.me")
  expect(ownFlashAddress("", "flashapp.me")).toBeUndefined()
  expect(ownFlashAddress("alice@other.example", "flashapp.me")).toBeUndefined()
  expect(ownFlashAddress("alice", "https://other.example")).toBeUndefined()
})
