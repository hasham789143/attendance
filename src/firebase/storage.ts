
'use client';
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";
import { initializeFirebase } from ".";

// Do not initialize here directly. Defer it.
let storage: ReturnType<typeof getStorage>;

function getStorageInstance() {
  if (!storage) {
    storage = initializeFirebase().storage;
  }
  return storage;
}

/**
 * Converts a data URL to a Blob object.
 * @param dataUrl The data URL to convert.
 * @returns A Blob object.
 */
function dataURLtoBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(',');
  if (arr.length < 2) {
    throw new Error('Invalid data URL');
  }
  const mimeMatch = arr[0].match(/:(.*?);/);
  if (!mimeMatch || mimeMatch.length < 2) {
    throw new Error('Could not determine MIME type from data URL');
  }
  const mime = mimeMatch[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Uploads an image from a data URL to Firebase Storage and returns the download URL.
 * @param dataUrl The base64 data URL of the image.
 * @param userId The UID of the user uploading the image.
 * @returns A promise that resolves with the public download URL of the uploaded image.
 */
export async function uploadImageAndGetURL(dataUrl: string, userId: string): Promise<string> {
  try {
    const storageInstance = getStorageInstance();
    const timestamp = new Date().getTime();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const fileName = `${timestamp}-${randomSuffix}.jpg`;
    const storageRef = ref(storageInstance, `selfies/${userId}/${fileName}`);

    // Firebase's uploadString automatically handles base64 data URLs
    const snapshot = await uploadString(storageRef, dataUrl, 'data_url');
    
    const downloadURL = await getDownloadURL(snapshot.ref);
    
    return downloadURL;
  } catch (error) {
    console.error("Error uploading image to Firebase Storage:", error);
    throw new Error("Could not upload image. Please try again.");
  }
}
