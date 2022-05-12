exports.SMTP_HOST = "smtp.host.com"
exports.SMTP_PORT = "587"
exports.SMTP_USER = "noreply@emailhost.com"
exports.SMTP_PASSWORD = "password*******"

exports.secret_key = "examplesecretkey*****"

const DOMAIN = "www.domain.com"
exports.DOMAIN = DOMAIN
exports.privateKey = `/etc/letsencrypt/live/${DOMAIN}/privkey.pem`
exports.cert = `/etc/letsencrypt/live/${DOMAIN}/cert.pem`
exports.chain = `/etc/letsencrypt/live/${DOMAIN}/chain.pem`

exports.USE_HTTPS = false