import React from 'react';
import { Folder, Still } from 'remotion';
import { PortraitSample } from '../../kits/science/PortraitSample';
import { HOSTS } from './hosts';
import { SciHostContact, SciHostSheet } from './HostSheets';

/** "Chíp Khoa học" character set – review stills of the host candidates (`npx remotion still src/channels.ts SciHostContact out.png`). */
export const ChipScienceCompositions: React.FC = () => (
  <Folder name="ChipScience">
    <Still id="SciHostContact" component={SciHostContact} width={1920} height={1080} />
    <Still id="SciPortraitSample" component={PortraitSample} width={1080} height={1920} />
    {HOSTS.map((h) => (
      <Still
        key={h.id}
        id={`SciHost${h.id}`}
        component={SciHostSheet}
        width={1920}
        height={1080}
        defaultProps={{ id: h.id }}
      />
    ))}
  </Folder>
);
