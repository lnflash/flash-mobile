// Height math for the chat composer TextInput.
//
// onContentSizeChange reports the CONTENT height only. The box height must
// also hold the input's vertical padding, or the measured height of two lines
// clamps back to MIN_BOX_HEIGHT and the second line renders underneath the
// padding — you type it but never see it (#715).

// Vertical padding applied to the TextInput (paddingVertical). The grow math
// adds it on both sides of the content, so style and computation share this
// single constant.
export const INPUT_PADDING_V = 8

// MIN/MAX are BOX heights — they bound the rendered TextInput including its
// vertical padding, not the raw content height. Content therefore stops
// growing (and scrolling kicks in) once content + 2 * INPUT_PADDING_V reaches
// MAX_BOX_HEIGHT.
export const MIN_BOX_HEIGHT = 40
export const MAX_BOX_HEIGHT = 120

export const computeComposerHeight = (contentHeight: number): number =>
  Math.min(Math.max(contentHeight + INPUT_PADDING_V * 2, MIN_BOX_HEIGHT), MAX_BOX_HEIGHT)
