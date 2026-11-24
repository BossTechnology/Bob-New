// Every path the app can answer, found on disk, with the access the box
// gives it: pages and route handlers under app/, files under public/.
// Dynamic segments ([id], [...rest]) become a placeholder; route groups
// ((name)) leave no segment.
import { readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { boxAccess } from '../../lib/bob/surface.ts'

const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)])

function appPath(file) {
  const segments = relative('app', file).split(sep).slice(0, -1)
    .filter((s) => !/^\(.*\)$/.test(s))
    .map((s) => (/^\[.*\]$/.test(s) ? 'x' : s))
  return '/' + segments.join('/')
}

export function boxRoutes(root = '.') {
  const app = files(join(root, 'app'))
    .filter((f) => /[/\\](route\.ts|page\.tsx)$/.test(f))
    .map((f) => appPath(relative(root, f)))
  const pub = files(join(root, 'public')).map((f) => '/' + relative(join(root, 'public'), f).split(sep).join('/'))
  return [...new Set([...app, ...pub])].sort().map((path) => ({
    path,
    access: boxAccess(path),
    data: path.startsWith('/api/') || path.startsWith('/auth/'),
  }))
}
