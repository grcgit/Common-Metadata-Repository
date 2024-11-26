const express = require('express')
const fs = require('fs')
const http = require('http')
const https = require('https')
const { createProxyMiddleware } = require('http-proxy-middleware')

const secretConfig = require('./secret-config')

const app = express()
const {
  PORT
} = secretConfig

app.use('/search', createProxyMiddleware({
  target: 'http://localhost:3003',
  changeOrigin: true,
  pathRewrite: {
    '^/search':'/'
  }
}))

app.use('/browse-scaler', createProxyMiddleware({
  target: 'http://localhost:8082',
  changeOrigin: true,
  pathRewrite: {
  }
}))

app.use('/data', createProxyMiddleware({
  target: 'http://localhost:8082',
  changeOrigin: true,
  pathRewrite: {
  }
}))

if (secretConfig.USE_HTTPS) {
  // Certificate
  const privateKey = fs.readFileSync(secretConfig.privateKey, 'utf8')
  const certificate = fs.readFileSync(secretConfig.cert, 'utf8')

  let credentials = null
  if (secretConfig.chain) {
    const ca = fs.readFileSync(secretConfig.chain, 'utf8')
    credentials = {
      key: privateKey,
      cert: certificate,
      ca
    }
  } else {
    credentials = {
      key: privateKey,
      cert: certificate
    }
  }

  const httpsServer = https.createServer(credentials, app)

  httpsServer.listen(PORT, () => {
    console.log(`HTTPS Server running on port ${PORT}`)
  })
} else {
  const httpServer = http.createServer(app)

  httpServer.listen(PORT, () => {
    console.log(`HTTP Server running on port ${PORT}`)
  })
}
