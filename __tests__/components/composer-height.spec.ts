import {
  computeComposerHeight,
  INPUT_PADDING_V,
  MAX_BOX_HEIGHT,
  MIN_BOX_HEIGHT,
} from "@app/screens/chat/components/composer-height"

describe("computeComposerHeight", () => {
  it("adds vertical padding so a two-line message stays visible (#715)", () => {
    // Two lines of content measure ~38px. Without adding the input's vertical
    // padding the box clamps back to MIN_BOX_HEIGHT (40) and the second line
    // renders under the padding.
    expect(computeComposerHeight(38)).toEqual(54)
    expect(computeComposerHeight(38)).toBeGreaterThan(MIN_BOX_HEIGHT)
  })

  it("clamps small content up to the minimum box height", () => {
    expect(computeComposerHeight(10)).toEqual(40)
    expect(computeComposerHeight(0)).toEqual(MIN_BOX_HEIGHT)
  })

  it("clamps large content down to the maximum box height", () => {
    expect(computeComposerHeight(500)).toEqual(120)
    expect(computeComposerHeight(MAX_BOX_HEIGHT)).toEqual(MAX_BOX_HEIGHT)
  })

  it("grows by exactly the padding on both sides between the clamps", () => {
    const contentHeight = 60
    expect(computeComposerHeight(contentHeight)).toEqual(
      contentHeight + INPUT_PADDING_V * 2,
    )
  })
})
