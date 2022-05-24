const { resizeImage, notFound } = require('./resize');
const { getCollectionLevelBrowseImage, getGranuleLevelBrowseImage} = require('./cmr');
const { cacheImage, getImageFromCache } = require('./cache');
const { withTimeout, slurpImageIntoBuffer } = require('./util');

const config = require ('./config');
const secret_config = require('./secret-config')

const http = require('http');
const https = require('https');

// Importing express
const express = require('express');
var cors = require('cors')
const bodyParser = require("body-parser");
const router = express.Router();

const nodemailer = require('nodemailer')

const crypto = require('crypto')

var fs = require('fs');
const util = require('util')

const { JsonDB } = require('node-json-db');
const { Config } = require('node-json-db/dist/lib/JsonDBConfig');

/**
 * buildResponse: assembles response body to avoid code duplication
 * @param {Buffer<Image>} image
 * @returns {JSON} assembled response object with image as a base64 string
 */
const buildResponse = image => {
  //console.log('Image Dump');
  //console.log(image);
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'image/png',
      "Access-Control-Allow-Origin": "*"
    },
    //body: image.toString('base64'),
    //body: image.toString('ascii'),
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
  } else if (conceptType === 'datasets') {
    return getCollectionLevelBrowseImage(conceptId);
  }

  console.error (`Unable to fetch imagery for concept-type: ${conceptType} on concept-id ${conceptId}`)
  return;
};

const readFileProm = util.promisify(fs.readFile)

const resizeImageFromLocalURL = async (localUrl, height, width) => {
  const content = await readFileProm(localUrl)
  if (content) {
    const thumbnail = await resizeImage(content, height, width);
    if (thumbnail) {
      console.log("made thumbnail of local image");
      return thumbnail
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
    //console.log(br);
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

  //try local path
  localUrl = imageUrl.replace("C:","/mnt/c");
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

var history_db = new JsonDB(new Config("REQUEST_HISTORY_DB", true, true, '#'));
var download_db = new JsonDB(new Config("DOWNLOAD_HISTORY_DB", true, true, '#'));

const getHash = input => {
  let input_with_key = input + secret_config.secret_key
  return crypto.createHash('sha1').update(input_with_key).digest('hex');
}

exports.handler = async event => {
  const args = parseArguments(event);
  console.log(`Test Attempting to resize browse image for concept: ${JSON.stringify(args)}`);
  return resizeImageFromConceptId(args.conceptType, args.conceptId, args.h, args.w);
};

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors())

// Handling GET IMAGE
app.get('/browse-scaler/browse_images/*', function (req, res) {
  const string1 = req.path
      .split('/')
      .filter(param => param !== 'browse-scaler' && param !== 'browse_images' && param !== '');

  let args = {
    conceptType: string1[0],
    conceptId: string1[1],
    h: req.query.h,
    w: req.query.w
  };

  if(args.h > 512){
    args.h = 512
  }

  if(args.w > 512){
    args.w = 512
  }
  console.log(`Arguments: ${JSON.stringify(args)}`);

  resizeImageFromConceptId(args.conceptType, args.conceptId, args.h, args.w).then(image_res => {
    res.writeHead(200,{'Content-type':'image/png'});
    res.end(image_res.body);
  }).catch(error => {
    res.writeHead(500);
    res.end();
  })
})

// Handling GET DATA
app.get('/data/*', function (req, res) {
  const urlstring = req.path;
  let accepted = false
  if(urlstring.search("\\.\\.") == -1){ //prevent stray file downloads
    accepted = true
  }
  let hash = getHash(urlstring)

  if(accepted){
    if(req.query.p == hash){    
      const datasetstring = urlstring.split("/data/")[1];
      const datarootstring = secret_config.DATA_DIR;
      const file = datarootstring + datasetstring;
      if(fs.existsSync(file)){
        res.download(file);
      }else{
        res.writeHead(404);
        res.end();
      }
    }else{
      res.writeHead(404);
      res.end();
    }
  }
  
  let time = new Date().toISOString()

  let entry = {
    dataset: urlstring,
    provided_hash: req.query.p,
    valid: accepted,
    time: time,
    remote_address: req.socket.remoteAddress,
    x_forwarded_for: req.headers['x-forwarded-for']
  }

  download_db.push('#' + getHash(time),{entry})
})

// Handling POST DATA
router.post('/data/*', function (req, res) {
  let transporter = nodemailer.createTransport({
    // host: secret_config.SMTP_HOST,
    // port: secret_config.SMTP_PORT,
    // secure: false,
    service: 'Gmail',
    auth: {
      user: secret_config.SMTP_USER,
      pass: secret_config.SMTP_PASSWORD,
    },
  });

  let user_email = req.body.email
  let user_name = req.body.name

  const urlstring = req.path;
  let hash = getHash(urlstring)
  let fullUrl = req.protocol + '://' + req.get('host') + urlstring + '?p=' + hash

  let legal_request = false
  if(user_email && user_name){
    //check if url is legitimate
    if(urlstring.search("\\.\\.") == -1){ //prevent stray file downloads
      legal_request = true
    }
  }

  if(legal_request == true){
    let mailOptions = {
      from: secret_config.SMTP_USER,
      to: user_email,
      bcc: secret_config.ADMIN_EMAILS,
      subject: 'Jetstream Data Request',
      html: `Hello ${user_name}<br>Your data is ready to be downloaded<br>${fullUrl}`
    };

    transporter.sendMail(mailOptions, function (err, info) {
      //console.log("Sending Mail")
      if (err) {
        console.log("Error")
        console.log(err)
      } else {
        //console.log("Success")
        //console.log(info)
      }
    });

    res.writeHead(200);
    res.end()
  }else{
    res.writeHead(404);
    res.end();
  }
  
  let time = new Date().toISOString()

  let entry = {
    name: user_name,
    email: user_email,
    dataset: urlstring,
    valid: legal_request,
    time: time,
    remote_address: req.socket.remoteAddress,
    x_forwarded_for: req.headers['x-forwarded-for']
  }

  history_db.push('#' + getHash(time),{entry})
})

app.use("/", router);

let use_https = secret_config.USE_HTTPS

if(use_https){
  // Certificate
  const privateKey = fs.readFileSync(secret_config.privateKey, 'utf8');
  const certificate = fs.readFileSync(secret_config.cert, 'utf8');
  const ca = fs.readFileSync(secret_config.chain, 'utf8');

  const credentials = {
    key: privateKey,
    cert: certificate,
    ca: ca
  };

  const httpsServer = https.createServer(credentials, app);

  httpsServer.listen(8081, () => {
    console.log('HTTPS Server running on port 8081');
  });
  
}else{
  const httpServer = http.createServer(app);

  httpServer.listen(8081, () => {
    console.log('HTTP Server running on port 8081');
  });
}