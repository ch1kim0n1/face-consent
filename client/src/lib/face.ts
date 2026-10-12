import * as faceapi from "@vladmandic/face-api";

const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model";

let modelsReady: Promise<void> | null = null;

export function loadFaceModels() {
  if (!modelsReady) {
    modelsReady = (async () => {
      await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
      await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    })();
  }
  return modelsReady;
}

export async function descriptorFromImageSource(
  source: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
) {
  await loadFaceModels();
  const detections = await faceapi
    .detectAllFaces(source)
    .withFaceLandmarks()
    .withFaceDescriptors();
  if (detections.length !== 1) {
    return { error: "Use a single clear face in the photo." as const };
  }
  return { descriptor: Array.from(detections[0].descriptor) as number[] };
}

export async function descriptorFromVideoFrame(video: HTMLVideoElement) {
  await loadFaceModels();
  const detection = await faceapi
    .detectSingleFace(video)
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!detection) return null;
  return Array.from(detection.descriptor) as number[];
}
