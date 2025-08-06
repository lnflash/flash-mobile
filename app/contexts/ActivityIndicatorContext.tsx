import React, { createContext, useState } from "react"
import { ActivityIndicator } from "react-native"
import styled from "styled-components/native"

interface ActivityIndicatorInterface {
  toggleActivityIndicator: (loading: boolean) => void
  loadableVisible: boolean
}

export const ActivityIndicatorContext = createContext<ActivityIndicatorInterface>({
  toggleActivityIndicator: () => {},
  loadableVisible: false,
})

type Props = {
  children: string | React.JSX.Element | React.JSX.Element[]
}

export const ActivityIndicatorProvider = ({ children }: Props) => {
  const [visible, toggleActivityIndicator] = useState<boolean>(false)

  return (
    <ActivityIndicatorContext.Provider
      value={{ loadableVisible: visible, toggleActivityIndicator }}
    >
      {children}
      {visible && <Loading />}
    </ActivityIndicatorContext.Provider>
  )
}

export const Loading = () => (
  <Backdrop>
    <ActivityIndicator color={"#007856"} size={"large"} />
  </Backdrop>
)

const Backdrop = styled.View`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0);
`
