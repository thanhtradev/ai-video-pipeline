// SFX rules the gates enforce on the agent's generated sounds (episode-gates.mjs).
// Continuous ambience beds and room tone are filtered noise heard as hiss under the whole episode,
// so episodes play only event SFX and loops tied to an action on screen.
const AMBIENCE_BED = /^amb_|room_tone/i;

/**
 * @param {readonly string[]} files generated SFX file names
 * @returns {string[]} the ambience beds among them
 */
export const ambienceBeds = (files) => files.filter((f) => AMBIENCE_BED.test(f));
