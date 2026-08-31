// Sizing constants for the chat composer TextInput.
//
// There is deliberately NO height computation here anymore. The first fix for
// #715 drove the box height from onContentSizeChange through state, and on the
// New Architecture that FIGHTS the platform: Fabric's TextInput auto-sizes a
// multiline input natively, so a controlled height triggers relayout, which
// reports a new content size, which sets a new height — on a physical iPhone
// the composer visibly oscillated (grow, snap back, grow). The mechanism was
// the bug.
//
// Under Fabric the correct amount of code is none: leave `height` unset and
// bound the box with minHeight/maxHeight. The input grows to fit, the second
// line is visible by construction (#715), and past MAX_BOX_HEIGHT the content
// scrolls internally.

// Vertical padding applied to the TextInput (paddingVertical).
export const INPUT_PADDING_V = 8

// Bounds on the rendered BOX, including vertical padding. Applied as
// minHeight/maxHeight styles — never as a controlled `height`.
export const MIN_BOX_HEIGHT = 40
export const MAX_BOX_HEIGHT = 120
