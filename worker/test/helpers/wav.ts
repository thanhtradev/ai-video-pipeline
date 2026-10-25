import { writeFile } from 'node:fs/promises';

/** 16-bit PCM mono WAV bytes, optionally with a LIST chunk before the data (as ffmpeg writes). */
export function wavBytes(samples: Int16Array, sampleRate: number, withList = false): Buffer {
  const fmt = Buffer.alloc(24);
  fmt.write('fmt ', 0, 'ascii');
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8);
  fmt.writeUInt16LE(1, 10);
  fmt.writeUInt32LE(sampleRate, 12);
  fmt.writeUInt32LE(sampleRate * 2, 16);
  fmt.writeUInt16LE(2, 20);
  fmt.writeUInt16LE(16, 22);
  const list = Buffer.from('LIST\x04\x00\x00\x00INFO', 'latin1');
  const data = Buffer.alloc(8 + samples.length * 2);
  data.write('data', 0, 'ascii');
  data.writeUInt32LE(samples.length * 2, 4);
  Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength).copy(data, 8);
  const body = Buffer.concat([
    Buffer.from('WAVE', 'ascii'),
    fmt,
    ...(withList ? [list] : []),
    data,
  ]);
  const header = Buffer.alloc(8);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

/** Speech-like tone where `voiced` spans are (seconds), digital silence elsewhere. */
export function toneSamples(seconds: number, sampleRate: number, voiced: [number, number][]) {
  return Int16Array.from({ length: Math.round(seconds * sampleRate) }, (_, i) => {
    const t = i / sampleRate;
    return voiced.some(([a, b]) => t >= a && t < b)
      ? Math.round(3000 * Math.sin(2 * Math.PI * 220 * t))
      : 0;
  });
}

export async function writeToneWav(
  path: string,
  seconds: number,
  voiced: [number, number][],
  sampleRate = 16_000,
): Promise<void> {
  await writeFile(path, wavBytes(toneSamples(seconds, sampleRate, voiced), sampleRate));
}
