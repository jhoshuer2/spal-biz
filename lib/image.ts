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
