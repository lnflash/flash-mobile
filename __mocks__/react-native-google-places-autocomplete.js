const React = require("react")
const { View } = require("react-native")

const GooglePlacesAutocomplete = React.forwardRef((props, ref) =>
  React.createElement(View, { ...props, ref }),
)

module.exports = {
  __esModule: true,
  GooglePlacesAutocomplete,
}
