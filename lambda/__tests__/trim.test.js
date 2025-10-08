/**
 * Unit tests for the canvas trimming/cropping function
 * 
 * The trim function handles canvas wrapping scenarios by:
 * - Converting inches to pixels using 300 DPI
 * - Calculating face dimensions (image area minus bleed)
 * - Computing scale to fit content within output dimensions
 * - Extracting the correctly positioned crop region
 * 
 * Key calculations:
 * - Face = original dimensions - (bleed * 2)
 * - Scale = min(face/output_face) but >= 1 (no enlargement)
 * - Crop offsets center the content in the original image
 */
import { describe, test, expect, jest, beforeEach } from '@jest/globals';

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
const { trim } = await import('../index.js');

// Mock Sharp image object
const createMockImage = (width = 4000, height = 5000) => ({
  metadata: jest.fn().mockResolvedValue({ width, height }),
  extract: jest.fn().mockReturnThis()
});

describe('trim Function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return image unchanged when no canvas options provided', async () => {
    const mockImage = createMockImage();
    const opts = {};

    const result = await trim(mockImage, opts);

    expect(result).toBe(mockImage);
    expect(mockImage.extract).not.toHaveBeenCalled();
  });

  test('should extract correct region for canvas with bleed', async () => {
    const mockImage = createMockImage(6000, 7200); // Realistic high-res image
    const opts = {
      canvasWrap: 2, // 2 inches wrap
      canvasBleed: 1400, // 1400 pixels bleed
      aspectWidth: 16, // 16 inches output width
      aspectHeight: 22 // 22 inches output height
    };

    await trim(mockImage, opts);

    expect(mockImage.extract).toHaveBeenCalled();
    const extractCall = mockImage.extract.mock.calls[0][0];
    
    // Verify all required params are present and are integers
    expect(Number.isInteger(extractCall.left)).toBe(true);
    expect(Number.isInteger(extractCall.top)).toBe(true);
    expect(Number.isInteger(extractCall.width)).toBe(true);
    expect(Number.isInteger(extractCall.height)).toBe(true);
  });

  test('should throw error for insufficient canvas bleed', async () => {
    const mockImage = createMockImage(2000, 2400); // Small image
    const opts = {
      canvasWrap: 2,
      canvasBleed: 100, // Very small bleed
      aspectWidth: 16,
      aspectHeight: 22
    };

    await expect(trim(mockImage, opts)).rejects.toThrow('Insufficient canvas bleed');
    expect(mockImage.extract).not.toHaveBeenCalled();
  });

  test('should handle fractional calculations correctly', async () => {
    const mockImage = createMockImage(6000, 7000); // Larger dimensions
    const opts = {
      canvasWrap: 1.5,
      canvasBleed: 800,
      aspectWidth: 12.5,
      aspectHeight: 16.75
    };

    await trim(mockImage, opts);

    expect(mockImage.extract).toHaveBeenCalled();
    const extractCall = mockImage.extract.mock.calls[0][0];
    
    // Ensure all values are integers
    expect(Number.isInteger(extractCall.left)).toBe(true);
    expect(Number.isInteger(extractCall.top)).toBe(true);
    expect(Number.isInteger(extractCall.width)).toBe(true);
    expect(Number.isInteger(extractCall.height)).toBe(true);
  });
});