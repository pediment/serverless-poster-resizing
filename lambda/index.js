import {S3Client, PutObjectCommand, GetObjectCommand} from "@aws-sdk/client-s3";
import Sharp from "sharp";

const s3Client = new S3Client();
const BUCKET = process.env.BUCKET;
const URL = process.env.URL;

export const handler = async (event, context) => {
  const key = event.queryStringParameters.key;
  const match = key.match(/^Posters\/([\d.]+):([\d.]+)\/(.*)$/);
  const aspectWidth = parseFloat(match[1]);
  const aspectHeight = parseFloat(match[2]);
  const aspect = aspectWidth / aspectHeight;
  const originalKey = `Posters/${match[3]}`;

  const response = await s3Client.send(new GetObjectCommand({Bucket: BUCKET, Key: originalKey}))
    .then(data => data.Body.transformToByteArray())
    .then(async data => {
      const image = new Sharp(data)
        .jpeg({quality: 100});
      const { width: originalWidth, height: originalHeight} = await image.metadata();
      const adjustedWidth = Math.round(originalHeight * aspect);
      
      if(adjustedWidth < originalWidth) { // Prefer keeping original height
        image.resize(adjustedWidth, originalHeight);
      } else { // Fall back to original width, and use adjusted height
        const adjustedHeight = Math.round(originalWidth / aspect);
        image.resize(originalWidth, adjustedHeight);
      }
        
      return image.toBuffer();
    })
    .then(buffer => s3Client.send(new PutObjectCommand({
        Body: buffer,
        Bucket: BUCKET,
        ContentType: 'image/jpeg',
        Key: key,
      }))
    )
    .then((resp) => {
      return {
        statusCode: 301,
        headers: {'Location': `${URL}/${key}`},
        body: '',
      };
    })
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