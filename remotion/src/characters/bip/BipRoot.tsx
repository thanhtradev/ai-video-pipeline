import React from 'react';
import { Folder, Still } from 'remotion';
import { HOSTS } from './hosts';
import { SciHostContact, SciHostSheet } from './HostSheets';

/** "Bíp" character set – review stills of the host candidates (`npx remotion still src/channels.ts SciHostContact out.png`). */
export const BipCompositions: React.FC = () => (
  <Folder name="Bip">
    <Still id="SciHostContact" component={SciHostContact} width={1920} height={1080} />
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
