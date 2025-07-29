import {S3Client, PutObjectCommand, GetObjectCommand} from "@aws-sdk/client-s3";
import Sharp from "sharp";

const s3Client = new S3Client();
const BUCKET = process.env.BUCKET;
const URL = process.env.URL;
const CANVAS_DPI = 200; // Default DPI for resizing

const extractParams = (queryString) => {
  let params = {...queryString},
      match,
      prefix,
      aspectWidth,
      aspectHeight,
      canvasBleed,
      originalKey;
  
  // If the key includes a canvas bleed, extract it
  if (match = params.key.match(/^(Posters)\/([\d.]+):([\d.]+)\/canvas\/\+(\d+)\/(.*)$/)) {
    [ prefix, aspectWidth, aspectHeight, canvasBleed, originalKey ] = match.slice(1);

  // Extract aspect ratio and original key
  } else if (match = params.key.match(/^(Posters)\/([\d.]+):([\d.]+)\/(.*)$/)) {
    [ prefix, aspectWidth, aspectHeight, originalKey ] = match.slice(1);

  // Pass through the original key
  } else {
    [ prefix, originalKey ] = params.key.split('/');
  }

  params = { ...params, canvasBleed, originalKey: `${prefix}/${originalKey}` };
  if (aspectWidth && aspectHeight) {
    params = {
      ...params,
      aspectWidth,
      aspectHeight,
      aspectRatio: aspectWidth / aspectHeight,
    };
  }

  return params;
};

const trim = async (image, opts={}) => {
  const { canvasBleed, aspectWidth, aspectHeight } = opts;
  const { width: originalWidth, height: originalHeight} = await image.metadata();

  if (canvasBleed && aspectWidth && aspectHeight) {
    const bleedPercentage = parseInt(canvasBleed) / Math.min(originalWidth, originalHeight);
    const bleedInches = 1.875;
    const targetBleedPercentage = bleedInches / Math.min(aspectWidth, aspectHeight);

    // If the expected bleed percentage is greater than what we have return the original image
    // which will likely result in an error when submitting to Lumaprints
    if (targetBleedPercentage > bleedPercentage) throw new Error('Insufficient canvas bleed');

    const scale = Math.min(
      originalWidth / (parseFloat(aspectWidth) * CANVAS_DPI),
      originalHeight / (parseFloat(aspectHeight) * CANVAS_DPI)
    )

    // Scale all target dimensions back to original image scale
    const scaledFinalWidth = Math.round(aspectWidth * CANVAS_DPI * scale);
    const scaledFinalHeight = Math.round(aspectHeight * CANVAS_DPI * scale);

    // Calculate crop offsets to center the content in the original image
    const leftOffset = Math.max(0, Math.round((originalWidth - scaledFinalWidth) / 2));
    const topOffset = Math.max(0, Math.round((originalHeight - scaledFinalHeight) / 2));

    // If the offsets exceed the canvas bleed, return the original image
    if (Math.max(leftOffset, topOffset) > canvasBleed) return image; 
    
    // Extract the cropped region from the original image
    image.extract({
      left: leftOffset,
      top: topOffset,
      width: scaledFinalWidth,
      height: scaledFinalHeight
    });
  }

  return image;
};

const resize = async (image, opts={}) => {
  const { aspectRatio, canvasBleed, aspectWidth, aspectHeight } = opts;

  // Canvas with bleed, resize to actual output dimensions and return
  if ( canvasBleed ) {
    return image.resize(
      Math.round(aspectWidth * CANVAS_DPI),
      Math.round(aspectHeight * CANVAS_DPI)
    );
  }

  // Continue with aspect ratio resizing
  const { width: originalWidth, height: originalHeight} = await image.metadata();
  const adjustedWidth = Math.round(originalHeight * aspectRatio);
  
  if ( adjustedWidth < originalWidth ) { // Prefer keeping original height
    image.resize(adjustedWidth, originalHeight);
  } else { // Fall back to original width, and use adjusted height
    const adjustedHeight = Math.round(originalWidth / aspectRatio);
    image.resize(originalWidth, adjustedHeight);
  }

  return image;
};

export const handler = async (event, context) => {
  const params = extractParams(event.queryStringParameters || {});
  const { key, originalKey } = params;
  const redirect = {
    statusCode: 301,
    headers: {'Location': `${URL}/${key}`},
    body: '',
  };

  // If no aspect ratio is provided, redirect to the original key as there is no resizing needed
  if( !params.aspectRatio ) return redirect;
  
  const response = await s3Client.send(new GetObjectCommand({Bucket: BUCKET, Key: originalKey}))
    .then(data => data.Body.transformToByteArray())
    .then(buffer => new Sharp(buffer).jpeg({quality: 100}))
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