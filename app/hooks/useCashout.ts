import {
  HomeAuthedDocument,
  useAccountDefaultWalletLazyQuery,
  useIntraLedgerUsdPaymentSendMutation,
} from "@app/graphql/generated"

export const useCashout = () => {
  const [intraLedgerUsdPaymentSend] = useIntraLedgerUsdPaymentSendMutation({
    refetchQueries: [HomeAuthedDocument],
  })

  const [accountDefaultWalletQuery] = useAccountDefaultWalletLazyQuery({
    fetchPolicy: "no-cache",
  })

  const onCashout = async (walletId: string, amount: number) => {
    const { data } = await accountDefaultWalletQuery({
      variables: { username: process.env.CASHOUT_ADDRESS as string },
    })

    if (data) {
      const res = await intraLedgerUsdPaymentSend({
        variables: {
          input: {
            walletId,
            recipientWalletId: data?.accountDefaultWallet.id,
            amount,
            memo: "Cash out",
          },
        },
      })

      return res.data?.intraLedgerUsdPaymentSend
    }
  }

  return { onCashout }
}
