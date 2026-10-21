import {
  createSuggestionStore,
  QUESTION_SUGGESTIONS,
} from "@app/assistant/ui/question-suggestions"

it("replaces only the chosen slot with a question not already visible", () => {
  const store = createSuggestionStore()
  const before = store.get()
  store.choose(before[0].id)
  const after = store.get()
  expect(after).toHaveLength(3)
  expect(after[0].id).not.toBe(before[0].id)
  expect(after[1]).toBe(before[1])
  expect(after[2]).toBe(before[2])
  expect(new Set(after.map(({ id }) => id)).size).toBe(3)
})
it("offers every reviewed question once and never recycles used suggestions", () => {
  const store = createSuggestionStore()
  const used = new Set<string>()
  while (store.get().length) {
    const choice = store.get()[0]
    expect(used.has(choice.id)).toBe(false)
    used.add(choice.id)
    store.choose(choice.id)
  }
  expect(used.size).toBe(QUESTION_SUGGESTIONS.length)
  expect(createSuggestionStore().get()).toHaveLength(3)
})
it("ignores stale presses and preserves choices when a subscriber remounts", () => {
  const store = createSuggestionStore()
  const first = store.get()[0]
  const oldListener = jest.fn()
  const unsubscribe = store.subscribe(oldListener)
  store.choose(first.id)
  unsubscribe()
  const nextListener = jest.fn()
  store.subscribe(nextListener)
  const current = store.get()
  store.choose(first.id)
  expect(store.get()).toBe(current)
  expect(nextListener).not.toHaveBeenCalled()
  store.choose(current[0].id)
  expect(oldListener).toHaveBeenCalledTimes(1)
  expect(nextListener).toHaveBeenCalledTimes(1)
})
