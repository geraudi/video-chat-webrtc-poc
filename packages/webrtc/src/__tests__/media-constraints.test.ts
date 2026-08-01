import { describe, expect, it } from 'vitest';
import {
  defaultMediaConstraints,
  type MediaConstraints
} from '../media-constraints';

describe('defaultMediaConstraints', () => {
  it('requests audio', () => {
    expect(defaultMediaConstraints.audio).toBe(true);
  });

  it('uses width/height with ideal and max instead of a fixed 4:3 aspect ratio', () => {
    expect(defaultMediaConstraints.video.width).toEqual({
      ideal: 1280,
      max: 1920
    });
    expect(defaultMediaConstraints.video.height).toEqual({
      ideal: 720,
      max: 1080
    });
    expect(defaultMediaConstraints.video.aspectRatio).toBeUndefined();
  });
});

describe('MediaConstraints configurability', () => {
  it('supports custom constraints for portrait phone cameras', () => {
    const constraints: MediaConstraints = {
      audio: true,
      video: {
        width: { ideal: 1080, max: 1080 },
        height: { ideal: 1920, max: 1920 },
        facingMode: 'environment',
        frameRate: { ideal: 30, max: 60 }
      }
    };

    const width = constraints.video.width;
    const height = constraints.video.height;
    const frameRate = constraints.video.frameRate;

    expect(width).toBeDefined();
    expect(height).toBeDefined();
    expect(frameRate).toBeDefined();

    if (width !== undefined && typeof width !== 'number') {
      expect(width.max).toBe(1080);
    }
    if (height !== undefined && typeof height !== 'number') {
      expect(height.ideal).toBe(1920);
    }
    expect(constraints.video.facingMode).toBe('environment');
    if (frameRate !== undefined && typeof frameRate !== 'number') {
      expect(frameRate.max).toBe(60);
    }
  });

  it('is structurally compatible with getUserMedia MediaStreamConstraints', () => {
    const constraints: MediaConstraints = defaultMediaConstraints;
    const asStreamConstraints: MediaStreamConstraints = {
      audio: constraints.audio,
      video: constraints.video
    };
    expect(asStreamConstraints.video).toEqual(constraints.video);
  });
});
