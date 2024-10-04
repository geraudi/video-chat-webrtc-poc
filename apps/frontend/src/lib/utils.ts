export function whiteNoise({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  const canvas = Object.assign(document.createElement('canvas'), {
    width,
    height,
  });
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillRect(0, 0, width, height);
  const p = ctx.getImageData(0, 0, width, height);
  requestAnimationFrame(function draw() {
    for (let i = 0; i < p.data.length; i++) {
      p.data[i++] = p.data[i++] = p.data[i++] = Math.random() * 255;
    }
    ctx.putImageData(p, 0, 0);
    requestAnimationFrame(draw);
  });
  return canvas.captureStream();
}
