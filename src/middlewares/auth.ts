export default async function(req, res, next) {
	if (!req.headers.authorization) return res.status(401).send({ message: 'No authorization header provided' })

	const token = req.headers.authorization.split(' ')[1]
	if (!token) return res.status(401).send({ message: 'No authorization header provided' })

	const apiKeyVerification = token === process.env.AUTH_SECRET
	if (apiKeyVerification) {
		next()
	} else {
		return res.code(403).send({ error: { statusCode: 403, message: 'Invalid authorization.' } })
	}
}
