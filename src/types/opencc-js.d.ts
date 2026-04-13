declare module 'opencc-js' {
  export type ConverterOptions = {
    from: string
    to: string
  }

  export function Converter(options: ConverterOptions): (input: string) => string
}

