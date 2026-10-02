module.exports = {
  // Custom:
  semi: false,
  trailingComma: "all",
  printWidth: 90,
  quoteProps: "consistent",
  // Defaults:
  singleQuote: false,
  tabWidth: 2,
  useTabs: false,
  bracketSpacing: true,
  arrowParens: "always",
  proseWrap: "preserve",
  endOfLine: "lf",
  overrides: [
    {
      // The card art is copied byte-for-byte from flash-pos (see its header),
      // so it keeps flash-pos's formatting: formatting it here must not
      // change a byte. These are flash-pos's options over Prettier's defaults.
      files: "app/components/flashcard-v2-art/cardArtV2.tsx",
      options: {
        semi: true,
        printWidth: 80,
        quoteProps: "as-needed",
        singleQuote: true,
        bracketSpacing: false,
        bracketSameLine: true,
        arrowParens: "avoid",
      },
    },
  ],
}
