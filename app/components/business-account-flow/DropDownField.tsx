import React from "react"
import { View } from "react-native"
import { makeStyles, Text } from "@rneui/themed"
import { Dropdown } from "react-native-element-dropdown"

type Props = {
  label: string
  placeholder: string
  data: any[]
  value: string
  onChange: (val: string) => void
}

const DropDownField: React.FC<Props> = ({
  label,
  placeholder,
  data,
  value,
  onChange,
}) => {
  const styles = useStyles()
  return (
    <View>
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
    </View>
  )
}

export default DropDownField

const useStyles = makeStyles(({ colors }) => ({
  dropdown: {
    padding: 15,
    marginTop: 5,
    marginBottom: 15,
    borderRadius: 10,
    backgroundColor: colors.grey5,
    fontSize: 16,
    fontFamily: "Sora-Regular",
  },
  container: {
    marginTop: 5,
  },
}))
