export type Vec2 = {
  x: number
  y: number
}

export const vec = (x: number, y: number): Vec2 => ({ x, y })

export const add = (a: Vec2, b: Vec2): Vec2 => vec(a.x + b.x, a.y + b.y)
export const sub = (a: Vec2, b: Vec2): Vec2 => vec(a.x - b.x, a.y - b.y)
export const mul = (a: Vec2, scalar: number): Vec2 => vec(a.x * scalar, a.y * scalar)
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y
export const length = (a: Vec2): number => Math.hypot(a.x, a.y)
export const distance = (a: Vec2, b: Vec2): number => length(sub(a, b))

export const normalize = (a: Vec2): Vec2 => {
  const len = length(a)
  if (len < 1e-9) {
    return vec(0, 0)
  }
  return vec(a.x / len, a.y / len)
}

export const rotateAround = (point: Vec2, origin: Vec2, angleRad: number): Vec2 => {
  const c = Math.cos(angleRad)
  const s = Math.sin(angleRad)
  const dx = point.x - origin.x
  const dy = point.y - origin.y
  return vec(origin.x + dx * c - dy * s, origin.y + dx * s + dy * c)
}

export const mirrorPointOnLine = (point: Vec2, a: Vec2, b: Vec2): Vec2 => {
  const ab = sub(b, a)
  const ap = sub(point, a)
  const denom = dot(ab, ab)
  if (denom < 1e-9) {
    return point
  }
  const t = dot(ap, ab) / denom
  const proj = add(a, mul(ab, t))
  const offset = sub(proj, point)
  return add(point, mul(offset, 2))
}
