import React, { useState } from "react"
import { ActivityIndicator, View } from "react-native"
import { Input, Text, makeStyles, useTheme } from "@rneui/themed"

// components
import { Screen } from "../screen"
import { GaloyErrorBox } from "@app/components/atomic/galoy-error-box"

// utils
import { testProps } from "@app/utils/testProps"

type Props = {
  send: (code: string) => void
  header: string
  loading: boolean
  errorMessage: string | undefined
  setErrorMessage: (arg0: string) => void
}

const placeholder = "000000"

export const CodeInput: React.FC<Props> = ({
  send,
  header,
  loading,
  errorMessage,
  setErrorMessage,
}) => {
  const styles = useStyles()
  const { colors } = useTheme().theme

  const [code, _setCode] = useState("")

  const setCode = (code: string) => {
    if (code.length > 6) {
      return
    }

    setErrorMessage("")
    _setCode(code)
    if (code.length === 6) {
      send(code)
    }
  }

  return (
    <Screen
      preset="scroll"
      style={styles.screenStyle}
      keyboardOffset="navigationHeader"
      keyboardShouldPersistTaps="handled"
    >
      <Text type="p1" style={styles.header}>
        {header}
      </Text>
      <Input
        {...testProps(placeholder)}
        placeholder={placeholder}
        containerStyle={styles.inputComponentContainerStyle}
        inputContainerStyle={styles.inputContainerStyle}
        inputStyle={styles.inputStyle}
        value={code}
        onChangeText={setCode}
        renderErrorMessage={false}
        autoFocus={true}
        textContentType={"oneTimeCode"}
        keyboardType="numeric"
      />
      {errorMessage && (
        <View style={styles.errorContainer}>
          <GaloyErrorBox errorMessage={errorMessage} />
        </View>
      )}
      {loading && (
        <ActivityIndicator
          style={styles.activityIndicator}
          size="large"
          color={colors.primary}
        />
      )}
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  screenStyle: {
    padding: 20,
    flexGrow: 1,
  },
  activityIndicator: {
    marginTop: 12,
  },
  header: {
    marginBottom: 20,
  },
  inputComponentContainerStyle: {
    flexDirection: "row",
    marginBottom: 20,
    paddingLeft: 0,
    paddingRight: 0,
    justifyContent: "center",
  },
  inputContainerStyle: {
    minWidth: 160,
    minHeight: 60,
    borderWidth: 1,
    paddingHorizontal: 10,
    borderColor: colors.border02,
    borderRadius: 10,
    marginRight: 0,
  },
  inputStyle: {
    fontSize: 24,
    textAlign: "center",
  },
  errorContainer: {
    marginBottom: 20,
  },
}))
