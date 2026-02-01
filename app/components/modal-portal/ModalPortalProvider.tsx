import React, {
  createContext,
  useCallback,
  useContext,
  useReducer,
  useRef,
  ReactNode,
  useMemo,
} from "react"
import { View, StyleSheet } from "react-native"

type ModalPortalContextType = {
  register: (id: string, element: ReactNode) => void
  unregister: (id: string) => void
}

const ModalPortalContext = createContext<ModalPortalContextType>({
  register: () => {},
  unregister: () => {},
})

export const useModalPortal = () => useContext(ModalPortalContext)

type Props = {
  children: ReactNode
}

export const ModalPortalProvider = ({ children }: Props) => {
  const modalsRef = useRef<Map<string, ReactNode>>(new Map())
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

  const register = useCallback((id: string, element: ReactNode) => {
    modalsRef.current.set(id, element)
    forceUpdate()
  }, [])

  const unregister = useCallback((id: string) => {
    modalsRef.current.delete(id)
    forceUpdate()
  }, [])

  // Global bridge for patched node_modules (react-native-modal)
  React.useEffect(() => {
    ;(global as any).__modalPortalRegister = register
    ;(global as any).__modalPortalUnregister = unregister
    return () => {
      delete (global as any).__modalPortalRegister
      delete (global as any).__modalPortalUnregister
    }
  }, [register, unregister])

  const contextValue = useMemo(() => ({ register, unregister }), [register, unregister])

  const modalEntries = Array.from(modalsRef.current.entries())

  return (
    <ModalPortalContext.Provider value={contextValue}>
      {children}
      {modalEntries.map(([id, element]) => (
        <View key={id} style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {element}
        </View>
      ))}
    </ModalPortalContext.Provider>
  )
}
