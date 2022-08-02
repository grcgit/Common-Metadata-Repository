const { resizeImage, notFound } = require('./resize');
const { getCollectionLevelBrowseImage, getGranuleLevelBrowseImage } = require('./cmr');

const http = require('http');
const https = require('https');

// Importing express
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const router = express.Router();

const nodemailer = require('nodemailer');

const crypto = require('crypto');

const fs = require('fs');
const util = require('util');

const { JsonDB } = require('node-json-db');
const { Config } = require('node-json-db/dist/lib/JsonDBConfig');
const secretConfig = require('./secret-config');
const config = require('./config');
const { withTimeout, slurpImageIntoBuffer } = require('./util');
const { cacheImage, getImageFromCache } = require('./cache');

/**
 * buildResponse: assembles response body to avoid code duplication
 * @param {Buffer<Image>} image
 * @returns {JSON} assembled response object with image as a base64 string
 */
const buildResponse = image => {
  // console.log('Image Dump');
  // console.log(image);
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'image/png',
      'Access-Control-Allow-Origin': '*'
    },
    // body: image.toString('base64'),
    // body: image.toString('ascii'),
    body: image,
    isBase64Encoded: true
  };
};

/**
 * getImageUrlFromConcept: call appropriate cmr.js function based on
 * given concept type to extract image url from metadata
 * @param {String} conceptId CMR concept id
 * @param {String} conceptType CMR concept type
 * 'dataset' refers to collections
 * @returns {String} image url or null
 */
const getImageUrlFromConcept = async (conceptId, conceptType) => {
  console.log(`Concept id: ${conceptId}`);

  if (!conceptId) {
    return null;
  }

  if (conceptType === 'granules') {
    return getGranuleLevelBrowseImage(conceptId);
  }
  if (conceptType === 'datasets') {
    return getCollectionLevelBrowseImage(conceptId);
  }

  console.error(
    `Unable to fetch imagery for concept-type: ${conceptType} on concept-id ${conceptId}`
  );
};

const readFileProm = util.promisify(fs.readFile);

const resizeImageFromLocalURL = async (localUrl, height, width) => {
  const content = await readFileProm(localUrl);
  if (content) {
    const thumbnail = await resizeImage(content, height, width);
    if (thumbnail) {
      console.log('made thumbnail of local image');
      return thumbnail;
    }
  }
};

/**
 * resizeImageFromConceptId: call necessary helper functions to resize an image
 * associated with a given concept-id
 * @param {String} conceptType
 * @param {String} conceptId
 * @param {Integer} height
 * @param {Integer} width
 * @returns {JSON} server response object
 */
const resizeImageFromConceptId = async (conceptType, conceptId, height, width) => {
  const cacheKey = `${conceptId}-${height}-${width}`;
  const imageFromCache = await getImageFromCache(cacheKey);
  if (imageFromCache) {
    console.log(`Returning cached image ${cacheKey}`);
    const br = buildResponse(imageFromCache);
    // console.log(br);
    return br;
  }

  // If given an image url, fetch the image and resize. If no valid image
  // exists, return the not found response
  const imageUrl = await withTimeout(
    config.TIMEOUT_INTERVAL,
    getImageUrlFromConcept(conceptId, conceptType)
  );
  // If the url is not `null`, `undefined`, or an empty string try to grab the image and resize it
  if (imageUrl) {
    const imageBuffer = await withTimeout(config.TIMEOUT_INTERVAL, slurpImageIntoBuffer(imageUrl));
    if (imageBuffer) {
      const thumbnail = await resizeImage(imageBuffer, height, width);
      if (thumbnail) {
        cacheImage(cacheKey, thumbnail);
        return buildResponse(thumbnail);
      }
    }
  }

  // try local path
  const localUrl = imageUrl.replace('C:', '/mnt/c');
  console.log(localUrl);
  const thumbnaillocal = await resizeImageFromLocalURL(localUrl, height, width);
  if (thumbnaillocal) {
    cacheImage(cacheKey, thumbnaillocal);
    return buildResponse(thumbnaillocal);
  }

  console.log(`No image found for: ${conceptId}. Returning default image.`);
  const imgNotFound = await notFound();
  // scale to requested size
  const thumbnail = await resizeImage(imgNotFound, height, width);

  if (thumbnail) {
    return buildResponse(thumbnail);
  }

  // should never reach this point, but just in case we send back the full size no-image
  return buildResponse(imgNotFound);
};

/**
 * parseArguments: pull relevant parameters from the Lambda event
 * object
 * @param {JSON} event
 * @returns {JSON} parsed arguments that were passed to the server
 */
const parseArguments = event => {
  const pathParams = event.path
    .split('/')
    .filter(param => param !== 'browse-scaler' && param !== 'browse_images' && param !== '');

  const args = {
    conceptType: pathParams[0],
    conceptId: pathParams.pop(),
    h: event.queryStringParameters.h,
    w: event.queryStringParameters.w
  };

  if (!args.conceptId) {
    throw new Error('Please supply a concept id');
  }

  if (!args.h && !args.w) {
    throw new Error('Please supply at least a height or a width');
  }

  return args;
};

const historyDB = new JsonDB(new Config('REQUEST_HISTORY_DB', true, true, '#'));
const downloadDB = new JsonDB(new Config('DOWNLOAD_HISTORY_DB', true, true, '#'));

const getHash = input => {
  const inputWithKey = input + secretConfig.secret_key;
  return crypto
    .createHash('sha1')
    .update(inputWithKey)
    .digest('hex');
};

exports.handler = async event => {
  const args = parseArguments(event);
  console.log(`Test Attempting to resize browse image for concept: ${JSON.stringify(args)}`);
  return resizeImageFromConceptId(args.conceptType, args.conceptId, args.h, args.w);
};

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors());

// Handling GET IMAGE
app.get('/browse-scaler/browse_images/*', function getImage(req, res) {
  const string1 = req.path
    .split('/')
    .filter(param => param !== 'browse-scaler' && param !== 'browse_images' && param !== '');

  const args = {
    conceptType: string1[0],
    conceptId: string1[1],
    h: req.query.h,
    w: req.query.w
  };

  if (args.h > 512) {
    args.h = 512;
  }

  if (args.w > 512) {
    args.w = 512;
  }
  console.log(`Arguments: ${JSON.stringify(args)}`);

  resizeImageFromConceptId(args.conceptType, args.conceptId, args.h, args.w)
    .then(imageRes => {
      res.writeHead(200, { 'Content-type': 'image/png' });
      res.end(imageRes.body);
    })
    .catch(() => {
      res.writeHead(500);
      res.end();
    });
});

// Handling GET DATA
app.get('/data/*', function getData(req, res) {
  const urlstring = req.path;
  let accepted = false;
  if (urlstring.search('\\.\\./') === -1) {
    // prevent stray file downloads
    accepted = true;
  }
  const hash = getHash(urlstring);

  if (accepted) {
    if (req.query.p == hash) {
      const datasetstring = urlstring.split('/data/')[1];
      const datarootstring = secretConfig.DATA_DIR;
      const file = datarootstring + datasetstring;
      if (fs.existsSync(file)) {
        res.download(file);
      } else {
        res.writeHead(404);
        res.end();
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  }

  const time = new Date().toISOString();

  const entry = {
    dataset: urlstring,
    provided_hash: req.query.p,
    valid: accepted,
    time,
    remote_address: req.socket.remoteAddress,
    x_forwarded_for: req.headers['x-forwarded-for']
  };

  downloadDB.push(`#${getHash(time)}`, { entry });
});

// Handling POST DATA
router.post('/data/*', function postData(req, res) {
  const transporter = nodemailer.createTransport({
    // host: secret_config.SMTP_HOST,
    // port: secret_config.SMTP_PORT,
    // secure: false,
    service: 'Gmail',
    auth: {
      user: secretConfig.SMTP_USER,
      pass: secretConfig.SMTP_PASSWORD
    }
  });

  const { userEmail, userName } = req.body;

  const urlstring = req.path;
  const hash = getHash(urlstring);
  const fullUrl = `${secretConfig.PROXYSERVER}${urlstring}?p=${hash}`;

  console.log(fullUrl);

  let legalRequest = false;
  if (userEmail && userName) {
    // check if url is legitimate
    if (urlstring.search('\\.\\./') === -1) {
      // prevent stray file downloads
      legalRequest = true;
    } else {
      // console.log(urlstring)
      // console.log("Bad Path")
    }
  }

  if (legalRequest === true) {
    const mailOptions = {
      from: secretConfig.SMTP_USER,
      to: userEmail,
      bcc: secretConfig.ADMIN_EMAILS,
      subject: 'Jetstream Data Request',
      html: `Hello ${userName}<br>Your data is ready to be downloaded<br>${fullUrl}`
    };

    transporter.sendMail(mailOptions, function sendMailConsoleLog(err) {
      // console.log("Sending Mail")
      if (err) {
        console.log('Error');
        console.log(err);
      }
    });

    res.writeHead(200);
    res.end();
  } else {
    // console.log("Bad Request")
    res.writeHead(404);
    res.end();
  }

  const time = new Date().toISOString();

  const entry = {
    name: userName,
    email: userEmail,
    dataset: urlstring,
    valid: legalRequest,
    time,
    remote_address: req.socket.remoteAddress,
    x_forwarded_for: req.headers['x-forwarded-for']
  };

  historyDB.push(`#${getHash(time)}`, { entry });
});

app.use('/', router);

const { PORT } = secretConfig;

if (secretConfig.USE_HTTPS) {
  // Certificate
  const privateKey = fs.readFileSync(secretConfig.privateKey, 'utf8');
  const certificate = fs.readFileSync(secretConfig.cert, 'utf8');
  const ca = fs.readFileSync(secretConfig.chain, 'utf8');

  const credentials = {
    key: privateKey,
    cert: certificate,
    ca
  };

  const httpsServer = https.createServer(credentials, app);

  httpsServer.listen(PORT, () => {
    console.log(`HTTPS Server running on port ${PORT}`);
  });
} else {
  const httpServer = http.createServer(app);

  httpServer.listen(PORT, () => {
    console.log(`HTTP Server running on port ${PORT}`);
  });
}
