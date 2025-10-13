/**
 * Integration tests for the serverless poster resizing Lambda handler
 * 
 * These tests verify the complete end-to-end functionality including:
 * - Parameter extraction from URL patterns
 * - Image processing with Sharp
 * - S3 operations (get/put objects)
 * - Canvas wrapping and bleed calculations
 * - Error handling scenarios
 * 
 * The tests use mocked AWS SDK and Sharp dependencies to isolate
 * the Lambda function logic while testing against realistic scenarios.
 */
import { describe, test, expect, jest, beforeEach } from '@jest/globals';

// Mock AWS S3 Client and operations
const mockS3Send = jest.fn();
const mockS3Client = {
  send: mockS3Send
};

// Mock Sharp image processing library with chainable methods
const mockSharpInstance = {
  jpeg: jest.fn(),
  metadata: jest.fn(),
  extract: jest.fn(),
  resize: jest.fn(),
  toBuffer: jest.fn()
};

const mockSharp = jest.fn(() => mockSharpInstance);

// Setup mocks before importing the module under test
jest.unstable_mockModule('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => mockS3Client),
  PutObjectCommand: jest.fn((params) => ({ type: 'PutObjectCommand', params })),
  GetObjectCommand: jest.fn((params) => ({ type: 'GetObjectCommand', params }))
}));

jest.unstable_mockModule('sharp', () => ({
  default: mockSharp
}));

// Set up test environment variables
process.env.BUCKET = 'test-bucket';
process.env.URL = 'http://example.execute-api.region.amazonaws.com';

// Import the actual handler function after mocks are configured
const { handler } = await import('../index.js');

describe('Handler Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset mock chain for Sharp
    mockSharpInstance.jpeg.mockReturnValue(mockSharpInstance);
    mockSharpInstance.extract.mockReturnValue(mockSharpInstance);
    mockSharpInstance.resize.mockReturnValue(mockSharpInstance);
    mockSharpInstance.metadata.mockResolvedValue({ width: 3000, height: 3600 });
    mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('processed-image-data'));
    
    // Mock S3 responses
    mockS3Send.mockImplementation((command) => {
      if (command.type === 'GetObjectCommand') {
        return Promise.resolve({
          Body: {
            transformToByteArray: () => Promise.resolve(Buffer.from('original-image-data'))
          }
        });
      }
      if (command.type === 'PutObjectCommand') {
        return Promise.resolve({ ETag: '"mock-etag"' });
      }
      return Promise.resolve({});
    });
  });

  describe('Redirect scenarios', () => {
    test('should redirect when no aspect ratio in key', async () => {
      const event = {
        queryStringParameters: {
          key: 'Posters/simple-image.jpg'
        }
      };

      const result = await handler(event, {});

      expect(result).toEqual({
        statusCode: 301,
        headers: { 'Location': 'http://example.execute-api.region.amazonaws.com/Posters/simple-image.jpg' },
        body: 'Redirecting to http://example.execute-api.region.amazonaws.com/Posters/simple-image.jpg'
      });
      expect(mockS3Send).not.toHaveBeenCalled();
    });
  });

  describe('Image processing scenarios', () => {
    test('should process image with aspect ratio successfully', async () => {
      const event = {
        queryStringParameters: {
          key: 'Posters/4:5/wedding-poster.jpg'
        }
      };

      const result = await handler(event, {});

      // Verify S3 interactions - Get original, Put processed
      expect(mockS3Send).toHaveBeenCalledTimes(2);
      
      const getCall = mockS3Send.mock.calls[0][0];
      expect(getCall.type).toBe('GetObjectCommand');
      expect(getCall.params.Bucket).toBe('test-bucket');
      expect(getCall.params.Key).toBe('Posters/wedding-poster.jpg');

      const putCall = mockS3Send.mock.calls[1][0];
      expect(putCall.type).toBe('PutObjectCommand');
      expect(putCall.params.Bucket).toBe('test-bucket');
      expect(putCall.params.Key).toBe('Posters/4:5/wedding-poster.jpg');
      expect(putCall.params.ContentType).toBe('image/jpeg');

      // Verify Sharp operations
      expect(mockSharp).toHaveBeenCalledWith(Buffer.from('original-image-data'));
      expect(mockSharpInstance.jpeg).toHaveBeenCalledWith({ quality: 100 });
      expect(mockSharpInstance.resize).toHaveBeenCalled();
      expect(mockSharpInstance.toBuffer).toHaveBeenCalled();

      // Check final response
      expect(result).toEqual({
        statusCode: 301,
        headers: { 'Location': 'http://example.execute-api.region.amazonaws.com/Posters/4:5/wedding-poster.jpg' },
        body: 'Redirecting to http://example.execute-api.region.amazonaws.com/Posters/4:5/wedding-poster.jpg'
      });
    });

    test('should process canvas image with bleed successfully', async () => {
      // Use larger image dimensions to avoid bleed issues
      mockSharpInstance.metadata.mockResolvedValue({ width: 6000, height: 7200 });
      
      const event = {
        queryStringParameters: {
          key: 'Posters/12:18/canvas/1.5/1400px/canvas-poster.jpg'
        }
      };

      const result = await handler(event, {});

      // Verify complete S3 flow: Get original, Put processed
      const calls = mockS3Send.mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[0][0].type).toBe('GetObjectCommand');
      expect(calls[1][0].type).toBe('PutObjectCommand');
      
      // Verify both trim (extract) and resize were called
      expect(mockSharpInstance.extract).toHaveBeenCalled();
      expect(mockSharpInstance.resize).toHaveBeenCalled();

      expect(result.statusCode).toBe(301);
    });

    test('should handle complex filename with special characters', async () => {
      const event = {
        queryStringParameters: {
          key: 'Posters/2:3/My Poster - Design (Final v2).jpg'
        }
      };

      const result = await handler(event, {});

      // Verify complete S3 flow: Get original, Put processed
      const calls = mockS3Send.mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[0][0].type).toBe('GetObjectCommand');
      expect(calls[1][0].type).toBe('PutObjectCommand');
      
      expect(result.statusCode).toBe(301);
    });
  });

  describe('Error handling', () => {
    test('should handle S3 GetObject errors', async () => {
      mockS3Send.mockImplementation((command) => {
        if (command.type === 'GetObjectCommand') {
          return Promise.reject(new Error('Object not found'));
        }
        return Promise.resolve({});
      });

      const event = {
        queryStringParameters: {
          key: 'Posters/2:3/missing-image.jpg'
        }
      };

      const result = await handler(event, {});

      expect(result).toEqual({
        statusCode: 500,
        headers: {},
        body: 'Object not found'
      });
    });

    test('should handle S3 PutObject errors', async () => {
      mockS3Send.mockImplementation((command) => {
        if (command.type === 'GetObjectCommand') {
          return Promise.resolve({
            Body: {
              transformToByteArray: () => Promise.resolve(Buffer.from('data'))
            }
          });
        }
        if (command.type === 'PutObjectCommand') {
          return Promise.reject(new Error('Upload failed'));
        }
        return Promise.resolve({});
      });

      const event = {
        queryStringParameters: {
          key: 'Posters/2:3/test.jpg'
        }
      };

      const result = await handler(event, {});

      expect(result).toEqual({
        statusCode: 500,
        headers: {},
        body: 'Upload failed'
      });
    });

    test('should handle Sharp processing errors', async () => {
      mockSharpInstance.toBuffer.mockRejectedValue(new Error('Image processing failed'));

      const event = {
        queryStringParameters: {
          key: 'Posters/2:3/corrupt-image.jpg'
        }
      };

      const result = await handler(event, {});

      expect(result).toEqual({
        statusCode: 500,
        headers: {},
        body: 'Image processing failed'
      });
    });

    test('should handle insufficient canvas bleed error', async () => {
      mockSharpInstance.extract.mockImplementation(() => {
        throw new Error('Insufficient canvas bleed');
      });

      const event = {
        queryStringParameters: {
          key: 'Posters/12:18/canvas/1.5/50px/small-bleed.jpg'
        }
      };

      const result = await handler(event, {});

      expect(result).toEqual({
        statusCode: 500,
        headers: {},
        body: 'Insufficient canvas bleed'
      });
    });

    test('should handle malformed image data', async () => {
      mockS3Send.mockImplementation((command) => {
        if (command.type === 'GetObjectCommand') {
          return Promise.resolve({
            Body: {
              transformToByteArray: () => Promise.reject(new Error('Invalid image data'))
            }
          });
        }
        return Promise.resolve({});
      });

      const event = {
        queryStringParameters: {
          key: 'Posters/2:3/invalid.jpg'
        }
      };

      const result = await handler(event, {});

      expect(result).toEqual({
        statusCode: 500,
        headers: {},
        body: 'Invalid image data'
      });
    });
  });

  describe('Environment configuration', () => {
    test('should use environment variables from setup', async () => {
      const event = {
        queryStringParameters: {
          key: 'Posters/2:3/env-test.jpg'
        }
      };

      await handler(event, {});

      const getCall = mockS3Send.mock.calls[0][0];
      expect(getCall.params.Bucket).toBe('test-bucket'); // From our beforeEach setup

      const result = await handler(event, {});
      expect(result.headers.Location).toContain('http://example.execute-api.region.amazonaws.com');
    });
  });
});