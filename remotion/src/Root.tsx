import { Composition, Still } from 'remotion';
import { Explainer } from './Explainer';
import { FPS, HEIGHT, WIDTH, type ExplainerProps, type ThumbnailProps } from './props';
import { Thumbnail } from './Thumbnail';

// Compositions are authored at 1080×1920; the preview renders them at scale 2/3 (720×1280, D-025).

const SAMPLE: ExplainerProps = {
  style: 'curious',
  title: 'Vì sao bầu trời có màu xanh?',
  scenes: [
    {
      index: 1,
      text: 'Vì sao bầu trời màu xanh?',
      emphasis: ['màu xanh'],
      startFrame: 0,
      durationInFrames: 75,
      audioSrc: null,
    },
    {
      index: 2,
      text: 'Ánh sáng mặt trời có đủ màu',
      emphasis: ['đủ màu'],
      startFrame: 75,
      durationInFrames: 75,
      audioSrc: null,
    },
    {
      index: 3,
      text: 'Màu xanh bị tán xạ nhiều nhất',
      emphasis: ['tán xạ'],
      startFrame: 150,
      durationInFrames: 90,
      audioSrc: null,
    },
  ],
  music: null,
  durationInFrames: 240,
};

const SAMPLE_THUMBNAIL: ThumbnailProps = {
  style: 'curious',
  title: 'Vì sao bầu trời có màu xanh?',
  hook: 'Câu trả lời nằm ở ánh sáng mặt trời',
};

export function Root() {
  return (
    <>
      <Composition
        id="TypographyExplainer"
        component={Explainer}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        durationInFrames={SAMPLE.durationInFrames}
        defaultProps={SAMPLE}
        calculateMetadata={({ props }) => ({ durationInFrames: props.durationInFrames })}
      />
      <Still
        id="Thumbnail"
        component={Thumbnail}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={SAMPLE_THUMBNAIL}
      />
    </>
  );
}
