import React from "react"
import { 
  TextInput, 
  TextInputProps, 
  Platform
} from "react-native"

// Minimal wrapper for Android SDK 35 compatibility
export const SafeTextInput: React.FC<TextInputProps> = (props) => {
  // For Android SDK 35, override certain props to prevent crashes
  if (Platform.OS === "android" && Platform.Version >= 35) {
    return (
      <TextInput
        {...props}
        // These props are known to cause issues on SDK 35
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        // Ensure we have a valid input type
        keyboardType={props.keyboardType || "default"}
        // Remove the custom font that might not be loaded properly
        style={[
          props.style,
          {
            fontFamily: "System" // Use system font instead of custom
          }
        ]}
      />
    )
  }

  // For other platforms/versions, use TextInput normally
  return <TextInput {...props} />
}