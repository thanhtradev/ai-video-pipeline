import { Config } from '@remotion/cli/config';

// CLI renders only (the worker passes the same option through the Node API). The TikTok 2 kit
// leans on CSS blur for parallax depth; the GPU (ANGLE) renders it about 3× faster than the
// software renderer with the same output (D-051).
Config.setChromiumOpenGlRenderer('angle');
