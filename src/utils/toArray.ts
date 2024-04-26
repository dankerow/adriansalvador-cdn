interface ArrayElement {
  path: string
  [key: string]: unknown
}

export const toArray = <T extends object>(obj: T): ArrayElement[] => {
  return Object.entries(obj).map(([key, value]) => ({ ...value as object, path: key }))
}
