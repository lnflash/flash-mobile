import React, { useState } from "react"
import { View } from "react-native"
import { makeStyles } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { AddressField, InputField } from "@app/components/account-upgrade-flow"

// store
import { useAppDispatch, useAppSelector } from "@app/store/redux"
import { setBusinessInfo } from "@app/store/redux/slices/accountUpgradeSlice"

type Props = StackScreenProps<RootStackParamList, "BusinessInformation">

const BusinessInformation: React.FC<Props> = ({ navigation }) => {
  const styles = useStyles()

  const dispatch = useAppDispatch()
  const { businessName, businessAddress } = useAppSelector(
    (state) => state.accountUpgrade.businessInfo,
  )

  const onPressNext = () => {
    navigation.navigate("BankInformation")
  }

  return (
    <Screen>
      <View style={styles.container}>
        <InputField
          label="Business Name"
          placeholder={"Your business name"}
          value={businessName}
          onChangeText={(val) => dispatch(setBusinessInfo({ businessName: val }))}
        />
        <AddressField
          label="Business address"
          placeholder={"Enter your business address"}
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
