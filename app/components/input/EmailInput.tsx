import React from "react"
import { View } from "react-native"
import { Input, makeStyles, Text } from "@rneui/themed"

type Props = {
  title: string
  email?: string
  setEmail: (val: string) => void
}

const EmailInput: React.FC<Props> = ({ title, email, setEmail }) => {
  const styles = useStyles()

  return (
    <View>
      <Text type={"p1"} style={styles.header}>
        {title}
      </Text>
      <View style={styles.inputContainer}>
        <Input
          placeholder={"friend@email.com"}
          containerStyle={styles.inputComponentContainerStyle}
          inputContainerStyle={styles.inputContainerStyle}
          renderErrorMessage={false}
          textContentType="telephoneNumber"
          keyboardType="phone-pad"
          value={email}
          onChangeText={setEmail}
          autoFocus={true}
        />
      </View>
    </View>
  )
}

export default EmailInput

const useStyles = makeStyles(({ colors }) => ({
  wrapper: {},
  header: {
    marginBottom: 5,
  },
  inputContainer: {
    flexDirection: "row",
    marginBottom: 10,
  },
  inputComponentContainerStyle: {
    flex: 1,
    paddingLeft: 0,
    paddingRight: 0,
  },
  inputContainerStyle: {
    borderWidth: 1,
    borderRadius: 10,
    borderColor: colors.border02,
    paddingHorizontal: 10,
  },
}))
