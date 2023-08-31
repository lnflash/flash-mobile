import { useState, useEffect } from "react"
import { nodeInfo } from "@breeztech/react-native-breez-sdk"
import { initializeBreezSDK } from "@app/utils/breez-sdk"

const useBreezBalance = (): [number | null, () => void] => {
  const [balance, setBalance] = useState<number | null>(null)
  const [refresh, setRefresh] = useState<number>(0)

  useEffect(() => {
    const initializeAndFetchBalance = async () => {
      console.log("initializing breez balance hook")
      await initializeBreezSDK()
      console.log("connected to breez sdk")
      const nodeState = await nodeInfo()
      const balance = nodeState.channelsBalanceMsat + nodeState.onchainBalanceMsat
      console.log("getting balance", balance)
      setBalance(balance / 1000)
    }

    initializeAndFetchBalance()
  }, [refresh])

  const refreshBreezBalance = () => {
    setRefresh((prev) => prev + 1)
  }

  return [balance, refreshBreezBalance]
}

export default useBreezBalance
