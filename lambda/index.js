import {S3Client, PutObjectCommand, GetObjectCommand} from "@aws-sdk/client-s3";
import Sharp from "sharp";

const s3Client = new S3Client();
const BUCKET = process.env.BUCKET;
const URL = process.env.URL;
const CANVAS_DPI = 300; // DPI for resizing

export const extractParams = (queryString) => {
  let params = {...queryString},
      match,
      prefix,
      aspectWidth,
      aspectHeight,
      canvasSize,
      canvasWrap,
      canvasBleed,
      originalKey;

  // If the key includes canvas size and bleed info, extract it
  // Example format: Posters/12:18/canvas/1.5/+1400/OriginalKey.jpg
  if (match = params.key.match(/^(Posters)\/(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)\/canvas\/(\d+(?:\.\d+)?)\/\+(\d+)\/(.*)$/)) {
    [ prefix, aspectWidth, aspectHeight, canvasSize, canvasBleed, originalKey ] = match.slice(1);
    switch(canvasSize) {
      case '0.75': canvasWrap = 1; break;
      case '1.25': canvasWrap = 1.875; break;
      case '1.5': canvasWrap = 2; break;
      default: canvasWrap = 0; break;
    }
    aspectWidth = parseFloat(aspectWidth) + (canvasWrap * 2);
    aspectHeight = parseFloat(aspectHeight) + (canvasWrap * 2);

  // Extract aspect ratio and original key
  // Example format: Posters/12:18/OriginalKey.jpg
  } else if (match = params.key.match(/^(Posters)\/(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)\/(.*)$/)) {
    [ prefix, aspectWidth, aspectHeight, originalKey ] = match.slice(1);

  // Pass through the original key
  // Example format: Posters/OriginalKey.jpg
  } else {
    [ prefix, originalKey ] = params.key.split('/');
  }

  params = { ...params, canvasWrap, canvasBleed, originalKey: `${prefix}/${originalKey}` };
  if (aspectWidth && aspectHeight) {
    params = {
      ...params,
      aspectWidth,
      aspectHeight,
      aspectRatio: aspectWidth / aspectHeight,
    };
  }

  // Log extracted parameters
  console.debug(` Extracted parameters: ${JSON.stringify(params)}`);

  return params;
};

export const trim = async (image, opts={}) => {
  let  { canvasWrap, canvasBleed, aspectWidth: outputWidth, aspectHeight: outputHeight } = opts;
  const { width: originalWidth, height: originalHeight} = await image.metadata();

  if (canvasWrap && canvasBleed && outputWidth && outputHeight) {
    // Convert inches to pixels
    outputWidth = outputWidth * CANVAS_DPI;
    outputHeight = outputHeight * CANVAS_DPI;
    canvasWrap = canvasWrap * CANVAS_DPI;

    // Calculate face dimensions
    const faceWidth = originalWidth - ( canvasBleed * 2 );
    const faceHeight = originalHeight - ( canvasBleed * 2 );
    const outputFaceWidth = outputWidth - ( canvasWrap * 2 );
    const outputFaceHeight = outputHeight - ( canvasWrap * 2 );

    // Calculate scale
    const scale = Math.max(Math.min(
      faceWidth / outputFaceWidth,
      faceHeight / outputFaceHeight
    ), 1);

    // Scale all target dimensions back to original image scale
    const scaledWidth = Math.round(outputWidth * scale);
    const scaledHeight = Math.round(outputHeight * scale);

    // Calculate crop offsets to center the content in the original image
    const leftOffset = Math.round((originalWidth - scaledWidth) / 2);
    const topOffset = Math.round((originalHeight - scaledHeight) / 2)

    // Throw an error if the bleed is insufficient
    if(Math.min(leftOffset, topOffset) <= 0) throw new Error('Insufficient canvas bleed');

    // Extract the cropped region from the original image
    const params = {
      left: leftOffset,
      top: topOffset,
      width: scaledWidth,
      height: scaledHeight
    };
    console.debug(` Extraction parameters: ${JSON.stringify(params)}`);
    image.extract(params);
  }

  return image;
};

export const resize = async (image, opts={}) => {
  const { aspectRatio, canvasBleed, aspectWidth, aspectHeight } = opts;
  let outputWidth, outputHeight;

  // Canvas with bleed, resize to actual output dimensions and return
  if ( canvasBleed ) {
    outputWidth = Math.round(aspectWidth * CANVAS_DPI);
    outputHeight = Math.round(aspectHeight * CANVAS_DPI);

  // Continue with aspect ratio resizing
  } else {
    const { width: originalWidth, height: originalHeight} = await image.metadata();
    const adjustedWidth = Math.round(originalHeight * aspectRatio);

    if ( adjustedWidth < originalWidth ) { // Prefer keeping original height
      outputWidth = adjustedWidth;
      outputHeight = originalHeight;
    } else { // Fall back to original width, and use adjusted height
      outputWidth = originalWidth;
      outputHeight = Math.round(originalWidth / aspectRatio);
    }
  }

  // Resize the image to output dimensions, but prevent enlargement
  const params = {
    width: outputWidth,
    height: outputHeight,
    withoutEnlargement: true
  };
  console.debug(` Resizing parameters: ${JSON.stringify(params)}`);
  image.resize(params);

  return image;
};

export const handler = async (event, context) => {
  const params = extractParams(event.queryStringParameters || {});
  const { key, originalKey } = params;
  const redirect = {
    statusCode: 301,
    headers: {'Location': `${URL}/${key}`},
    body: `Redirecting to ${URL}/${key}`,
  };

  // If no aspect ratio is provided, redirect to the original key as there is no resizing needed
  if( !params.aspectRatio ) return redirect;

  console.debug(` Processing '${params.key}'...`);

  const response = await s3Client.send(new GetObjectCommand({Bucket: BUCKET, Key: originalKey}))
    .then(data => data.Body.transformToByteArray())
    .then(buffer => Sharp(buffer).jpeg({quality: 100}))
    .then(image => trim(image, params))
    .then(image => resize(image, params))
    .then(image => image.toBuffer())
    .then(buffer => s3Client.send(new PutObjectCommand({
        Body: buffer,
        Bucket: BUCKET,
        ContentType: 'image/jpeg',
        Key: key,
      }))
    )
    .then(resp => redirect)
    .catch(err => {
      return {
        statusCode: 500,
        headers: {},
        body: err.message,
      };
    });

  return response;
};