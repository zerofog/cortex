import path from 'path'
import { withCortex } from 'cortex-editor/next'

export default withCortex({
  // cortex-editor is a symlinked file: dependency living one directory up;
  // widen Turbopack's resolution root so the symlink target is inside it.
  // Real npm installs don't need this — the package sits inside node_modules.
  turbopack: { root: path.resolve(process.cwd(), '..') },
})
