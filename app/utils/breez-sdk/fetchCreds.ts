import axios from "axios"
import { useAppConfig } from "@app/hooks"
import { useEffect, useState } from "react"

interface GreenlightCredentials {
  deviceKey: number[]
  deviceCert: number[]
}

const useFetchGreenlightCredentials = () => {
  const [credentials, setCredentials] = useState<GreenlightCredentials | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const {
    appConfig: {
      galoyInstance: { authUrl },
    },
  } = useAppConfig()

  useEffect(() => {
    const fetchGreenlightCredentials = async () => {
      try {
        const response = await axios.get<GreenlightCredentials>(`${authUrl}/getCertKey`, {
          headers: {
            // TODO: Include headers for authentication as required
            Authorization: "Bearer YOUR_AUTH_TOKEN", // Replace with actual token retrieval logic
          },
        })
        setCredentials(response.data)
      } catch (error) {
        console.error("Error fetching Greenlight credentials:", error)
        setError(new Error("Failed to fetch Greenlight credentials"))
      }
    }

    fetchGreenlightCredentials()
  }, [authUrl])

  return { credentials, error }
}

export default useFetchGreenlightCredentials
