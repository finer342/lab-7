import { FrameProfiler } from './profiler';

const profiler = new FrameProfiler(1800, 16.7);

self.onmessage = (event: MessageEvent<{ type: 'sample'; frameMs: number } | { type: 'report' }>) => {
  const data = event.data;
  if (data.type === 'sample') {
    profiler.record(data.frameMs);
  } else if (data.type === 'report') {
    self.postMessage({ type: 'stats', stats: profiler.computeStats() });
  }
};
