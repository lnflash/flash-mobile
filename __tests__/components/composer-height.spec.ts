/**
 * #715 / #716 regression pins — on the MECHANISM, not arithmetic.
 *
 * History, because this file exists to stop it repeating: the first #715 fix
 * drove the composer's height from onContentSizeChange through state. On the
 * New Architecture, Fabric auto-sizes multiline TextInputs natively, so the
 * controlled height fought the platform and the composer oscillated on a
 * physical iPhone (grow, snap back, grow). The correct amount of height code
 * under Fabric is none: bound the box with minHeight/maxHeight and let the
 * platform grow it.
 *
 * So these tests assert the ABSENCE of the fighting mechanism and the
 * presence of the bounds — the two things a well-meaning future fix is most
 * likely to break.
 */
import { readFileSync } from "fs"
import { join } from "path"

import {
  INPUT_PADDING_V,
  MIN_BOX_HEIGHT,
  MAX_BOX_HEIGHT,
} from "@app/screens/chat/components/composer-height"

const componentSource = readFileSync(
  join(__dirname, "../../app/screens/chat/components/MessageInput.tsx"),
  "utf8",
)

describe("composer sizing mechanism", () => {
  it("bounds are sane and hold at least two padded lines", () => {
    // Two ~19px lines + padding must fit under the max, or #715 comes back
    // as a scroll instead of a clip.
    expect(2 * 19 + 2 * INPUT_PADDING_V).toBeLessThanOrEqual(MAX_BOX_HEIGHT)
    expect(MIN_BOX_HEIGHT).toBeLessThan(MAX_BOX_HEIGHT)
  })

  it("does not drive the input height from content-size state", () => {
    // The oscillation mechanism, by name. If either of these reappears, the
    // controlled-height loop is back and iOS will fight Fabric again.
    expect(componentSource).not.toContain("onContentSizeChange")
    expect(componentSource).not.toMatch(/height:\s*inputHeight/)
  })

  it("bounds the box via min/max styles instead", () => {
    expect(componentSource).toContain("minHeight: MIN_BOX_HEIGHT")
    expect(componentSource).toContain("maxHeight: MAX_BOX_HEIGHT")
    expect(componentSource).toContain("paddingVertical: INPUT_PADDING_V")
  })
})
