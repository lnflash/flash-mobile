import React, { useState } from "react"
import { View } from "react-native"
import { makeStyles } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { InputField } from "@app/components/business-account-flow"

// store
import { useAppDispatch, useAppSelector } from "@app/store/redux"
import { setBusinessInfo } from "@app/store/redux/slices/businessAccountSlice"

type Props = StackScreenProps<RootStackParamList, "BusinessInformation">

const BusinessInformation: React.FC<Props> = ({ navigation }) => {
  const styles = useStyles()

  const dispatch = useAppDispatch()
  const { businessName, businessAddress } = useAppSelector(
    (state) => state.businessAccount.businessInfo,
  )

  const onPressNext = () => {
    navigation.navigate("BankInformation")
  }

  return (
    <Screen>
      <View style={styles.container}>
        <InputField
          label="Business Name"
          placeholder="Optional for merchants"
          value={businessName}
          onChangeText={(val) => dispatch(setBusinessInfo({ businessName: val }))}
        />

        <InputField
          label="Business address"
          placeholder="Optional for merchants"
          value={businessAddress}
          onChangeText={(val) => dispatch(setBusinessInfo({ businessAddress: val }))}
        />
      </View>
      <PrimaryBtn label="Next" btnStyle={styles.btn} onPress={onPressNext} />
    </Screen>
  )
}

export default BusinessInformation

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  btn: {
    marginBottom: 10,
    marginHorizontal: 20,
  },
}))
