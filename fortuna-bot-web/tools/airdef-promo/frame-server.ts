// Приёмник кадров промо-ролика (record.js): POST ?n=f01000 с JPEG → <папка>/f01000.jpg
//   deno run --allow-net --allow-write tools/airdef-promo/frame-server.ts <папка для кадров>   (порт 8937)
const dir = Deno.args[0] || './frames';
await Deno.mkdir(dir, { recursive: true });
Deno.serve({ port: 8937, hostname: '127.0.0.1' }, async (req) => {
  const h = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
  if (req.method === 'OPTIONS') return new Response(null, { headers: h });
  const name = (new URL(req.url).searchParams.get('n') || 'f').replace(/[^a-z0-9_]/gi, '');
  await Deno.writeFile(`${dir}/${name}.jpg`, new Uint8Array(await req.arrayBuffer()));
  return new Response('ok', { headers: h });
});
