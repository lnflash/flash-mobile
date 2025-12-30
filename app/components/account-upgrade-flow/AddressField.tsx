import React, { useState } from "react"
import { ActivityIndicator, TextInput, View } from "react-native"
import { makeStyles, Text, useTheme } from "@rneui/themed"

// components
import { PrimaryBtn } from "../buttons"

import { useBusinessAddressEnrichLazyQuery } from "@app/graphql/generated"

type Props = {
  label: string
  placeholder: string
  value?: string
  errorMsg?: string
  onAddressSelect: (address: string, lat?: number, lng?: number) => void
}

const AddressField: React.FC<Props> = ({
  label,
  placeholder,
  value,
  errorMsg,
  onAddressSelect,
}) => {
  const styles = useStyles()
  const { colors } = useTheme().theme

  const [inputValue, setInputValue] = useState(value || "")
  const [loading, setLoading] = useState(false)
  const [enrichError, setEnrichError] = useState<string>()

  const [enrichAddress] = useBusinessAddressEnrichLazyQuery()

  const handleEnrichAddress = async () => {
    if (!inputValue || inputValue.length < 3) {
      setEnrichError("Please enter a valid address")
      return
    }

    setLoading(true)
    setEnrichError(undefined)

    try {
      const { data } = await enrichAddress({
        variables: { address: inputValue },
      })

      if (data?.businessAddressEnrich?.errors?.length) {
        setEnrichError(data.businessAddressEnrich.errors[0].message)
      } else if (data?.businessAddressEnrich?.formattedAddress) {
        onAddressSelect(
          data.businessAddressEnrich.formattedAddress,
          data.businessAddressEnrich.latitude ?? undefined,
          data.businessAddressEnrich.longitude ?? undefined,
        )
      }
    } catch (err) {
      console.log("Address enrichment error:", err)
      setEnrichError("Failed to validate address. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <Text type="bl" bold>
        {label}
      </Text>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          value={inputValue}
          onChangeText={(text) => {
            setInputValue(text)
            setEnrichError(undefined)
          }}
        />
      </View>
      {(errorMsg || enrichError) && (
        <Text type="caption" color={colors.red}>
          {errorMsg || enrichError}
        </Text>
      )}
      {value && (
        <View style={styles.selectedAddress}>
          <Text type="caption" color={colors.grey3}>
            Selected: {value}
          </Text>
        </View>
      )}
      <PrimaryBtn
        label={loading ? "Validating..." : "Validate Address"}
        onPress={handleEnrichAddress}
        disabled={loading || !inputValue}
        btnStyle={styles.btn}
      />
      {loading && <ActivityIndicator style={styles.loader} />}
    </View>
  )
}

export default AddressField

const useStyles = makeStyles(({ colors }) => ({
  container: {
    marginBottom: 15,
  },
  inputContainer: {
    marginTop: 5,
    marginBottom: 2,
  },
  input: {
    paddingHorizontal: 15,
    paddingVertical: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.grey4,
    backgroundColor: colors.grey5,
    fontSize: 16,
    fontFamily: "Sora-Regular",
    color: colors.black,
    width: "100%",
  },
  btn: {
    marginTop: 10,
  },
  loader: {
    marginTop: 10,
  },
  selectedAddress: {
    marginTop: 5,
    padding: 8,
    backgroundColor: colors.grey5,
    borderRadius: 8,
  },
}))
