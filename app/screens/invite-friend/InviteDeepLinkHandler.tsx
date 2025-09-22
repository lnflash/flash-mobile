import React from "react"
import { useInviteDeepLink } from "./HandleInviteDeepLink"

export const InviteDeepLinkHandler: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  useInviteDeepLink()
  return <>{children}</>
}
