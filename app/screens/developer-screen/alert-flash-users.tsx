import React, { useState } from "react"
import { TextInput, View } from "react-native"
import { makeStyles, useTheme } from "@rneui/themed"
import { useSafeAreaInsets } from "react-native-safe-area-context"

// components
import { PrimaryBtn } from "@app/components/buttons"

export const AlertFlashUsers = () => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { bottom } = useSafeAreaInsets()

  const [title, setTitle] = useState("")
  const [desc, setDesc] = useState("")

  const onAlert = () => {}

  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
        <TextInput
          autoCorrect={false}
          autoComplete="off"
          style={styles.titleInput}
          onChangeText={setTitle}
          value={title}
          placeholder={"Alert title"}
          placeholderTextColor={colors.grey3}
          keyboardType="default"
        />
        <TextInput
          autoCorrect={false}
          autoComplete="off"
          style={styles.descInput}
          onChangeText={setDesc}
          value={desc}
          placeholder={"Alert Description"}
          placeholderTextColor={colors.grey3}
          keyboardType="default"
          multiline
        />
      </View>
      <PrimaryBtn
        label="Alert"
        onPress={onAlert}
        btnStyle={{ marginBottom: bottom + 10 }}
      />
    </View>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  wrapper: {
    flex: 1,
    paddingHorizontal: 20,
    backgroundColor: colors.white,
  },
  container: {
    flex: 1,
    marginTop: 10,
  },
  titleInput: {
    padding: 10,
    backgroundColor: colors.white,
    fontSize: 18,
    fontFamily: "Sora-Regular",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.button01,
    marginBottom: 20,
  },
  descInput: {
    height: 150,
    padding: 10,
    backgroundColor: colors.white,
    fontSize: 18,
    fontFamily: "Sora-Regular",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.button01,
    marginBottom: 10,
  },
}))
