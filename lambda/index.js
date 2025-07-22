import {S3Client, PutObjectCommand, GetObjectCommand} from "@aws-sdk/client-s3";
import Sharp from "sharp";

const s3Client = new S3Client();
const BUCKET = process.env.BUCKET;
const URL = process.env.URL;

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
      aspectRatio: aspectWidth / aspectHeight
    };
  }

  return params;
};

const resize = async (data, opts={}) => {
  const { aspectRatio } = opts;
  const image = new Sharp(data).jpeg({quality: 100});
  const { width: originalWidth, height: originalHeight} = await image.metadata();
  const adjustedWidth = Math.round(originalHeight * aspectRatio);
  
  if ( adjustedWidth < originalWidth ) { // Prefer keeping original height
    image.resize(adjustedWidth, originalHeight);
  } else { // Fall back to original width, and use adjusted height
    const adjustedHeight = Math.round(originalWidth / aspectRatio);
    image.resize(originalWidth, adjustedHeight);
  }
    
  return image.toBuffer();
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
    .then(data => resize(data, params))
    .then(buffer => s3Client.send(new PutObjectCommand({
        Body: buffer,
        Bucket: BUCKET,
        ContentType: 'image/jpeg',
        Key: key,
      }))
    )
    .then((resp) => redirect)
    .catch(err => {
      console.error(err);
      return {
        statusCode: 500,
        headers: {},
        body: err,
      };
    });

  return response;
};