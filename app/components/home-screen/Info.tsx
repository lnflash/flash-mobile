import React, { useEffect, useState } from "react"
import { View } from "react-native"
import { makeStyles } from "@rneui/themed"
import { ApolloError } from "@apollo/client"
import { useI18nContext } from "@app/i18n/i18n-react"
import { listRefundables, RefundableSwap } from "@breeztech/react-native-breez-sdk-liquid"

// components
import { GaloyErrorBox } from "../atomic/galoy-error-box"

// gql
import { getErrorMessages } from "@app/graphql/utils"
import { GraphQLError } from "graphql"
import { GraphQlApplicationError } from "@app/graphql/generated"

type ErrorInput =
  | readonly GraphQLError[]
  | readonly GraphQlApplicationError[]
  | ApolloError

type Props = {
  error?: ErrorInput
}

const Info: React.FC<Props> = ({ error }) => {
  const styles = useStyles()
  const { LL } = useI18nContext()

  const [refundables, setRefundables] = useState<RefundableSwap[]>([])

  useEffect(() => {
    fetchRefundables()
  }, [])

  const fetchRefundables = async () => {
    try {
      const refundables = (await listRefundables()) || []
      setRefundables(refundables)
    } catch (err) {
      console.log("List Refundables Err: ", err)
    }
  }

  if (error || refundables.length > 0) {
    return (
      <View style={styles.marginButtonContainer}>
        {refundables.length > 0 && (
          <GaloyErrorBox
            isWarning
            errorMessage={LL.HomeScreen.refundableWarning()}
            style={{ marginBottom: 5 }}
          />
        )}
        {error && <GaloyErrorBox errorMessage={getErrorMessages(error)} />}
      </View>
    )
  } else {
    return null
  }
}

export default Info

const useStyles = makeStyles(({ colors }) => ({
  marginButtonContainer: {
    marginBottom: 20,
  },
}))
