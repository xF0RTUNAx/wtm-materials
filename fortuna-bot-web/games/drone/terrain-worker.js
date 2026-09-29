// Фоновый поток «Симулятора Летки»: строит сетки участков рельефа (позиции, нормали, цвета, индексы)
// и отдаёт их основному потоку без копирования (transferable), чтобы подлёт к новому участку не задерживал кадр.
import { buildChunkArrays } from './terrain-core.js?v=20260929c';
self.onmessage = (e) => {
  const { id, x0, z0, size, seg, skirt } = e.data;
  const a = buildChunkArrays(x0, z0, size, seg, skirt);
  self.postMessage({ id, ...a }, [a.pos.buffer, a.nor.buffer, a.col.buffer, a.idx.buffer]);
};
