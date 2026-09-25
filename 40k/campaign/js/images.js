/** Resize photographs before they leave the device. EXIF metadata is discarded. */
export async function compressImage(
  file,
  { maxEdge = 2000, quality = 0.84 } = {},
) {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error(
      "Choose a JPEG, PNG or WebP photograph. Export HEIC images as JPEG first.",
    );
  }
  if (file.size > 30 * 1024 * 1024)
    throw new Error(
      "This photograph exceeds 30 MB. Please choose a smaller image.",
    );
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => {
      throw new Error(
        "This photograph could not be decoded. Try exporting it as JPEG.",
      );
    });
    if (!img.naturalWidth || !img.naturalHeight)
      throw new Error("This photograph has no readable image dimensions.");
    const scale = Math.min(
      1,
      maxEdge / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Your browser could not prepare this photograph.");
    context.fillStyle = "#181917";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob)
      throw new Error("Your browser could not compress this photograph.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () =>
      reject(new Error("The compressed photograph could not be read."));
    reader.readAsDataURL(blob);
  });
}
