#!/usr/bin/env node

const version = '0.1.0'

if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log(version)
  process.exit(0)
}

console.log(`cortex-editor v${version}

The CLI is not yet available. To use cortex-editor, add it as a Vite plugin:

  import { createSourceTransform } from 'cortex-editor'
  // Use createSourceTransform(projectRoot) to create a transform function
`)
