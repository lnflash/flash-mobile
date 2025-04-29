import React from "react"
import { View } from "react-native"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { Dropdown } from "react-native-element-dropdown"

type Props = {
  label: string
  placeholder: string
  data: any[]
  value: string
  errorMsg?: string
  onChange: (val: string) => void
}

const DropDownField: React.FC<Props> = ({
  label,
  placeholder,
  data,
  value,
  errorMsg,
  onChange,
}) => {
  const styles = useStyles()
  const { colors } = useTheme().theme

  return (
    <View style={styles.wrapper}>
      <Text type="bl" bold>
        {label}
      </Text>
      <Dropdown
        style={styles.dropdown}
        containerStyle={styles.container}
        data={data}
        search={false}
        maxHeight={300}
        labelField="label"
        valueField={value}
        placeholder={placeholder}
        value={value}
        onChange={(item) => onChange(item.value)}
      />
      {!!errorMsg && (
        <Text type="caption" color={colors.red}>
          {errorMsg}
        </Text>
      )}
    </View>
  )
}

export default DropDownField

const useStyles = makeStyles(({ colors }) => ({
  wrapper: {
    marginBottom: 15,
  },
  dropdown: {
    padding: 15,
    marginTop: 5,
    marginBottom: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.grey4,
    backgroundColor: colors.grey5,
    fontSize: 16,
    fontFamily: "Sora-Regular",
  },
  container: {
    marginTop: 5,
  },
}))
