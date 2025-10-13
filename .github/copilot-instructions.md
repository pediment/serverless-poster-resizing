# Copilot Instructions - Serverless Poster Resizing

## Project Overview

This is a serverless image resizing service for poster and canvas print production using AWS Lambda, S3, and API Gateway. The service specializes in aspect ratio-based resizing with canvas wrapping and bleed handling for print production.

## Architecture Pattern

**URL-driven processing**: The Lambda function extracts processing parameters directly from S3 object keys via API Gateway redirects:
- `Posters/2:3/image.jpg` → aspect ratio resize
- `Posters/12:18/canvas/1.5/1400px/image.jpg` → canvas with wrap and bleed
- `Posters/image.jpg` → passthrough to original

**Core processing pipeline** (`lambda/index.js`):
1. `extractParams()` - Parse URL patterns into processing parameters
2. `trim()` - Handle canvas bleed cropping with DPI calculations
3. `resize()` - Apply aspect ratio or canvas sizing with Sharp
4. S3 put → redirect to processed image

## Key Patterns & Conventions

### URL Parameter Extraction
The service uses regex patterns to parse complex URLs:
```javascript
// Canvas with bleed: Posters/12:18/canvas/1.5/1400px/image.jpg
/^(Posters)\/(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)\/canvas\/(\d+(?:\.\d+)?)\/(\d+)px\/(.*)$/
```

### Canvas Math (300 DPI Standard)
- Canvas wrap sizes map to pixel multipliers: `0.75"→1px`, `1.25"→1.875px`, `1.5"→2px`
- All dimensions converted to pixels: `inches * 300 DPI`
- Bleed calculations preserve face content while allowing wrap extension

### Build System
- **Production**: `make dist` uses SAM + Docker for ARM64 Lambda packaging
- **Development**: `npm install` for local testing with full dev dependencies
- **Deploy**: `./bin/deploy` builds and uploads to `$LATEST` version

### Testing Strategy
Tests mock AWS SDK and Sharp to focus on business logic:
- Parameter extraction from URL patterns
- Canvas math calculations and edge cases
- Integration scenarios with realistic event payloads

## Critical Files

- `lambda/index.js` - Main handler with three exported functions
- `lambda/__tests__/*.test.js` - Comprehensive test suite with mocking patterns
- `events/*.json` - Test event payloads for different URL patterns
- `resize.yaml` - SAM template with ARM64 runtime configuration
- `Makefile` - Docker-based build for Lambda native dependencies

## Development Workflow

1. **Local testing**: Use `npm test` with Jest and mocked dependencies
2. **Build for Lambda**: Run `make dist` to create ARM64-compatible Sharp binaries
3. **Deploy updates**: Use `./bin/deploy` script (builds + uploads)
4. **Test endpoints**: Use event JSON files in `events/` directory
5. **Live testing**: Use `https://ltgchi86r4.execute-api.us-east-1.amazonaws.com` as the host for testing deployed functions

## Environment Requirements

- **Runtime**: Node.js 22.x with ES modules (`"type": "module"`)
- **Architecture**: ARM64 for Lambda deployment
- **Dependencies**: Sharp requires native compilation via Docker
- **AWS Resources**: S3 bucket with website hosting + Lambda function + API Gateway

## Common Operations

- **Add new canvas size**: Update `extractParams()` switch statement and test cases
- **Modify DPI**: Change `CANVAS_DPI` constant (impacts all canvas calculations)
- **Debug processing**: Check CloudWatch logs for parameter extraction and Sharp operations
- **Test locally**: Use SAM local with `sam local invoke --template-file resize.yaml`