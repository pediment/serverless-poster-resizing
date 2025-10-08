# Serverless Poster Resizing

## Description

Resizes poster images on the fly using Amazon S3, AWS Lambda, and Amazon API Gateway.
This fork extends the original serverless image resizing function to support:

- **Aspect ratio-based resizing** - Resize images to specific aspect ratios (e.g., 12:18)
- **Canvas wrapping** - Support for gallery wrap canvas prints with configurable wrap sizes (0.75", 1.25", 1.5")
- **Canvas bleed handling** - Automatically crops images to account for canvas bleed in print production
- **Smart cropping** - Intelligently centers and crops images while maintaining aspect ratios

Using a conventional URL structure, requests for resized images trigger a Lambda
function via API Gateway which will resize the image, upload it to S3, and
redirect the requestor to the resized image. Subsequent requests for the resized
image are served from S3 directly.

## URL Format

The function supports multiple URL formats:

1. **Simple aspect ratio resize:**
   ```
   /Posters/2:3/OriginalImageName.jpg
   ```
   Resizes to 2:3 aspect ratio (use simplified ratios, e.g., 2:3 instead of 12:18)

2. **Canvas wrap with bleed:**
   ```
   /Posters/12:18/canvas/1.5/+1400/OriginalImageName.jpg
   ```
   - `12:18` - Final canvas dimensions in inches (not simplified - represents actual canvas size)
   - `1.5` - Canvas wrap size in inches (0.75, 1.25, or 1.5)
   - `+1400` - Bleed in pixels (e.g., 1400 pixels of bleed around the image)

3. **Original image (no resize):**
   ```
   /Posters/OriginalImageName.jpg
   ```
   Returns original image without modification

## Usage

1. Build the Lambda function

   The Lambda function uses [sharp][sharp] for image resizing which requires
   native extensions. In order to run on Lambda, it must be packaged on Amazon
   Linux with the correct architecture (ARM64).

   This repo includes a Dockerfile and Makefile that will build the function using
   Docker with Amazon Linux 2023 and Node.js 22.x for ARM64 architecture.
     
   **To build the distribution package:**
   ```bash
   make dist
   ```
     
   This will create `dist/function.zip` ready for deployment.

   **Development workflow:**
   
   - For local development and testing: `npm install` (installs all dependencies including dev tools)
   - To run tests: `npm test`
   - To build production package: `make dist` (installs only production dependencies)
   - After building, if you want to run tests again: `npm install` (to restore dev dependencies)
   - To clean up: `make clean` (removes node_modules and Docker image)

2. Deploy to AWS Lambda

   You can deploy using AWS SAM or manually upload the `dist/function.zip` to your Lambda function.

   **For local testing with SAM:**
   ```bash
   sam local start-lambda --template-file resize.yaml
   ```

   **Environment variables required:**
   - `BUCKET` - S3 bucket name where images are stored
   - `URL` - Base URL for the S3 bucket website

3. Test the function

   Upload an image to the S3 bucket (in the `Posters/` prefix) and try to resize it:

   **Examples:**
   - 2:3 aspect ratio: `http://[BucketWebsiteHost]/Posters/2:3/myimage.jpg`
   - With 1.5" canvas wrap and 1400px bleed (12"x18" canvas): `http://[BucketWebsiteHost]/Posters/12:18/canvas/1.5/+1400/myimage.jpg`
   - Original image: `http://[BucketWebsiteHost]/Posters/myimage.jpg`

## Technical Details

- **Runtime:** Node.js 22.x
- **Architecture:** ARM64
- **Image DPI:** 300 DPI for canvas calculations
- **Image Format:** Output as JPEG with 100% quality
- **Scaling:** Never enlarges images, only scales down or maintains original size

## License

This reference architecture sample is [licensed][license] under Apache 2.0.

[license]: LICENSE
[sharp]: https://github.com/lovell/sharp
