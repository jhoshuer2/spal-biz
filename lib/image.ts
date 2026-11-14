/** Turn a photo from her phone into a small square JPEG (about 10 to 20 KB), cropped from the middle. */
export async function squarePhoto(file: File, size = 192): Promise<string> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions).catch(() => null);
  const img = bmp ?? (await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("image"));
    i.src = URL.createObjectURL(file);
  }));
  const w = "width" in img ? img.width : 0, h = "height" in img ? img.height : 0;
  const side = Math.min(w, h);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  c.getContext("2d")!.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
  bmp?.close();
  return c.toDataURL("image/jpeg", 0.82);
}

/** A photo of a page or receipt, shrunk to fit a phone connection but still readable (JPEG, longest side 1600px). */
export async function readablePhoto(file: File, max = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions).catch(() => null);
  const img = bmp ?? (await new Promise<HTMLImageElement>((res, rej) => {
    const el = new Image();
    el.onload = () => res(el);
    el.onerror = () => rej(new Error("image"));
    el.src = URL.createObjectURL(file);
  }));
  const w = "width" in img ? img.width : 0, h = "height" in img ? img.height : 0;
  if (!w || !h) throw new Error("image");
  const k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  bmp?.close();
  return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("image"))), "image/jpeg", 0.82));
}
