declare module "react-native-html-to-pdf" {
  export type ConvertOptions = {
    html: string
    fileName?: string
    directory?: string
    base64?: boolean
    height?: number
    width?: number
  }

  export type ConvertResult = {
    filePath: string
    base64?: string
  }

  const ReactNativeHTMLToPDF: {
    convert(options: ConvertOptions): Promise<ConvertResult>
  }

  export default ReactNativeHTMLToPDF
}
