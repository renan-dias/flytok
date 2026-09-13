import { NextRequest } from 'next/server';
import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * Proxy de mídia same-origin (vídeo e imagem).
 *
 * Por que existe: para desenhar um quadro de vídeo dentro de um canvas WebGL o
 * navegador exige que a origem seja confiável — sem `Access-Control-Allow-Origin`
 * o canvas é "contaminado" e a textura não pode ser enviada à GPU. A maioria dos
 * servidores de MP4 na internet não manda esse cabeçalho, então o clipe que o
 * usuário cola simplesmente não apareceria na tela do celular 3D.
 *
 * Buscando o arquivo aqui no servidor e devolvendo-o pela mesma origem do app, o
 * vídeo vira uma textura legítima. Requisições `Range` são repassadas, para o
 * player continuar podendo buscar e dar loop sem baixar tudo.
 *
 * NOTA DE SEGURANÇA: um proxy aberto é um vetor de SSRF. Só http(s) é aceito,
 * endereços privados/loopback são bloqueados (inclusive após resolução de DNS,
 * contra rebinding) e apenas respostas de tipo vídeo passam.
 */

// Precisa ser Node: o runtime Edge não tem `node:dns` nem `node:net`, usados
// na checagem de SSRF.
export const runtime = 'nodejs';

// A resposta depende inteiramente da query e dos cabeçalhos Range.
export const dynamic = 'force-dynamic';

/**
 * Teto de duração da função na Vercel. O plano da conta ainda manda — o valor é
 * reduzido ao limite do plano se for maior. Vídeos são servidos por faixas
 * (Range), então cada invocação transfere um pedaço, não o arquivo inteiro.
 */
export const maxDuration = 30;

/** Faixas reservadas que nunca devem ser alcançadas a partir do servidor. */
function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local / metadata de nuvem
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::') return true;
    if (v.startsWith('fc') || v.startsWith('fd')) return true; // unique local
    if (v.startsWith('fe80')) return true; // link-local
    // IPv4 mapeado em IPv6
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return true;
}

async function assertPublicHost(hostname: string): Promise<void> {
  const bare = hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(bare)) {
    throw new Error('host bloqueado');
  }
  if (net.isIP(bare)) {
    if (isPrivateAddress(bare)) throw new Error('endereço privado bloqueado');
    return;
  }
  // Resolve e valida todos os endereços: um nome público pode apontar para a
  // rede interna (DNS rebinding).
  const records = await dns.lookup(bare, { all: true });
  if (records.length === 0) throw new Error('host não resolvido');
  for (const r of records) {
    if (isPrivateAddress(r.address)) throw new Error('endereço privado bloqueado');
  }
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('url');
  if (!raw) return new Response('parâmetro `url` ausente', { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response('URL inválida', { status: 400 });
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return new Response('apenas http(s)', { status: 400 });
  }

  try {
    await assertPublicHost(target.hostname);
  } catch (err) {
    return new Response((err as Error).message, { status: 403 });
  }

  // Repassa o Range para preservar seek e loop sem baixar o arquivo inteiro.
  const range = req.headers.get('range');
  const headers: HeadersInit = { accept: 'video/*,image/*,*/*;q=0.8' };
  if (range) (headers as Record<string, string>).range = range;

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      // Alguns hosts (o Wikimedia entre eles) recusam requisições sem User-Agent.
      headers: { ...headers, 'user-agent': 'flytok-lab/0.1 (projeto educacional)' },
      redirect: 'follow',
      // Curto de propósito: uma faixa de vídeo que demora mais que isso já
      // estouraria a duração da função antes de terminar.
      signal: AbortSignal.timeout(8_000),
      cache: 'no-store',
    });
  } catch (err) {
    return new Response(`falha ao buscar a origem: ${(err as Error).message}`, { status: 502 });
  }

  if (!upstream.ok && upstream.status !== 206) {
    return new Response(`origem respondeu ${upstream.status}`, { status: 502 });
  }

  const contentType = upstream.headers.get('content-type') ?? '';
  // Só mídia: vídeo e imagem. Isso impede que o proxy seja usado para buscar
  // HTML ou JSON de qualquer lugar da internet em nome do servidor.
  if (!/^(video\/|image\/|application\/octet-stream|application\/mp4)/i.test(contentType)) {
    return new Response(`tipo de conteúdo não suportado: ${contentType || 'desconhecido'}`, {
      status: 415,
    });
  }

  const out = new Headers();
  out.set('content-type', contentType);
  out.set('accept-ranges', 'bytes');
  // Same-origin já basta para o canvas, mas isso mantém o proxy utilizável
  // caso o app seja embutido em outro lugar.
  out.set('access-control-allow-origin', '*');
  out.set('cache-control', 'public, max-age=3600');
  for (const h of ['content-length', 'content-range', 'etag', 'last-modified']) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }

  return new Response(upstream.body, { status: upstream.status, headers: out });
}
