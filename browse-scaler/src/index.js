const { resizeImage, notFound } = require('./resize');
const { getCollectionLevelBrowseImage, getGranuleLevelBrowseImage} = require('./cmr');
const { cacheImage, getImageFromCache } = require('./cache');
const { withTimeout, slurpImageIntoBuffer } = require('./util');

const config = require ('./config');

var http = require("http");
var fs = require('fs');

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
  fs.readFile(localUrl, function (err, content) {
    if (err) {
      console.log("Could not open local image");
    } else {
      console.log("Found local image");
      if (content) {
        resizeImage(content, height, width).then(thumbnail => {
          if (thumbnail) {
            cacheImage(cacheKey, thumbnail);
            return buildResponse(thumbnail);
          }
        }).catch(error => {
          console.log("Failed to resize local image");
        })
      }else{
        console.log("No Image Content");
      }
    }
  });

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

exports.handler = async event => {
  const args = parseArguments(event);
  console.log(`Test Attempting to resize browse image for concept: ${JSON.stringify(args)}`);
  return resizeImageFromConceptId(args.conceptType, args.conceptId, args.h, args.w);
};

http.createServer(function(request, response){
  console.log(request.url);
  const string1 = request.url
      .split('/')
      .filter(param => param !== 'browse-scaler' && param !== 'browse_images' && param !== '');
  console.log(string1);

  const string2 = string1[1].split("?")
  console.log(string2);

  const string3 = string2[1].split("&")
  console.log(string3);

  const args = {
    conceptType: string1[0],
    conceptId: string2[0],
    h: string3[0].substring(2),
    w: string3[1].substring(2)
  };

  console.log(`Arguments: ${JSON.stringify(args)}`);

  // fs.readFile('/home/george/cmr/browse-scaler/src/ASTGTMV003_N03E021.1.jpg', function (err, content) {
  //   if (err) {
  //       response.writeHead(400, {'Content-type':'text/html'})
  //       console.log(err);
  //       response.end("No such image");    
  //   } else {
  //       //specify the content type in the response will be an image
  //       response.writeHead(200,{'Content-type':'image/jpg'});
  //       response.end(content);
  //   }
  // });

  // fs.readFile('/home/george/cmr/browse-scaler/src/ASTGTMV003_N03E021.1.jpg', function (err, content) {
  //   if (err) {
  //       response.writeHead(400, {'Content-type':'text/html'})
  //       console.log(err);
  //       response.end("No such image");    
  //   } else {
  //       //specify the content type in the response will be an image
  //       response.writeHead(200,{'Content-type':'image/png'});
  //       response.write('<img src="data:image/png;base64,')
  //       response.write(content);
  //       response.end('"/>');
  //   }
  // });

  resizeImageFromConceptId(args.conceptType, args.conceptId, args.h, args.w).then(res => {

    // response.writeHead(200, {'Content-Type': 'text/html'});
    // response.write('<img src="data:image/png;base64,')
    // response.write(res.body);
    // response.end('"/>');

    // response.writeHead(res.statusCode,
    // {
    //   'Content-Type': 'image/png',
    //   "Access-Control-Allow-Origin": "*",
    //   'Content-Length': Buffer.byteLength(res.body),
    //   'X-Content-Type-Options': 'nosniff'
    // }
    // );

    response.writeHead(200,{'Content-type':'image/png'});
    response.end(res.body);
  }).catch(error => {
    response.writeHead(500);
    response.end();
  })

}).listen(8081);

console.log('Server running at http://127.0.0.1:8081/');