export interface MediaConstraints {
  audio: boolean;
  video: MediaTrackConstraints;
}

export const defaultMediaConstraints: MediaConstraints = {
  audio: true,
  video: {
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 }
  }
};

export enum GetUserMediaErrorType {
  NotFound = 'NotFoundError',
  Security = 'SecurityError',
  PermissionDenied = 'PermissionDeniedError',
  Unknown = 'UnknownError'
}

export interface GetUserMediaError extends Error {
  type: GetUserMediaErrorType;
  originalError: Error;
}

export function mapGetUserMediaError(error: Error): GetUserMediaError {
  const typedError = error as GetUserMediaError;
  typedError.originalError = error;

  switch (error.name) {
    case 'NotFoundError':
      typedError.type = GetUserMediaErrorType.NotFound;
      typedError.message = 'No camera and/or microphone found.';
      break;
    case 'SecurityError':
    case 'PermissionDeniedError':
      typedError.type = GetUserMediaErrorType.PermissionDenied;
      typedError.message = 'Permission denied to access camera/microphone.';
      break;
    default:
      typedError.type = GetUserMediaErrorType.Unknown;
      typedError.message = `Error opening camera/microphone: ${error.message}`;
      break;
  }

  return typedError;
}
