/** Shared Babel parser plugins for JSX/TSX parsing across ai-writer and runtime-resolver. */
export const PARSE_PLUGINS = [
  'jsx',
  'typescript',
  ['decorators', { version: '2023-07' }],
  'importAttributes',
  'explicitResourceManagement',
] as import('@babel/parser').ParserPlugin[]
