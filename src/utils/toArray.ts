export const toArray = (obj: object) => Object.entries(obj).map(([key, value]) => ({ ...value, path: key }))
