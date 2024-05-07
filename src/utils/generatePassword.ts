import crypto from 'node:crypto'

export const generatePassword = (length: number) => {
  const allowedChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$'
  let password = ''
  const randomBytes = crypto.randomBytes(length)

  for (let i = 0; i < randomBytes.length; i++) {
    const byte = randomBytes[i]
    password += allowedChars[byte % allowedChars.length]
  }

  return password
}
