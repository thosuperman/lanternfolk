import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { sound } from './game/audio.js';
import { LanternfolkSystem } from './game/game.js';
import { setupLanding } from './landing.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(LanternfolkSystem);
  setupLanding(world, () => sound.unlock());
});
