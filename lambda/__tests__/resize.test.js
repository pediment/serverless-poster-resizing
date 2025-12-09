/**
 * Unit tests for the image resizing function
 * 
 * The resize function handles two scenarios:
 * 1. Canvas with bleed: Resize to exact dimensions (aspectWidth/Height * 300 DPI)
 * 2. Aspect ratio only: Maintain aspect ratio, prefer original height when possible
 * 
 * Aspect ratio logic:
 * - Calculate adjustedWidth = originalHeight * aspectRatio
 * - If adjustedWidth <= originalWidth: keep original height, use adjustedWidth
 * - Otherwise: keep original width, calculate adjustedHeight = originalWidth / aspectRatio
 * 
 * All resizing uses withoutEnlargement: true to prevent upscaling
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
const { resize } = await import('../index.js');

// Mock Sharp image object
const createMockImage = (width = 1000, height = 1200) => ({
  metadata: jest.fn().mockResolvedValue({ width, height }),
  resize: jest.fn().mockReturnThis()
});

describe('resize Function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should resize for canvas with bleed to exact dimensions', async () => {
    const mockImage = createMockImage(4000, 5000);
    const opts = {
      aspectWidth: 16,
      aspectHeight: 22,
      canvasBleed: 1400 // Indicates canvas mode
    };

    await resize(mockImage, opts);

    expect(mockImage.resize).toHaveBeenCalledWith({
      width: 3200, // 16 * 200 DPI
      height: 4400, // 22 * 200 DPI
      withoutEnlargement: true
    });
  });

  test('should resize maintaining aspect ratio - prefer original height', async () => {
    const mockImage = createMockImage(1000, 1200);
    const opts = {
      aspectRatio: 0.75 // 3:4 aspect ratio
    };

    await resize(mockImage, opts);

    // adjustedWidth = 1200 * 0.75 = 900, which is < 1000
    // So prefer keeping original height
    expect(mockImage.resize).toHaveBeenCalledWith({
      width: 900,  // 1200 * 0.75
      height: 1200, // original height
      withoutEnlargement: true
    });
  });

  test('should resize maintaining aspect ratio - fall back to original width', async () => {
    const mockImage = createMockImage(1000, 800);
    const opts = {
      aspectRatio: 1.5 // 3:2 aspect ratio (wider)
    };

    await resize(mockImage, opts);

    // adjustedWidth = 800 * 1.5 = 1200, which is > 1000
    // So fall back to original width and adjust height
    expect(mockImage.resize).toHaveBeenCalledWith({
      width: 1000, // original width
      height: 667, // Math.round(1000 / 1.5)
      withoutEnlargement: true
    });
  });

  test('should handle exact aspect ratio match', async () => {
    const mockImage = createMockImage(1500, 1000);
    const opts = {
      aspectRatio: 1.5 // Exact match
    };

    await resize(mockImage, opts);

    // adjustedWidth = 1000 * 1.5 = 1500, which equals original width
    // Should prefer keeping original height
    expect(mockImage.resize).toHaveBeenCalledWith({
      width: 1500,
      height: 1000,
      withoutEnlargement: true
    });
  });

  test('should handle canvas bleed with fractional dimensions', async () => {
    const mockImage = createMockImage(3000, 3600);
    const opts = {
      aspectWidth: 12.5,
      aspectHeight: 16.75,
      canvasBleed: 300
    };

    await resize(mockImage, opts);

    expect(mockImage.resize).toHaveBeenCalledWith({
      width: 2500, // Math.round(12.5 * 200)
      height: 3350, // Math.round(16.75 * 200)
      withoutEnlargement: true
    });
  });
});