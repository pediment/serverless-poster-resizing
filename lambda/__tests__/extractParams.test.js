/**
 * Unit tests for the URL parameter extraction function
 * 
 * The extractParams function parses different URL patterns to extract:
 * - Basic aspect ratios (GCD form): "Posters/2:3/image.jpg"
 * - Canvas with bleed (actual inches): "Posters/12:18/canvas/1.5/+1400/image.jpg"
 * - Pass-through: "Posters/image.jpg" (no processing)
 * 
 * Canvas size mappings:
 * - 0.75 → 1 inch wrap
 * - 1.25 → 1.875 inch wrap  
 * - 1.5 → 2 inch wrap
 * - Other → 0 (no wrap)
 */
import { describe, test, expect, jest } from '@jest/globals';

// Mock dependencies before importing the module
jest.unstable_mockModule('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn()
}));

jest.unstable_mockModule('sharp', () => ({
  default: jest.fn()
}));

// Import the actual function from the module after mocking
const { extractParams } = await import('../index.js');

describe('extractParams Function', () => {
  test('should extract canvas parameters with bleed information', () => {
    const queryString = {
      key: 'Posters/12:18/canvas/1.5/+1400/OriginalImage.jpg'
    };

    const result = extractParams(queryString);

    expect(result).toEqual({
      key: 'Posters/12:18/canvas/1.5/+1400/OriginalImage.jpg',
      canvasWrap: 2, // 1.5 maps to 2
      canvasBleed: '1400',
      originalKey: 'Posters/OriginalImage.jpg',
      aspectWidth: 16, // 12 + (2 * 2)
      aspectHeight: 22, // 18 + (2 * 2) 
      aspectRatio: 16/22
    });
  });

  test('should handle different canvas sizes correctly', () => {
    const testCases = [
      { size: '0.75', expectedWrap: 1 },
      { size: '1.25', expectedWrap: 1.875 },
      { size: '1.5', expectedWrap: 2 },
      { size: '2.0', expectedWrap: 0 } // default case
    ];

    testCases.forEach(({ size, expectedWrap }) => {
      const queryString = {
        key: `Posters/12:18/canvas/${size}/+1400/test.jpg`
      };

      const result = extractParams(queryString);
      expect(result.canvasWrap).toBe(expectedWrap);
    });
  });

  test('should extract aspect ratio without canvas information', () => {
    const queryString = {
      key: 'Posters/4:5/TestImage.jpg'
    };

    const result = extractParams(queryString);

    expect(result).toEqual({
      key: 'Posters/4:5/TestImage.jpg',
      canvasWrap: undefined,
      canvasBleed: undefined,
      originalKey: 'Posters/TestImage.jpg',
      aspectWidth: '4',
      aspectHeight: '5',
      aspectRatio: 4/5
    });
  });

  test('should handle decimal aspect ratios', () => {
    const queryString = {
      key: 'Posters/12.5:18.75/TestImage.jpg'
    };

    const result = extractParams(queryString);

    expect(result).toEqual({
      key: 'Posters/12.5:18.75/TestImage.jpg',
      canvasWrap: undefined,
      canvasBleed: undefined,
      originalKey: 'Posters/TestImage.jpg',
      aspectWidth: '12.5',
      aspectHeight: '18.75',
      aspectRatio: 12.5/18.75
    });
  });

  test('should pass through original key without aspect ratio', () => {
    const queryString = {
      key: 'Posters/OriginalImage.jpg'
    };

    const result = extractParams(queryString);

    expect(result).toEqual({
      key: 'Posters/OriginalImage.jpg',
      canvasWrap: undefined,
      canvasBleed: undefined,
      originalKey: 'Posters/OriginalImage.jpg'
    });
  });

  test('should handle complex filenames with special characters', () => {
    const queryString = {
      key: 'Posters/2:3/My-Test_Image (1).jpg'
    };

    const result = extractParams(queryString);

    expect(result.originalKey).toBe('Posters/My-Test_Image (1).jpg');
    expect(result.aspectWidth).toBe('2');
    expect(result.aspectHeight).toBe('3');
  });

  test('should preserve additional query parameters', () => {
    const queryString = {
      key: 'Posters/2:3/test.jpg',
      version: '1.0',
      timestamp: '12345'
    };

    const result = extractParams(queryString);

    expect(result.version).toBe('1.0');
    expect(result.timestamp).toBe('12345');
    expect(result.originalKey).toBe('Posters/test.jpg');
  });
});